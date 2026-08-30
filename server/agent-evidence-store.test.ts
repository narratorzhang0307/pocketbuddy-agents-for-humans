import { describe, expect, it, vi } from 'vitest'
import { createAgentEvidenceStore } from './agent-evidence-store.mjs'

describe('Firestore agent evidence store', () => {
  it('stores bounded execution metadata without prompts or credentials', async () => {
    const set = vi.fn(async () => undefined)
    const doc = vi.fn(() => ({ set }))
    const collection = vi.fn(() => ({ doc }))
    const store = createAgentEvidenceStore({
      env: {
        FROST_FIRESTORE_ENABLED: 'true',
        GOOGLE_CLOUD_PROJECT: 'agentic-demo',
        K_SERVICE: 'frost-taskmaster',
        K_REVISION: 'frost-taskmaster-00001',
      },
      firestore: { collection },
    })

    const result = await store.record({
      traceId: 'trace_12345678',
      status: 'completed',
      task: 'run-route-intent',
      provider: 'Google Gen AI SDK',
      model: 'gemini-3.5-flash',
      framework: '@google/genai',
      promptChars: 120,
      responseChars: 80,
      prompt: 'private health context',
      apiKey: 'must-not-be-stored',
    })

    expect(result).toEqual({ status: 'stored', traceId: 'trace_12345678', collection: 'frost_agent_runs' })
    expect(collection).toHaveBeenCalledWith('frost_agent_runs')
    expect(doc).toHaveBeenCalledWith('trace_12345678')
    const stored = set.mock.calls[0][0]
    expect(stored).toMatchObject({ protocol: 'frost-agent-evidence/v1', task: 'run-route-intent' })
    expect(JSON.stringify(stored)).not.toContain('private health context')
    expect(JSON.stringify(stored)).not.toContain('must-not-be-stored')
  })

  it('is a no-op when Firestore evidence is disabled', async () => {
    const store = createAgentEvidenceStore({ env: {} })
    await expect(store.record({ traceId: 'trace_12345678' })).resolves.toEqual({ status: 'disabled' })
  })
})
