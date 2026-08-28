const trimBase = (value) => String(value || '').replace(/\/$/, '')

export function createQwenProvider(env = process.env) {
  const base = trimBase(env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1')
  const nativeBase = trimBase(env.DASHSCOPE_NATIVE_BASE_URL || 'https://dashscope.aliyuncs.com/api/v1')
  return {
    name: 'alibaba-model-studio',
    provider: 'Alibaba Cloud Model Studio',
    owner: 'Qwen',
    transport: 'dashscope-openai-compatible',
    key: env.DASHSCOPE_API_KEY || env.QWEN_API_KEY || '',
    url: `${base}/chat/completions`,
    nativeImageUrl: `${nativeBase}/services/aigc/multimodal-generation/generation`,
    model: env.QWEN_MODEL || 'qwen3.7-max',
    subagentModel: env.QWEN_MODEL_SUBAGENT || 'qwen3.8-max',
    skillAnswerModel: env.QWEN_MODEL_SKILL_ANSWER || 'qwen3.8-max',
    visionModel: env.QWEN_VISION_MODEL || 'qwen3-vl-plus',
    heritageVisionModel: env.QWEN_HERITAGE_VISION_MODEL || 'qwen3.7-plus',
    readingVisionModel: env.QWEN_READING_VISION_MODEL || 'qwen3.7-plus',
    mappingVisionModel: env.QWEN_MAPPING_VISION_MODEL || 'qwen3.7-plus',
    imageModel: env.QWEN_IMAGE_MODEL || 'qwen-image-2.0',
    searchModel: env.QWEN_SEARCH_MODEL || 'qwen3.5-plus',
    bookResearchModel: env.QWEN_BOOK_RESEARCH_MODEL || 'qwen3.7-plus',
    musicCardModel: env.QWEN_MUSIC_CARD_MODEL || 'qwen3.7-max',
    taskModels: {
      council: env.QWEN_MODEL_COUNCIL || 'qwen3.7-max',
      narrative: env.QWEN_MODEL_NARRATIVE || 'qwen3.7-max',
      route: env.QWEN_MODEL_ROUTE || 'qwen3.7-max',
      taskmaster: env.QWEN_MODEL_TASKMASTER || 'qwen3.7-max',
      multilingual: env.QWEN_MODEL_MULTILINGUAL || 'qwen3.7-max',
      default: env.QWEN_MODEL || 'qwen3.7-max',
    },
  }
}

export function qwenModelForTask(provider, task) {
  const name = String(task || 'default').trim().toLowerCase()
  if (name.startsWith('skill-answer:')) return provider.skillAnswerModel || 'qwen3.8-max'
  if (name.startsWith('subagent:')) return provider.subagentModel || provider.model
  if (name === 'run-route-intent') return provider.taskModels.route || provider.model
  if (provider.taskModels[name]) return provider.taskModels[name]
  if (name === 'research-book-metadata') return provider.bookResearchModel || provider.searchModel || provider.model
  if (name === 'music-card') return provider.musicCardModel || provider.model
  if (name.startsWith('research-')) return provider.searchModel || provider.taskModels.default || provider.model
  if (name.includes('narrative')) return provider.taskModels.narrative || provider.taskModels.default || provider.model
  if (name.includes('multilingual')) return provider.taskModels.multilingual || provider.taskModels.default || provider.model
  if (name === 'route' || name.startsWith('mapping-') || name.endsWith('-route') || name.endsWith('-plan')) return provider.taskModels.route || provider.taskModels.default || provider.model
  if (name.startsWith('council-')) return provider.taskModels.council || provider.taskModels.default || provider.model
  return provider.taskModels.default || provider.model
}

export function qwenVisionConfigForPurpose(provider, purpose) {
  const route = String(purpose || '').trim().toLowerCase()
  // The flagship heritage request includes an image and four evidence-heavy
  // sections. Real runs can cross 105s, so leave room for normal provider
  // latency variance while keeping a finite upstream deadline.
  if (route === 'heritage') return { model: provider.heritageVisionModel, maxTokens: 1200, timeoutMs: 180000 }
  if (route === 'reading-jot') return { model: provider.readingVisionModel, maxTokens: 1800, timeoutMs: 120000 }
  if (route === 'mapping') return { model: provider.mappingVisionModel, maxTokens: 2000, timeoutMs: 120000 }
  return { model: provider.visionModel, maxTokens: 900, timeoutMs: 45000 }
}

export function qwenVisionSystemForPurpose(purpose) {
  const route = String(purpose || '').trim().toLowerCase()
  if (route === 'heritage') {
    return '你是文献证据优先的古籍与碑刻整理专家。图像、用户确认稿和明确提供的馆藏题名是唯一事实来源。不得扩展官职沿革、爵位等级、古今地理对应、人物生平或年代背景；没有来源支持就明确写待考。'
  }
  if (route === 'reading-jot') {
    return '你是证据优先的阅读摘录精读助手。只能依据用户主动上传的选区小图和确认稿逐字核校、解释与标记；不得假装覆盖用户原文，不得凭常识猜书名作者，看不清的字写□并列入歧义。'
  }
  if (route === 'mapping') {
    return '你是证据优先的文献 Mapping 整理专家。只能依据本次上传 PDF 的逐页图像与 PP-OCR 原文提炼地点、引文和原文内说明；不得编造地点、坐标、页码或外部历史事实。只输出纯 JSON。'
  }
  return ''
}

export function buildQwenChatBody(provider, { prompt, system = '', task = 'default', json = false, stream = false, search = false, temperature } = {}) {
  const messages = []
  if (system) messages.push({ role: 'system', content: system })
  messages.push({ role: 'user', content: prompt || '' })
  return {
    model: qwenModelForTask(provider, task),
    messages,
    temperature: temperature ?? (json ? 0 : 0.65),
    stream,
    ...(String(task).startsWith('subagent:') ? { max_tokens: 1536, enable_thinking: false } : {}),
    ...(String(task).startsWith('skill-answer:') ? { max_tokens: 768, enable_thinking: false } : {}),
    ...(task === 'run-route-intent' ? { max_tokens: 512, enable_thinking: false } : {}),
    ...(json ? { response_format: { type: 'json_object' } } : {}),
    ...(search ? { enable_search: true, search_options: { forced_search: true, search_strategy: 'max' } } : {}),
  }
}

export function buildQwenImageBody(provider, prompt) {
  return {
    model: provider.imageModel,
    input: { messages: [{ role: 'user', content: [{ text: String(prompt || '').slice(0, 5200) }] }] },
    parameters: { prompt_extend: true, watermark: false, size: '1328*1328', n: 1 },
  }
}

export function readQwenImageUrl(data) {
  const content = data?.output?.choices?.[0]?.message?.content
  if (Array.isArray(content)) {
    const block = content.find((item) => typeof item?.image === 'string' || typeof item?.image_url === 'string')
    if (block) return block.image || block.image_url || ''
  }
  return data?.output?.results?.[0]?.url || ''
}
