export const FROST_BRIDGE_PROTOCOL = 'pocket-her-motion-bridge/v1' as const
export const HER_MOTION_AUDIO_PROTOCOL = 'pocket-her-motion-audio/v1' as const

export type FrostBridgeEvent = 'opened' | 'workout-started' | 'pose-confirmed' | 'completed' | 'cancelled'

export interface FrostBridgePayload {
  domain?: string
  exerciseId?: string
  exerciseName?: string
  durationSec?: number
  confidence?: number
  poseConfirmed?: boolean
  stopReason?: string
}

export interface FrostBridge {
  sessionId: string
  embedded: boolean
  send: (type: FrostBridgeEvent, payload?: FrostBridgePayload) => void
  speak: (text: string) => void
  stopSpeech: () => void
}

function safeOrigin(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (value === 'capacitor://localhost') return value
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null
  } catch { return null }
}

export function createFrostBridge(): FrostBridge | null {
  const params = new URLSearchParams(window.location.search)
  const sessionId = params.get('frost_session_id')?.trim()
  const targetOrigin = safeOrigin(params.get('frost_origin'))
  const target = window.parent !== window ? window.parent : window.opener
  if (!sessionId || !targetOrigin || !target) return null
  let audioId = 0
  const post = (value: object) => target.postMessage(value, targetOrigin === 'capacitor://localhost' ? '*' : targetOrigin)

  return {
    sessionId,
    embedded: params.get('frost_embed') === '1',
    send(type, payload = {}) {
      post({
        protocol: FROST_BRIDGE_PROTOCOL,
        sessionId,
        type,
        at: new Date().toISOString(),
        ...payload,
      })
    },
    speak(text) {
      if (!text.trim() || [...text].length > 100) return
      post({ protocol: HER_MOTION_AUDIO_PROTOCOL, sessionId, id: ++audioId, type: 'speak', text })
    },
    stopSpeech() { post({ protocol: HER_MOTION_AUDIO_PROTOCOL, sessionId, id: ++audioId, type: 'stop' }) },
  }
}
