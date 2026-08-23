import { IndexedDbTaskmasterStore } from '../taskmaster/indexedDbStore';
import type { HealthEvent, JsonObject } from '../taskmaster/contracts';
import { createPocketBuddyApiClient, defaultSkillApiBaseUrl, getDefaultSkillApiToken } from './apiClient';
import { CAPABILITY_CATALOG } from './catalog';
import { verifyGraphHash } from './compiler';
import type { CompiledSkillGraph, SkillPreflightIssue, SkillRunTrace } from './contracts';
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
        {
          retryable: false,
          suggestedAction: error.code === error.PERMISSION_DENIED
            ? '在浏览器或系统设置中允许定位，再由用户重新运行。'
            : '检查 GPS 和网络后重试；系统不会用伪坐标继续。',
        },
      )),
      {
        enableHighAccuracy: config.high_accuracy !== false,
        timeout: typeof config.timeout_ms === 'number' ? config.timeout_ms : 12000,
        maximumAge: 15000,
      },
    );
  });
}

function speakFromBrowser(text: string, config: JsonObject, signal?: AbortSignal): Promise<void> {
  if (typeof window === 'undefined' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
    throw new SkillRuntimeError('capability_unavailable', '当前宿主没有语音播报能力。');
  }
  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = typeof config.lang === 'string' ? config.lang : 'zh-CN';
    const cleanup = () => signal?.removeEventListener('abort', cancel);
    const cancel = () => {
      window.speechSynthesis.cancel();
      cleanup();
      reject(new SkillRuntimeError('cancelled', '用户已取消语音播报。'));
    };
    if (signal?.aborted) { cancel(); return; }
    signal?.addEventListener('abort', cancel, { once: true });
    utterance.onend = () => { cleanup(); resolve(); };
    utterance.onerror = () => { cleanup(); reject(new SkillRuntimeError('voice_failed', '语音播报未完成。')); };
    window.speechSynthesis.speak(utterance);
  });
}

export function createBrowserSkillRuntimeDependencies(options: BrowserSkillRuntimeOptions = {}): SkillRuntimeDependencies {
  const userId = options.userId || 'local-dev-user';
  const deviceId = options.deviceId || 'pocketbuddy-web';
  const api = createPocketBuddyApiClient({ baseUrl: defaultSkillApiBaseUrl(), getIdToken: getDefaultSkillApiToken, signal: options.signal });
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
    speak: (text, config) => speakFromBrowser(text, config, options.signal),
    syncHealthEvent: async (event: HealthEvent) => {
      const response = await api.syncHealthEvents([event]);
      const result = response.results[0];
      if (!result) throw new SkillRuntimeError('bad_backend_output', '健康事实同步没有返回结果。');
      return result;
    },
  };
}

function graphNode(graph: CompiledSkillGraph, capability: CompiledSkillGraph['nodes'][number]['capability']) {
  return graph.nodes.find((node) => node.capability === capability);
}

export async function preflightBrowserSkillRuntime(graph: CompiledSkillGraph): Promise<SkillPreflightIssue[]> {
  const issues: SkillPreflightIssue[] = [];
  if (!verifyGraphHash(graph)) {
    issues.push({
      code: 'graph_hash_mismatch',
      severity: 'blocking',
      message: '这份技能图的内容与编译 Hash 不一致。',
      suggested_action: '返回技能画布重新编译，不运行可能被改动的 Graph。',
      retryable: false,
    });
  }
  graph.capability_lockfile.forEach((lock) => {
    const contract = Object.prototype.hasOwnProperty.call(CAPABILITY_CATALOG, lock.capability)
      ? CAPABILITY_CATALOG[lock.capability]
      : null;
    if (!contract || contract.version !== lock.version || contract.runtime_binding !== lock.runtime_binding) {
      const node = graphNode(graph, lock.capability);
      issues.push({
        code: 'contract_mismatch',
        severity: 'blocking',
        message: `${lock.capability} 的本机合同与编译锁定版本不一致。`,
        suggested_action: '更新或恢复兼容 Provider，然后重新编译技能图。',
        retryable: false,
        ...(node ? { node_id: node.id, capability: node.capability } : {}),
      });
    }
  });
  const locationNode = graphNode(graph, 'sensor.location');
  if (locationNode && (typeof navigator === 'undefined' || !navigator.geolocation)) {
    issues.push({
      code: 'location_unavailable', severity: 'blocking', node_id: locationNode.id, capability: locationNode.capability,
      message: '当前设备没有可用的浏览器定位 Provider。',
      suggested_action: '换到支持 GPS 的宿主，或从技能图中移除“位置数据”模块。', retryable: false,
    });
  }
  const voiceNode = graphNode(graph, 'action.voice');
  if (voiceNode && (typeof window === 'undefined' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined')) {
    issues.push({
      code: 'voice_unavailable', severity: 'blocking', node_id: voiceNode.id, capability: voiceNode.capability,
      message: '当前宿主没有可用的语音播报 Provider。',
      suggested_action: '换到支持 Speech Synthesis 的宿主，或选择其他动作输出。', retryable: false,
    });
  }
  const poseNode = graphNode(graph, 'model.pose');
  if (poseNode && (typeof window === 'undefined' || !window.__POCKET_POSE_ESTIMATOR__)) {
    issues.push({
      code: 'pose_provider_missing', severity: 'blocking', node_id: poseNode.id, capability: poseNode.capability,
      message: '本机姿态识别 Provider 未安装。',
      suggested_action: '安装兼容 pocket-capability/v1 的姿态适配器，或移除“姿态识别”模块。', retryable: false,
    });
  }
  const modelNode = graphNode(graph, 'model.gemma');
  const syncNode = graphNode(graph, 'state.skill_completed');
  const backendNode = modelNode || syncNode;
  if (backendNode) {
    try {
      const token = await getDefaultSkillApiToken();
      if (!token) issues.push({
        code: 'authentication_missing', severity: 'blocking', node_id: backendNode.id, capability: backendNode.capability,
        message: '还没有可用的 Firebase 身份，不能调用后端能力。',
        suggested_action: '先登录 Pocket Buddy，获取新的 ID Token 后重试。', retryable: true,
      });
    } catch (error) {
      issues.push({
        code: 'authentication_missing', severity: 'blocking', node_id: backendNode.id, capability: backendNode.capability,
        message: error instanceof Error ? `身份预检失败：${error.message}` : '身份预检失败。',
        suggested_action: '刷新登录状态后重试。', retryable: true,
      });
    }
    try {
      const api = createPocketBuddyApiClient({ baseUrl: defaultSkillApiBaseUrl(), getIdToken: getDefaultSkillApiToken });
      const health = await api.health();
      if (modelNode && health.capabilities?.llm_generate?.ready === false) {
        issues.push({
          code: 'backend_capability_unavailable', severity: 'blocking', node_id: modelNode.id, capability: modelNode.capability,
          message: `pocketbuddy-api 已联通，但 Gemma Provider 未就绪：${health.capabilities.llm_generate.reason || '未配置'}`,
          suggested_action: '在 Cloud Run 配置 GEMMA_BASE_URL 与 GEMMA_API_TOKEN，或显式启用本地确定性开发 Provider。', retryable: true,
        });
      }
      if (syncNode && health.capabilities?.health_event_sync?.ready === false) {
        issues.push({
          code: 'backend_capability_unavailable', severity: 'blocking', node_id: syncNode.id, capability: syncNode.capability,
          message: `pocketbuddy-api 已联通，但健康事实同步未就绪：${health.capabilities.health_event_sync.reason || '未配置'}`,
          suggested_action: '恢复 Firestore 凭据或事实仓库后重试；本地 Evidence 不会被丢弃。', retryable: true,
        });
      }
    } catch (error) {
      issues.push({
        code: 'backend_unavailable', severity: 'blocking', node_id: backendNode.id, capability: backendNode.capability,
        message: error instanceof Error ? `pocketbuddy-api 不可用：${error.message}` : 'pocketbuddy-api 不可用。',
        suggested_action: '检查 API 地址、Cloud Run 状态或本地 8787 端口，恢复后重试。', retryable: true,
      });
    }
  }
  return issues;
}
