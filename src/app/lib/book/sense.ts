// 感知层：共享 PP-OCR 先抄可见文字，端侧 Qwen3-VL-2B/MNN 再按版面选择字段。
import { visionRead } from '../skills/visionRead';
import { extractJSON } from '../skills/enrichEntity';
import { parseRating as parseRatingText, parseTitle as parseTitleText } from '../skills/parseInput';
import { runChineseOcr } from '../ocr/chineseOcr';

// 从一句话抽用户评分（→ 0-5 星）。解耦进 [parseInput] skill（确定性·不费云）。
export const parseRating = (text: string): number | undefined => parseRatingText(text, /满分|神作|封神|此生最爱/);

// 抽书名：《》优先；否则去评分尾巴 + 通用标记词 + 书噪声词（解耦进 [parseInput]）。
// 保留去噪后整段，不取最长段——否则含空格的多词书名被截断。
export function parseTitle(text: string): string {
  return parseTitleText(text, {
    verbs: /我?(刚|今天|昨天|最近)?(读完了?|读了|看完了?|看了|在读|刷完了?|啃完了?|读过)/g,
    nouns: /这本(书|小说)?|的?这本|想读|推荐/g,
  });
}

// 截图认书：原图只进端侧 VL，并用严格 JSON 合同一次完成可见字段整理。端侧未就绪→空结果（手填兜底）。
const clean = (value: unknown, max = 80) => (typeof value === 'string' ? value : '').replace(/[《》]/g, '').trim().slice(0, max);
const evidenceText = (value: unknown, max = 600) => (typeof value === 'string' ? value : '').trim().slice(0, max);
const normalizeEvidence = (value: string) => value.toLowerCase().replace(/[\s《》·•\-—:：,，.。!！?？'"“”‘’（）()【】\[\]]/g, '');

// OCR 已有证据时，VL 选出的字段必须能在证据里找到足够字符；提示词之外再加一层确定性防幻觉门。
function grounded(value: string, evidence: string): string {
  if (!value || !evidence) return value;
  const candidate = normalizeEvidence(value);
  const source = normalizeEvidence(evidence);
  if (!candidate || !source) return '';
  if (source.includes(candidate) || candidate.includes(source)) return value;
  const dp = new Array(source.length + 1).fill(0);
  for (const char of candidate) {
    let previous = 0;
    for (let index = 1; index <= source.length; index += 1) {
      const saved = dp[index];
      dp[index] = char === source[index - 1] ? previous + 1 : Math.max(dp[index], dp[index - 1]);
      previous = saved;
    }
  }
  // 简繁转换会让同一中文书名只保留约一半完全相同的码点；50% 仍能拦住无关书名，同时允许这种可解释差异。
  return dp[source.length] >= Math.max(2, Math.ceil(candidate.length * 0.5)) ? value : '';
}

export interface BookCoverFields {
  title: string;
  author: string;
  translator: string;
  publisher: string;
  visibleTags: string[];
  rawVisibleText: string;
  ocrUsed: boolean;
}

export async function readBookCover(imageDataUrl: string): Promise<BookCoverFields> {
  const empty: BookCoverFields = { title: '', author: '', translator: '', publisher: '', visibleTags: [], rawVisibleText: '', ocrUsed: false };
  const [ocrPage] = await runChineseOcr([imageDataUrl], { profile: 'document', rotations: [0] }).catch(() => []);
  const ocrText = evidenceText(ocrPage?.text);
  const prompt = [
    '这是一本书的封面、封底、书脊或一组书架照片。只整理图片中实际可见的信息。',
    `【端侧专业 OCR 候选】${ocrText || '无；请只按图面作答。'}`,
    '输出纯 JSON：{"title":"","author":"","translator":"","publisher":"","visibleTags":[],"visibleText":""}。',
    'title 只填最明确的一本书名；若同图有多本书或书名不确定就留空。visibleTags 只放图面明确写出的系列、奖项或类别，最多4个。',
    'PP-OCR 是原文证据，模型只负责结合图面判断哪些行分别是书名、作者、译者、出版社；不得擅自改写 OCR 原文。',
    'visibleText 原样保留关键可见文字，最多240字。不得凭常识补作者、简介、流派、国籍、年份或地点。',
  ].join('\n');
  const raw = await visionRead(imageDataUrl, prompt, { max: 1200, redact: true, detail: 'high', maxTokens: 320, timeoutMs: 125000 });
  const parsed = extractJSON<Record<string, unknown>>(raw);
  if (!parsed || Array.isArray(parsed)) return empty;
  const title = clean(parsed.title);
  const author = clean(parsed.author);
  const translator = clean(parsed.translator);
  const publisher = clean(parsed.publisher);
  const visibleTags = Array.isArray(parsed.visibleTags) ? parsed.visibleTags.map((item) => clean(item, 24)).filter(Boolean).slice(0, 4) : [];
  return {
    title: grounded(title, ocrText),
    author: grounded(author, ocrText),
    translator: grounded(translator, ocrText),
    publisher: grounded(publisher, ocrText),
    visibleTags: ocrText ? visibleTags.map((tag) => grounded(tag, ocrText)).filter(Boolean) : visibleTags,
    rawVisibleText: ocrText || evidenceText(parsed.visibleText, 240),
    ocrUsed: !!ocrText,
  };
}

export interface Sensed extends BookCoverFields { rating?: number; from: 'quote' | 'edge-vision' | 'manual' }
export async function sense(input: { kind: 'text' | 'image' | 'manual'; text?: string; imageDataUrl?: string; manualTitle?: string; manualRating?: number }): Promise<Sensed> {
  const blank = { author: '', translator: '', publisher: '', visibleTags: [], rawVisibleText: '', ocrUsed: false };
  if (input.kind === 'image' && input.imageDataUrl) return { ...await readBookCover(input.imageDataUrl), from: 'edge-vision' };
  if (input.kind === 'manual') return { ...blank, title: (input.manualTitle || '').trim(), rating: input.manualRating, from: 'manual' };
  const text = input.text || '';
  return { ...blank, title: parseTitle(text), rating: parseRating(text), from: 'quote' };
}
