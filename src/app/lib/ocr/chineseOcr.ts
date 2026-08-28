import type { OcrResultItem } from '@paddleocr/paddleocr-js';
import { Capacitor } from '@capacitor/core';

const paddleOcrWorkerAssetUrl = new URL(
  '../../../../node_modules/@paddleocr/paddleocr-js/dist/assets/worker-entry-C9UNuyOJ.js',
  import.meta.url,
).href;

export type ChineseOcrProfile = 'document' | 'heritage';
export type ChineseOcrRotation = 0 | 90 | 180 | 270;
export type ChineseOcrModel = 'PP-OCRv6_small' | 'PP-OCRv5_mobile';

export interface ChineseOcrLine {
  text: string;
  score: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ChineseOcrPage {
  text: string;
  lines: ChineseOcrLine[];
  items: OcrResultItem[];
  width: number;
  height: number;
  meanConfidence: number;
  detectedBoxes: number;
  totalMs: number;
  provider: string;
  model: ChineseOcrModel;
  rotation: ChineseOcrRotation;
  reviewImage?: string;
}

export interface ChineseOcrOptions {
  profile: ChineseOcrProfile;
  rotations?: ChineseOcrRotation[];
  includeReviewImage?: boolean;
  /** Stop after the first orientation when it already yields a credible page. */
  progressiveRotations?: boolean;
  runtimeTimeoutMs?: number;
  predictTimeoutMs?: number;
}

/** Host-owned OCR base capability. Skills route a profile and never own these weights. */
export const CHINESE_OCR_CAPABILITY = {
  id: 'paddle-ocr',
  revision: 'paddleocr-js-0.4.2-host-v2-mime',
  profiles: {
    document: {
      model: 'PP-OCRv6_small',
      detection: { asset: '/assets/ocr/PP-OCRv6_small_det_onnx_infer.tar', bytes: 9_891_840, sha256: 'd218f6fbf0f1c23d2161bd6ac7f5eaa6104fa89955c09290497e31008e2618e4' },
      recognition: { asset: '/assets/ocr/PP-OCRv6_small_rec_onnx_infer.tar', bytes: 21_319_680, sha256: 'd267ab077a44a0eedb1ea8f8c542d263f211de8e9d7a029bf9fcfff7e5a88fb1' },
    },
    heritage: {
      model: 'PP-OCRv5_mobile',
      detection: { asset: '/assets/ocr/PP-OCRv5_mobile_det_onnx_infer.tar', bytes: 4_843_520, sha256: '781056046c9ed77a15c94681605db6a0f62317c2e9cce6931c71da2478d4bc30' },
      recognition: { asset: '/assets/ocr/PP-OCRv5_mobile_rec_onnx_infer.tar', bytes: 16_701_440, sha256: 'f7e792bc836f36e7ef895ad47c426d75b0b75b1650caa6d63fe9418441ffba8c' },
    },
  },
} as const;

type OcrRuntime = Awaited<ReturnType<typeof import('@paddleocr/paddleocr-js')['PaddleOCR']['create']>>;

const MODEL: Record<ChineseOcrProfile, {
  name: ChineseOcrModel;
  detection: string;
  recognition: string;
  detectionAsset: string;
  recognitionAsset: string;
}> = {
  // Modern pages use the current official browser/edge high-accuracy tier.
  document: {
    name: 'PP-OCRv6_small',
    detection: 'PP-OCRv6_small_det',
    recognition: 'PP-OCRv6_small_rec',
    detectionAsset: CHINESE_OCR_CAPABILITY.profiles.document.detection.asset,
    recognitionAsset: CHINESE_OCR_CAPABILITY.profiles.document.recognition.asset,
  },
  // Keep the frozen, device-verified heritage revision until its vertical and
  // rare-character fixture suite approves a model upgrade.
  heritage: {
    name: 'PP-OCRv5_mobile',
    detection: 'PP-OCRv5_mobile_det',
    recognition: 'PP-OCRv5_mobile_rec',
    detectionAsset: CHINESE_OCR_CAPABILITY.profiles.heritage.detection.asset,
    recognitionAsset: CHINESE_OCR_CAPABILITY.profiles.heritage.recognition.asset,
  },
};

export function sameOriginOcrAssetUrl(
  path: string,
  origin = window.location.origin,
): string {
  // The module Worker is same-origin, so every resource it fetches must also
  // stay on the app origin. The immutable OSS release does not currently emit
  // CORS headers; a fresh Android WebView would otherwise wait forever inside
  // PaddleOCR.create() instead of surfacing the blocked model/WASM request.
  const asset = new URL(path, origin);
  // The previous response was cached as immutable with the wrong MIME type.
  // A capability revision forces Android WebView to fetch corrected files.
  // Keep directory URLs query-free: ONNX Runtime appends the WASM filename to
  // wasmPaths, and a query on that directory would produce `?rev=...file.wasm`.
  if (!asset.pathname.endsWith('/')) asset.searchParams.set('ocr_rev', CHINESE_OCR_CAPABILITY.revision);
  return asset.href;
}

export function releaseOcrAssetUrl(
  path: string,
  base = import.meta.env.BASE_URL,
  origin = window.location.origin,
): string {
  const releaseBase = new URL(base, `${origin}/`);
  return new URL(path.replace(/^\/+/, ''), releaseBase).href;
}

export function sameOriginOcrWorkerUrl(
  emittedUrl: string,
  origin = window.location.origin,
): string {
  const emitted = new URL(emittedUrl, `${origin}/`);
  const assetMarker = '/assets/';
  const assetIndex = emitted.pathname.lastIndexOf(assetMarker);
  if (assetIndex < 0) throw new Error('PP-OCR Worker 构建地址无效');
  return new URL(`${emitted.pathname.slice(assetIndex)}${emitted.search}`, origin).href;
}

function createOcrWorker(): Worker {
  // Vite 的生产 base 指向 OSS，但 Worker 构造器禁止跨源脚本。
  // 同一个带 hash 的构建产物也保留在站点 /assets 下，强制从页面同源启动。
  return new Worker(sameOriginOcrWorkerUrl(paddleOcrWorkerAssetUrl), { type: 'module' });
}

function withOcrDeadline<T>(promise: Promise<T>, timeoutMs: number, phase: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = globalThis.setTimeout(() => reject(new Error(`${phase}超时（${timeoutMs}ms）`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) globalThis.clearTimeout(timer);
  });
}

async function createRuntime(profile: ChineseOcrProfile, timeoutMs: number): Promise<OcrRuntime> {
  const { PaddleOCR } = await import('@paddleocr/paddleocr-js');
  const model = MODEL[profile];
  const capability = CHINESE_OCR_CAPABILITY.profiles[profile];
  // Fetch model archives in the page first. A fresh Android WebView could
  // otherwise leave the Worker waiting on an opaque internal fetch until the
  // generic initialization deadline fired. Blob URLs keep the transfer
  // same-origin and make HTTP/size failures observable before Worker startup.
  // Fetch immutable weights from the release CDN: the production origin is
  // bandwidth-limited, while the CDN explicitly allows this app origin.
  const fetchModelArchive = async (path: string, expectedBytes: number, label: string) => {
    const response = await withOcrDeadline(
      fetch(releaseOcrAssetUrl(path), { cache: 'no-store', credentials: 'omit' }),
      120_000,
      `${label}连接`,
    );
    if (!response.ok) throw new Error(`${label}下载失败（HTTP ${response.status}）`);
    const archive = await withOcrDeadline(response.blob(), 600_000, `${label}下载`);
    if (archive.size !== expectedBytes) {
      throw new Error(`${label}文件不完整（${archive.size}/${expectedBytes} bytes）`);
    }
    return URL.createObjectURL(archive);
  };
  const [detectionUrl, recognitionUrl] = await Promise.all([
    fetchModelArchive(model.detectionAsset, capability.detection.bytes, `${model.name} 检测模型`),
    fetchModelArchive(model.recognitionAsset, capability.recognition.bytes, `${model.name} 识别模型`),
  ]);
  const runtimeOptions = {
    textDetectionModelName: model.detection,
      textDetectionModelAsset: { url: detectionUrl },
    textRecognitionModelName: model.recognition,
      textRecognitionModelAsset: { url: recognitionUrl },
    textRecognitionBatchSize: 4,
    ortOptions: {
      backend: 'wasm',
      wasmPaths: releaseOcrAssetUrl('/assets/ocr/ort/'),
      numThreads: 1,
      simd: true,
      proxy: false,
    },
  };
  try {
    // Vite keeps this package out of dependency pre-bundling so its relative
    // module-worker asset is emitted and addressable (see vite.config.ts).
    return await withOcrDeadline(
      PaddleOCR.create({ ...runtimeOptions, worker: { createWorker: createOcrWorker } }),
      timeoutMs,
      `${model.name} Worker 初始化`,
    );
  } catch (workerError) {
    // A main-thread WASM retry can freeze Android WebView for tens of seconds.
    // On Android fail explicitly: heritage must never substitute a different,
    // lower-quality OCR engine while presenting the result as PP-OCR.
    if (Capacitor.isNativePlatform()) throw workerError;
    // Fail closed to the already verified single-thread WASM path. OCR remains
    // local; only responsiveness changes if a WebView cannot launch the worker.
    return await withOcrDeadline(
      PaddleOCR.create({ ...runtimeOptions, worker: false }),
      timeoutMs,
      `${model.name} 单线程初始化`,
    );
  } finally {
    URL.revokeObjectURL(detectionUrl);
    URL.revokeObjectURL(recognitionUrl);
  }
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('OCR 图片解码失败'));
    image.src = source;
  });
}

function rotateImage(image: HTMLImageElement, rotation: ChineseOcrRotation): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const swap = rotation === 90 || rotation === 270;
  canvas.width = swap ? image.naturalHeight : image.naturalWidth;
  canvas.height = swap ? image.naturalWidth : image.naturalHeight;
  const context = canvas.getContext('2d')!;
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(rotation * Math.PI / 180);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  return canvas;
}

export function chineseOcrLine(item: OcrResultItem): ChineseOcrLine {
  const xs = item.poly.map((point) => point[0]);
  const ys = item.poly.map((point) => point[1]);
  return {
    text: item.text.trim(),
    score: item.score,
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

export function sortChineseOcrLines(lines: ChineseOcrLine[]): ChineseOcrLine[] {
  const vertical = lines.filter((line) => line.bottom - line.top > (line.right - line.left) * 1.25).length;
  const verticalPage = vertical >= Math.max(2, Math.ceil(lines.length * 0.45));
  return [...lines].sort((left, right) => {
    if (verticalPage) {
      const xDelta = right.left - left.left;
      return Math.abs(xDelta) > 8 ? xDelta : left.top - right.top;
    }
    const yDelta = left.top - right.top;
    return Math.abs(yDelta) > Math.max(8, Math.min(left.bottom - left.top, right.bottom - right.top) * 0.45)
      ? yDelta
      : left.left - right.left;
  });
}

function qualityScore(items: OcrResultItem[]): number {
  const readable = items.filter((item) => /[\p{L}\p{N}]/u.test(item.text));
  const chars = readable.reduce((total, item) => total + [...item.text].filter((char) => /[\p{L}\p{N}]/u.test(char)).length, 0);
  const confidence = readable.reduce((total, item) => total + item.score, 0) / Math.max(1, readable.length);
  return chars * (0.35 + confidence);
}

/** Whether one orientation is good enough to avoid three redundant full-page passes. */
export function isUsableChineseOcrResult(items: OcrResultItem[], profile: ChineseOcrProfile): boolean {
  const readable = items.filter((item) => /[\p{L}\p{N}]/u.test(item.text));
  const characters = readable.reduce(
    (total, item) => total + [...item.text].filter((char) => /[\p{L}\p{N}]/u.test(char)).length,
    0,
  );
  const confidence = readable.reduce((total, item) => total + item.score, 0) / Math.max(1, readable.length);
  return characters >= (profile === 'heritage' ? 6 : 4) && confidence >= 0.45;
}

/**
 * Shared host OCR capability. Skills select a profile; they do not own model
 * assets. Multiple images share one worker so full-page geometry and a crop
 * can be recognized without loading the model twice.
 */
export async function runChineseOcr(images: string[], options: ChineseOcrOptions): Promise<ChineseOcrPage[]> {
  if (!images.length) return [];
  const engine = await createRuntime(options.profile, options.runtimeTimeoutMs ?? 12_000);
  const decoded: HTMLImageElement[] = [];
  const canvases: HTMLCanvasElement[] = [];
  const rotations: ChineseOcrRotation[] = options.rotations?.length ? options.rotations : [0];
  try {
    const pages: ChineseOcrPage[] = [];
    for (const source of images) {
      const image = await loadImage(source);
      decoded.push(image);
      const ranked: Array<{
        result: Awaited<ReturnType<OcrRuntime['predict']>>[number];
        canvas: HTMLCanvasElement;
        rotation: ChineseOcrRotation;
        score: number;
      }> = [];
      let totalMs = 0;
      for (const rotation of rotations) {
        const canvas = rotateImage(image, rotation);
        canvases.push(canvas);
        const [result] = await withOcrDeadline(engine.predict(canvas, {
          textDetLimitSideLen: options.profile === 'document' ? 1920 : 1536,
          textDetLimitType: 'max',
          textDetMaxSideLimit: options.profile === 'document' ? 2560 : 2048,
          textDetThresh: 0.25,
          textDetBoxThresh: 0.45,
          // Modern book pages often align the same glyph position over several
          // rows. A tighter expansion avoids joining those rows into a false
          // vertical word while keeping the heritage profile unchanged.
          textDetUnclipRatio: options.profile === 'document' ? 1.25 : 1.8,
          textRecScoreThresh: options.profile === 'document' ? 0.15 : 0.12,
        }), options.predictTimeoutMs ?? 18_000, `${MODEL[options.profile].name} ${rotation}°识别`);
        if (result) {
          totalMs += result.metrics.totalMs;
          ranked.push({ result, canvas, rotation, score: qualityScore(result.items) });
          if (options.progressiveRotations && isUsableChineseOcrResult(result.items, options.profile)) break;
        }
      }
      ranked.sort((left, right) => right.score - left.score);
      const best = ranked[0];
      if (!best) throw new Error(`${MODEL[options.profile].name} 未返回结果`);
      const lines = sortChineseOcrLines(best.result.items.map(chineseOcrLine).filter((line) => line.text));
      const text = lines.map((line) => line.text).join('\n').trim();
      if (!text) throw new Error(`${MODEL[options.profile].name} 未检测到可读文字`);
      pages.push({
        text,
        lines,
        items: best.result.items,
        width: best.result.image.width,
        height: best.result.image.height,
        meanConfidence: lines.reduce((sum, line) => sum + line.score, 0) / Math.max(1, lines.length),
        detectedBoxes: lines.length,
        totalMs,
        provider: `${best.result.runtime.detProvider}/${best.result.runtime.recProvider}`,
        model: MODEL[options.profile].name,
        rotation: best.rotation,
        reviewImage: options.includeReviewImage ? best.canvas.toDataURL('image/jpeg', 0.96) : undefined,
      });
    }
    return pages;
  } finally {
    // A timed-out worker may also ignore dispose. Cleanup is bounded so the UI
    // can surface the PP-OCR error instead of hanging in finally.
    await withOcrDeadline(Promise.resolve(engine.dispose()), 2_000, 'PP-OCR 资源释放').catch(() => undefined);
    for (const canvas of canvases) { canvas.width = 1; canvas.height = 1; }
    for (const image of decoded) image.src = '';
    await new Promise<void>((resolve) => window.setTimeout(resolve, 160));
  }
}
