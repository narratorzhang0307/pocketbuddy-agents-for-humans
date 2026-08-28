import { runEdgeChatEvidence } from '../../../frost-agent/edge/httpEdge';
import type { ReadingAnalysis } from './readingJot';
import { requestQwenVision } from './skills/qwenVision';

interface ReadingAnalysisInput {
  excerpt: string;
  bookTitle?: string;
  author?: string;
}

function stripFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.map(stringValue).filter(Boolean))].slice(0, 8)
    : stringValue(value).split(/[，,、#\n]+/).map((item) => item.trim()).filter(Boolean).slice(0, 8);
}

function ambiguityValue(value: unknown): string | undefined {
  const direct = stringValue(value);
  if (direct) return direct;
  const items = stringList(value);
  return items.length ? items.join('；') : undefined;
}

export function parseReadingAnalysis(raw: string, backend: 'edge' | 'cloud', model: string): ReadingAnalysis {
  const clean = stripFence(raw);
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const value = JSON.parse(clean.slice(start, end + 1)) as Record<string, unknown>;
      return {
        backend,
        model,
        interpretation: stringValue(value.interpretation) || stringValue(value.analysis) || '模型没有返回释义。',
        tags: stringList(value.tags),
        correctedExcerpt: stringValue(value.correctedExcerpt) || undefined,
        bookTitleCandidate: stringValue(value.bookTitleCandidate) || undefined,
        authorCandidate: stringValue(value.authorCandidate) || undefined,
        ambiguities: ambiguityValue(value.ambiguities),
      };
    } catch { /* Preserve useful plain text if the small-model JSON is incomplete. */ }
  }
  return { backend, model, interpretation: clean || '模型没有返回内容。', tags: [] };
}

function inputEvidence(input: ReadingAnalysisInput): string {
  return `【用户确认的摘录】\n${input.excerpt.trim().slice(0, 5000)}\n\n【用户已填书目；空值不是原文】\n书名：${input.bookTitle?.trim() || '（用户未提供）'}\n作者：${input.author?.trim() || '（用户未提供）'}`;
}

export function buildReadingEdgePrompt(input: ReadingAnalysisInput): string {
  return `${inputEvidence(input)}\n\n只根据上面的确认文字做本地整理。输出严格 JSON：{"interpretation":"只解释原文字面信息；不得增加作品内容、写作行为、观点或背景","tags":["最多5个标签"],"bookTitleCandidate":"只有原文逐字出现才填写","authorCandidate":"只有原文逐字出现才填写","ambiguities":"疑难点，没有则为空"}。界面中的“用户未提供”不是原文证据。不得改写或补全摘录，不得凭参数知识猜书名作者；若只有一条版权页字段，就只说明该字段。`;
}

function normalizedEvidence(value: string): string {
  return value.replace(/[\s\p{P}\p{S}]/gu, '').toLocaleLowerCase();
}

function groundedCandidate(candidate: string | undefined, excerpt: string): string | undefined {
  const value = normalizedEvidence(candidate || '');
  return value && normalizedEvidence(excerpt).includes(value) ? candidate : undefined;
}

function guardEdgeAnalysis(analysis: ReadingAnalysis, input: ReadingAnalysisInput): ReadingAnalysis {
  const excerpt = input.excerpt.trim();
  const metadata = excerpt.match(/^\s*(出版者|出版社|發行人|发行人|發行所|发行所|印刷者|編輯者|编辑者|作者)\s*[：:／/]\s*(.+?)\s*$/u);
  if (metadata) {
    const [, label, value] = metadata;
    return {
      ...analysis,
      interpretation: `这是一条书籍出版信息，原文标注的${label}为“${value}”。`,
      tags: ['版权页', '出版信息'],
      bookTitleCandidate: undefined,
      authorCandidate: /作者/u.test(label) ? value : undefined,
      ambiguities: undefined,
    };
  }
  return {
    ...analysis,
    bookTitleCandidate: groundedCandidate(analysis.bookTitleCandidate, excerpt),
    authorCandidate: groundedCandidate(analysis.authorCandidate, excerpt),
  };
}

export function buildReadingCloudPrompt(input: ReadingAnalysisInput): string {
  return `你正在查看用户主动上传的一小块书页选区。${inputEvidence(input)}\n\n请进行比端侧更细致的视觉核校，并严格输出 JSON：{"correctedExcerpt":"逐字对图核校后的建议稿，看不清写□","interpretation":"只陈述图片和确认文字直接支持的字面信息","tags":["最多8个、仅由可见文字直接支持的标签"],"bookTitleCandidate":"仅有可靠图像证据才填","authorCandidate":"仅有可靠图像证据才填","ambiguities":"只列改字依据、图像歧义和仍需人工核验处"}。云端建议不得声称已覆盖用户确认稿，不得根据语义偷偷补字；图片没有书名作者时字段留空。严禁根据字体、纸张、繁简体或机构名猜测年代、地点、版本和历史背景；这些信息只能在拿到明确书目后走独立检索。`;
}

function metadataRows(excerpt: string): Array<{ label: string; value: string }> {
  const rows = excerpt.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const parsed = rows.map((line) => line.match(/^\s*(出版者|出版社|發行人|发行人|發行所|发行所|印刷者|編輯者|编辑者|作者)\s*[：:／/]\s*(.+?)\s*$/u));
  return parsed.every(Boolean) ? parsed.map((match) => ({ label: match![1], value: match![2] })) : [];
}

function guardCloudAnalysis(analysis: ReadingAnalysis, input: ReadingAnalysisInput): ReadingAnalysis {
  const metadata = metadataRows(input.excerpt);
  if (!metadata.length) return analysis;
  const correctedMatches = normalizedEvidence(analysis.correctedExcerpt || '') === normalizedEvidence(input.excerpt);
  return {
    ...analysis,
    interpretation: `选区包含 ${metadata.length} 条书籍出版信息：${metadata.map((row) => `${row.label}为“${row.value}”`).join('；')}。`,
    tags: ['版权页', '出版信息'],
    bookTitleCandidate: undefined,
    authorCandidate: undefined,
    ambiguities: correctedMatches
      ? '云端逐字核校与确认稿一致；仍需人工对照原图。'
      : '云端建议与确认稿存在差异；需人工逐字核验，未自动覆盖。',
  };
}

export async function runReadingEdgeAnalysis(input: ReadingAnalysisInput): Promise<ReadingAnalysis> {
  const response = await runEdgeChatEvidence(buildReadingEdgePrompt(input), {
    system: '你是隐私优先的阅读摘录整理助手。确认原文不可改写；未知书目信息必须留空。',
    json: true,
    maxTokens: 520,
  });
  if (response.backend !== 'mnn' || !response.text?.trim()) throw new Error(response.error || '端侧 Qwen 未返回整理结果');
  return guardEdgeAnalysis(parseReadingAnalysis(response.text, 'edge', 'Qwen3-VL-2B/MNN'), input);
}

export async function runReadingCloudAnalysis(
  image: string,
  input: ReadingAnalysisInput,
  options: { endpoint?: string } = {},
): Promise<ReadingAnalysis> {
  const response = await requestQwenVision(image, {
    prompt: buildReadingCloudPrompt(input),
    purpose: 'reading-jot',
    timeoutMs: 150_000,
    endpoint: options.endpoint,
  });
  if (!response.ok || !response.text.trim()) throw new Error(`云端 Qwen 精读失败：${response.error || 'empty_text'}`);
  return guardCloudAnalysis(parseReadingAnalysis(response.text, 'cloud', response.model || 'qwen3.7-plus'), input);
}
