// 端侧模型 · 前端客户端
// Capacitor Android 壳优先走 PocketMnn 原生桥；普通浏览器 / 开发环境才请求 /api/edge。
// 任何一步失败都安全降级：available 返回 false、其余返回空值，调用方走规则兜底。
import type { EdgeAssetId, EdgeAssetInstallSource, EdgeAssetStatus, EdgeModel, EdgeRequest, EdgeResponse } from './types';
import { callNativeMnn, isNativeMnnPlatform } from './capacitorMnnEdge';

/** All Skills must use this transport instead of fetching /api/edge directly. */
export async function callEdgeRequest(body: EdgeRequest, timeoutOverrideMs?: number): Promise<EdgeResponse> {
  if (isNativeMnnPlatform()) return callNativeMnn(body);
  // /api/edge 的 fetch 无原生超时：服务端 VL / LLM 推理挂起时 await 会永久 pending（曾致记一笔截图认片卡死 176s）。
  // 按 task 分档超时（vision 走端侧 3B VL 最重、冷加载/大图给足余量；chat 次之；其余文本小模型短超时），超时 abort → 落 catch → stub 兜底（等价端侧不可用，上层走规则/手填）。
  const timeoutMs = timeoutOverrideMs ?? (body.task === 'asset_install' || body.task === 'asset_uninstall' ? 180000
    : body.task === 'runtime_apk_evidence' ? 60000
    : body.task === 'vision' ? (body.detail === 'ocr' ? 125000 : 70000)
      : body.task === 'chat' ? (body.adapter ? 70000 : 20000) : 15000);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch('/api/edge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!r.ok) return { backend: 'stub' };
    return (await r.json()) as EdgeResponse;
  } catch {
    return { backend: 'stub' };
  } finally {
    clearTimeout(timer);
  }
}

export const httpEdge: EdgeModel = {
  async available() {
    const r = await callEdgeRequest({ task: isNativeMnnPlatform() ? 'runtime_status' : 'ping' });
    if (isNativeMnnPlatform()) return r.backend === 'mnn'
      && (r.runtime?.textReady === true || r.runtime?.healthTextReady === true || r.runtime?.visionReady === true);
    return r.backend !== 'stub';
  },
  async chat(prompt, opts) {
    const r = await callEdgeRequest({
      task: 'chat', prompt, system: opts?.system, json: opts?.json,
      adapter: opts?.adapter, maxTokens: opts?.maxTokens, model: opts?.model,
    });
    return typeof r.text === 'string' ? r.text : '';
  },
  async classify(text, labels) {
    const r = await callEdgeRequest({ task: 'classify', text, labels });
    return typeof r.text === 'string' && r.text ? r.text : '';
  },
  async rank(query, candidates) {
    const r = await callEdgeRequest({ task: 'rank', query, candidates });
    return Array.isArray(r.scores) && r.scores.length === candidates.length ? r.scores : [];
  },
  async embed(texts) {
    const r = await callEdgeRequest({ task: 'embed', texts });
    return Array.isArray(r.vectors) ? r.vectors : [];
  },
  async vision(image, prompt, opts) {
    const r = await callEdgeRequest({ task: 'vision', image, prompt, adapter: opts?.adapter, detail: opts?.detail, maxTokens: opts?.maxTokens });
    return typeof r.text === 'string' ? r.text : '';
  },
};

/** @deprecated Retained only so archived, non-health screens still typecheck outside the published app. */
export async function matteExhibitPhoto(image: string): Promise<EdgeResponse> {
  return callEdgeRequest({ task: 'exhibit_matting', image });
}

/** @deprecated Retained only so archived, non-health screens still typecheck outside the published app. */
export async function restoreHeritageImage(image: string, mask: string): Promise<EdgeResponse> {
  return callEdgeRequest({ task: 'heritage_restore', image, mask });
}

export async function getEdgeRuntimeStatus(): Promise<EdgeResponse> {
  return callEdgeRequest({ task: 'runtime_status' });
}

export async function probeEdgeRuntime(): Promise<EdgeResponse> {
  return callEdgeRequest({ task: 'runtime_probe' });
}

/** Full response is intentionally exposed for the acceptance ledger (metrics, backend and hashes). */
export async function runEdgeChatEvidence(prompt: string, opts?: { system?: string; json?: boolean; adapter?: string; maxTokens?: number; model?: 'default' | 'health-qwen3-4b' }): Promise<EdgeResponse> {
  return callEdgeRequest({ task: 'chat', prompt, system: opts?.system, json: opts?.json, adapter: opts?.adapter, maxTokens: opts?.maxTokens, model: opts?.model });
}

/** Full VL response for the bundled, fixed offline fixture used by the MNN acceptance ledger. */
export async function runEdgeVisionEvidence(image: string, prompt: string, opts?: { adapter?: string; detail?: 'fast' | 'high' | 'ocr'; maxTokens?: number }): Promise<EdgeResponse> {
  return callEdgeRequest({ task: 'vision', image, prompt, adapter: opts?.adapter, detail: opts?.detail, maxTokens: opts?.maxTokens });
}

export async function configureEdgeRuntime(mnnEnabled: boolean, sme2Enabled: boolean): Promise<EdgeResponse> {
  return callEdgeRequest({ task: 'runtime_configure', mnnEnabled, sme2Enabled });
}

export async function getEdgeEvidenceArtifacts(): Promise<EdgeResponse['evidenceArtifacts']> {
  const response = await callEdgeRequest({ task: 'runtime_evidence_artifacts' });
  return response.evidenceArtifacts;
}

/** Explicit and potentially expensive; only called by the acceptance ledger/export. */
export async function getEdgeApkEvidence(): Promise<EdgeResponse['apkEvidence']> {
  const response = await callEdgeRequest({ task: 'runtime_apk_evidence' });
  return response.apkEvidence;
}

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
