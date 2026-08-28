// Android APK 优先走 PocketMnn 原生桥；普通浏览器 / PWA 才走服务器旁路。
// 所有 Skill 必须经过这一层，避免 APK 页面误把云端成功冒充成端侧成功。
import type {
  EdgeAssetId,
  EdgeAssetInstallSource,
  EdgeAssetStatus,
  EdgeModel,
  EdgeRequest,
  EdgeResponse,
} from './types';
import { callNativeMnn, isNativeMnnPlatform } from './capacitorMnnEdge';

export async function callEdgeRequest(body: EdgeRequest, timeoutOverrideMs?: number): Promise<EdgeResponse> {
  if (isNativeMnnPlatform()) return callNativeMnn(body);
  const timeoutMs = timeoutOverrideMs ?? (body.task === 'asset_install' || body.task === 'asset_uninstall' ? 180000
    : body.task === 'runtime_apk_evidence' ? 60000
      : body.task === 'heritage_restore' || body.task === 'exhibit_matting' ? 120000
        : body.task === 'vision' ? (body.detail === 'ocr' ? 125000 : 70000)
          : body.task === 'chat' ? (body.adapter ? 70000 : 20000) : 15000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('/api/edge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) return { backend: 'stub', error: `http_${response.status}` };
    return (await response.json()) as EdgeResponse;
  } catch (error) {
    return { backend: 'stub', error: String(error) };
  } finally {
    clearTimeout(timer);
  }
}

export const httpEdge: EdgeModel = {
  async available() {
    const native = isNativeMnnPlatform();
    const response = await callEdgeRequest({ task: native ? 'runtime_status' : 'ping' });
    if (native) return response.backend === 'mnn'
      && (response.runtime?.textReady === true || response.runtime?.visionReady === true);
    return response.backend !== 'stub';
  },
  async chat(prompt, opts) {
    const response = await callEdgeRequest({
      task: 'chat', prompt, system: opts?.system, json: opts?.json,
      adapter: opts?.adapter, maxTokens: opts?.maxTokens,
    });
    return typeof response.text === 'string' ? response.text : '';
  },
  async classify(text, labels) {
    const response = await callEdgeRequest({ task: 'classify', text, labels });
    return typeof response.text === 'string' ? response.text : '';
  },
  async rank(query, candidates) {
    const response = await callEdgeRequest({ task: 'rank', query, candidates });
    return Array.isArray(response.scores) && response.scores.length === candidates.length ? response.scores : [];
  },
  async embed(texts) {
    const response = await callEdgeRequest({ task: 'embed', texts });
    return Array.isArray(response.vectors) ? response.vectors : [];
  },
  async vision(image, prompt, opts) {
    const response = await callEdgeRequest({
      task: 'vision', image, prompt, adapter: opts?.adapter,
      detail: opts?.detail, maxTokens: opts?.maxTokens,
    });
    return typeof response.text === 'string' ? response.text : '';
  },
};

export const matteExhibitPhoto = (image: string) => callEdgeRequest({ task: 'exhibit_matting', image });
export const restoreHeritageImage = (image: string, mask: string) => callEdgeRequest({ task: 'heritage_restore', image, mask });
export const getEdgeRuntimeStatus = () => callEdgeRequest({ task: 'runtime_status' });
export const probeEdgeRuntime = () => callEdgeRequest({ task: 'runtime_probe' });
/** Full response is required when a caller must prove that native MNN, rather than a cloud fallback, ran. */
export const runEdgeChatEvidence = (
  prompt: string,
  opts?: { system?: string; json?: boolean; adapter?: string; maxTokens?: number },
) => callEdgeRequest({
  task: 'chat', prompt, system: opts?.system, json: opts?.json,
  adapter: opts?.adapter, maxTokens: opts?.maxTokens,
});
export const runNativeChineseOcr = (image: string) => callEdgeRequest({ task: 'ocr_chinese', image });
export const configureEdgeRuntime = (mnnEnabled: boolean, sme2Enabled: boolean) => callEdgeRequest({
  task: 'runtime_configure', mnnEnabled, sme2Enabled,
});

export async function getEdgeAssets(): Promise<EdgeAssetStatus[]> {
  const response = await callEdgeRequest({ task: 'asset_status' });
  return Array.isArray(response.assets) ? response.assets : [];
}

export async function installEdgeAsset(asset: EdgeAssetId, source?: EdgeAssetInstallSource): Promise<EdgeAssetStatus[]> {
  const response = await callEdgeRequest({ task: 'asset_install', asset, ...source });
  if (response.error) throw new Error(response.error);
  return Array.isArray(response.assets) ? response.assets : [];
}

export async function cancelEdgeAsset(asset: EdgeAssetId): Promise<EdgeAssetStatus[]> {
  const response = await callEdgeRequest({ task: 'asset_cancel', asset });
  return Array.isArray(response.assets) ? response.assets : [];
}

export async function uninstallEdgeAsset(asset: EdgeAssetId): Promise<EdgeAssetStatus[]> {
  const response = await callEdgeRequest({ task: 'asset_uninstall', asset });
  if (response.error) throw new Error(response.error);
  return Array.isArray(response.assets) ? response.assets : [];
}
