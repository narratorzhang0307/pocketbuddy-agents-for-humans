import { matteExhibitPhoto as requestExhibitMatting } from '../../../../frost-agent/edge/httpEdge';

const OSS_ASSET_ORIGIN = 'https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com';
const CORS_ASSET_ORIGIN = 'https://assets-pocketearth.throughtheglass.art';

/**
 * The release shell displays immutable art directly from OSS. WebView may
 * cache that first <img> response without CORS headers, so a later fetch() of
 * the same URL cannot read its bytes for local inference. The asset gateway
 * serves the identical OSS object with unconditional CORS and inline headers.
 */
export function exhibitInferenceAssetUrl(url: string): string {
  return url.startsWith(`${OSS_ASSET_ORIGIN}/`)
    ? `${CORS_ASSET_ORIGIN}${url.slice(OSS_ASSET_ORIGIN.length)}`
    : url;
}

export type Museum2_5DView = {
  id: string;
  yawDeg: number;
  colorUrl: string;
  depthUrl: string;
  originalUrl?: string;
  observed: true;
};

export type Museum2_5DDetailHotspot = {
  id: string;
  exhibitId: string;
  yawDeg: number;
  x: number;
  y: number;
  kind: 'inscription' | 'ornament' | 'damage' | 'craft';
  title: string;
  detailPhotoUrl?: string;
  captureRole: 'separate_detail_photo';
  ocr?: {
    rawText: string;
    normalizedText?: string;
    modernText?: string;
    confidence: number;
    uncertainCharacters?: string[];
    baseCandidate?: string;
    loraCandidate?: string;
    source?: 'agreement' | 'rubbing-lora' | 'base-fallback' | 'comparison-review' | 'manual';
    needsConfirmation?: boolean;
    gateReason?: string;
    languageGateReason?: string;
    semanticSource?: 'qwen' | 'raw-fallback';
  };
};

export type Museum2_5DDemo = {
  id: string;
  label: string;
  nameEn: string;
  sourceLabel: string;
  material: string[];
  category: string;
  manifestUrl: string;
  evidenceUrl: string;
  views: Museum2_5DView[];
  hotspots: Museum2_5DDetailHotspot[];
};

function observedViews(assetRoot: string, yawDegrees: number[], includeOriginal = false): Museum2_5DView[] {
  return yawDegrees.map((yawDeg, index) => {
    const stem = `view-${String(index).padStart(2, '0')}-${String(yawDeg).padStart(3, '0')}`;
    const root = `${assetRoot}/views`;
    return {
      id: stem,
      yawDeg,
      colorUrl: `${root}/${stem}.webp`,
      depthUrl: `${root}/${stem}-depth.png`,
      originalUrl: includeOriginal ? `${assetRoot}/originals/${stem}.jpg` : undefined,
      observed: true as const,
    };
  });
}

// This is deliberately a capture slot, not a crop from the six overview
// frames.  On a real exhibit it is replaced by a separately photographed
// inscription / ornament / damage detail before OCR is allowed to run.
export const MUSEUM_2_5D_DEMO_HOTSPOTS: Museum2_5DDetailHotspot[] = [
  {
    id: 'abo-eef43318-ornament-slot',
    exhibitId: 'abo-eef43318',
    yawDeg: 355,
    x: 0.62,
    y: 0.45,
    kind: 'inscription',
    title: '铭文细节 · 待单独近拍',
    captureRole: 'separate_detail_photo',
  },
];

function inscriptionSlot(exhibitId: string, yawDeg: number): Museum2_5DDetailHotspot {
  return {
    id: `${exhibitId}-inscription-slot`,
    exhibitId,
    yawDeg,
    x: 0.58,
    y: 0.48,
    kind: 'inscription',
    title: '铭文细节 · 待单独近拍',
    captureRole: 'separate_detail_photo',
  };
}

function verifiedInscriptionHotspot(
  exhibitId: string,
  yawDeg: number,
  x: number,
  y: number,
  detailPhotoUrl: string,
  rawText: string,
  modernText: string,
  gateReason: string,
  candidates: { base?: string; lora?: string } = {},
): Museum2_5DDetailHotspot {
  return {
    id: `${exhibitId}-verified-inscription`,
    exhibitId,
    yawDeg,
    x,
    y,
    kind: 'inscription',
    title: '局部铭文 · 独立近拍',
    detailPhotoUrl,
    captureRole: 'separate_detail_photo',
    ocr: {
      rawText,
      normalizedText: rawText,
      modernText,
      confidence: 0.86,
      baseCandidate: candidates.base,
      loraCandidate: candidates.lora,
      source: 'manual',
      needsConfirmation: false,
      gateReason,
      semanticSource: 'qwen',
    },
  };
}

export const MUSEUM_2_5D_DEMOS: Museum2_5DDemo[] = [
  {
    id: 'harvard-200497-li',
    label: '西周青铜鬲',
    nameEn: "'Li' Ritual Food Vessel",
    sourceLabel: 'Harvard Art Museums IIIF · 6 张完整馆藏角度 · MNN + 结构守卫 6/6',
    material: ['青铜', '西周', '六张主体完整馆藏图'],
    category: '鬲',
    manifestUrl: '/assets/exhibit-2_5d/harvard-200497-li-complete-mnn/exhibit.json',
    evidenceUrl: '/assets/exhibit-2_5d/harvard-200497-li-complete-mnn/complete-six-view-contact-sheet.jpg',
    views: observedViews('/assets/exhibit-2_5d/harvard-200497-li-complete-mnn', [0, 60, 120, 180, 240, 300], true),
    hotspots: [verifiedInscriptionHotspot(
      'harvard-200497-li', 0, 0.52, 0.62,
      '/assets/exhibit-2_5d/harvard-200497-li-museum-matting/details/inscription.jpg',
      '季貞作尊鬲',
      '这是西周时期铸造的青铜鬲，由季贞制作。',
      '双路均出现占位符塌缩，质量门控拒绝自动释读；按馆方释文确认后由原生 Qwen 解释。',
      { base: '摩崖石刻 □□□…', lora: '摩崖石刻 □□□…' },
    )],
  },
  {
    id: 'ego-ch-42-79-0-gallery-relief',
    label: '繁复背景压力测试',
    nameEn: 'Gallery Stone Relief · Complex Background Stress Test',
    sourceLabel: 'EGO-CH 真实文化场所序列 · 繁复背景压力测试 · 非主案例',
    material: ['石质', '展厅玻璃与阴影', '六张未抠图原照'],
    category: '浮雕',
    manifestUrl: '/assets/exhibit-2_5d/ego-ch-42-79-0-gallery-relief-museum-mnn/exhibit.json',
    evidenceUrl: '/assets/exhibit-2_5d/ego-ch-42-79-0-gallery-relief-museum-mnn/comparisons/view-00-000-original-vs-cutout.jpg',
    views: observedViews('/assets/exhibit-2_5d/ego-ch-42-79-0-gallery-relief-museum-mnn', [0, 60, 120, 180, 240, 300], true),
    hotspots: [inscriptionSlot('ego-ch-42-79-0-gallery-relief', 0)],
  },
  {
    id: 'harvard-315439-rong-mirror',
    label: '孔子·荣启期铜镜',
    nameEn: 'Rong Qiqi and Confucius Mirror',
    sourceLabel: 'Harvard Art Museums IIIF · 2 观察面（覆盖受限）',
    material: ['青铜', '东汉', '九字人物榜题'],
    category: '铜镜',
    manifestUrl: '/assets/exhibit-2_5d/harvard-315439-rong-mirror-museum-matting/exhibit.json',
    evidenceUrl: '/assets/exhibit-2_5d/harvard-315439-rong-mirror-museum-matting/details/inscription.jpg',
    views: observedViews('/assets/exhibit-2_5d/harvard-315439-rong-mirror-museum-matting', [0, 180]),
    hotspots: [verifiedInscriptionHotspot(
      'harvard-315439-rong-mirror', 180, 0.5, 0.51,
      '/assets/exhibit-2_5d/harvard-315439-rong-mirror-museum-matting/details/inscription.jpg',
      '孔夫子問曰囘榮啟奇',
      '这是东汉铜镜上的三列图像榜题，内容为“孔夫子”、“問曰囘”、“榮啟奇”。其中“孔夫子”是人物名，“問曰囘”为古文表达，“榮啟奇”为姓名。此为人物榜题，不应强行补成完叙事。',
      '相同原图/提示/解码下，LoRA CER 22.2%，Base CER 44.4%；门控展示双候选，用户对照馆方释文确认后进入 Qwen 断句。',
      { base: '孔夫子問日春榮壽', lora: '孔夫子 / 問曰答 / 榮譽奇' },
    )],
  },
  {
    id: 'harvard-204612-jade-bi',
    label: '乾隆御题玉璧',
    nameEn: 'Large Jade Disk with Imperial Inscription',
    sourceLabel: 'Harvard Art Museums IIIF · 4 观察视角（覆盖受限）',
    material: ['软玉', '战国玉璧', '1766 年御题'],
    category: '玉璧',
    manifestUrl: '/assets/exhibit-2_5d/harvard-204612-jade-bi-museum-matting/exhibit.json',
    evidenceUrl: '/assets/exhibit-2_5d/harvard-204612-jade-bi-museum-matting/details/inscription.jpg',
    views: observedViews('/assets/exhibit-2_5d/harvard-204612-jade-bi-museum-matting', [0, 90, 180, 270]),
    hotspots: [verifiedInscriptionHotspot(
      'harvard-204612-jade-bi', 0, 0.79, 0.5,
      '/assets/exhibit-2_5d/harvard-204612-jade-bi-museum-matting/details/inscription.jpg',
      '乾隆丙戌孟春月御題古香',
      '这是乾隆丙戌年（1766 年）春季首月题写在玉璧上的御题款，“古香”是印文。',
      '局部照只覆盖边款一段；完整转录采用馆方编目，Qwen 只做原字守恒的解释，不宣称局部照独立读全。',
    )],
  },
  {
    id: 'abo-eef43318',
    label: '陶瓷双耳瓶',
    nameEn: 'ABO eef43318',
    sourceLabel: 'ABO 数据集 · 演示展位',
    material: ['陶瓷', '多视图 RGB 样本'],
    category: '瓶',
    manifestUrl: '/assets/exhibit-2_5d/abo-eef43318-museum-mnn/exhibit.json',
    evidenceUrl: '/assets/exhibit-2_5d/model-proof/frozen-blind-best-01.png',
    views: observedViews('/assets/exhibit-2_5d/abo-eef43318-museum-mnn', [0, 70, 140, 215, 285, 355]),
    hotspots: MUSEUM_2_5D_DEMO_HOTSPOTS,
  },
  {
    id: 'chsd-Ark_HM_791_HI',
    label: '圆腹双耳陶罐',
    nameEn: 'CHSD Ark HM 791 HI',
    sourceLabel: 'CHSD 文化遗产数据集 · 演示展位',
    material: ['陶土', '文化遗产多视图样本'],
    category: '罐',
    manifestUrl: '/assets/exhibit-2_5d/chsd-Ark_HM_791_HI-museum-mnn/exhibit.json',
    evidenceUrl: '/assets/exhibit-2_5d/model-proof/chsd-Ark_HM_791_HI-museum-mnn-2_5d-proof.jpg',
    views: observedViews('/assets/exhibit-2_5d/chsd-Ark_HM_791_HI-museum-mnn', [1, 61, 121, 181, 241, 301]),
    hotspots: [inscriptionSlot('chsd-Ark_HM_791_HI', 1)],
  },
  {
    id: 'chsd-Ark_HM_217_HI',
    label: '舟形有柄器',
    nameEn: 'CHSD Ark HM 217 HI',
    sourceLabel: 'CHSD 文化遗产数据集 · 演示展位',
    material: ['陶土', '文化遗产多视图样本'],
    category: '器皿',
    manifestUrl: '/assets/exhibit-2_5d/chsd-Ark_HM_217_HI-museum-mnn/exhibit.json',
    evidenceUrl: '/assets/exhibit-2_5d/model-proof/chsd-Ark_HM_217_HI-museum-mnn-2_5d-proof.jpg',
    views: observedViews('/assets/exhibit-2_5d/chsd-Ark_HM_217_HI-museum-mnn', [1, 61, 121, 181, 241, 301]),
    hotspots: [inscriptionSlot('chsd-Ark_HM_217_HI', 1)],
  },
];

// 主案例是现场体验任务，压力测试也不作为用户实例展示。
export const MUSEUM_2_5D_ARCHIVE_DEMOS = MUSEUM_2_5D_DEMOS.slice(2);

export const MUSEUM_2_5D_DEMO_VIEWS = MUSEUM_2_5D_DEMOS[0].views;

export function museum2_5DDemoFromUrl(url?: string): Museum2_5DDemo {
  return MUSEUM_2_5D_DEMOS.find((demo) => demo.manifestUrl === url) || MUSEUM_2_5D_DEMOS[0];
}

export const MUSEUM_2_5D_PIPELINE = [
  '6 张原始 RGB',
  '抠图 MNN · 本次运行',
  'Alpha 门禁 · 6/6',
  'Alpha + RGB · 本地深度',
  '2.5D Builder · 本次生成',
] as const;

export const MUSEUM_MATTING_PROOF = {
  frozenBlindImages: 198,
  base: { mae: 0.1826951389, iou: 0.2937967, boundaryIou: 0.1223810167 },
  tuned: { mae: 0.0920369457, iou: 0.7003366256, boundaryIou: 0.2859277279 },
  evidenceUrl: '/assets/exhibit-2_5d/model-proof/frozen-blind-best-01.png',
  regressionUrl: '/assets/exhibit-2_5d/model-proof/frozen-blind-regression-01.png',
  runtime: 'MNN 3.6.1 FP16',
  sme2: '真机运行时检测',
} as const;

export async function matteExhibitPhoto(image: string): Promise<{
  cutout?: string;
  alpha?: string;
  accepted: boolean;
  reason?: string;
  foregroundRatio?: number;
  elapsedMs?: number;
  inferenceMs?: number;
  runtime?: string;
  model?: string;
  error?: string;
}> {
  const response = await requestExhibitMatting(image);
  const ratio = response.stats?.foregroundRatio;
  const accepted = response.backend === 'mnn'
    && response.stats?.runtime === 'MNN Android JNI'
    && typeof response.image === 'string'
    && typeof response.alpha === 'string'
    && typeof ratio === 'number'
    && mattingCaptureAccepted(ratio)
    && response.stats?.accepted !== false;
  return {
    cutout: response.image,
    alpha: response.alpha,
    accepted,
    reason: response.stats?.reason,
    foregroundRatio: ratio,
    elapsedMs: response.stats?.elapsedMs,
    inferenceMs: response.stats?.inferenceMs,
    runtime: response.stats?.runtime,
    model: response.stats?.model,
    error: response.error,
  };
}

export function wrapYaw(value: number): number {
  return ((value % 360) + 360) % 360;
}

export function signedYawDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

export function nearestObservedView(yaw: number, views = MUSEUM_2_5D_DEMO_VIEWS): Museum2_5DView {
  if (!views.length) throw new Error('Museum 2.5D viewer needs at least one observed view');
  const target = wrapYaw(yaw);
  return views.reduce((best, view) => (
    Math.abs(signedYawDelta(target, view.yawDeg)) < Math.abs(signedYawDelta(target, best.yawDeg)) ? view : best
  ));
}

export function captureReady(viewCount: number): boolean {
  return viewCount >= 6 && viewCount <= 8;
}

export function mattingCaptureAccepted(foregroundRatio: number): boolean {
  return Number.isFinite(foregroundRatio) && foregroundRatio >= 0.05 && foregroundRatio <= 0.85;
}

export function hotspotVisibleAtYaw(
  yaw: number,
  hotspot: Pick<Museum2_5DDetailHotspot, 'yawDeg'>,
  tolerance = 42,
): boolean {
  return Math.abs(signedYawDelta(yaw, hotspot.yawDeg)) <= tolerance;
}
