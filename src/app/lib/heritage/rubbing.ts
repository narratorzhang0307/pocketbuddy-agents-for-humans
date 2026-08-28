import { getEdgeRuntimeStatus, runEdgeChatEvidence, runEdgeVisionEvidence, restoreHeritageImage } from '../../../../frost-agent/edge/httpEdge';
import type { EdgeResponse } from '../../../../frost-agent/edge/types';
import { requestQwenVision } from '../skills/qwenVision';
import { runProfessionalChineseOcr } from './professionalOcr';
import type { ChineseOcrProfile } from '../ocr/chineseOcr';

export type RubbingGate = 'passed' | 'manual-review' | 'failed';
export type HeritageMaterial = 'guji' | 'rubbing';

export interface RubbingCandidate {
  source: 'professional-ocr' | 'qwen-base' | 'guji-lora' | 'rubbing-lora';
  text: string;
  valid: boolean;
  reasons: string[];
}

export interface RubbingResult {
  backend: 'mnn' | 'qwen-cloud';
  base: RubbingCandidate;
  lora: RubbingCandidate;
  gate: RubbingGate;
  selected: string;
  reason: string;
}

export interface HeritageCloudEnhancement {
  text: string;
  model: string;
}

export interface HeritageCompletionCandidate {
  text: string;
  model: string;
  source: 'local-mnn' | 'qwen-cloud';
  referenceBacked: boolean;
}

const HERITAGE_CLOUD_TIMEOUT_MS = 210_000;

export type HeritageOcrStage = 'qwen-review';
export type HeritageOcrStageListener = (stage: HeritageOcrStage, detail: string) => void;

function withDeadline<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = globalThis.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) globalThis.clearTimeout(timer);
  });
}

function stripTerminalRepetition(value: string): string {
  const chars = [...value.trimEnd()];
  let collapseStart = chars.length;
  for (let period = 1; period <= 16; period += 1) {
    if (chars.length < period * 8) continue;
    const unit = chars.slice(-period);
    if (!unit.every((char) => /[\p{L}\p{N}□`]/u.test(char))) continue;
    let start = chars.length;
    while (start >= period && chars.slice(start - period, start).join('') === unit.join('')) start -= period;
    if (chars.length - start >= Math.max(64, period * 8)) collapseStart = Math.min(collapseStart, start);
  }
  if (collapseStart === chars.length) return value;
  const prefix = chars.slice(0, collapseStart).join('').trimEnd();
  const tailCoverage = (chars.length - collapseStart) / Math.max(1, chars.length);
  const visible = [...prefix.replace(/\s+/g, '')];
  return tailCoverage < 0.85 && visible.length >= 4 && new Set(visible).size >= 3 ? prefix : '□';
}

const clean = (value: string): string => stripTerminalRepetition(value)
  .replace(/```(?:text)?/gi, '')
  .replace(/```/g, '')
  .replace(/^\s*(?:转录|识读结果|文字)[:：]\s*/u, '')
  .trim();

const comparable = (value: string): string => clean(value).normalize('NFKC').replace(/[\s，。！？、；：“”‘’（）《》【】\[\].,:;!?-]/gu, '');

function repetitionDetected(value: string): boolean {
  const text = comparable(value);
  if (/(.{2,10})\1{3,}/u.test(text)) return true;
  const counts = new Map<string, number>();
  for (const char of text) counts.set(char, (counts.get(char) || 0) + 1);
  return text.length >= 12 && Math.max(0, ...counts.values()) / text.length > 0.48;
}

function decoderCollapsed(value: string): boolean {
  const text = comparable(value);
  return text.length >= 12 && new Set([...text.toUpperCase()]).size <= 2;
}

export function assessRubbingCandidate(source: RubbingCandidate['source'], raw: string): RubbingCandidate {
  const rawText = clean(raw);
  const compact = comparable(rawText);
  const reasons: string[] = [];
  if (raw.length >= 64 && rawText === '□') reasons.push('解码塌缩');
  if (compact.length < 2) reasons.push('可读字符不足');
  if (rawText.length > 1200) reasons.push('输出异常过长');
  if (repetitionDetected(rawText)) reasons.push('检测到复读');
  if (/无法(?:识别|辨认)|看不清|抱歉|as an ai|i cannot/iu.test(rawText)) reasons.push('模型未给出转录');
  if (!/[\u3400-\u9fff□]/u.test(rawText)) reasons.push('未检测到可读汉字');
  const text = reasons.length > 0 && rawText.length > 160 ? `${rawText.slice(0, 160)}…` : rawText;
  return { source, text, valid: reasons.length === 0, reasons };
}

function bigramSimilarity(left: string, right: string): number {
  const a = comparable(left); const b = comparable(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const grams = (value: string) => new Set(Array.from({ length: Math.max(1, value.length - 1) }, (_, index) => value.slice(index, index + 2)));
  const x = grams(a); const y = grams(b); let common = 0;
  x.forEach((item) => { if (y.has(item)) common += 1; });
  return common / Math.max(x.size, y.size, 1);
}

export function gateRubbingCandidates(baseRaw: string, loraRaw: string, material: HeritageMaterial = 'rubbing'): Omit<RubbingResult, 'backend'> {
  const base = assessRubbingCandidate('qwen-base', baseRaw);
  const lora = assessRubbingCandidate(material === 'guji' ? 'guji-lora' : 'rubbing-lora', loraRaw);
  if (!base.valid && !lora.valid) return {
    base, lora, gate: 'failed', selected: '',
    reason: (base.reasons.includes('解码塌缩') && lora.reasons.includes('解码塌缩')) || (decoderCollapsed(base.text) && decoderCollapsed(lora.text))
      ? '共享视觉解码器发生重复输出；结果已拒绝且没有写入资料库。请安装含视觉防复读采样器的新 APK 后重试。'
      : `Base（${base.reasons.join('、') || '未知异常'}）与 LoRA（${lora.reasons.join('、') || '未知异常'}）均未通过门禁；请重拍或手工录入。`,
  };
  if (base.valid && !lora.valid) return { base, lora, gate: 'passed', selected: base.text, reason: `LoRA ${lora.reasons.join('、')}，采用 Base。` };
  if (!base.valid && lora.valid) return { base, lora, gate: 'passed', selected: lora.text, reason: `Base ${base.reasons.join('、')}，采用 LoRA。` };
  const similarity = bigramSimilarity(base.text, lora.text);
  if (similarity >= 0.82) return { base, lora, gate: 'passed', selected: lora.text, reason: `双候选一致度 ${Math.round(similarity * 100)}%，采用${material === 'guji' ? '古籍' : '碑拓'} LoRA 转录。` };
  return { base, lora, gate: 'manual-review', selected: '', reason: `Base 与 LoRA 一致度仅 ${Math.round(similarity * 100)}%，禁止自动覆盖，请人工选择或校订。` };
}

const PROMPTS: Record<HeritageMaterial, string> = {
  guji: '逐字转录这张古籍书页。保持竖排栏序、正文与夹注层级；版框、印章、水印和页眉不得混入正文。不总结、不翻译、不补字；不能确认的单字写作□。只输出原始转录。',
  rubbing: '逐字转录这张碑刻或拓片。保持可见行序，不总结、不翻译、不补字；不能确认的单字写作□。只输出原始转录。',
};

export function buildHeritageCloudPrompt(confirmedText: string, material: HeritageMaterial, trustedReference = ''): string {
  const materialName = material === 'guji' ? '竖排繁体古籍' : '碑刻或拓片';
  const reference = trustedReference.trim()
    ? `\n\n【可引用的馆藏题名】\n${trustedReference.trim().slice(0, 1600)}\n馆藏题名属于辅助证据，必须与图像/OCR 分开标注。`
    : '';
  return `你是严谨的中文文献整理专家。当前材料是${materialName}。请同时查看原图，并复核下面由手机端 PP-OCRv5 和 Qwen 生成、用户可校订的确认稿。

【手机端确认稿】
${confirmedText.trim().slice(0, 7000)}${reference}

请严格输出四个部分：
【云端精校稿】逐字对照原图修正明显 OCR 错字，保留原有行序；看不清的字写□，不得凭语义补造。
【断句稿】仅在精校稿基础上添加现代标点。
【逐句释义】逐句给出准确、简洁的白话释义；只陈述有图像、确认稿或馆藏题名支持的内容。
【疑难字与依据】列出改动处、判断依据与仍待人工核验的字；没有则写“无”。

禁止把推测写成确定事实，禁止虚构人物生平、年代、地名或历史故事。除非馆藏题名明确提供，否则不要扩展官职沿革、爵位等级、治所今地或人物身份。`;
}

export async function runHeritageCloudEnhancement(
  image: string,
  confirmedText: string,
  material: HeritageMaterial,
  trustedReference = '',
): Promise<HeritageCloudEnhancement> {
  const source = confirmedText.trim();
  if (!source) throw new Error(`请先确认或校订${material === 'guji' ? '古籍' : '碑拓'}识读稿`);
  const response = await requestQwenVision(image, {
    prompt: buildHeritageCloudPrompt(source, material, trustedReference),
    purpose: 'heritage',
    timeoutMs: HERITAGE_CLOUD_TIMEOUT_MS,
  });
  if (!response.ok || !response.text.trim()) throw new Error(`云端 Qwen 精校失败：${response.error || 'empty_text'}`);
  return { text: response.text.trim(), model: response.model || 'qwen3.7-plus' };
}

export function buildHeritageCompletionPrompt(
  visibleText: string,
  material: HeritageMaterial,
  knownSentence = '',
): string {
  const reference = knownSentence.trim()
    ? `\n\n【用户提供的完整原句】\n${knownSentence.trim().slice(0, 1200)}\n这只是参考证据，仍需用户确认后才能进入像素修复。`
    : '\n\n【完整原句】\n用户未提供。只能提出最多 3 个推测候选，必须明确标为“推测候选”，不得冒充真实原文。';
  return `你是谨慎的中文文献残损分析助手。材料是${material === 'guji' ? '古籍书页' : '碑刻拓片'}。OCR 已读取残损周围尚可见的文字：\n\n【周围可见文字】\n${visibleText.trim().slice(0, 4200)}${reference}\n\n只输出三个部分：\n【缺字候选】列出最可能的缺字或短语；没有把握写“无法确定”。\n【依据】逐条说明来自可见字、完整原句或字形上下文的哪一项证据。\n【置信声明】若有完整原句写“原句参考候选，仍需人工确认”；若没有完整原句写“推测候选，不可作为真实原文”。\n\n禁止编造版本、人物、年代或出处；禁止声称已经恢复原文；不要讨论像素修复。`;
}

export async function runHeritageCompletionLocal(
  visibleText: string,
  material: HeritageMaterial,
  knownSentence = '',
): Promise<HeritageCompletionCandidate> {
  if (!visibleText.trim()) throw new Error('请先运行 OCR，取得残损周围可见文字');
  const response = await runEdgeChatEvidence(buildHeritageCompletionPrompt(visibleText, material, knownSentence), {
    system: '你只做有证据约束的缺字候选分析。推测必须标明推测，绝不把候选冒充原文。',
    maxTokens: 320,
  });
  const text = clean(response.text || '');
  if (response.backend !== 'mnn' || !text) throw new Error(response.error || 'Qwen3-VL-2B 端侧候选分析未返回结果');
  return { text, model: 'Qwen3-VL-2B · MNN', source: 'local-mnn', referenceBacked: !!knownSentence.trim() };
}

export async function runHeritageCompletionCloud(
  image: string,
  visibleText: string,
  material: HeritageMaterial,
  knownSentence = '',
): Promise<HeritageCompletionCandidate> {
  if (!visibleText.trim()) throw new Error('请先运行 OCR，取得残损周围可见文字');
  const response = await requestQwenVision(image, {
    prompt: buildHeritageCompletionPrompt(visibleText, material, knownSentence),
    purpose: 'heritage',
    timeoutMs: HERITAGE_CLOUD_TIMEOUT_MS,
  });
  if (!response.ok || !response.text.trim()) throw new Error(`云端缺字候选失败：${response.error || 'empty_text'}`);
  return { text: response.text.trim(), model: response.model || 'qwen3.7-plus', source: 'qwen-cloud', referenceBacked: !!knownSentence.trim() };
}

type OcrLineBox = NonNullable<EdgeResponse['ocrLines']>[number];
type ReviewLineBox = Pick<OcrLineBox, 'text' | 'left' | 'top' | 'right' | 'bottom'> & {
  score?: number;
  alternatives?: string[];
};

async function cropOcrLine(imageUrl: string, box: ReviewLineBox): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = reject;
    element.src = imageUrl;
  });
  const padX = Math.max(6, Math.round((box.right - box.left) * 0.12));
  const padY = Math.max(8, Math.round((box.bottom - box.top) * 0.015));
  const left = Math.max(0, box.left - padX);
  const top = Math.max(0, box.top - padY);
  const right = Math.min(image.naturalWidth, box.right + padX);
  const bottom = Math.min(image.naturalHeight, box.bottom + padY);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, right - left);
  canvas.height = Math.max(1, bottom - top);
  canvas.getContext('2d')!.drawImage(image, left, top, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.96);
}

function conservativeBaseReview(ocr: string, base: string): string {
  const source = clean(ocr); const candidate = clean(base);
  if (!source || !candidate) return source;
  const grounded = bigramSimilarity(source, candidate);
  const lengthRatio = candidate.length / Math.max(1, source.length);
  // Base may correct OCR glyphs, but it may not expand a small crop into a
  // newly invented sentence. The original OCR remains the default candidate.
  return grounded >= 0.68 && lengthRatio >= 0.82 && lengthRatio <= 1.18 ? candidate : source;
}

async function loadPrimaryOcr(image: string, material: HeritageMaterial, profile?: ChineseOcrProfile): Promise<{
  source: RubbingCandidate['source'];
  lines: ReviewLineBox[];
  model: string;
  detail: string;
  reviewImage: string;
}> {
  const result = await withDeadline(
    runProfessionalChineseOcr(image, profile ?? (material === 'rubbing' ? 'document' : 'heritage')),
    720_000,
    'PP-OCRv5 本地识别超时；未采用其他 OCR，请重试',
  );
  return {
    source: 'professional-ocr',
    lines: result.lines,
    model: result.model === 'PP-OCRv6_small' ? 'PP-OCRv6 Small' : 'PP-OCRv5 mobile',
    detail: `${result.detectedBoxes} 个文字区域 · 自动旋转 ${result.rotation}° · ${Math.round(result.totalMs)} ms · ${result.provider}`,
    reviewImage: result.reviewImage,
  };
}

function selectReviewIndexes(lines: ReviewLineBox[], limit = 1): Set<number> {
  const eligible = lines
    .map((line, index) => ({ index, score: line.score ?? 0.75, length: [...clean(line.text)].length }))
    .filter((item) => item.length >= 2)
    .sort((left, right) => left.score - right.score);
  const uncertain = eligible.filter((item) => item.score < 0.88);
  const selected = (uncertain.length > 0 ? uncertain : eligible).slice(0, Math.min(limit, Math.max(2, eligible.length)));
  return new Set(selected.map((item) => item.index));
}

async function runOcrWithVisualReview(image: string, material: HeritageMaterial, onStage?: HeritageOcrStageListener, profile?: ChineseOcrProfile): Promise<RubbingResult> {
  const primary = await loadPrimaryOcr(image, material, profile);
  const lines = primary.lines.filter((line) => /[\u3400-\u9fff]/u.test(line.text));
  if (lines.length === 0) throw new Error('专业中文 OCR 未检测到可用文字区域');
  const reviewIndexes = selectReviewIndexes(lines, 1);
  onStage?.('qwen-review', `${primary.model} 主稿完成，只复核 ${reviewIndexes.size} 个低置信区域`);
  const reviewed: string[] = [];
  let changed = 0;
  for (const [index, line] of lines.entries()) {
    const source = clean(line.text);
    if (!reviewIndexes.has(index)) { reviewed.push(source); continue; }
    const crop = await cropOcrLine(primary.reviewImage, line);
    const alternatives = (line.alternatives || []).map(clean).filter(Boolean);
    const alternateHint = alternatives.length
      ? `\n其他图像预处理候选：${alternatives.map((value, candidateIndex) => `${String.fromCharCode(66 + candidateIndex)}：“${value}”`).join('；')}。`
      : '';
    const materialName = material === 'guji' ? '繁体竖排古籍' : '碑刻或拓片';
    const prompt = `图中只有${materialName}的一个文字区域。专业 OCR 主候选 A 是：“${source}”。${alternateHint}\n请逐字对照图片，只核对 OCR 中的疑字；不得添加图中没有的句子，不得解释，无法确认的字写□。只输出校正后的原文。`;
    // Competition-safe path: one official Base review only. The currently
    // exported visual overlays target a different visual graph revision and
    // are deliberately not loaded by this live chain.
    const baseResponse = await runEdgeVisionEvidence(crop, prompt, { detail: 'ocr', maxTokens: 96 });
    const baseText = clean(baseResponse.text || '');
    const next = conservativeBaseReview(source, baseText);
    if (next !== source) changed += 1;
    reviewed.push(next);
  }
  const primaryText = lines.map((line) => clean(line.text)).join('\n');
  const reviewedText = reviewed.join('\n');
  const base: RubbingCandidate = { source: primary.source, text: primaryText, valid: primaryText.length > 0, reasons: [] };
  const lora: RubbingCandidate = { source: 'qwen-base', text: reviewedText, valid: reviewedText.length > 0, reasons: [] };
  return {
    backend: 'mnn', base, lora, gate: 'manual-review', selected: primaryText,
    reason: `${primary.model} 先生成 ${lines.length} 段忠实主稿（${primary.detail}）；官方 Qwen3-VL-2B Base + 古籍 LoRA 通过 MNN 对 ${reviewIndexes.size} 个低置信区域同图复核，${changed} 段达到保守改字门槛。OCR 主稿默认保留，请确认疑难字。`,
  };
}

export async function runHeritageOcr(image: string, material: HeritageMaterial, onStage?: HeritageOcrStageListener, profile?: ChineseOcrProfile): Promise<RubbingResult> {
  const status = await getEdgeRuntimeStatus();
  if (status.backend !== 'mnn' || !status.runtime?.visionReady) throw new Error('Qwen3-VL MNN 端侧视觉基座尚未就绪');
  if (!status.runtime.version?.includes('pocket-jni-v17-qwen3vl2b-official-image-path')) {
    const app = status.runtime.device?.appVersionName || '未知版本';
    const bridge = status.runtime.version || '未读取到 JNI 版本';
    throw new Error(`当前仍是旧原生视觉引擎：APK ${app} · ${bridge}。请覆盖安装 2B 古籍链路 APK 后再试。`);
  }
  return runOcrWithVisualReview(image, material, onStage, profile);
}

/**
 * Explicit MNN-OFF control path. This never pretends that the local Visual LoRA
 * ran: the cloud service can only execute a Qwen-VL Base control candidate.
 * Keeping the result in the same UI makes the decoder fault easy to compare,
 * while the backend and reason retain the provenance needed by the evidence log.
 */
export async function runHeritageCloudDiagnostic(image: string, material: HeritageMaterial): Promise<RubbingResult> {
  const response = await requestQwenVision(image, { prompt: PROMPTS[material], timeoutMs: 45_000 });
  if (!response.ok) throw new Error(`MNN OFF 对照请求失败：${response.error || 'qwen_cloud_unavailable'}`);
  const base = assessRubbingCandidate('qwen-base', response.text);
  const lora: RubbingCandidate = {
    source: material === 'guji' ? 'guji-lora' : 'rubbing-lora',
    text: '', valid: false, reasons: ['MNN OFF，本地 LoRA 未运行'],
  };
  return {
    backend: 'qwen-cloud', base, lora,
    gate: base.valid ? 'passed' : 'failed',
    selected: base.valid ? base.text : '',
    reason: base.valid
      ? 'MNN OFF 对照通过：云端 Qwen-VL Base 可正常识读；本地 LoRA 未运行。'
      : `MNN OFF 对照也未通过输出门禁：${base.reasons.join('、') || '未知异常'}。`,
  };
}

export async function runRubbingOcr(image: string): Promise<RubbingResult> {
  return runHeritageOcr(image, 'rubbing');
}

const PUNCTUATION_MAP: Record<string, string> = {
  ',': '，', '.': '。', ';': '；', ':': '：', '?': '？', '!': '！',
  '，': '，', '。': '。', '；': '；', '：': '：', '？': '？', '！': '！', '、': '、',
};

function punctuationBody(raw: string): string {
  const text = clean(raw);
  const labelled = text.includes('【断句稿】') ? text.split('【断句稿】', 2)[1] : text;
  return labelled.split(/\n?【(?:白话释义|疑难提示)】/u, 1)[0].trim();
}

/**
 * Extract only Qwen's punctuation decisions and project them onto the exact
 * confirmed source. Edit-distance alignment tolerates simplified/traditional
 * substitutions in model output, but the returned characters always come
 * from `source`.
 */
export function projectHeritagePunctuation(source: string, rawCandidate: string): string {
  const sourceChars = [...source];
  const candidateChars = [...punctuationBody(rawCandidate)];
  const sourceEvidence = sourceChars.map((char, index) => ({ char, index })).filter(({ char }) => !/\s/u.test(char) && !PUNCTUATION_MAP[char]);
  const candidateEvidence = candidateChars.map((char, index) => ({ char, index })).filter(({ char }) => !/\s/u.test(char) && !PUNCTUATION_MAP[char]);
  if (!sourceEvidence.length || candidateEvidence.length / sourceEvidence.length < 0.72 || candidateEvidence.length / sourceEvidence.length > 1.28) {
    throw new Error('Qwen2B 断句输出与确认原文长度不一致');
  }

  const rows = sourceEvidence.length + 1;
  const columns = candidateEvidence.length + 1;
  const distance = Array.from({ length: rows }, () => Array<number>(columns).fill(0));
  for (let row = 1; row < rows; row += 1) distance[row][0] = row * 2;
  for (let column = 1; column < columns; column += 1) distance[0][column] = column * 2;
  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const same = sourceEvidence[row - 1].char.normalize('NFKC') === candidateEvidence[column - 1].char.normalize('NFKC');
      distance[row][column] = Math.min(
        distance[row - 1][column - 1] + (same ? 0 : 1),
        distance[row - 1][column] + 2,
        distance[row][column - 1] + 2,
      );
    }
  }

  const candidateToSource = new Map<number, number>();
  let row = sourceEvidence.length;
  let column = candidateEvidence.length;
  while (row > 0 && column > 0) {
    const same = sourceEvidence[row - 1].char.normalize('NFKC') === candidateEvidence[column - 1].char.normalize('NFKC');
    if (distance[row][column] === distance[row - 1][column - 1] + (same ? 0 : 1)) {
      candidateToSource.set(column - 1, row - 1); row -= 1; column -= 1;
    } else if (distance[row][column] === distance[row - 1][column] + 2) row -= 1;
    else column -= 1;
  }

  const insertions = new Map<number, string>();
  let evidenceIndex = -1;
  let lastSourceIndex = -1;
  for (const char of candidateChars) {
    const punctuation = PUNCTUATION_MAP[char];
    if (punctuation && lastSourceIndex >= 0) {
      insertions.set(lastSourceIndex, `${insertions.get(lastSourceIndex) || ''}${punctuation}`);
    } else if (!/\s/u.test(char)) {
      evidenceIndex += 1;
      const sourceEvidenceIndex = candidateToSource.get(evidenceIndex);
      if (sourceEvidenceIndex !== undefined) lastSourceIndex = sourceEvidence[sourceEvidenceIndex].index;
    }
  }
  if (insertions.size === 0) throw new Error('Qwen2B 未返回可用的古文标点');
  return sourceChars.map((char, index) => `${char}${insertions.get(index) || ''}`).join('');
}

function chunkHeritageText(source: string, material: HeritageMaterial): string[] {
  const lines = source.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (material === 'guji') return lines;
  const chunks: string[] = [];
  let current = '';
  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (current && [...next.replace(/\s/gu, '')].length > 48) {
      chunks.push(current); current = line;
    } else current = next;
  }
  if (current) chunks.push(current);
  return chunks;
}

export async function runHeritageInterpretation(confirmedText: string, material: HeritageMaterial = 'guji', trustedReference = ''): Promise<string> {
  const source = confirmedText.trim();
  if (!source) throw new Error(`请先确认或校订${material === 'guji' ? '古籍' : '碑拓'}识读稿`);
  const role = material === 'guji' ? '古籍' : '碑刻拓片';
  const punctuatedChunks: string[] = [];
  for (const chunk of chunkHeritageText(source, material)) {
    const prompt = material === 'rubbing'
      ? `碑拓原文：\n${chunk}\n\n只输出加标点后的原文。保留每一个原字和换行，不得输出标题、解释或括号说明；全文末尾至少添加一个句号。`
      : `以下内容是用户确认过的古籍 OCR 单栏。\n\n原文：\n${chunk}\n\n请严格输出三个部分：\n【断句稿】保留所有原字，只添加现代中文标点，不改字、不删字。\n【白话释义】按断句简要解释。\n【疑难提示】没有则写“无”。`;
    const response = await runEdgeChatEvidence(prompt, {
      system: material === 'rubbing' ? '你只负责给碑刻原文添加标点。禁止解释，禁止评论，禁止改字。' : `你是${role}整理助手。原文证据优先；断句可以生成，原字不得篡改；释义必须与给定原文逐句对应。`,
      maxTokens: material === 'rubbing' ? 96 : 320,
    });
    if (response.backend !== 'mnn' || !response.text) throw new Error(response.error || 'Qwen2B 端侧断句未返回结果');
    try {
      const punctuationEvidence = material === 'rubbing' ? response.text.split(/\n\s*\n/u, 1)[0] : response.text;
      punctuatedChunks.push(projectHeritagePunctuation(chunk, punctuationEvidence));
    } catch {
      // Titles and incomplete column fragments may legitimately receive no
      // punctuation. Keep those exact source lines instead of failing the page.
      punctuatedChunks.push(chunk);
    }
  }
  const punctuated = punctuatedChunks.join('\n');
  if (![...punctuated].some((char) => Boolean(PUNCTUATION_MAP[char]))) throw new Error('Qwen2B 未能为本页生成有效古文标点');
  const evidenceCharacters = [...source.replace(/\s/gu, '')].length;
  if (material === 'rubbing' && trustedReference.trim()) {
    return `【断句稿】\n${punctuated}\n\n【馆藏题名辅助释义】\n${trustedReference.trim()}\n\n【疑难提示】\n馆藏题名属于辅助证据，不冒充本次 OCR 输出；确认稿中的“折、覃爵朴、内庚河内”等字仍需对照原拓核验。`;
  }
  if (material === 'rubbing' && evidenceCharacters < 30) {
    return `【断句稿】\n${punctuated}\n\n【白话释义】\n当前确认稿仅 ${evidenceCharacters} 字且含疑字，只能作为碑额残文阅读；证据不足，暂不推断人物身份、年代、官职经历或历史故事。\n\n【疑难提示】\n请对照完整拓片或馆藏释文核对疑字。`;
  }
  const explanationResponse = await runEdgeChatEvidence(`下面是已经锁定原字的${material === 'guji' ? '古籍' : '碑拓'}断句稿：\n\n${punctuated}\n\n只输出两个部分：\n【白话释义】按句解释；不得新增原文没有的人名、地名、年代或情节。\n【疑难提示】列出□或明显影响理解的疑字；没有则写“无”。`, {
    system: `你是${role}阅读助手。释义必须逐句对应证据；疑字明确待考，不得编造确定事实。`,
    maxTokens: 480,
  });
  const explanation = clean(explanationResponse.text || '');
  const suffix = explanationResponse.backend === 'mnn' && explanation
    ? `\n\n${explanation}`
    : '\n\n【白话释义】\n暂未生成；断句稿已保留。\n\n【疑难提示】\n请人工核对疑字。';
  return `【断句稿】\n${punctuated}${suffix}`;
}

export async function runHeritageRestoration(image: string, mask: string): Promise<EdgeResponse> {
  const response = await restoreHeritageImage(image, mask);
  if (response.backend !== 'mnn' || !response.image) throw new Error(response.error || '文化遗产修复模型尚未就绪');
  const outsidePreserved = response.stats?.outsideMaskPreserved === true || response.stats?.unmaskedMaxDelta === 0;
  if (!outsidePreserved) throw new Error('修复器未返回“选区外像素保持不变”证据，Quality Gate 已拒绝');
  return response;
}
