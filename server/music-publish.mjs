import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildQwenChatBody, qwenModelForTask } from './qwen-provider.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const INGEST = path.join(ROOT, 'scripts', 'music', 'ingest-authorized-audio.py')
const YOUTUBE_URL = /^https:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|live\/)|youtu\.be\/)[A-Za-z0-9_-]{11}(?:[?&#/].*)?$/i

const text = (value, max = 240) => typeof value === 'string' ? value.trim().slice(0, max) : ''

function extractJson(raw) {
  const cleaned = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try { return JSON.parse(cleaned) } catch { /* try the outermost object */ }
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try { return JSON.parse(cleaned.slice(start, end + 1)) } catch { return null }
}

function runIngest(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(env.MUSIC_PYTHON_BIN || 'python3', [INGEST, ...args], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const append = (current, chunk) => (current + chunk.toString('utf8')).slice(-1024 * 1024)
    child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk) })
    child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk) })
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('music_publish_timeout')) }, 6 * 60_000)
    child.on('error', (error) => { clearTimeout(timer); reject(error) })
    child.on('close', (code) => {
      clearTimeout(timer)
      const payload = extractJson(stdout)
      if (code !== 0 || !payload || payload.error) {
        reject(new Error(text(payload?.error || stderr || `music_ingest_exit_${code}`, 500)))
        return
      }
      resolve(payload)
    })
  })
}

async function createQwenCard(qwen, ingest) {
  if (!qwen.key) throw new Error('no_qwen_key')
  const source = ingest.source || {}
  const system = [
    '你是 Pocket Earth 的音乐资料编辑。根据给定的 YouTube 元数据，生成一张可信、简洁的中文音乐卡。',
    '只输出 JSON；不确定的年份、流派、地点留空，不要编造。',
    '地点优先选择歌手出生/成长城市；若歌曲明确关联某城市，可选择歌曲城市。',
  ].join('')
  const prompt = JSON.stringify({
    youtubeTitle: text(source.title),
    artistOrUploader: text(source.artist),
    channel: text(source.channel),
    sourceUrl: ingest.playback?.sourceUrl || '',
    output: {
      title: '正式歌曲名', artist: '歌手或乐队', genre: '主要流派，不超过12字', year: '发行年份数字或null',
      songIntro: '歌曲简介，中文60-100字', artistIntro: '歌手说明，中文60-100字',
      place: '用于钉地球的城市', country: '国家或地区', geoKind: 'artist_origin或song_city',
    },
  })
  const model = qwenModelForTask(qwen, 'music-card')
  const response = await fetch(qwen.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${qwen.key}` },
    body: JSON.stringify(buildQwenChatBody(qwen, { prompt, system, task: 'music-card', json: true, temperature: 0.2 })),
    signal: AbortSignal.timeout(90_000),
  })
  if (!response.ok) throw new Error(`qwen_music_${response.status}`)
  const data = await response.json()
  const card = extractJson(data?.choices?.[0]?.message?.content)
  if (!card || typeof card !== 'object') throw new Error('qwen_music_invalid_json')
  const parsedYear = Number(card.year)
  return {
    title: text(card.title, 120) || text(source.title, 120) || '未命名歌曲',
    artist: text(card.artist, 100) || text(source.artist, 100) || '未知歌手',
    genre: text(card.genre, 30),
    year: card.year !== null && card.year !== '' && Number.isInteger(parsedYear) && parsedYear >= 1000 && parsedYear <= 2100 ? parsedYear : null,
    songIntro: text(card.songIntro, 220),
    artistIntro: text(card.artistIntro, 220),
    place: text(card.place, 100),
    country: text(card.country, 80),
    geoKind: card.geoKind === 'song_city' ? 'song_city' : 'artist_origin',
    model,
  }
}

async function geocode(place, country) {
  const query = [place, country].filter(Boolean).join(' ')
  if (!query) return null
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('q', query)
    url.searchParams.set('format', 'json')
    url.searchParams.set('limit', '1')
    url.searchParams.set('accept-language', 'zh')
    const response = await fetch(url, {
      headers: { 'user-agent': 'PocketEarth/1.0 (music card geocoder)' },
      signal: AbortSignal.timeout(8_000),
    })
    const rows = await response.json()
    const hit = Array.isArray(rows) ? rows[0] : null
    const lng = Number(hit?.lon)
    const lat = Number(hit?.lat)
    return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat, place: text(hit.display_name, 160) || place } : null
  } catch { return null }
}

export async function publishYoutubeMusic(input, { env = process.env, qwen } = {}) {
  const youtubeUrl = text(input?.youtubeUrl, 500)
  if (!YOUTUBE_URL.test(youtubeUrl)) throw new Error('youtube_url_invalid')
  const args = [
    'youtube-publish', '--youtube-url', youtubeUrl,
    '--prefix', text(env.MUSIC_OSS_PREFIX, 180) || 'pocket-earth/user-music',
  ]
  const requestedTitle = text(input?.title, 120)
  const requestedArtist = text(input?.artist, 100)
  if (requestedTitle) args.push('--title', requestedTitle)
  if (requestedArtist) args.push('--artist', requestedArtist)
  if (env.MUSIC_YOUTUBE_PROXY) args.push('--proxy', env.MUSIC_YOUTUBE_PROXY)
  const ingest = await runIngest(args, env)
  const qwenCard = await createQwenCard(qwen, ingest)
  const geo = await geocode(qwenCard.place, qwenCard.country)
  return {
    ok: true,
    card: {
      id: `youtube-${text(ingest.source?.videoId, 20)}`,
      ...qwenCard,
      geo,
      durationSec: Number(ingest.artifact?.durationSec || ingest.source?.durationSec || 0),
      playback: ingest.playback,
      sourceUrl: ingest.playback?.sourceUrl || youtubeUrl,
      artifact: ingest.artifact,
    },
  }
}

export const __musicPublishTest = { extractJson }
