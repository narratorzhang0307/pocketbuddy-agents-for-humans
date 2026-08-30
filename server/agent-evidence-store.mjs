import { Firestore } from '@google-cloud/firestore'
import { FIRESTORE_COLLECTIONS, assertAgentEvidenceDocument } from './cloud-data-contracts.mjs'

const enabled = (value) => /^(?:1|true|yes|on)$/i.test(String(value || ''))
const clean = (value, max = 160) => String(value || '').trim().slice(0, max)

export function createAgentEvidenceStore({ env = process.env, firestore } = {}) {
  const active = enabled(env.FROST_FIRESTORE_ENABLED)
  const required = enabled(env.FROST_FIRESTORE_REQUIRED)
  const collection = /^[a-zA-Z0-9_-]{1,80}$/.test(String(env.FROST_FIRESTORE_COLLECTION || ''))
    ? String(env.FROST_FIRESTORE_COLLECTION)
    : FIRESTORE_COLLECTIONS.agentEvidence
  let database = firestore || null

  const getDatabase = () => {
    if (!database) database = new Firestore({
      ...(env.GOOGLE_CLOUD_PROJECT ? { projectId: env.GOOGLE_CLOUD_PROJECT } : {}),
    })
    return database
  }

  return {
    enabled: active,
    required,
    collection,
    readiness() {
      return { enabled: active, required, collection }
    },
    async record(value = {}) {
      if (!active) return { status: 'disabled' }
      const traceId = clean(value.traceId, 120)
      if (!/^[a-zA-Z0-9_-]{8,120}$/.test(traceId)) throw new Error('agent_trace_id_invalid')
      const document = {
        protocol: 'frost-agent-evidence/v1',
        traceId,
        status: clean(value.status, 32),
        task: clean(value.task, 120),
        promptProtocol: clean(value.promptProtocol, 80),
        promptVersion: clean(value.promptVersion, 32),
        promptProfile: clean(value.promptProfile, 80),
        provider: clean(value.provider, 80),
        model: clean(value.model, 120),
        transport: clean(value.transport, 80),
        framework: clean(value.framework, 80),
        sessionId: clean(value.sessionId, 120),
        runId: clean(value.runId, 120),
        startedAt: clean(value.startedAt, 40),
        completedAt: clean(value.completedAt, 40),
        latencyMs: Math.max(0, Number(value.latencyMs) || 0),
        promptChars: Math.max(0, Number(value.promptChars) || 0),
        clientInstructionChars: Math.max(0, Number(value.clientInstructionChars) || 0),
        responseChars: Math.max(0, Number(value.responseChars) || 0),
        cloudRun: {
          service: clean(env.K_SERVICE, 120),
          revision: clean(env.K_REVISION, 120),
          region: clean(env.GOOGLE_CLOUD_REGION || env.GOOGLE_CLOUD_LOCATION, 80),
        },
      }
      assertAgentEvidenceDocument(document)
      try {
        await getDatabase().collection(collection).doc(traceId).set(document)
        return { status: 'stored', traceId, collection }
      } catch (error) {
        if (required) throw error
        return { status: 'failed', traceId }
      }
    },
  }
}
