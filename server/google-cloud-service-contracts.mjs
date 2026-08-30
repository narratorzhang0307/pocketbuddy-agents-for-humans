export const GOOGLE_CLOUD_SERVICE_PROTOCOL = 'pocket-buddy-google-service-boundaries/v1'

export const REQUIRED_GCP_APIS = Object.freeze([
  'aiplatform.googleapis.com',
  'artifactregistry.googleapis.com',
  'cloudbuild.googleapis.com',
  'firestore.googleapis.com',
  'run.googleapis.com',
])

const IMPLEMENTED = Object.freeze({
  agent: Object.freeze({ provider: 'vertex-ai', framework: '@google/genai', enabled: true }),
  compute: Object.freeze({ provider: 'cloud-run', enabled: true }),
  evidence: Object.freeze({ provider: 'firestore-native', collection: 'frost_agent_runs', enabled: true }),
  build: Object.freeze({ provider: 'cloud-build+artifact-registry', enabled: true }),
})

const RETAINED = Object.freeze({
  map: Object.freeze({ provider: 'amap', enabled: true, reason: 'mainland-product-fit' }),
  speechInput: Object.freeze({ provider: 'ios-local-speech', enabled: true }),
  badge: Object.freeze({ provider: 'ojbadge-ios-ble', enabled: true }),
})

const RESERVED = Object.freeze({
  media: Object.freeze({ provider: 'google-cloud-storage', enabled: false, requires: 'identity+consent+retention+deletion' }),
  stt: Object.freeze({ provider: 'google-cloud-speech-to-text', enabled: false, requires: 'server-adapter+consent+retention+deletion' }),
  tts: Object.freeze({ provider: 'google-cloud-text-to-speech', enabled: false, requires: 'server-adapter+voice-review' }),
  push: Object.freeze({ provider: 'firebase-cloud-messaging', enabled: false, requires: 'identity+device-token-lifecycle' }),
  identity: Object.freeze({ provider: 'firebase-auth', enabled: false, requires: 'authorization+account-deletion' }),
})

export function googleCloudServiceReadiness({ model = 'gemini-3.5-flash' } = {}) {
  return {
    protocol: GOOGLE_CLOUD_SERVICE_PROTOCOL,
    implemented: {
      ...IMPLEMENTED,
      agent: { ...IMPLEMENTED.agent, model: String(model || 'gemini-3.5-flash') },
    },
    retained: RETAINED,
    reserved: RESERVED,
  }
}

export function assertGoogleCloudServiceReadiness(value) {
  if (!value || value.protocol !== GOOGLE_CLOUD_SERVICE_PROTOCOL) throw new Error('invalid_google_service_protocol')
  for (const [name, service] of Object.entries(value.implemented || {})) {
    if (!service || service.enabled !== true || !String(service.provider || '')) throw new Error(`invalid_implemented_service:${name}`)
  }
  if (value.retained?.map?.provider !== 'amap' || value.retained.map.enabled !== true) throw new Error('invalid_retained_map_provider')
  for (const [name, service] of Object.entries(value.reserved || {})) {
    if (!service || service.enabled !== false || !String(service.requires || '')) throw new Error(`invalid_reserved_service:${name}`)
  }
  return value
}
