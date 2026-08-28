// 兼容文件名：看展搭子的云视觉已改为阿里云百炼 Qwen3-VL。
// 仅在端侧 Qwen/MNN 读不出、用户明确同意上传公开说明牌后调用。
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { nativeApiEndpoint } from '../../../native/apiOrigin';
import {
  normalizeQwenImageSource,
  normalizeQwenPrompt,
  postQwenJson,
  readQwenError,
  readStringField,
  type QwenFetch,
} from './qwenClient';

export const QWEN_VISION_ENDPOINT = '/api/qwen-vision';
export const QWEN_VISION_NATIVE_ENDPOINT = 'https://pocketearth.throughtheglass.art/api/qwen-vision';
export const QWEN_VISION_TIMEOUT_MS = 30000;

export interface QwenVisionRequestOptions {
  prompt?: string;
  endpoint?: string;
  timeoutMs?: number;
  fetcher?: QwenFetch;
  purpose?: 'heritage' | 'reading-jot';
}

export interface QwenVisionResult {
  ok: boolean;
  text: string;
  error?: string;
  status?: number;
  model?: string;
  retryAfterMs?: number;
}

function readChoiceText(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return '';
  const first = choices[0];
  if (!first || typeof first !== 'object') return '';
  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== 'object') return '';
  const content = (message as { content?: unknown }).content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => readStringField(part, 'text')).filter(Boolean).join('\n');
  return '';
}

export function parseQwenVisionPayload(data: unknown): Pick<QwenVisionResult, 'text' | 'error' | 'model'> {
  return {
    text: readStringField(data, 'text') || readStringField(data, 'output_text') || readStringField(data, 'outputText') || readChoiceText(data),
    error: readQwenError(data) || undefined,
    model: readStringField(data, 'model') || undefined,
  };
}

export function parseNativeQwenVisionData(
  data: unknown,
  status: number,
): { data?: unknown; error?: string } {
  if (typeof data !== 'string') return { data };
  try {
    return { data: JSON.parse(data) };
  } catch {
    return {
      error: status === 504
        ? '云端 Qwen 响应超时，请重试'
        : status === 502
          ? '云端 Qwen 网关暂不可用，请重试'
          : '云端返回了非 JSON 响应',
    };
  }
}

async function requestNativeQwenVision(
  endpoint: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<QwenVisionResult> {
  try {
    const url = endpoint.startsWith('/')
      ? nativeApiEndpoint(endpoint, `${QWEN_VISION_NATIVE_ENDPOINT.replace(/\/api\/qwen-vision$/, '')}${endpoint}`)
      : endpoint;
    const response = await CapacitorHttp.post({
      url,
      headers: { 'content-type': 'application/json' },
      data: body,
      connectTimeout: Math.min(timeoutMs, 30_000),
      readTimeout: timeoutMs,
      responseType: 'json',
    });
    const parsed = parseNativeQwenVisionData(response.data, response.status);
    if (parsed.error) return { ok: false, text: '', error: parsed.error, status: response.status };
    const data = parsed.data;
    const payload = parseQwenVisionPayload(data);
    const hasText = !!payload.text.trim();
    const ok = response.status >= 200 && response.status < 300 && hasText && !payload.error;
    return {
      ok,
      text: ok ? payload.text : '',
      error: ok ? undefined : payload.error || (!hasText ? 'empty_text' : `http_${response.status}`),
      status: response.status,
      model: payload.model,
    };
  } catch (error) {
    return { ok: false, text: '', error: error instanceof Error ? error.message : 'network_error' };
  }
}

export async function requestQwenVision(imageDataUrl: string, options: QwenVisionRequestOptions = {}): Promise<QwenVisionResult> {
  const image = normalizeQwenImageSource(imageDataUrl);
  if (!image) return { ok: false, text: '', error: 'no_image' };
  const endpoint = options.endpoint || QWEN_VISION_ENDPOINT;
  const timeoutMs = options.timeoutMs ?? QWEN_VISION_TIMEOUT_MS;
  const body = { image, prompt: normalizeQwenPrompt(options.prompt), purpose: options.purpose };

  if (!options.fetcher && Capacitor.isNativePlatform()) {
    return requestNativeQwenVision(endpoint, body, timeoutMs);
  }

  const result = await postQwenJson({
    endpoint,
    timeoutMs,
    fetcher: options.fetcher,
    body,
  });
  const payload = parseQwenVisionPayload(result.data);
  const hasText = !!payload.text.trim();
  const ok = result.ok && hasText && !payload.error;
  const error = result.error || payload.error || (result.ok && !hasText ? 'empty_text' : undefined);
  return {
    ok,
    text: ok ? payload.text : '',
    error,
    status: result.status,
    model: payload.model,
    retryAfterMs: result.retryAfterMs,
  };
}

export async function qwenVision(imageDataUrl: string, prompt?: string): Promise<string> {
  const result = await requestQwenVision(imageDataUrl, { prompt });
  return result.text;
}
