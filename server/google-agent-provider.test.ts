import { describe, expect, it, vi } from 'vitest'
import { createGoogleAgentProvider, googleAgentClientOptions, selectFrostAgentBackend } from './google-agent-provider.mjs'

describe('Google agent provider', () => {
  it('uses Vertex AI with Cloud Run application default credentials', () => {
    expect(googleAgentClientOptions({
      GOOGLE_GENAI_USE_VERTEXAI: 'true',
      GOOGLE_CLOUD_PROJECT: 'agentic-demo',
      GOOGLE_CLOUD_LOCATION: 'us-central1',
    })).toEqual({
      vertexai: true,
      project: 'agentic-demo',
      location: 'us-central1',
      apiVersion: 'v1',
    })
  })

  it('selects Gemini explicitly or when Google credentials are available', () => {
    expect(selectFrostAgentBackend({ FROST_AGENT_PROVIDER: 'gemini' }, { google: false })).toBe('gemini')
    expect(selectFrostAgentBackend({}, { google: true, qwen: true })).toBe('gemini')
    expect(selectFrostAgentBackend({}, { google: false, qwen: true })).toBe('qwen')
  })

  it('generates JSON through the official SDK without exposing credentials', async () => {
    const generateContent = vi.fn(async () => ({
      text: '{"next_action":{"type":"ask_user"}}',
      responseId: 'response-1',
      usageMetadata: { totalTokenCount: 42 },
    }))
    const provider = createGoogleAgentProvider({
      GEMINI_API_KEY: 'test-only-key',
      GEMINI_MODEL: 'gemini-3.5-flash',
    }, { client: { models: { generateContent } } })

    const result = await provider.complete({ prompt: 'plan a run', system: 'return JSON', json: true, maxOutputTokens: 512 })

    expect(provider).toMatchObject({ configured: true, framework: '@google/genai', transport: 'gemini-api' })
    expect(result.text).toContain('ask_user')
    expect(generateContent).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gemini-3.5-flash',
      contents: 'plan a run',
      config: expect.objectContaining({ responseMimeType: 'application/json', maxOutputTokens: 512 }),
    }))
    expect(JSON.stringify(generateContent.mock.calls)).not.toContain('test-only-key')
  })

  it('fails closed when the selected Google backend has no credentials', async () => {
    const provider = createGoogleAgentProvider({})
    expect(provider.configured).toBe(false)
    await expect(provider.complete({ prompt: 'hello' })).rejects.toThrow('google_agent_not_configured')
  })
})
