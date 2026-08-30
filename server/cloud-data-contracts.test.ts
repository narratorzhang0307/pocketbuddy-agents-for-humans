import { describe, expect, it } from 'vitest'
import { COMPETITION_CLOUD_SCOPE, FIRESTORE_COLLECTIONS, assertAgentEvidenceDocument, buddyMemoryCloudPath, gcsPetJobPrefix, gcsUserMediaObject, userCloudPath } from './cloud-data-contracts.mjs'

describe('cloud data contracts', () => {
  it('keeps the submitted write scope intentionally small', () => {
    expect(COMPETITION_CLOUD_SCOPE.implemented).toEqual(['frost_agent_runs'])
    expect(COMPETITION_CLOUD_SCOPE.reservedForConsentedSync).toContain('users/{uid}/health_events/{eventId}')
  })

  it('builds only allowlisted user-scoped Firestore paths', () => {
    expect(userCloudPath('user_123', FIRESTORE_COLLECTIONS.runSessions, 'run-route:abc')).toBe('users/user_123/run_sessions/run-route:abc')
    expect(() => userCloudPath('user/escape', FIRESTORE_COLLECTIONS.runSessions, 'run')).toThrow('invalid_uid')
    expect(() => userCloudPath('user_123', 'admin', 'run')).toThrow('invalid_user_collection')
    expect(buddyMemoryCloudPath('user_123', 'buddy_1', 'memory_1')).toBe('users/user_123/buddies/buddy_1/memories/memory_1')
  })

  it('builds bounded GCS object paths without granting upload access', () => {
    expect(gcsUserMediaObject('user_123', 'media_1', '.WEBP')).toBe('users/user_123/media/media_1.webp')
    expect(gcsPetJobPrefix('user_123', 'job_1')).toBe('tmp/pet-jobs/user_123/job_1/')
    expect(() => gcsUserMediaObject('user/escape', 'media_1', 'png')).toThrow('invalid_uid')
    expect(() => gcsUserMediaObject('user_123', 'media_1', 'html')).toThrow('invalid_media_extension')
  })

  it('rejects prompt content and any other undeclared evidence field', () => {
    expect(assertAgentEvidenceDocument({ protocol: 'frost-agent-evidence/v1', traceId: 'trace_123' })).toBeTruthy()
    expect(() => assertAgentEvidenceDocument({ protocol: 'frost-agent-evidence/v1', prompt: 'private' })).toThrow('agent_evidence_field_not_allowed:prompt')
  })
})
