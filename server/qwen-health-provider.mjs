const trimBase = (value) => String(value || '').replace(/\/$/, '')

export function createQwenProvider(env = process.env) {
  const base = trimBase(env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1')
  return {
    provider: 'Alibaba Cloud Model Studio',
    owner: 'Qwen',
    transport: 'dashscope-openai-compatible',
    key: env.DASHSCOPE_API_KEY || env.QWEN_API_KEY || '',
    url: `${base}/chat/completions`,
    model: env.QWEN_MODEL || 'qwen3.7-max',
    subagentModel: env.QWEN_MODEL_SUBAGENT || 'qwen3.8-max',
    skillAnswerModel: env.QWEN_MODEL_SKILL_ANSWER || 'qwen3.8-max',
    taskModels: {
      route: env.QWEN_MODEL_ROUTE || env.QWEN_MODEL || 'qwen3.7-max',
      taskmaster: env.QWEN_MODEL_TASKMASTER || env.QWEN_MODEL || 'qwen3.7-max',
      multilingual: env.QWEN_MODEL_MULTILINGUAL || env.QWEN_MODEL || 'qwen3.7-max',
    },
  }
}

export function qwenModelForTask(provider, task) {
  const name = String(task || 'default').trim().toLowerCase()
  if (name.startsWith('skill-answer:')) return provider.skillAnswerModel || 'qwen3.8-max'
  if (name.startsWith('subagent:')) return provider.subagentModel || provider.model
  if (name === 'run-route-intent') return provider.taskModels.route || provider.model
  if (name === 'route' || name.endsWith('-route') || name.endsWith('-plan')) return provider.taskModels.route
  if (name === 'taskmaster' || name.startsWith('health-')) return provider.taskModels.taskmaster
  if (name.includes('multilingual')) return provider.taskModels.multilingual
  return provider.model
}

export function buildQwenChatBody(provider, { prompt, system = '', task = 'default', json = false, temperature, maxTokens } = {}) {
  const messages = []
  if (system) messages.push({ role: 'system', content: system })
  messages.push({ role: 'user', content: prompt || '' })
  const boundedTokens = maxTokens
    || (String(task).startsWith('subagent:') ? 1536 : 0)
    || (String(task).startsWith('skill-answer:') ? 768 : 0)
    || (task === 'run-route-intent' ? 512 : 0)
  return {
    model: qwenModelForTask(provider, task),
    messages,
    temperature: temperature ?? (json ? 0 : 0.55),
    ...(boundedTokens ? { max_tokens: Math.max(1, Math.min(8192, Number(boundedTokens) || 2048)) } : {}),
    ...(String(task).startsWith('subagent:') || String(task).startsWith('skill-answer:') || task === 'run-route-intent' ? { enable_thinking: false } : {}),
    ...(json ? { response_format: { type: 'json_object' } } : {}),
  }
}
