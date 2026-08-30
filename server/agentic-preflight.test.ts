import { describe, expect, it } from 'vitest'
import { staticCloudPreflight, summarizeCloudPreflight } from '../scripts/agentic/preflight-cloud.mjs'

describe('Google Cloud handoff preflight', () => {
  it('accepts a redacted, Taiwan-region deployment configuration', () => {
    const { checks, region, firestoreLocation } = staticCloudPreflight({
      GOOGLE_CLOUD_PROJECT: 'frost-agentic-demo',
      GOOGLE_CLOUD_REGION: 'asia-east1',
      FROST_FIRESTORE_LOCATION: 'asia-east1',
      VITE_AMAP_KEY: 'not-printed',
      VITE_AMAP_SERVICE_HOST: 'https://demo.example/_AMapService',
    }, { nodeVersion: '22.18.0' })
    expect(region).toBe('asia-east1')
    expect(firestoreLocation).toBe('asia-east1')
    expect(checks.find((check) => check.name === 'AMap Web key')?.detail).toBe('configured (redacted)')
    expect(checks.every((check) => check.status === 'pass')).toBe(true)
  })

  it('reports missing billing-independent inputs as blockers', () => {
    const { checks } = staticCloudPreflight({}, { nodeVersion: '20.1.0' })
    const summary = summarizeCloudPreflight(checks)
    expect(summary.passed).toBe(false)
    expect(summary.blocking).toEqual(expect.arrayContaining(['Node.js 22+', 'Google Cloud project id', 'AMap Web key', 'AMap protection']))
  })
})
