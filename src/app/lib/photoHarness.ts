import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { nativeApiEndpoint } from '../../native/apiOrigin';
import type { MealCandidate } from './frostHealthMemory';

export interface PhotoSegmentation {
  version: 'photos-harness/v1'; model: string; backend: 'cpu'; checkpointSha256: string;
  width: number; height: number; expected_count: number; status: 'ok' | 'needs_review'; elapsedMs: number;
  regions: Array<{ region_id: string; category: string; sam_score: number; mask_uri: string }>;
  rejected: Array<{ reason: string; score?: number; item: { category: string } }>;
}
export interface PhotoHarnessResult {
  version: 'photos-harness/v1'; meal: MealCandidate; segmentation: PhotoSegmentation;
  groundingModel: string; tunedModelUsed: boolean; imageSha256: string; imagePersisted: false;
}

export async function analyzeFoodPhoto(image: string, signal?: AbortSignal): Promise<PhotoHarnessResult> {
  signal?.throwIfAborted();
  const path = '/api/photos-harness/analyze';
  const body = { image, consent: true, requestId: crypto.randomUUID() };
  let status: number, data: any;
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.post({ url: nativeApiEndpoint(path, `https://pocketbuddy.throughtheglass.art${path}`),
      headers: { 'content-type': 'application/json' }, data: body, connectTimeout: 10000,
      readTimeout: 230000, responseType: 'json', disableRedirects: true });
    status = response.status; data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  } else {
    const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(230000)]) : AbortSignal.timeout(230000),
      redirect: 'error', cache: 'no-store' });
    status = response.status; data = await response.json();
  }
  // Native HTTP cannot cancel a submitted request; never apply a late result to another photo.
  signal?.throwIfAborted();
  if (status < 200 || status >= 300) {
    const reason = data?.error === 'food_not_recognized' ? '未辨认出可确认的食物'
      : status === 429 ? '识别服务繁忙或达到本时段额度'
      : 'Qwen / SAM 真实识别未完成';
    throw new Error(`${reason}（${String(data?.error || status)}）。未自动重试、未记录为吃过。`);
  }
  if (data?.version !== 'photos-harness/v1' || data?.segmentation?.version !== 'photos-harness/v1'
    || !data?.meal || !Array.isArray(data.segmentation.regions)) throw new Error('识别结果格式不完整，未记录。');
  return data as PhotoHarnessResult;
}

export function editedMealCandidate(candidate: MealCandidate | undefined, title: string, range: [number, number]): MealCandidate {
  const renamed = !!candidate && candidate.title.trim() !== title.trim();
  const changed = renamed || (!!candidate && range.some((value, i) => value !== candidate.calories_kcal_range[i]));
  return {
    title: title.trim(), dishes: renamed || !candidate ? [title.trim()] : candidate.dishes,
    calories_kcal_range: range,
    protein_g: changed ? null : candidate?.protein_g ?? null,
    carbs_g: changed ? null : candidate?.carbs_g ?? null,
    fat_g: changed ? null : candidate?.fat_g ?? null,
    uncertainty: changed ? '用户修改了餐名或热量范围；已清除不再可靠的原营养估算，请按实际食物确认。'
      : candidate?.uncertainty || '用户手动填写的估算，未称重或调用营养数据库',
    model: candidate?.model || 'user-confirmed/manual',
  };
}
