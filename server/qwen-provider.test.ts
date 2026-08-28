import { describe, expect, it } from 'vitest';
// @ts-expect-error Runtime provider is intentionally plain ESM shared by Node and Vite.
import { buildQwenChatBody, buildQwenImageBody, createQwenProvider, qwenModelForTask, qwenVisionConfigForPurpose, qwenVisionSystemForPurpose, readQwenImageUrl } from './qwen-provider.mjs';

describe('unified Qwen provider', () => {
  const provider = createQwenProvider({
    DASHSCOPE_API_KEY: 'secret',
    QWEN_MODEL_COUNCIL: 'qwen-council-test',
    QWEN_MODEL_NARRATIVE: 'qwen-narrative-test',
    QWEN_MODEL_MULTILINGUAL: 'qwen-multilingual-test',
    QWEN_MODEL_ROUTE: 'qwen-route-test',
    QWEN_MODEL_TASKMASTER: 'qwen-taskmaster-test',
    QWEN_SEARCH_MODEL: 'qwen-search-test',
    QWEN_BOOK_RESEARCH_MODEL: 'qwen-book-research-test',
    QWEN_MUSIC_CARD_MODEL: 'qwen-music-card-test',
  });

  it('routes every task to a Qwen model and one DashScope endpoint', () => {
    expect(provider.url).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
    expect(qwenModelForTask(provider, 'council')).toBe('qwen-council-test');
    expect(qwenModelForTask(provider, 'exhibition-narrative')).toBe('qwen-narrative-test');
    expect(qwenModelForTask(provider, 'exhibition-multilingual')).toBe('qwen-multilingual-test');
    expect(qwenModelForTask(provider, 'mapping-place-resolve')).toBe('qwen-route-test');
    expect(qwenModelForTask(provider, 'frost-plan')).toBe('qwen-route-test');
    expect(qwenModelForTask(provider, 'taskmaster')).toBe('qwen-taskmaster-test');
    expect(qwenModelForTask(provider, 'research-place')).toBe('qwen-search-test');
    expect(qwenModelForTask(provider, 'research-book-metadata')).toBe('qwen-book-research-test');
    expect(qwenModelForTask(provider, 'music-card')).toBe('qwen-music-card-test');
    expect(qwenModelForTask(provider, 'unknown')).toBe('qwen3.7-max');
    expect(provider.owner).toBe('Qwen');
    expect(provider.heritageVisionModel).toBe('qwen3.7-plus');
    expect(provider.readingVisionModel).toBe('qwen3.7-plus');
    expect(provider.mappingVisionModel).toBe('qwen3.7-plus');
  });

  it('builds deterministic JSON and explicit search requests', () => {
    expect(buildQwenChatBody(provider, { prompt: 'x', json: true })).toMatchObject({ temperature: 0, response_format: { type: 'json_object' } });
    expect(buildQwenChatBody(provider, { prompt: 'x', search: true })).toMatchObject({ enable_search: true, search_options: { forced_search: true, search_strategy: 'max' } });
  });

  it('uses the current flagship Plus model for explicit research by default', () => {
    const defaultProvider = createQwenProvider({ DASHSCOPE_API_KEY: 'secret' });
    expect(defaultProvider.searchModel).toBe('qwen3.5-plus');
    expect(defaultProvider.bookResearchModel).toBe('qwen3.7-plus');
    expect(defaultProvider.musicCardModel).toBe('qwen3.7-max');
    expect(defaultProvider.model).toBe('qwen3.7-max');
    expect(qwenModelForTask(defaultProvider, 'taskmaster')).toBe('qwen3.7-max');
    expect(qwenModelForTask(defaultProvider, 'research-book-metadata')).toBe('qwen3.7-plus');
    expect(qwenModelForTask(defaultProvider, 'music-card')).toBe('qwen3.7-max');
  });

  it('uses the native Qwen Image contract', () => {
    expect(buildQwenImageBody(provider, '画一颗星球')).toMatchObject({ model: 'qwen-image-2.0', parameters: { size: '1328*1328' } });
    expect(readQwenImageUrl({ output: { choices: [{ message: { content: [{ image: 'https://oss.example/a.png' }] } }] } })).toBe('https://oss.example/a.png');
  });

  it('reserves the flagship multimodal model for evidence-heavy heritage and reading work', () => {
    expect(qwenVisionConfigForPurpose(provider, 'heritage')).toEqual({ model: 'qwen3.7-plus', maxTokens: 1200, timeoutMs: 180000 });
    expect(qwenVisionConfigForPurpose(provider, 'reading-jot')).toEqual({ model: 'qwen3.7-plus', maxTokens: 1800, timeoutMs: 120000 });
    expect(qwenVisionConfigForPurpose(provider, 'mapping')).toEqual({ model: 'qwen3.7-plus', maxTokens: 2000, timeoutMs: 120000 });
    expect(qwenVisionConfigForPurpose(provider, 'exhibition')).toEqual({ model: 'qwen3-vl-plus', maxTokens: 900, timeoutMs: 45000 });
    expect(qwenVisionSystemForPurpose('reading-jot')).toContain('选区小图');
    expect(qwenVisionSystemForPurpose('mapping')).toContain('PDF');
    expect(qwenVisionSystemForPurpose('exhibition')).toBe('');
  });
});


it('uses the flagship for bounded Skill queries without changing existing tasks', () => {
  const provider = createQwenProvider({});
  expect(buildQwenChatBody(provider, { prompt: 'fixture', task: 'skill-answer:frost.outdoor-window:answer', json: true })).toMatchObject({ model: 'qwen3.8-max', max_tokens: 768, enable_thinking: false });
  expect(qwenModelForTask(provider, 'default')).toBe('qwen3.7-max');
});
