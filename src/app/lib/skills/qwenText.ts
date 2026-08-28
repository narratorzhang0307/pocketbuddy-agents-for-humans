// 统一的 Qwen 文本请求：Web 走同源代理，Capacitor APK 走已部署的 HTTPS 代理。
// API Key 始终留在服务端；原生端只发送业务模块明确传入的最小文本。
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { nativeApiEndpoint } from '../../../native/apiOrigin';
import { postQwenJson, readQwenError, readStringField, type QwenFetch } from './qwenClient';

export const QWEN_TEXT_ENDPOINT = '/api/frost-llm';
export const QWEN_TEXT_NATIVE_ENDPOINT = 'https://pocketearth.throughtheglass.art/api/frost-llm';

export interface QwenTextRequest {
  prompt: string;
  system?: string;
  json?: boolean;
  task?: string;
  endpoint?: string;
  timeoutMs?: number;
  fetcher?: QwenFetch;
}

export interface QwenTextResult {
  ok: boolean;
  text: string;
  error?: string;
  status?: number;
  model?: string;
  retryAfterMs?: number;
}

function parsePayload(data: unknown): Pick<QwenTextResult, 'text' | 'error' | 'model'> {
  return {
    text: readStringField(data, 'text'),
    error: readQwenError(data) || undefined,
    model: readStringField(data, 'model') || undefined,
  };
}

async function requestNative(endpoint: string, body: Record<string, unknown>, timeoutMs: number): Promise<QwenTextResult> {
  try {
    const url = endpoint.startsWith('/')
      ? nativeApiEndpoint(endpoint, `${QWEN_TEXT_NATIVE_ENDPOINT.replace(/\/api\/frost-llm$/, '')}${endpoint}`)
      : endpoint;
    const response = await CapacitorHttp.post({
      url,
      headers: { 'content-type': 'application/json' },
      data: body,
      connectTimeout: Math.min(timeoutMs, 30_000),
      readTimeout: timeoutMs,
      responseType: 'json',
    });
    const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    const payload = parsePayload(data);
    const ok = response.status >= 200 && response.status < 300 && !!payload.text.trim() && !payload.error;
    return {
      ok,
      text: ok ? payload.text : '',
      error: ok ? undefined : payload.error || (!payload.text.trim() ? 'empty_text' : `http_${response.status}`),
      status: response.status,
      model: payload.model,
    };
  } catch (error) {
    return { ok: false, text: '', error: error instanceof Error ? error.message : 'network_error' };
  }
}

export async function requestQwenText(input: QwenTextRequest): Promise<QwenTextResult> {
  const prompt = (input.prompt || '').trim();
  if (!prompt) return { ok: false, text: '', error: 'invalid_prompt' };
  const endpoint = input.endpoint || QWEN_TEXT_ENDPOINT;
  const timeoutMs = input.timeoutMs ?? 30_000;
  const body = { prompt, system: input.system, json: !!input.json, task: input.task };

  if (!input.fetcher && Capacitor.isNativePlatform()) return requestNative(endpoint, body, timeoutMs);

  const result = await postQwenJson({ endpoint, timeoutMs, fetcher: input.fetcher, body });
  const payload = parsePayload(result.data);
  const ok = result.ok && !!payload.text.trim() && !payload.error;
  return {
    ok,
    text: ok ? payload.text : '',
    error: ok ? undefined : result.error || payload.error || 'empty_text',
    status: result.status,
    model: payload.model,
    retryAfterMs: result.retryAfterMs,
  };
}
