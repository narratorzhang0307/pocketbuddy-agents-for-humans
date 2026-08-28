import { downscaleForVision } from '../../lib/imageDownscale';
import { POCKET_PLANT_ASSETS, type PocketPlantAsset } from './catalog';

export const PLANT_RECOGNITION_ENDPOINT = '/api/plant-recognition';

export type PlantRecognitionResult = {
  asset: PocketPlantAsset | null;
  commonName: string;
  scientificName: string;
  confidence: number;
  visibleEvidence: string;
  matchReason: string;
  alternatives: Array<{ commonName: string; scientificName: string }>;
  model?: string;
  provider?: string;
};

type PlantRecognitionPayload = {
  ok?: boolean;
  assetId?: string | null;
  commonName?: string;
  scientificName?: string;
  confidence?: number;
  visibleEvidence?: string;
  matchReason?: string;
  alternatives?: Array<{ commonName?: string; scientificName?: string }>;
  model?: string;
  provider?: string;
  error?: string | { message?: string };
};

const readFileDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
  reader.onerror = () => reject(new Error('无法读取这张照片'));
  reader.readAsDataURL(file);
});

export async function preparePlantRecognitionImage(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('请选择植物照片');
  const source = await readFileDataUrl(file);
  if (!source) throw new Error('无法读取这张照片');
  return downscaleForVision(source, 1024, 0.82);
}

function readError(payload: PlantRecognitionPayload, status: number) {
  const raw = typeof payload.error === 'string'
    ? payload.error
    : payload.error?.message;
  if (raw === 'no_qwen_key') return '植物识别服务暂未配置';
  if (raw === 'image_requires_bounded_data') return '照片格式不受支持，请换一张 JPG、PNG 或 WebP';
  if (status === 413 || raw === 'body_too_large') return '照片太大，请换一张或先裁剪';
  if (status === 429) return '识别服务正忙，请稍后再试';
  return raw ? `识别失败：${raw}` : '植物识别暂时不可用';
}

export async function recognizePocketPlant(
  image: string,
  fetcher: typeof fetch = fetch,
): Promise<PlantRecognitionResult> {
  const response = await fetcher(PLANT_RECOGNITION_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image }),
  });
  const payload = await response.json().catch(() => ({})) as PlantRecognitionPayload;
  if (!response.ok || !payload.ok) throw new Error(readError(payload, response.status));

  const asset = payload.assetId
    ? POCKET_PLANT_ASSETS.find((candidate) => candidate.id === payload.assetId) ?? null
    : null;
  const commonName = String(payload.commonName || '').trim();
  const scientificName = String(payload.scientificName || '').trim();
  if (!commonName && !scientificName) throw new Error('模型没有返回可用的植物名称');
  return {
    asset,
    commonName,
    scientificName,
    confidence: Math.min(1, Math.max(0, Number(payload.confidence) || 0)),
    visibleEvidence: String(payload.visibleEvidence || '').trim(),
    matchReason: String(payload.matchReason || '').trim(),
    alternatives: Array.isArray(payload.alternatives)
      ? payload.alternatives.slice(0, 3).map((item) => ({
        commonName: String(item.commonName || '').trim(),
        scientificName: String(item.scientificName || '').trim(),
      })).filter((item) => item.commonName || item.scientificName)
      : [],
    model: payload.model,
    provider: payload.provider,
  };
}

