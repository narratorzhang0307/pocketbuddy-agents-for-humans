import { GoogleGenAI } from '@google/genai'

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash'

const enabled = (value) => /^(?:1|true|yes|on)$/i.test(String(value || ''))

export function googleAgentClientOptions(env = process.env) {
  const vertexai = enabled(env.GOOGLE_GENAI_USE_VERTEXAI)
  if (vertexai) {
    return {
      vertexai: true,
      project: String(env.GOOGLE_CLOUD_PROJECT || env.GCLOUD_PROJECT || '').trim(),
      location: String(env.GOOGLE_CLOUD_LOCATION || 'global').trim(),
      apiVersion: 'v1',
    }
  }
  return {
    apiKey: String(env.GEMINI_API_KEY || env.GOOGLE_API_KEY || '').trim(),
  }
}

export function selectFrostAgentBackend(env = process.env, availability = {}) {
  const requested = String(env.FROST_AGENT_PROVIDER || '').trim().toLowerCase()
  if (['gemini', 'google', 'google-genai', 'vertex', 'vertex-ai'].includes(requested)) return 'gemini'
  if (requested === 'qwen') return 'qwen'
  return availability.google ? 'gemini' : 'qwen'
}

function outputTokens(task) {
  const name = String(task || 'default').toLowerCase()
  if (name.startsWith('subagent:')) return 1536
  if (name === 'run-route-intent') return 512
  if (name.startsWith('skill-answer:')) return 768
  return 2048
}

export function createGoogleAgentProvider(env = process.env, options = {}) {
  const clientOptions = googleAgentClientOptions(env)
  const vertexai = clientOptions.vertexai === true
  const configured = vertexai ? Boolean(clientOptions.project) : Boolean(clientOptions.apiKey)
  const model = String(env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim()
  let client = options.client || null

  const getClient = () => {
    if (!configured) throw new Error('google_agent_not_configured')
    if (!client) client = new GoogleGenAI(clientOptions)
    return client
  }

  const params = ({ prompt, system = '', json = false, task = 'default', signal, temperature }) => ({
    model,
    contents: String(prompt || ''),
    config: {
      ...(system ? { systemInstruction: String(system) } : {}),
      temperature: temperature ?? (json ? 0.1 : 0.55),
      maxOutputTokens: outputTokens(task),
      ...(json ? { responseMimeType: 'application/json' } : {}),
      ...(signal ? { abortSignal: signal } : {}),
    },
  })

  return {
    name: 'google-genai',
    provider: 'Google Gen AI SDK',
    owner: 'Google',
    transport: vertexai ? 'vertex-ai' : 'gemini-api',
    framework: '@google/genai',
    model,
    configured,
    vertexai,
    async complete(input) {
      const response = await getClient().models.generateContent(params(input))
      return {
        text: response.text || '',
        responseId: response.responseId || '',
        usage: response.usageMetadata || {},
      }
    },
    async stream(input) {
      return getClient().models.generateContentStream(params(input))
    },
  }
}
