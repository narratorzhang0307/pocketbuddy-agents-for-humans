import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { loadAgent3DRuntime } from '../../../../vendor/legacy-city/src/app/lib/agent3d/loadAgentRuntime';
import { BUILTIN_CITY_AGENTS, RIGGED_WAYFARER_GUIDE } from '../../../../vendor/legacy-city/src/app/lib/agent3d/profiles';
import { USER_AVATAR_GUIDES } from '../../../../vendor/legacy-city/src/app/lib/skills/city-companion/catalog';

const { loadAsync } = vi.hoisted(() => ({ loadAsync: vi.fn() }));
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    setMeshoptDecoder() {}
    loadAsync = loadAsync;
  },
}));

describe('real character assets only', () => {
  const profiles = [...BUILTIN_CITY_AGENTS, ...USER_AVATAR_GUIDES.map((guide) => guide.profile)];

  it.each(profiles.map((profile) => [profile.id, profile] as const))(
    '%s: viewer and map failures reject without manufacturing a character',
    async (_id, profile) => {
      const failure = new Error('model download failed');
      loadAsync.mockRejectedValue(failure);
      for (const purpose of ['viewer', 'map'] as const) {
        await expect(loadAgent3DRuntime(profile, purpose)).rejects.toBe(failure);
      }
    },
  );

  it('leaves missing, legacy and unknown profiles empty', async () => {
    for (const species of ['human', 'dachshund', 'orb', 'unknown']) {
      const profile = { ...RIGGED_WAYFARER_GUIDE, species, visual: undefined } as typeof RIGGED_WAYFARER_GUIDE;
      await expect(loadAgent3DRuntime(profile, 'viewer')).rejects.toThrow('预览留空');
      await expect(loadAgent3DRuntime(profile, 'map')).rejects.toThrow('预览留空');
    }
  });

  it('keeps the actual GLB scene on successful loading, including old metadata', async () => {
    const scene = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial());
    mesh.name = 'actual-model-fixture';
    scene.add(mesh);
    loadAsync.mockResolvedValue({ scene, animations: [] });
    const model = await loadAgent3DRuntime({
      ...RIGGED_WAYFARER_GUIDE,
      visual: { ...RIGGED_WAYFARER_GUIDE.visual!, representation: 'procedural-3d' },
    }, 'viewer');
    expect(model.representation).toBe('static-3d');
    expect(model.root.getObjectByName(mesh.name)).toBe(mesh);
    model.dispose();
  });

  it('rejects an empty GLB instead of replacing it', async () => {
    loadAsync.mockResolvedValue({ scene: new THREE.Group(), animations: [] });
    await expect(loadAgent3DRuntime(RIGGED_WAYFARER_GUIDE, 'viewer')).rejects.toThrow('三维边界');
  });

  it('has physically removed the substitute model factory', () => {
    expect(existsSync(new URL('../../../../vendor/legacy-city/src/app/lib/agent3d/createAgentModel.ts', import.meta.url))).toBe(false);
    const source = readFileSync(new URL('../../../../vendor/legacy-city/src/app/lib/agent3d/loadAgentRuntime.ts', import.meta.url), 'utf8');
    expect(source).not.toContain('createAgent3DModel');
    expect(source).not.toContain('已回退到程序化形象');
  });
});
