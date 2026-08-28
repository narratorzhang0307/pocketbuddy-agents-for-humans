import { timingSafeEqual } from 'node:crypto'
import { createSlidingWindowLimiter } from './security.mjs'
import { readSpeechTicket, speechTicketMatches } from './frost-voice-ticket.mjs'

export const VOICE_MAX_TEXT = 100
const MAX_PCM_BYTES = 16000 * 2 * 30
const MODEL = 'speech-2.8-turbo'
const VOICE = 'male-qn-qingse'

export class VoiceError extends Error {
  constructor(code, status = 502) { super(code); this.status = status }
}

export function validateVoiceText(value) {
  if (typeof value !== 'string' || !value.trim() || [...value.trim()].length > VOICE_MAX_TEXT) {
    throw new VoiceError('voice_text_must_be_1_to_100_characters', 400)
  }
  return value.trim()
}

export function decodeMiniMaxPcm(data) {
  const code = data?.base_resp?.status_code
  if (code !== 0) throw new VoiceError(`minimax_error_${Number.isInteger(code) ? code : 'invalid_response'}`)
  const info = data.extra_info
  if (data.data?.status !== 2 || info?.audio_format !== 'pcm' || info?.audio_sample_rate !== 16000 || info?.audio_channel !== 1) {
    throw new VoiceError('minimax_audio_format_mismatch')
  }
  const hex = data.data.audio
  if (typeof hex !== 'string' || !hex.length || hex.length > MAX_PCM_BYTES * 2 || hex.length % 4 || !/^[0-9a-f]+$/i.test(hex)) {
    throw new VoiceError('minimax_invalid_or_oversized_pcm')
  }
  const pcm = Buffer.from(hex, 'hex')
  return { pcm, sampleRate: 16000, channels: 1, format: 'pcm_s16le', durationMs: pcm.length / 32 }
}

async function limitedJson(response) {
  const reader = response.body?.getReader()
  if (!reader) throw new VoiceError('minimax_empty_response')
  const chunks = []; let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > MAX_PCM_BYTES * 2 + 32768) throw new VoiceError('minimax_response_too_large')
      chunks.push(value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } finally { await reader.cancel().catch(() => {}) }
}

export async function synthesizeMiniMax(text, { env = process.env, fetcher = fetch } = {}) {
  const input = validateVoiceText(text)
  const key = String(env.MINIMAX_API_KEY || '').trim()
  if (!key) throw new VoiceError('minimax_key_not_configured', 503)
  const base = String(env.MINIMAX_BASE_URL || 'https://api.minimaxi.com').replace(/\/$/, '')
  // Provider credentials may only be sent to documented MiniMax origins, never a caller-supplied URL.
  if (!['https://api.minimaxi.com', 'https://api.minimax.io'].includes(base)) throw new VoiceError('minimax_invalid_api_origin', 503)
  const model = env.MINIMAX_TTS_MODEL || MODEL
  const voice = env.MINIMAX_VOICE_ID || VOICE
  try {
    const upstream = await fetcher(`${base}/v1/t2a_v2`, {
      method: 'POST', redirect: 'error',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model, text: input, stream: false, output_format: 'hex', language_boost: 'auto',
        voice_setting: { voice_id: voice, speed: 1, vol: 1, pitch: 0 },
        audio_setting: { sample_rate: 16000, format: 'pcm', channel: 1 },
      }),
      signal: AbortSignal.timeout(30000),
    })
    // No automatic retry: even a response timeout may have consumed synthesis quota.
    if (!upstream.ok) {
      await upstream.body?.cancel().catch(() => {})
      throw new VoiceError(`minimax_http_${upstream.status}`, upstream.status === 429 ? 429 : 502)
    }
    return { ...decodeMiniMaxPcm(await limitedJson(upstream)), provider: 'minimax', model, voice }
  } catch (error) {
    if (error instanceof VoiceError) throw error
    throw new VoiceError(error?.name === 'TimeoutError' ? 'minimax_timeout_no_retry' : 'minimax_request_failed')
  }
}

function localRequest(req) {
  try {
    const host = String(req.headers.host || '')
    const hostname = new URL(`http://${host}`).hostname
    const remote = String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '')
    return ['localhost', '127.0.0.1', '[::1]'].includes(hostname) && ['127.0.0.1', '::1'].includes(remote) &&
      !req.headers['x-forwarded-for'] && !req.headers.forwarded &&
      (!req.headers.origin || req.headers.origin === `http://${host}` || req.headers.origin === `https://${host}`)
  } catch { return false }
}
function authorized(req, env, localDev) {
  if (localDev && localRequest(req)) return true
  const expected = String(env.FROST_VOICE_ACCESS_TOKEN || '')
  const header = String(req.headers.authorization || '')
  if (!header.startsWith('Bearer ')) return false
  const actual = Buffer.from(header.slice(7)), expectedBytes = Buffer.from(expected)
  if (expected.length < 32 || expected === env.MINIMAX_API_KEY || actual.length !== expectedBytes.length) return false
  return timingSafeEqual(actual, expectedBytes)
}
function send(res, status, data) {
  if (res.headersSent || res.destroyed) return
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  res.end(JSON.stringify(data))
}
async function readJson(req) {
  const chunks = []; let total = 0
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    total += chunk.length
    if (total > 4096) { req.resume(); throw new VoiceError('voice_request_too_large', 413) }
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { throw new VoiceError('voice_invalid_json', 400) }
}

export function createFrostVoiceHandler({ env = process.env, localDev = false, fetcher = fetch } = {}) {
  const limiter = createSlidingWindowLimiter({ limit: 6, windowMs: 60000 })
  const answers = new Map()
  let active = false
  return async (req, res) => {
    const path = new URL(req.url || '/', 'http://localhost').pathname
    if (!path.startsWith('/api/frost-voice/')) return false
    const ticket = readSpeechTicket(String(req.headers.authorization || '').replace(/^Bearer /, ''))
    if (!ticket && !authorized(req, env, localDev)) {
      send(res, 403, { error: 'voice_access_required', message: '语音接口需要独立后端访问码；不要在客户端填写 MiniMax API Key。' }); return true
    }
    if (path === '/api/frost-voice/status' && req.method === 'GET') {
      send(res, 200, { provider: 'minimax', configured: !!String(env.MINIMAX_API_KEY || '').trim(), tts: true, asr: false }); return true
    }
    if (path !== '/api/frost-voice/tts') { send(res, 404, { error: 'voice_not_found' }); return true }
    if (req.method !== 'POST') { send(res, 405, { error: 'method_not_allowed' }); return true }
    if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
      send(res, 415, { error: 'voice_json_required' }); return true
    }
    try {
      const input = await readJson(req)
      const text = validateVoiceText(input?.text)
      if (ticket && !speechTicketMatches(ticket, text)) throw new VoiceError('voice_ticket_text_mismatch', 403)
      if (!String(env.MINIMAX_API_KEY || '').trim()) throw new VoiceError('minimax_key_not_configured', 503)
      for (const [id, entry] of answers) if (entry.expires <= Date.now()) answers.delete(id)
      // A duplicate delivery shares the same outcome, including a possibly billed failure.
      if (ticket && answers.has(ticket.id)) {
        const result = await answers.get(ticket.id).result
        send(res, 200, result)
        return true
      }
      if (active) throw new VoiceError('voice_request_in_progress', 429)
      if (!limiter.consume('voice').allowed) throw new VoiceError('voice_rate_limited', 429)
      active = true
      try {
        const result = synthesizeMiniMax(text, { env, fetcher }).then(audio => ({ ...audio, pcm: undefined, audioBase64: audio.pcm.toString('base64') }))
        if (ticket) answers.set(ticket.id, { expires: ticket.exp, result })
        send(res, 200, await result)
      } finally { active = false }
    } catch (error) {
      send(res, error instanceof VoiceError ? error.status : 502, { error: error instanceof VoiceError ? error.message : 'voice_request_failed' })
    }
    return true
  }
}
