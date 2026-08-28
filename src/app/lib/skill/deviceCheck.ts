import { getEdgeRuntimeStatus, runEdgeChatEvidence, runEdgeVisionEvidence } from '../../../../frost-agent/edge/httpEdge';
import type { EdgeResponse } from '../../../../frost-agent/edge/types';
import { onDeviceCoverage } from './onDeviceCoverage';
import type { SkillManifest } from './types';

const STORAGE_KEY = 'pe.skillDeviceChecks.v1';
const VISION_SMOKE_FIXTURE_URL = '/assets/food-demo/meal-breakfast.jpg';

export type SkillDeviceCheckState = 'passed' | 'failed' | 'protected';

export interface SkillDeviceCheck {
  key: string;
  manifestId: string;
  manifestVersion: string;
  state: SkillDeviceCheckState;
  checkedAt: string;
  detail: string;
  appVersion?: string;
  nativeVersion?: string;
  elapsedMs?: number;
}

type StoredChecks = Record<string, SkillDeviceCheck>;

function storageKey(manifest: SkillManifest): string {
  return `${manifest.identity.id}@${manifest.identity.version}`;
}

function readChecks(): StoredChecks {
  try {
    if (typeof localStorage === 'undefined') return {};
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return value && typeof value === 'object' ? value as StoredChecks : {};
  } catch { return {}; }
}

function persist(check: SkillDeviceCheck): SkillDeviceCheck {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readChecks(), [check.key]: check }));
    }
  } catch { /* The current result is still valid for this screen. */ }
  return check;
}

export function getSkillDeviceCheck(manifest: SkillManifest): SkillDeviceCheck | undefined {
  return readChecks()[storageKey(manifest)];
}

export function isProtectedSkill(_manifestId: string): boolean {
  return false;
}

export function skillNeedsMnn(manifest: SkillManifest): boolean {
  return manifest.runtime.execution === 'mnn';
}

export function skillNeedsVision(manifest: SkillManifest): boolean {
  const coverage = onDeviceCoverage(manifest.identity.id);
  if (coverage) return coverage.capabilities.includes('mnn-vision');
  return manifest.runtime.execution === 'mnn' && manifest.permissions.tools.includes('vision');
}

function requiredAssetReady(manifest: SkillManifest, runtime: NonNullable<EdgeResponse['runtime']>): string | null {
  for (const asset of manifest.assets.filter((item) => !item.optional)) {
    if (asset.id === 'qwen3-4b-health-mnn' && runtime.healthTextReady !== true) return 'Qwen3-4B 健康基座未就绪';
  }
  return null;
}

function failed(manifest: SkillManifest, detail: string, status?: EdgeResponse, elapsedMs?: number): SkillDeviceCheck {
  return persist({
    key: storageKey(manifest), manifestId: manifest.identity.id, manifestVersion: manifest.identity.version,
    state: 'failed', checkedAt: new Date().toISOString(), detail,
    appVersion: status?.runtime?.device?.appVersionName, nativeVersion: status?.runtime?.version, elapsedMs,
  });
}

async function loadVisionSmokeFixture(url = VISION_SMOKE_FIXTURE_URL): Promise<string> {
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`视觉自检样例不可用：${response.status}`);
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('视觉自检样例不是图像');
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('视觉自检样例读取失败'));
    reader.onerror = () => reject(reader.error || new Error('视觉自检样例读取失败'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Device acceptance used by Plaza. Passing means the Android native bridge answered,
 * the declared assets are installed, and Qwen/MNN completed a real decode. It does not
 * replace the business Skill's own quality gate.
 */
export async function checkSkillOnDevice(manifest: SkillManifest): Promise<SkillDeviceCheck> {
  if (!skillNeedsMnn(manifest)) {
    return persist({
      key: storageKey(manifest), manifestId: manifest.identity.id, manifestVersion: manifest.identity.version,
      state: 'passed', checkedAt: new Date().toISOString(), detail: '本机确定性工作流已就绪（无需模型）',
    });
  }

  const started = performance.now();
  const status = await getEdgeRuntimeStatus();
  if (status.backend !== 'mnn' || status.runtime?.nativeBridge !== true) return failed(manifest, '未连接 Android MNN 原生桥', status);
  if (status.runtime.mnnEnabled !== true) return failed(manifest, 'MNN 已关闭', status);
  if (status.runtime.textReady !== true) return failed(manifest, 'Qwen 文本基座未就绪', status);
  if (skillNeedsVision(manifest) && status.runtime.visionReady !== true) return failed(manifest, 'Qwen 视觉基座未就绪', status);
  const assetError = requiredAssetReady(manifest, status.runtime);
  if (assetError) return failed(manifest, assetError, status);

  // Use the same chat route as the actual Skill. The legacy runtime_probe has a
  // stricter literal marker gate and can report a false negative even when a
  // real Qwen/MNN decode just succeeded.
  const probe = await runEdgeChatEvidence('只回复 POCKET_MNN_READY', {
    system: '你只能输出 POCKET_MNN_READY，不要解释。',
    adapter: !skillNeedsVision(manifest) ? manifest.entry.adapter : undefined,
    maxTokens: 16,
    model: manifest.runtime.base?.id === 'qwen3-4b-health-mnn' ? 'health-qwen3-4b' : 'default',
  });
  if (probe.backend !== 'mnn' || !(probe.text || '').trim()) {
    return failed(manifest, 'Qwen/MNN 实际解码未返回就绪标记', status, Math.round(performance.now() - started));
  }

  if (skillNeedsVision(manifest)) {
    const fixture = await loadVisionSmokeFixture();
    const adapter = manifest.entry.adapter?.replace(/-lora$/, '');
    const vision = await runEdgeVisionEvidence(fixture, '只回复 VISION_READY', { adapter, detail: 'fast', maxTokens: 16 });
    if (vision.backend !== 'mnn' || !(vision.text || '').trim()) {
      return failed(manifest, 'Qwen-VL/MNN 视觉实际解码失败', status, Math.round(performance.now() - started));
    }
  }

  const elapsedMs = Math.round(performance.now() - started);
  return persist({
    key: storageKey(manifest), manifestId: manifest.identity.id, manifestVersion: manifest.identity.version,
    state: 'passed', checkedAt: new Date().toISOString(),
    detail: skillNeedsVision(manifest)
      ? manifest.entry.adapter
        ? `Qwen 文本 + 视觉均由 MNN 真机解码，${manifest.entry.adapter} 已加载`
        : 'Qwen 文本 + 视觉均由 MNN 真机解码'
      : manifest.entry.adapter
        ? `Qwen 文本由 MNN 真机解码，${manifest.entry.adapter} 已加载`
        : 'Qwen 文本由 MNN 真机解码',
    appVersion: status.runtime.device?.appVersionName, nativeVersion: status.runtime.version, elapsedMs,
  });
}
