import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto'

// Short-lived capability for exactly ONE server-generated answer. Not a provider key
// or a general TTS access code. Restart invalidates all outstanding tickets.
const secret = randomBytes(32)
const hash = text => createHash('sha256').update(text).digest('base64url')
const sign = value => createHmac('sha256', secret).update(value).digest('base64url')
export function answerSpeechTicket(task, content, now = Date.now()) {
  if (!/^skill-answer:[a-z0-9.-]+:answer$/.test(task)) return {}
  try {
    const data = JSON.parse(content)
    const text = typeof data.speech === 'string' ? data.speech.trim() : ''
    if (!text || [...text].length > 100 || typeof data.reply !== 'string') return {}
    const payload = Buffer.from(JSON.stringify({ h: hash(text), exp: now + 5 * 60_000, id: randomBytes(16).toString('hex') })).toString('base64url')
    return { speechTicket: `fv1.${payload}.${sign(payload)}` }
  } catch { return {} }
}
export function readSpeechTicket(token, now = Date.now()) {
  try {
    if (typeof token !== 'string' || token.length > 1024) return null
    const [v, payload, signature, extra] = token.split('.')
    if (v !== 'fv1' || !payload || !signature || extra) return null
    const a = Buffer.from(signature), b = Buffer.from(sign(payload))
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return data.exp > now && data.exp <= now + 5 * 60_000 ? data : null
  } catch { return null }
}
export function speechTicketMatches(ticket, text) { return ticket?.h === hash(text) }
