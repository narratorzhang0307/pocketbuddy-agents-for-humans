import type { OcrResultItem } from '@paddleocr/paddleocr-js';
import { chineseOcrLine, runChineseOcr, sortChineseOcrLines, type ChineseOcrModel, type ChineseOcrProfile } from '../ocr/chineseOcr';

export interface ProfessionalOcrLine {
  text: string;
  score: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ProfessionalOcrResult {
  text: string;
  lines: ProfessionalOcrLine[];
  reviewImage: string;
  rotation: 0 | 90 | 180 | 270;
  model: ChineseOcrModel;
  provider: string;
  totalMs: number;
  detectedBoxes: number;
}

export function filterHeritageContentItems(items: OcrResultItem[]): OcrResultItem[] {
  const readable = items.filter((item) => /[\u3400-\u9fff]/u.test(item.text));
  const area = (item: OcrResultItem) => {
    const xs = item.poly.map((point) => point[0]);
    const ys = item.poly.map((point) => point[1]);
    return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
  };
  const largest = Math.max(0, ...readable.map(area));
  if (!largest) return readable;
  // Museum inventory labels and colour charts are commonly captured around a
  // rubbing. Their text boxes are far smaller than the inscription itself.
  const main = readable.filter((item) => area(item) >= largest * 0.08);
  return main.length > 0 ? main : readable;
}

/**
 * Ancient books and rubbings are usually laid out in vertical columns. Keep
 * their historical reading order (right to left), while retaining the usual
 * top-to-bottom order for predominantly horizontal material.
 */
export function sortProfessionalOcrLines(lines: ProfessionalOcrLine[]): ProfessionalOcrLine[] {
  return sortChineseOcrLines(lines);
}

export async function runProfessionalChineseOcr(image: string, profile: ChineseOcrProfile = 'heritage'): Promise<ProfessionalOcrResult> {
  const [page] = await runChineseOcr([image], {
    profile,
    rotations: [0, 90, 270, 180],
    includeReviewImage: true,
    progressiveRotations: true,
    // A cold Android WebView compiles OpenCV + two ONNX sessions inside the
    // Worker. The verified V2509A run was still actively using CPU at 120s,
    // so do not kill a healthy first initialization at the old desktop limit.
    runtimeTimeoutMs: 300_000,
    predictTimeoutMs: 120_000,
  });
  const contentItems = filterHeritageContentItems(page.items);
  const lines = sortProfessionalOcrLines(contentItems.map(chineseOcrLine));
  const text = lines.map((line) => line.text).join('\n').trim();
  if (!text) throw new Error(`${page.model} 未检测到可读汉字`);
  return {
    text,
    lines,
    reviewImage: page.reviewImage || image,
    rotation: page.rotation,
    model: page.model,
    provider: page.provider,
    totalMs: page.totalMs,
    detectedBoxes: contentItems.length,
  };
}
