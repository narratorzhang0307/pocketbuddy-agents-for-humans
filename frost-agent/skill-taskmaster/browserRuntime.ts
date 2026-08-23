import { IndexedDbTaskmasterStore } from '../taskmaster/indexedDbStore';
import type { HealthEvent, JsonObject } from '../taskmaster/contracts';
import { createPocketBuddyApiClient, defaultSkillApiBaseUrl, getDefaultSkillApiToken } from './apiClient';
import type { CompiledSkillGraph, SkillRunTrace } from './contracts';
import { SkillRuntimeError, type SkillRuntimeDependencies } from './runtime';

declare global {
  interface Window {
    __POCKET_POSE_ESTIMATOR__?: (config: JsonObject) => Promise<JsonObject>;
  }
}

export interface BrowserSkillRuntimeOptions {
  userId?: string;
  deviceId?: string;
  signal?: AbortSignal;
  onTrace?: (trace: SkillRunTrace) => void | Promise<void>;
}

function locationFromBrowser(config: JsonObject): Promise<{ latitude: number; longitude: number; accuracy_m?: number; captured_at: string }> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new SkillRuntimeError('capability_unavailable', '当前设备没有浏览器定位能力。');
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        ...(Number.isFinite(position.coords.accuracy) ? { accuracy_m: position.coords.accuracy } : {}),
        captured_at: new Date(position.timestamp || Date.now()).toISOString(),
      }),
      (error) => reject(new SkillRuntimeError(
        error.code === error.PERMISSION_DENIED ? 'permission_denied' : 'location_failed',
        error.code === error.PERMISSION_DENIED ? '定位权限被拒绝，技能已暂停。' : `无法读取位置：${error.message}`,
      )),
      {
        enableHighAccuracy: config.high_accuracy !== false,
        timeout: typeof config.timeout_ms === 'number' ? config.timeout_ms : 12000,
        maximumAge: 15000,
      },
    );
  });
}

function speakFromBrowser(text: string, config: JsonObject): Promise<void> {
  if (typeof window === 'undefined' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
    throw new SkillRuntimeError('capability_unavailable', '当前宿主没有语音播报能力。');
  }
  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = typeof config.lang === 'string' ? config.lang : 'zh-CN';
    utterance.onend = () => resolve();
    utterance.onerror = () => reject(new SkillRuntimeError('voice_failed', '语音播报未完成。'));
    window.speechSynthesis.speak(utterance);
  });
}

export function createBrowserSkillRuntimeDependencies(options: BrowserSkillRuntimeOptions = {}): SkillRuntimeDependencies {
  const userId = options.userId || 'local-dev-user';
  const deviceId = options.deviceId || 'pocketbuddy-web';
  const api = createPocketBuddyApiClient({ baseUrl: defaultSkillApiBaseUrl(), getIdToken: getDefaultSkillApiToken });
  const healthStore = new IndexedDbTaskmasterStore();
  return {
    userId,
    deviceId,
    signal: options.signal,
    onTrace: options.onTrace,
    confirmManual: async () => true,
    readLocation: locationFromBrowser,
    readHealthSummary: async (config) => {
      const lookbackHours = typeof config.lookback_hours === 'number' ? config.lookback_hours : 24;
      const to = new Date();
      const from = new Date(to.getTime() - lookbackHours * 60 * 60 * 1000);
      const events = await healthStore.listHealthEvents(userId, from.toISOString(), to.toISOString());
      return {
        lookback_hours: lookbackHours,
        event_count: events.length,
        latest_event: events.length ? { domain: events.at(-1)?.domain || '', type: events.at(-1)?.type || '' } : null,
      };
    },
    generateText: async (input) => api.generate(input),
    estimatePose: async (config) => {
      if (typeof window === 'undefined' || !window.__POCKET_POSE_ESTIMATOR__) {
        throw new SkillRuntimeError('capability_unavailable', '本机姿态适配器尚未安装，没有使用伪造结果继续。');
      }
      return window.__POCKET_POSE_ESTIMATOR__(config);
    },
    evaluateSafety: async (context) => ({ safe: context.safety_signal !== 'stop' }),
    speak: speakFromBrowser,
    syncHealthEvent: async (event: HealthEvent) => {
      const response = await api.syncHealthEvents([event]);
      const result = response.results[0];
      if (!result) throw new SkillRuntimeError('bad_backend_output', '健康事实同步没有返回结果。');
      return result;
    },
  };
}

export async function preflightBrowserSkillRuntime(graph: CompiledSkillGraph): Promise<string[]> {
  const issues: string[] = [];
  if (graph.nodes.some((node) => node.capability === 'sensor.location') && (typeof navigator === 'undefined' || !navigator.geolocation)) {
    issues.push('设备不支持浏览器定位');
  }
  if (graph.nodes.some((node) => node.capability === 'action.voice') && (typeof window === 'undefined' || !window.speechSynthesis)) {
    issues.push('宿主不支持语音播报');
  }
  if (graph.nodes.some((node) => node.capability === 'model.pose') && (typeof window === 'undefined' || !window.__POCKET_POSE_ESTIMATOR__)) {
    issues.push('本机姿态适配器未安装');
  }
  if (graph.nodes.some((node) => node.capability === 'model.gemma' || node.capability === 'state.skill_completed')) {
    try {
      const api = createPocketBuddyApiClient({ baseUrl: defaultSkillApiBaseUrl(), getIdToken: getDefaultSkillApiToken });
      await api.health();
    } catch (error) {
      issues.push(error instanceof Error ? error.message : 'pocketbuddy-api 不可用');
    }
  }
  return issues;
}
