// 可复用 Skill（app 层）· GMI 图像生成（为展品/落点生成专属明信片，海外平台传播用）。
// 走服务端 /api/gmi-image（GMI console 图像端点，gemini flash-lite-image 同步返回图 url）。密钥只在服务端。
// suggest-then-confirm：只在用户点「生成明信片」时调用，不自动烧额度；失败静默回落（返回空串）。
// 版权红线：prompt 只做风格化原创，不指名 IP、不复刻真实海报。
import {
  normalizeGmiPrompt,
  postGmiJson,
  readGmiError,
  readStringField,
  type GmiFetch,
} from './gmiClient';

export const GMI_IMAGE_ENDPOINT = '/api/gmi-image';
export const GMI_IMAGE_TIMEOUT_MS = 25000;

export interface GmiImageRequestOptions {
  model?: string;
  endpoint?: string;
  timeoutMs?: number;
  fetcher?: GmiFetch;
}

export interface GmiImageResult {
  ok: boolean;
  url: string;
  error?: string;
  status?: number;
  model?: string;
  queueStatus?: string;
  retryAfterMs?: number;
  requestId?: string;
}

function readConsoleImageUrl(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const images = (data as { data?: unknown }).data;
  if (Array.isArray(images)) {
    const url = images.map((item) => readStringField(item, 'url')).find(Boolean);
    if (url) return url;
  }
  const outcome = (data as { outcome?: unknown }).outcome;
  if (!outcome || typeof outcome !== 'object') return '';
  const firstMedia = (outcome as { media_urls?: unknown }).media_urls;
  if (Array.isArray(firstMedia)) {
    const url = firstMedia.map((item) => readStringField(item, 'url')).find(Boolean);
    if (url) return url;
  }
  return readStringField(outcome, 'thumbnail_image_url');
}

function readImageRequestId(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  return readStringField(data, 'requestId') || readStringField(data, 'request_id') || readStringField(data, 'id');
}

export function parseGmiImagePayload(data: unknown): Pick<GmiImageResult, 'url' | 'error' | 'model' | 'queueStatus' | 'requestId'> {
  return {
    url: readStringField(data, 'url') || readConsoleImageUrl(data),
    error: readGmiError(data) || undefined,
    model: readStringField(data, 'model') || undefined,
    queueStatus: readStringField(data, 'status') || undefined,
    requestId: readImageRequestId(data) || undefined,
  };
}

export function imageEmptyError(queueStatus?: string): 'image_pending' | 'image_failed' | 'empty_url' {
  const status = (queueStatus || '').trim().toLowerCase();
  if (['failed', 'fail', 'error', 'errored', 'canceled', 'cancelled', 'timeout'].includes(status)) return 'image_failed';
  return status && !['completed', 'complete', 'succeeded', 'success', 'done'].includes(status) ? 'image_pending' : 'empty_url';
}

export async function requestGmiImage(prompt: string, options: GmiImageRequestOptions = {}): Promise<GmiImageResult> {
  const cleanPrompt = normalizeGmiPrompt(prompt);
  if (!cleanPrompt) return { ok: false, url: '', error: 'no_prompt' };

  const result = await postGmiJson({
    endpoint: options.endpoint || GMI_IMAGE_ENDPOINT,
    timeoutMs: options.timeoutMs ?? GMI_IMAGE_TIMEOUT_MS,
    fetcher: options.fetcher,
    body: { prompt: cleanPrompt, model: normalizeGmiPrompt(options.model) },
  });
  const payload = parseGmiImagePayload(result.data);
  const url = payload.url.trim();
  const ok = result.ok && !!url && !payload.error;
  const error = result.error || payload.error || (result.ok && !url ? imageEmptyError(payload.queueStatus) : undefined);
  return {
    ok,
    url: ok ? url : '',
    error,
    status: result.status,
    model: payload.model,
    queueStatus: payload.queueStatus,
    retryAfterMs: result.retryAfterMs,
    requestId: payload.requestId,
  };
}

export async function gmiImage(prompt: string, model?: string): Promise<string> {
  const result = await requestGmiImage(prompt, { model });
  return result.url;
}
