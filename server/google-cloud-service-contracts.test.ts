import { describe, expect, it } from 'vitest'
import { GOOGLE_CLOUD_SERVICE_PROTOCOL, REQUIRED_GCP_APIS, assertGoogleCloudServiceReadiness, googleCloudServiceReadiness } from './google-cloud-service-contracts.mjs'

describe('Google service boundaries', () => {
  it('reports only the deployed Google competition core as implemented', () => {
    const readiness = assertGoogleCloudServiceReadiness(googleCloudServiceReadiness({ model: 'gemini-3.5-flash' }))
    expect(readiness.protocol).toBe(GOOGLE_CLOUD_SERVICE_PROTOCOL)
    expect(readiness.implemented).toMatchObject({
      agent: { provider: 'vertex-ai', framework: '@google/genai', model: 'gemini-3.5-flash', enabled: true },
      compute: { provider: 'cloud-run', enabled: true },
      evidence: { provider: 'firestore-native', collection: 'frost_agent_runs', enabled: true },
    })
  })

  it('keeps AMap and device speech explicit instead of pretending they are Google services', () => {
    const readiness = googleCloudServiceReadiness()
    expect(readiness.retained.map).toMatchObject({ provider: 'amap', enabled: true })
    expect(readiness.retained.speechInput).toMatchObject({ provider: 'ios-local-speech', enabled: true })
  })

  it('fails closed when a reserved service is mislabeled as enabled', () => {
    const readiness = googleCloudServiceReadiness()
    expect(() => assertGoogleCloudServiceReadiness({
      ...readiness,
      reserved: { ...readiness.reserved, push: { ...readiness.reserved.push, enabled: true } },
    })).toThrow('invalid_reserved_service:push')
  })

  it('keeps the deployment API list in the same contract', () => {
    expect(REQUIRED_GCP_APIS).toEqual(expect.arrayContaining([
      'aiplatform.googleapis.com',
      'run.googleapis.com',
      'firestore.googleapis.com',
    ]))
  })
})
