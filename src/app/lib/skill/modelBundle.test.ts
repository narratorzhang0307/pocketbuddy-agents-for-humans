import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  QWEN4B_HEALTH_ASSET,
  QWEN4B_HEALTH_RELEASE,
  QWEN4B_HEALTH_REVISION,
} from '../../../../frost-agent/edge/qwen4bHealthRelease';
import { BUILTIN_SKILLS } from './builtins';

interface BundleFile { path: string; bytes: number; sha256: string }
interface BundleManifest {
  protocol: string;
  releaseId: string;
  totalBytes: number;
  bundles: Record<string, { target: string; files: BundleFile[] }>;
}
interface ReleasePin { id: string; bytes: number; sha256: string }

const manifestPath = resolve(process.cwd(), 'android/native/model-bundle.manifest.json');
const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString('utf8')) as BundleManifest;
const pluginSource = readFileSync(resolve(process.cwd(), 'android/app/src/main/java/art/throughtheglass/pocketearth/PocketMnnPlugin.java'), 'utf8');
const nativeRuntimeSource = readFileSync(resolve(process.cwd(), 'android/native/pocket_mnn_jni.cpp'), 'utf8');
// Pins captured from the 2026-08-11 OSS release and 2026-08-12 aesthetic release.
// Keep the expected release data independent of the implementation, without private deployment reports.
const releaseAssets = JSON.parse(readFileSync(resolve(process.cwd(), 'src/app/lib/skill/fixtures/nativeAssetReleasePins.json'), 'utf8')) as ReleasePin[];

describe('Android MNN dual-base release contract', () => {
  it('has a self-consistent immutable descriptor', () => {
    const files = Object.values(manifest.bundles).flatMap((bundle) => bundle.files);
    expect(manifest.protocol).toBe('pocket-mnn-model-bundle/v1');
    expect(manifest.releaseId).toBe('pocketearth-qwen3-vl-2b-dual-base-20260811');
    expect(Object.values(manifest.bundles).map((bundle) => bundle.target)).toEqual([
      'qwen3-vl-2b-language', 'qwen3-vl-2b-vision',
    ]);
    expect(files).toHaveLength(14);
    expect(files.reduce((sum, file) => sum + file.bytes, 0)).toBe(manifest.totalBytes);
    expect(files.every((file) => /^[0-9a-f]{64}$/.test(file.sha256) && file.bytes > 0)).toBe(true);
  });

  it('does not publish retired content adapters as current built-in MNN Skills', () => {
    expect(BUILTIN_SKILLS.filter((skill) => skill.runtime.execution === 'mnn')).toHaveLength(0);
  });

  it('keeps the Android Qwen3-4B health installer equal to the canonical ModelScope release', () => {
    expect(pluginSource.match(/HEALTH_BASE_BUNDLE_BYTES = (\d+)L/)?.[1]).toBe(String(QWEN4B_HEALTH_RELEASE.bytes));
    expect(pluginSource.match(/HEALTH_BASE_MANIFEST_SHA = "([0-9a-f]{64})"/)?.[1]).toBe(QWEN4B_HEALTH_RELEASE.sha256);
    expect(pluginSource.match(/HEALTH_BASE_REVISION = "([0-9a-f]{40})"/)?.[1]).toBe(QWEN4B_HEALTH_REVISION);
    const block = pluginSource.match(/HEALTH_BASE_FILES = new BaseFileSpec\[\] \{([\s\S]*?)\n    \};/)?.[1] || '';
    const files = [...block.matchAll(/new BaseFileSpec\("([^"]+)", "[^"]+", (\d+)L, "([0-9a-f]{64})"\)/g)]
      .map((match) => ({ path: match[1], bytes: Number(match[2]), sha256: match[3] }));
    expect(files).toHaveLength(5);
    expect(files.reduce((sum, file) => sum + file.bytes, 0)).toBe(QWEN4B_HEALTH_RELEASE.bytes);
    const canonical = files.map((file) => `${file.path}\t${file.bytes}\t${file.sha256}\n`).join('');
    expect(createHash('sha256').update(canonical).digest('hex')).toBe(QWEN4B_HEALTH_RELEASE.sha256);
  });

  it('keeps Android native asset pins equal to the OSS release and built-in Skills', () => {
    const nativePins = new Map<string, { bytes: number; sha256: string }>();
    for (const match of pluginSource.matchAll(/if \("([^"]+)"\.equals\(id\)\) return new AssetSpec\((\d+)L, "([0-9a-f]{64})"\);/g)) {
      nativePins.set(match[1], { bytes: Number(match[2]), sha256: match[3] });
    }
    expect(nativePins.size).toBe(7);

    expect(releaseAssets).toHaveLength(7);
    const releasePins = new Map(releaseAssets.map((item) => [
      item.id, { bytes: item.bytes, sha256: item.sha256 },
    ]));
    expect(nativePins).toEqual(releasePins);

    const builtinAssets = BUILTIN_SKILLS.flatMap((skill) => skill.assets);
    for (const asset of builtinAssets) {
      if (asset.id === QWEN4B_HEALTH_ASSET) {
        expect({ bytes: asset.bytes, sha256: asset.sha256 }).toEqual({
          bytes: QWEN4B_HEALTH_RELEASE.bytes,
          sha256: QWEN4B_HEALTH_RELEASE.sha256,
        });
        continue;
      }
      expect(nativePins.get(asset.id)).toEqual({ bytes: asset.bytes, sha256: asset.sha256 });
    }
  });

  it('reuses shared base weights without Android hard links or multi-GB copies', () => {
    expect(pluginSource).toContain('Os.symlink(shared.getAbsolutePath(), staged.getAbsolutePath())');
    expect(pluginSource).not.toContain('Os.link(shared.getAbsolutePath(), staged.getAbsolutePath())');
    expect(pluginSource).toContain('Os.stat(alias.getAbsolutePath()).st_ino == Os.stat(shared.getAbsolutePath()).st_ino');
  });

  it('serializes inference and releases the other model family before vision load', () => {
    expect(pluginSource).toContain('Executors.newSingleThreadExecutor()');
    expect(nativeRuntimeSource).toMatch(/freshVisionModel[\s\S]*?g_adapter\.reset\(\);[\s\S]*?g_language_base\.reset\(\);[\s\S]*?return loadModel/);
    expect(nativeRuntimeSource).toContain('auto model = freshVisionModel(adapter_id);');
    expect(nativeRuntimeSource).toContain('pocket-jni-v18-single-family-memory');
  });
});
