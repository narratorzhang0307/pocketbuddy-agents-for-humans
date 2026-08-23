import { sha256Hex } from './protocol';
import { disableSkill, equipSkill, getInstalledSkill, listInstalledSkills, markSkillAssetsMissing, markSkillAssetsVerified, markSkillStatus, uninstallSkill } from './registry';
import type { SkillAsset } from './types';

const CACHE_NAME = 'pocket-skill-assets-v1';
const MAX_BROWSER_BYTES = 64 * 1024 * 1024;

export interface SkillAssetProgress {
  assetId: string;
  downloaded: number;
  total: number;
  phase: 'downloading' | 'verifying' | 'done';
}

const cacheKey = (asset: SkillAsset): string => `https://pocket-earth.local/skill-assets/${asset.sha256}`;

async function downloadBrowserAsset(asset: SkillAsset, signal?: AbortSignal, onProgress?: (progress: SkillAssetProgress) => void): Promise<void> {
  if (!asset.url) throw new Error(`${asset.id} 没有可下载地址`);
  if (asset.bytes > MAX_BROWSER_BYTES) throw new Error(`${asset.id} 超过浏览器 64MB 校验上限；服务端版不下载大型本地模型资产`);
  const response = await fetch(asset.url, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error(`${asset.id} 下载失败：${response.status}`);
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared && declared !== asset.bytes) throw new Error(`${asset.id} Content-Length 与 Manifest 不一致`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error(`${asset.id} 响应不可流式读取`);
  const chunks: Uint8Array[] = [];
  let downloaded = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    chunks.push(next.value); downloaded += next.value.byteLength;
    if (downloaded > asset.bytes) throw new Error(`${asset.id} 实际大小超过 Manifest`);
    onProgress?.({ assetId: asset.id, downloaded, total: asset.bytes, phase: 'downloading' });
  }
  if (downloaded !== asset.bytes) throw new Error(`${asset.id} 实际大小与 Manifest 不一致`);
  const bytes = new Uint8Array(downloaded);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  onProgress?.({ assetId: asset.id, downloaded, total: asset.bytes, phase: 'verifying' });
  if (await sha256Hex(bytes.buffer) !== asset.sha256) throw new Error(`${asset.id} SHA256 校验失败`);
  if (!('caches' in globalThis)) throw new Error('当前环境不支持 CacheStorage');
  const cache = await caches.open(CACHE_NAME);
  await cache.put(cacheKey(asset), new Response(bytes, { headers: { 'content-type': asset.media_type, 'content-length': String(asset.bytes), 'x-content-sha256': asset.sha256 } }));
  onProgress?.({ assetId: asset.id, downloaded, total: asset.bytes, phase: 'done' });
}

export async function prepareAndEquipSkill(key: string, options: { signal?: AbortSignal; onProgress?: (progress: SkillAssetProgress) => void } = {}) {
  const skill = getInstalledSkill(key);
  if (!skill) throw new Error('Skill 尚未安装');
  markSkillStatus(key, 'downloading');
  try {
    if (skill.manifest.runtime.execution !== 'declarative') {
      throw new Error('当前演示只允许服务端编排 Skill，不支持端侧 MNN runtime');
    }
    for (const asset of skill.manifest.assets.filter((item) => !item.optional)) {
      if (options.signal?.aborted) throw new DOMException('已取消', 'AbortError');
      await downloadBrowserAsset(asset, options.signal, options.onProgress);
    }
    markSkillStatus(key, 'verifying');
    markSkillAssetsVerified(key);
    return equipSkill(key);
  } catch (error) {
    markSkillStatus(key, 'failed', error);
    throw error;
  }
}

export async function cancelSkillPreparation(key: string): Promise<void> {
  const skill = getInstalledSkill(key);
  if (!skill) return;
  markSkillStatus(key, 'installed');
}

export async function uninstallSkillWithAssets(key: string): Promise<void> {
  const skill = getInstalledSkill(key);
  if (!skill) return;
  const otherAssetIds = new Set(listInstalledSkills()
    .filter((item) => item.key !== key)
    .flatMap((item) => item.manifest.assets.map((asset) => asset.id)));
  if ('caches' in globalThis) {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(skill.manifest.assets
      .filter((asset) => !otherAssetIds.has(asset.id))
      .map((asset) => cache.delete(cacheKey(asset))));
  }
  if (skill.source === 'builtin') {
    // Built-ins double as the offline Plaza demo catalog. Unloading removes them
    // from the active Skills runtime and clears specialist assets, while keeping
    // the manifest visible as a truthful "待安装" card.
    if (skill.manifest.assets.length > 0) markSkillAssetsMissing(key);
    else disableSkill(skill.manifest.identity.id);
  } else {
    uninstallSkill(key);
  }
}
