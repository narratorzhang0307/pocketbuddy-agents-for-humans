export const CLOUD_DATA_PROTOCOL = 'pocket-buddy-cloud-data/v1'

export const FIRESTORE_COLLECTIONS = Object.freeze({
  agentEvidence: 'frost_agent_runs',
  users: 'users',
  media: 'media',
  buddies: 'buddies',
  memories: 'memories',
  healthEvents: 'health_events',
  runSessions: 'run_sessions',
  motionSessions: 'motion_sessions',
  trees: 'trees',
  dailySummaries: 'daily_summaries',
  petJobs: 'pet_jobs',
  openFoodFactsCache: 'cache_off',
  idempotency: 'idempotency',
})

export const COMPETITION_CLOUD_SCOPE = Object.freeze({
  implemented: Object.freeze(['frost_agent_runs']),
  reservedForConsentedSync: Object.freeze([
    'users/{uid}',
    'users/{uid}/media/{mediaId}',
    'users/{uid}/buddies/{buddyId}',
    'users/{uid}/buddies/{buddyId}/memories/{memoryId}',
    'users/{uid}/health_events/{eventId}',
    'users/{uid}/run_sessions/{sessionId}',
    'users/{uid}/motion_sessions/{sessionId}',
    'users/{uid}/trees/{treeId}',
    'users/{uid}/daily_summaries/{day}',
    'pet_jobs/{jobId}',
    'cache_off/{barcode}',
    'idempotency/{key}',
  ]),
  gcsReservedPrefixes: Object.freeze(['users/{uid}/media/', 'tmp/pet-jobs/{uid}/']),
})

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,159}$/

export function assertCloudDocumentId(value, label = 'document id') {
  const id = String(value || '')
  if (!ID.test(id) || id.includes('..')) throw new Error(`invalid_${label.replace(/\W+/g, '_')}`)
  return id
}

export function userCloudPath(uid, collection, documentId) {
  const userId = assertCloudDocumentId(uid, 'uid')
  const allowed = new Set([
    FIRESTORE_COLLECTIONS.media,
    FIRESTORE_COLLECTIONS.buddies,
    FIRESTORE_COLLECTIONS.healthEvents,
    FIRESTORE_COLLECTIONS.runSessions,
    FIRESTORE_COLLECTIONS.motionSessions,
    FIRESTORE_COLLECTIONS.trees,
    FIRESTORE_COLLECTIONS.dailySummaries,
  ])
  if (!allowed.has(collection)) throw new Error('invalid_user_collection')
  return `users/${userId}/${collection}/${assertCloudDocumentId(documentId)}`
}

const EVIDENCE_FIELDS = new Set([
  'protocol', 'traceId', 'status', 'task', 'promptProtocol', 'promptVersion', 'promptProfile',
  'provider', 'model', 'transport', 'framework', 'sessionId', 'runId', 'startedAt', 'completedAt',
  'latencyMs', 'promptChars', 'clientInstructionChars', 'responseChars', 'cloudRun',
])

export function assertAgentEvidenceDocument(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error('invalid_agent_evidence')
  for (const field of Object.keys(document)) {
    if (!EVIDENCE_FIELDS.has(field)) throw new Error(`agent_evidence_field_not_allowed:${field}`)
  }
  if (document.protocol !== 'frost-agent-evidence/v1') throw new Error('invalid_agent_evidence_protocol')
  return document
}
