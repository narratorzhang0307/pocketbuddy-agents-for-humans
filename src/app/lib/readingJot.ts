import { keyedStore } from './skills/keyedStore';

export const READING_OCR_POLICY_VERSION = 'reading-jot-gate-v3-ppocr-geometry';

export type ReadingSelectionMode = 'underline' | 'brackets';
export type ReadingOcrRoute = 'pp-ocr-v6' | 'base' | 'general-ocr-vision' | 'manual';
export type ReadingQualityGate = 'ppocr-accepted' | 'base-accepted' | 'base-kept' | 'lora-accepted' | 'manual-review';
export type ReadingCandidateStatus = 'pass' | 'review' | 'fail';
export type ReadingCandidateIssue =
  | 'empty-output'
  | 'suspiciously-short'
  | 'unknown-heavy'
  | 'repeated-lines'
  | 'degenerate-character-loop'
  | 'degenerate-word-loop'
  | 'terminal-collapse'
  | 'task-drift'
  | 'near-decode-limit';

export interface ReadingOcrInput {
  text: string;
  confidence: number;
  maxTokens?: number;
}

export interface ReadingOcrCandidate {
  text: string;
  confidence: number;
  score: number;
  unknownRatio: number;
  visibleChars: number;
  status: ReadingCandidateStatus;
  issues: ReadingCandidateIssue[];
}

export interface ReadingOcrVerificationInput {
  route: Exclude<ReadingOcrRoute, 'manual'>;
  output: ReadingOcrInput;
}

export interface ReadingOcrDecision {
  base: ReadingOcrCandidate;
  lora?: ReadingOcrCandidate;
  verification?: ReadingOcrCandidate;
  verificationRoute?: Exclude<ReadingOcrRoute, 'manual'>;
  selected: 'base' | 'lora';
  finalText: string;
  route: Exclude<ReadingOcrRoute, 'manual'>;
  qualityGate: ReadingQualityGate;
  reason: string;
  gateReasons: string[];
  needsReview: boolean;
  policyVersion: typeof READING_OCR_POLICY_VERSION;
}

export interface ReadingImageQuality {
  width: number;
  height: number;
  meanLuma: number;
  contrast: number;
  edgeStrength: number;
  laplacianVariance: number;
  highlightClipping: number;
}

export interface ReadingPoint { x: number; y: number }
export type ReadingStroke = ReadingPoint[];

export interface ReadingSelectionBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ReadingPositionedLine {
  text: string;
  score: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ReadingSelectionContext {
  mode: ReadingSelectionMode;
  strokes: ReadingStroke[];
}

export interface ReadingPpOcrDecision {
  finalText: string;
  cropText: string;
  geometryText: string;
  confidence: number;
  qualityGate: Extract<ReadingQualityGate, 'ppocr-accepted' | 'manual-review'>;
  needsReview: boolean;
  reason: string;
  gateReasons: string[];
  policyVersion: typeof READING_OCR_POLICY_VERSION;
  matchedLines: number;
  detectedBoxes: number;
  model: 'PP-OCRv6_small';
}

export interface ReadingAnalysis {
  backend: 'edge' | 'cloud';
  model: string;
  interpretation: string;
  tags: string[];
  correctedExcerpt?: string;
  bookTitleCandidate?: string;
  authorCandidate?: string;
  ambiguities?: string;
}

export interface ReadingOcrRouteDecision {
  runLora: boolean;
  reasons: Array<'base-review' | 'base-fail' | 'low-resolution' | 'low-contrast' | 'soft-focus' | 'glare-like'>;
  policyVersion: typeof READING_OCR_POLICY_VERSION;
}

export interface ReadingVerificationDecision {
  run: boolean;
  route: Exclude<ReadingOcrRoute, 'manual'>;
  reasons: Array<'pressure-without-lora' | 'candidate-not-pass' | 'base-lora-disagreement' | 'near-decode-limit'>;
}

export interface ReadingNote {
  id: string;
  excerpt: string;
  bookTitle: string;
  author: string;
  page: string;
  comment: string;
  tags: string[];
  selectionMode: ReadingSelectionMode;
  previewDataUrl?: string;
  createdAt: string;
  updatedAt: string;
  ocr: {
    route: ReadingOcrRoute;
    qualityGate: ReadingQualityGate;
    confidence: number;
    baseText?: string;
    loraText?: string;
    verificationText?: string;
    adapterVersion?: string;
    policyVersion?: string;
    gateReasons?: string[];
    model?: string;
    geometryText?: string;
    detectedBoxes?: number;
  };
  analyses?: {
    edge?: ReadingAnalysis;
    cloud?: ReadingAnalysis;
  };
}

const notes = keyedStore<ReadingNote>('pe-reading-jot-v1', 'id', 'notes', 1);
const READING_NOTE_SAMPLES_KEY = 'pe-reading-jot-samples-v1';

export const READING_NOTE_SAMPLE_EXCERPTS = [
  '一株黄色的树变成了许多飞燕',
  '傍晚的光线金黄而辽远',
  '月光啊，忧伤，美丽，静寂',
  '友好的夜晚被点亮',
  '只有湖中的一对天鹅',
  '一切的峰巅沉寂',
] as const;

const READING_NOTE_SAMPLES: ReadingNote[] = READING_NOTE_SAMPLE_EXCERPTS.map((excerpt, index) => {
  const day = [14, 15, 18, 20, 21, 22][index];
  const iso = `2026-03-${String(day).padStart(2, '0')}T12:00:00.000+08:00`;
  return {
    id: `reading-jot-sample-${index + 1}`,
    excerpt,
    bookTitle: '城市诗页',
    author: '',
    page: `03.${String(day).padStart(2, '0')}`,
    comment: '',
    tags: ['城市', index === 0 ? '树' : index === 1 ? '黄昏' : index === 2 ? '月光' : index === 3 ? '夜晚' : index === 4 ? '天鹅' : '群山'],
    selectionMode: 'underline',
    createdAt: iso,
    updatedAt: iso,
    ocr: { route: 'manual', qualityGate: 'manual-review', confidence: 1 },
  };
});

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const normalizedVisible = (value: string): string => value.replace(/[^\p{L}\p{N}□�]/gu, '');

function strokeBounds(stroke: ReadingStroke) {
  const xs = stroke.map((point) => point.x);
  const ys = stroke.map((point) => point.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

export function readingSelectionBox(mode: ReadingSelectionMode, strokes: ReadingStroke[]): ReadingSelectionBox {
  if (mode === 'underline') {
    const bounds = strokeBounds(strokes[0]);
    const lineY = strokes[0].reduce((sum, point) => sum + point.y, 0) / strokes[0].length;
    const left = Math.max(0, bounds.minX - 0.035);
    const top = Math.max(0, lineY - 0.145);
    return {
      x: left,
      y: top,
      width: Math.min(1, bounds.maxX + 0.035) - left,
      height: Math.min(1, lineY + 0.018) - top,
    };
  }
  const [first, second] = strokes;
  const firstX = first.reduce((sum, point) => sum + point.x, 0) / first.length;
  const secondX = second.reduce((sum, point) => sum + point.x, 0) / second.length;
  const all = [...first, ...second];
  const top = Math.max(0, Math.min(...all.map((point) => point.y)) - 0.018);
  const bottom = Math.min(1, Math.max(...all.map((point) => point.y)) + 0.018);
  const left = Math.max(0, Math.min(firstX, secondX) + 0.006);
  const right = Math.min(1, Math.max(firstX, secondX) - 0.006);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function overlap(left: number, right: number, start: number, end: number): number {
  return Math.max(0, Math.min(right, end) - Math.max(left, start));
}

function mergeReadingRows(lines: ReadingPositionedLine[]): ReadingPositionedLine[] {
  const sorted = [...lines].sort((left, right) => {
    const leftCenter = (left.top + left.bottom) / 2;
    const rightCenter = (right.top + right.bottom) / 2;
    return leftCenter - rightCenter || left.left - right.left;
  });
  const rows: ReadingPositionedLine[][] = [];
  for (const line of sorted) {
    const center = (line.top + line.bottom) / 2;
    const row = rows.find((candidate) => {
      const candidateCenter = candidate.reduce((sum, item) => sum + (item.top + item.bottom) / 2, 0) / candidate.length;
      const tolerance = Math.max(8, Math.min(line.bottom - line.top, ...candidate.map((item) => item.bottom - item.top)) * 0.58);
      return Math.abs(center - candidateCenter) <= tolerance;
    });
    if (row) row.push(line); else rows.push([line]);
  }
  const merged = rows.map((row) => {
    const ordered = [...row].sort((left, right) => left.left - right.left);
    const weight = ordered.reduce((sum, item) => sum + Math.max(1, item.text.length), 0);
    return {
      text: ordered.map((item) => item.text).join(''),
      score: ordered.reduce((sum, item) => sum + item.score * Math.max(1, item.text.length), 0) / weight,
      left: Math.min(...ordered.map((item) => item.left)),
      top: Math.min(...ordered.map((item) => item.top)),
      right: Math.max(...ordered.map((item) => item.right)),
      bottom: Math.max(...ordered.map((item) => item.bottom)),
    };
  }).sort((left, right) => left.top - right.top);

  // PP-OCR can join the same character position over several tightly-spaced
  // rows into one tall box (e.g. 界界界 / 書書書 / 局局局). Collapse only when
  // the box spans at least two independently detected neighbouring rows, then
  // use that OCR-visible suffix to complete their truncated payloads.
  const heights = merged.map((line) => line.bottom - line.top).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)] || 1;
  for (const tall of merged) {
    if (tall.bottom - tall.top < medianHeight * 1.9) continue;
    const neighbours = merged.filter((line) => line !== tall && (line.top + line.bottom) / 2 >= tall.top && (line.top + line.bottom) / 2 <= tall.bottom);
    if (neighbours.length < 2) continue;
    const collapsed = tall.text.replace(/(.)\1+/gu, '$1');
    if (collapsed.length >= tall.text.length - 1) continue;
    tall.text = collapsed;
    const separator = collapsed.search(/[:：]/u);
    if (separator < 0) continue;
    const payload = collapsed.slice(separator + 1);
    for (const neighbour of neighbours) {
      const neighbourSeparator = neighbour.text.search(/[:：]/u);
      if (neighbourSeparator < 0) continue;
      const neighbourPayload = neighbour.text.slice(neighbourSeparator + 1);
      if (neighbourPayload && payload.startsWith(neighbourPayload)) {
        neighbour.text += payload.slice(neighbourPayload.length);
      }
    }
  }
  return merged.sort((left, right) => (left.top + left.bottom) / 2 - (right.top + right.bottom) / 2);
}

export function selectReadingOcrLines(
  lines: ReadingPositionedLine[],
  image: { width: number; height: number },
  box: ReadingSelectionBox,
  selection?: ReadingSelectionContext,
): ReadingPositionedLine[] {
  const left = box.x * image.width;
  const right = (box.x + box.width) * image.width;
  const selectionYs = selection?.mode === 'brackets' ? selection.strokes.flat().map((point) => point.y * image.height) : [];
  const top = selectionYs.length ? Math.min(...selectionYs) : box.y * image.height;
  const bottom = selectionYs.length ? Math.max(...selectionYs) : (box.y + box.height) * image.height;
  const candidates = lines.filter((line) => {
    const width = Math.max(1, line.right - line.left);
    const height = Math.max(1, line.bottom - line.top);
    const xCoverage = overlap(line.left, line.right, left, right) / width;
    const yCoverage = overlap(line.top, line.bottom, top, bottom) / height;
    const centerX = (line.left + line.right) / 2;
    const centerY = (line.top + line.bottom) / 2;
    const centerInside = centerX >= left && centerX <= right && centerY >= top && centerY <= bottom;
    if (selection?.mode === 'brackets') return xCoverage >= 0.18 && centerY >= top && centerY <= bottom;
    return (xCoverage >= 0.18 && yCoverage >= 0.42) || centerInside;
  });
  const rows = mergeReadingRows(candidates);
  if (selection?.mode !== 'underline') return rows;

  const stroke = selection.strokes[0];
  const strokeY = stroke.reduce((sum, point) => sum + point.y, 0) / stroke.length * image.height;
  const above = rows.filter((row) => {
    const center = (row.top + row.bottom) / 2;
    return center <= strokeY + Math.max(5, (row.bottom - row.top) * 0.12);
  });
  const nearest = above.sort((left, right) => {
    const leftDistance = Math.abs(strokeY - (left.top + left.bottom) / 2);
    const rightDistance = Math.abs(strokeY - (right.top + right.bottom) / 2);
    return leftDistance - rightDistance;
  })[0];
  if (!nearest) return [];

  // A red line may sit under the final wrapped row of a sentence. Only walk
  // upward when that nearest row visibly closes a sentence; label-like rows
  // without terminal punctuation remain one row and cannot absorb neighbours.
  if (!/[。！？!?；;]$/.test(nearest.text.trim())) return [nearest];
  const ordered = rows.filter((row) => row.top <= nearest.top).sort((left, right) => left.top - right.top);
  const nearestIndex = ordered.indexOf(nearest);
  let first = nearestIndex;
  for (let index = nearestIndex - 1; index >= 0 && nearestIndex - index <= 3; index -= 1) {
    const lower = ordered[index + 1];
    const current = ordered[index];
    const gap = lower.top - current.bottom;
    if (gap > Math.max(current.bottom - current.top, lower.bottom - lower.top) * 1.8) break;
    if (/[。！？!?；;]$/.test(current.text.trim())) break;
    first = index;
  }
  return ordered.slice(first, nearestIndex + 1);
}

export function selectReadingCropEvidence(
  cropLines: ReadingPositionedLine[],
  geometryLines: ReadingPositionedLine[],
): ReadingPositionedLine[] {
  if (!geometryLines.length) return mergeReadingRows(cropLines);
  const rows = mergeReadingRows(cropLines);
  const target = geometryLines.map((line) => line.text).join('\n');
  const targetRows = geometryLines.length;
  let best: { lines: ReadingPositionedLine[]; distance: number } | undefined;
  for (let size = Math.max(1, targetRows - 1); size <= Math.min(rows.length, targetRows + 1); size += 1) {
    for (let start = 0; start + size <= rows.length; start += 1) {
      const candidate = rows.slice(start, start + size);
      const distance = normalizedOcrDistance(candidate.map((line) => line.text).join('\n'), target);
      if (!best || distance < best.distance) best = { lines: candidate, distance };
    }
  }
  return best?.lines || rows;
}

export function decideReadingPpOcr(
  crop: { text: string; confidence: number; detectedBoxes: number },
  geometryLines: ReadingPositionedLine[],
): ReadingPpOcrDecision {
  const cropCandidate = scoreReadingOcr(crop);
  const geometryText = geometryLines.map((line) => line.text.trim()).filter(Boolean).join('\n');
  const geometryConfidence = geometryLines.reduce((sum, line) => sum + line.score, 0) / Math.max(1, geometryLines.length);
  const geometryCandidate = scoreReadingOcr({ text: geometryText, confidence: geometryConfidence });
  const distance = normalizedOcrDistance(cropCandidate.text, geometryCandidate.text);
  const gateReasons = [
    ...cropCandidate.issues.map((issue) => `crop:${issue}`),
    ...geometryCandidate.issues.map((issue) => `geometry:${issue}`),
  ];
  const agreement = cropCandidate.status === 'pass' && geometryCandidate.status === 'pass' && distance <= 0.22;
  const finalText = agreement
    ? (geometryCandidate.visibleChars > cropCandidate.visibleChars ? geometryCandidate.text : cropCandidate.text)
    : (geometryCandidate.text || cropCandidate.text);
  return {
    finalText,
    cropText: cropCandidate.text,
    geometryText: geometryCandidate.text,
    confidence: cropCandidate.confidence,
    qualityGate: agreement ? 'ppocr-accepted' : 'manual-review',
    needsReview: !agreement,
    reason: agreement
      ? `PP-OCRv6 选区转录与整页文字框一致度 ${Math.round((1 - distance) * 100)}%；请保存前核对原文。`
      : !geometryCandidate.text
        ? '整页文字框没有稳定命中画线区域；已保留选区转录，请人工核对边界。'
        : `选区转录与整页文字框差异 ${Math.round(distance * 100)}%；不自动改字，请对照图片确认。`,
    gateReasons: [...new Set(gateReasons)],
    policyVersion: READING_OCR_POLICY_VERSION,
    matchedLines: geometryLines.length,
    detectedBoxes: crop.detectedBoxes,
    model: 'PP-OCRv6_small',
  };
}

function stripFence(raw: string): string {
  return raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

export function parseReadingOcr(raw: string): { text: string; confidence: number } {
  const clean = stripFence(raw);
  const jsonStart = clean.indexOf('{');
  const jsonEnd = clean.lastIndexOf('}');
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    try {
      const parsed = JSON.parse(clean.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>;
      const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
      const confidence = typeof parsed.confidence === 'number' ? clamp01(parsed.confidence) : 0.62;
      if (text) return { text, confidence };
    } catch { /* Some MNN decoders return plain text even when JSON was requested. */ }
  }
  return { text: clean, confidence: clean ? 0.58 : 0 };
}

function hasTerminalCollapse(value: string): boolean {
  const text = normalizedVisible(value);
  for (let period = 1; period <= 12; period += 1) {
    if (text.length < period * 6) continue;
    const unit = text.slice(-period);
    let start = text.length;
    while (start >= period && text.slice(start - period, start) === unit) start -= period;
    if (text.length - start >= Math.max(24, period * 6)) return true;
  }
  return false;
}

function candidateIssues(input: ReadingOcrInput): ReadingCandidateIssue[] {
  const text = input.text.trim();
  const visible = normalizedVisible(text);
  const issues: ReadingCandidateIssue[] = [];
  if (!visible) issues.push('empty-output');
  else if (visible.length < 4) issues.push('suspiciously-short');
  const unknown = (visible.match(/[□�]/g) || []).length;
  if (visible.length && unknown / visible.length > 0.18) issues.push('unknown-heavy');

  const lines = text.split(/\r?\n/).map((line) => normalizedVisible(line)).filter((line) => line.length >= 4);
  const repeatedLines = lines.length - new Set(lines).size;
  if (lines.length >= 4 && repeatedLines / lines.length >= 0.25) issues.push('repeated-lines');

  const characterCounts = new Map<string, number>();
  for (const char of visible) characterCounts.set(char, (characterCounts.get(char) || 0) + 1);
  const dominantCharacter = Math.max(0, ...characterCounts.values()) / Math.max(visible.length, 1);
  if (visible.length >= 16 && dominantCharacter >= 0.55) issues.push('degenerate-character-loop');

  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCounts = new Map<string, number>();
  for (const word of words) wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
  const dominantWord = Math.max(0, ...wordCounts.values()) / Math.max(words.length, 1);
  if (words.length >= 8 && dominantWord >= 0.5) issues.push('degenerate-word-loop');

  if (hasTerminalCollapse(text)) issues.push('terminal-collapse');
  if (/摩崖石刻|图片展示页|根据图片|the image|无法看到|作为(?:一个)?AI|我不能识别/i.test(text)) issues.push('task-drift');
  if (input.maxTokens && visible.length >= Math.floor(input.maxTokens * 0.86)) issues.push('near-decode-limit');
  return [...new Set(issues)];
}

const FATAL_ISSUES = new Set<ReadingCandidateIssue>([
  'empty-output', 'repeated-lines', 'degenerate-character-loop', 'degenerate-word-loop', 'terminal-collapse', 'task-drift',
]);

export function scoreReadingOcr(input: ReadingOcrInput): ReadingOcrCandidate {
  const text = input.text.trim();
  const visible = normalizedVisible(text);
  const unknown = (visible.match(/[□�]/g) || []).length;
  const unknownRatio = visible.length ? unknown / visible.length : 1;
  const issues = candidateIssues(input);
  const fatalCount = issues.filter((issue) => FATAL_ISSUES.has(issue)).length;
  const status: ReadingCandidateStatus = fatalCount > 0 ? 'fail' : issues.length > 0 ? 'review' : 'pass';
  // Confidence remains diagnostic only. Acceptance below is driven by hard issues,
  // agreement and an independent verification pass, never by a longer answer.
  const score = clamp01(0.95 - fatalCount * 0.45 - (issues.length - fatalCount) * 0.16 - Math.min(0.35, unknownRatio) + (clamp01(input.confidence) - 0.5) * 0.04);
  return { text, confidence: clamp01(input.confidence), score, unknownRatio, visibleChars: visible.length, status, issues };
}

export function decideReadingOcrRoute(baseInput: ReadingOcrInput, image: ReadingImageQuality): ReadingOcrRouteDecision {
  const base = scoreReadingOcr(baseInput);
  const reasons: ReadingOcrRouteDecision['reasons'] = [];
  if (base.status === 'review') reasons.push('base-review');
  if (base.status === 'fail') reasons.push('base-fail');
  if (image.width < 320 || image.height < 80) reasons.push('low-resolution');
  if (image.contrast < 0.08) reasons.push('low-contrast');
  const softFocus = image.meanLuma > 0.9 ? image.laplacianVariance < 0.018 : image.laplacianVariance < 0.0045;
  if (softFocus || image.edgeStrength < 0.025) reasons.push('soft-focus');
  if (image.highlightClipping > 0.15 || (image.highlightClipping > 0.03 && image.laplacianVariance < 0.01)) reasons.push('glare-like');
  return { runLora: reasons.length > 0, reasons: [...new Set(reasons)], policyVersion: READING_OCR_POLICY_VERSION };
}

function editDistance(left: string, right: string): number {
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

export function normalizedOcrDistance(left: string, right: string): number {
  const a = normalizedVisible(left);
  const b = normalizedVisible(right);
  return Math.max(a.length, b.length) ? editDistance(a, b) / Math.max(a.length, b.length) : 0;
}

function preferredRoute(base: ReadingOcrCandidate, lora: ReadingOcrCandidate): Exclude<ReadingOcrRoute, 'manual'> {
  const rank = (candidate: ReadingOcrCandidate) => candidate.status === 'pass' ? 2 : candidate.status === 'review' ? 1 : 0;
  if (rank(lora) > rank(base)) return 'general-ocr-vision';
  return 'base';
}

export function decideReadingVerification(
  baseInput: ReadingOcrInput,
  loraInput?: ReadingOcrInput,
  options: { pressure?: boolean } = {},
): ReadingVerificationDecision {
  const base = scoreReadingOcr(baseInput);
  const lora = loraInput ? scoreReadingOcr(loraInput) : undefined;
  const reasons: ReadingVerificationDecision['reasons'] = [];
  if (!lora) {
    if (options.pressure) reasons.push('pressure-without-lora');
    if (base.status !== 'pass') reasons.push('candidate-not-pass');
    if (base.issues.includes('near-decode-limit')) reasons.push('near-decode-limit');
    return { run: reasons.length > 0, route: 'base', reasons: [...new Set(reasons)] };
  }

  const distance = normalizedOcrDistance(base.text, lora.text);
  if (distance > 0.22) reasons.push('base-lora-disagreement');
  const route = preferredRoute(base, lora);
  const preferred = route === 'base' ? base : lora;
  // A sound Base plus a broken LoRA is already a safe fallback and needs no extra decode.
  if (base.status === 'pass' && lora.status === 'fail') return { run: false, route: 'base', reasons: [] };
  if (preferred.status !== 'pass') reasons.push('candidate-not-pass');
  if (preferred.issues.includes('near-decode-limit')) reasons.push('near-decode-limit');
  return { run: reasons.length > 0, route, reasons: [...new Set(reasons)] };
}

function decision(
  base: ReadingOcrCandidate,
  lora: ReadingOcrCandidate | undefined,
  selected: 'base' | 'lora',
  finalText: string,
  qualityGate: ReadingQualityGate,
  reason: string,
  needsReview: boolean,
  verification?: ReadingOcrCandidate,
  verificationRoute?: Exclude<ReadingOcrRoute, 'manual'>,
): ReadingOcrDecision {
  const route = selected === 'lora' ? 'general-ocr-vision' : 'base';
  const gateReasons = [
    ...base.issues.map((issue) => `base:${issue}`),
    ...(lora?.issues.map((issue) => `lora:${issue}`) || []),
    ...(verification?.issues.map((issue) => `verification:${issue}`) || []),
  ];
  return {
    base, lora, verification, verificationRoute, selected, finalText, route, qualityGate, reason,
    gateReasons: [...new Set(gateReasons)], needsReview, policyVersion: READING_OCR_POLICY_VERSION,
  };
}

function resolvedByVerification(
  base: ReadingOcrCandidate,
  lora: ReadingOcrCandidate | undefined,
  verification: ReadingOcrCandidate | undefined,
  verificationRoute: Exclude<ReadingOcrRoute, 'manual'> | undefined,
): 'base' | 'lora' | null {
  if (!verification || verification.status !== 'pass' || !verificationRoute) return null;
  const baseDistance = normalizedOcrDistance(base.text, verification.text);
  const loraDistance = lora ? normalizedOcrDistance(lora.text, verification.text) : Number.POSITIVE_INFINITY;
  if (baseDistance <= 0.22 && baseDistance + 0.12 <= loraDistance) return 'base';
  if (lora && loraDistance <= 0.22 && loraDistance + 0.12 <= baseDistance) return 'lora';
  if (!lora && (baseDistance <= 0.34 || base.status !== 'pass')) return 'base';
  if (verificationRoute === 'general-ocr-vision' && lora && loraDistance <= 0.34 && base.status !== 'pass') return 'lora';
  return null;
}

export function decideReadingOcr(
  baseInput: ReadingOcrInput,
  loraInput?: ReadingOcrInput,
  verificationInput?: ReadingOcrVerificationInput,
): ReadingOcrDecision {
  const base = scoreReadingOcr(baseInput);
  const lora = loraInput ? scoreReadingOcr(loraInput) : undefined;
  const verification = verificationInput ? scoreReadingOcr(verificationInput.output) : undefined;
  const verified = resolvedByVerification(base, lora, verification, verificationInput?.route);

  if (!lora) {
    if (base.status === 'pass') return decision(base, undefined, 'base', base.text, 'base-accepted', 'Base 通过输出硬门；本次无需 LoRA。', false, verification, verificationInput?.route);
    if (verified === 'base' && verification) {
      return decision(base, undefined, 'base', verification.text, 'base-accepted', 'Base 首次结果未通过，但增强视图复核恢复为有效文本。', false, verification, verificationInput?.route);
    }
    return decision(base, undefined, 'base', base.text, 'manual-review', 'Base 未通过输出硬门，且没有可靠的独立复核结果；请对照选区校文。', true, verification, verificationInput?.route);
  }

  const distance = normalizedOcrDistance(base.text, lora.text);
  if (base.status === 'pass' && lora.status !== 'pass') {
    return decision(base, lora, 'base', base.text, 'base-kept', 'LoRA 触发塌缩、任务漂移或完整性问题；保留通过硬门的 Base。', false, verification, verificationInput?.route);
  }
  if (base.status === 'pass' && lora.status === 'pass' && distance <= 0.22) {
    return decision(base, lora, 'base', base.text, 'base-kept', `Base/LoRA 一致度 ${Math.round((1 - distance) * 100)}%；默认保留 Base，避免干净书页负迁移。`, false, verification, verificationInput?.route);
  }
  if (verified) {
    const chosen = verified === 'lora' ? lora : base;
    const finalText = verificationInput?.route === (verified === 'lora' ? 'general-ocr-vision' : 'base') && verification?.status === 'pass'
      ? verification.text : chosen.text;
    return decision(
      base, lora, verified, finalText, verified === 'lora' ? 'lora-accepted' : 'base-kept',
      `增强视图复核支持 ${verified === 'lora' ? 'LoRA' : 'Base'}；另一候选未获独立验证，不自动覆盖。`,
      false, verification, verificationInput?.route,
    );
  }
  return decision(
    base, lora, preferredRoute(base, lora) === 'general-ocr-vision' ? 'lora' : 'base',
    preferredRoute(base, lora) === 'general-ocr-vision' ? lora.text : base.text,
    'manual-review',
    `Base/LoRA 差异 ${Math.round(distance * 100)}%，独立复核未形成可靠多数；请对照选区确认。`,
    true, verification, verificationInput?.route,
  );
}

export async function listReadingNotes(): Promise<ReadingNote[]> {
  return (await notes.all()).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function ensureReadingNoteSamples(): Promise<void> {
  try { if (localStorage.getItem(READING_NOTE_SAMPLES_KEY) === 'done') return; } catch { /* IndexedDB 仍可继续 */ }
  const existing = await notes.all();
  if (existing.length === 0) await notes.putMany(READING_NOTE_SAMPLES);
  const available = existing.length > 0 || (await notes.all()).length > 0;
  if (available) try { localStorage.setItem(READING_NOTE_SAMPLES_KEY, 'done'); } catch { /* 隐私模式下下次仍会先检查空库 */ }
}

export async function saveReadingNote(note: ReadingNote): Promise<void> {
  await notes.put(note);
}

export async function deleteReadingNote(id: string): Promise<void> {
  await notes.del(id);
}

export function newReadingNoteId(): string {
  return globalThis.crypto?.randomUUID?.() || `reading-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
