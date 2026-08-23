import type { HealthEvent } from '../taskmaster/contracts';

export interface LlmGenerateRequest {
  prompt: string;
  system?: string;
  json?: boolean;
  task?: string;
}

export interface HealthEventSyncResult {
  event_id: string;
  status: 'synced' | 'duplicate' | 'conflict' | 'invalid';
  revision: number;
  error?: string;
}

export interface PocketBuddyHealthResponse {
  ok: boolean;
  service: string;
  version: string;
  capabilities?: {
    llm_generate?: { ready: boolean; provider: string; reason?: string };
    health_event_sync?: { ready: boolean; provider: string; reason?: string };
  };
}

export interface PocketBuddyApiClientOptions {
  baseUrl?: string;
  getIdToken: () => Promise<string>;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export class SkillApiError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
    this.name = 'SkillApiError';
  }
}

function trimBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

const DEFAULT_TIMEOUT_MS = 65_000;

export function createPocketBuddyApiClient(options: PocketBuddyApiClientOptions) {
  const fetchImpl = options.fetchImpl || fetch;
  const baseUrl = trimBaseUrl(options.baseUrl || '');

  async function fetchWithDeadline(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const callerSignal = init.signal || options.signal;
    const timeoutSignal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const signal = callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal;
    try {
      return await fetchImpl(input, { ...init, signal });
    } catch (error) {
      if (callerSignal?.aborted) throw new SkillApiError('request_cancelled', '技能请求已取消。', 499);
      if (timeoutSignal.aborted) throw new SkillApiError('request_timeout', '技能服务响应超时，请稍后重试。', 408);
      throw error;
    }
  }

  async function request<T>(path: string, init: RequestInit): Promise<T> {
    const token = await options.getIdToken();
    if (!token) throw new SkillApiError('unauthenticated', '还没有可用的 Firebase 身份，技能已暂停。', 401);
    const response = await fetchWithDeadline(`${baseUrl}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        ...(init.headers || {}),
      },
    });
    const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
    if (!response.ok) {
      throw new SkillApiError(
        body?.error?.code || `http_${response.status}`,
        body?.error?.message || `pocketbuddy-api 返回 ${response.status}`,
        response.status,
      );
    }
    return body as T;
  }

  return {
    async health(): Promise<PocketBuddyHealthResponse> {
      const response = await fetchWithDeadline(`${baseUrl}/v1/healthz`);
      if (!response.ok) throw new SkillApiError('backend_unavailable', '技能后端尚未就绪。', response.status);
      return response.json() as Promise<PocketBuddyHealthResponse>;
    },
    async generate(input: LlmGenerateRequest): Promise<{ text: string }> {
      return request('/v1/llm/generate', { method: 'POST', body: JSON.stringify(input) });
    },
    async syncHealthEvents(events: HealthEvent[]): Promise<{ results: HealthEventSyncResult[] }> {
      return request('/v1/health-events:batchSync', { method: 'POST', body: JSON.stringify({ events }) });
    },
  };
}

declare global {
  interface Window {
    __POCKET_BUDDY_GET_ID_TOKEN__?: () => Promise<string>;
  }
}

export async function getDefaultSkillApiToken(): Promise<string> {
  if (typeof window !== 'undefined' && window.__POCKET_BUDDY_GET_ID_TOKEN__) {
    return window.__POCKET_BUDDY_GET_ID_TOKEN__();
  }
  return import.meta.env.DEV ? String(import.meta.env.VITE_POCKETBUDDY_DEV_TOKEN || 'pocketbuddy-local-dev') : '';
}

export function defaultSkillApiBaseUrl(): string {
  return String(import.meta.env.VITE_POCKETBUDDY_API_BASE || '');
}

export function createDefaultPocketBuddyApiClient(signal?: AbortSignal) {
  return createPocketBuddyApiClient({
    baseUrl: defaultSkillApiBaseUrl(),
    getIdToken: getDefaultSkillApiToken,
    signal,
  });
}
