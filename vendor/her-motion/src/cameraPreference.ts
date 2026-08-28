import type { FrostBridge } from './frostBridge'

const KEY = 'her-motion.camera-resume.v1'
type Preference = { enabled: boolean; granted: boolean }
function store(): Storage | undefined { try { return window.localStorage } catch { return undefined } }
export function cameraPreference(): Preference {
  try {
    const value = JSON.parse(store()?.getItem(KEY) || 'null')
    return { enabled: value?.enabled !== false, granted: value?.granted === true }
  } catch { return { enabled: true, granted: false } }
}
export function rememberCamera(enabled: boolean, granted = cameraPreference().granted): void {
  try { store()?.setItem(KEY, JSON.stringify({ enabled, granted })) } catch { /* no storage: ask again next time */ }
}
export function shouldResumeCamera(): boolean {
  const value = cameraPreference()
  return value.enabled && value.granted
}

/** A new Frost call may request first-time permission, but must not invent a grant or replay it. */
export function consumeCameraAutoStart(bridge: Pick<FrostBridge, 'sessionId' | 'embedded'> | null, now = Date.now()): boolean {
  if (!bridge?.embedded || !cameraPreference().enabled) return false
  const params = new URLSearchParams(window.location.search)
  if (!params.has('frost_auto_camera')) return shouldResumeCamera()
  const page = new URL(window.location.href)
  const origin = page.origin === 'null' ? `${page.protocol}//${page.host}` : page.origin
  const runId = params.get('frost_run_id')?.trim()
  const age = now - Date.parse(params.get('frost_requested_at') || '')
  if (params.get('frost_auto_camera') !== '1' || params.get('frost_embed') !== '1' ||
      params.get('frost_session_id') !== bridge.sessionId || params.get('frost_skill_id') !== 'pocket.her-motion' ||
      params.get('frost_origin') !== origin || !runId || !Number.isFinite(age) || age < 0 || age > 120_000) return false
  try {
    const key = `her-motion.camera-start.v1:${runId}`
    if (window.sessionStorage.getItem(key)) return false
    window.sessionStorage.setItem(key, '1')
    return true
  } catch { return false }
}
