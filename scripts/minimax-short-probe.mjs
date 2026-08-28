// Explicit, single-call live probe. Ordinary unit tests never run this file.
// Reuse the saved PCM for every subsequent BLE test; a failed attempt is not retried.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { parseEnv } from 'node:util'
import { synthesizeMiniMax } from '../server/minimax-voice.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const dotenv = path.join(root, '.env')
const env = { ...(existsSync(dotenv) ? parseEnv(readFileSync(dotenv, 'utf8')) : {}), ...process.env }
const directory = path.join(homedir(), '.local/share/pocketbuddy-esp/minimax-short-probe')
const attempt = path.join(directory, 'attempt.json'), resultPath = path.join(directory, 'result.json')
const pcmPath = path.join(directory, 'hello.pcm'), wavPath = path.join(directory, 'hello.wav')
const text = '你好。'

function wave(pcm) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22)
  header.writeUInt32LE(16000, 24); header.writeUInt32LE(32000, 28)
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34)
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

async function main() {
  if (!process.argv.includes('--live')) {
    console.log(JSON.stringify({ keyConfigured: !!env.MINIMAX_API_KEY?.trim(), apiCalls: 0,
      next: 'Only --live performs one paid synthesis of 你好。; subsequent runs reuse hello.pcm.' }))
    return
  }
  if (existsSync(resultPath) && existsSync(pcmPath) && existsSync(wavPath)) {
    console.log(JSON.stringify({ apiCallsThisRun: 0, reused: true, pcmPath, wavPath }))
    return
  }
  if (existsSync(attempt)) throw new Error('previous_attempt_exists_no_automatic_retry')
  if (!env.MINIMAX_API_KEY?.trim()) throw new Error('minimax_key_not_configured_no_request_sent')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  // Claim the one attempt before sending. Even a lost response may have consumed quota.
  writeFileSync(attempt, JSON.stringify({ text, characters: [...text].length, started: new Date().toISOString() }), { flag: 'wx', mode: 0o600 })
  const result = await synthesizeMiniMax(text, { env })
  writeFileSync(pcmPath, result.pcm, { flag: 'wx', mode: 0o600 })
  writeFileSync(wavPath, wave(result.pcm), { flag: 'wx', mode: 0o600 })
  const record = { apiCalls: 1, text, characters: [...text].length, provider: result.provider, model: result.model,
    voice: result.voice, bytes: result.pcm.length, durationMs: result.durationMs, format: result.format,
    sampleRate: result.sampleRate, channels: result.channels, completed: new Date().toISOString() }
  writeFileSync(resultPath, JSON.stringify(record, null, 2), { flag: 'wx', mode: 0o600 })
  console.log(JSON.stringify({ ...record, pcmPath, wavPath }))
}

main().catch(error => {
  // Never emit provider credentials, request headers, or raw provider responses.
  const code = /^(?:minimax_|previous_attempt_)[a-z0-9_]+$/.test(error?.message) ? error.message : 'probe_failed_no_automatic_retry'
  console.error(code); process.exitCode = 1
})
