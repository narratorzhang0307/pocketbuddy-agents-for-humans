import { afterEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  getEdgeRuntimeStatus: vi.fn(),
  runEdgeChatEvidence: vi.fn(),
  runEdgeVisionEvidence: vi.fn(),
}));

vi.mock('../../../../frost-agent/edge/httpEdge', () => native);

const values = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
});

import { BUILTIN_SKILLS } from './builtins';
import { checkSkillOnDevice, getSkillDeviceCheck, skillNeedsMnn } from './deviceCheck';
import type { SkillManifest } from './types';

afterEach(() => { values.clear(); vi.clearAllMocks(); });

function manifest(id: string) {
  const result = BUILTIN_SKILLS.find((item) => item.identity.id === id);
  if (!result) throw new Error(`missing fixture ${id}`);
  return result;
}

function nativeMnnFixture(): SkillManifest {
  const fixture = structuredClone(manifest('pocket.her-motion'));
  fixture.identity.id = 'test.native-mnn';
  fixture.identity.name = 'Native MNN fixture';
  fixture.runtime.execution = 'mnn';
  fixture.permissions.tools = [];
  fixture.assets = [];
  delete fixture.entry.adapter;
  return fixture;
}

describe('Plaza 真机自检', () => {
  it('does not make optional health-model assets a prerequisite for a declarative Skill', () => {
    expect(manifest('frost.running-coach').runtime.execution).toBe('declarative');
    expect(skillNeedsMnn(manifest('frost.running-coach'))).toBe(false);
    expect(skillNeedsMnn(manifest('pocket.her-motion'))).toBe(false);
  });

  it('passes a deterministic local workflow without pretending to run Qwen', async () => {
    await expect(checkSkillOnDevice(manifest('frost.run-route'))).resolves.toMatchObject({
      state: 'passed', detail: expect.stringContaining('无需模型'),
    });
    expect(native.getEdgeRuntimeStatus).not.toHaveBeenCalled();
  });

  it('requires the Android native bridge and a real Qwen/MNN decode', async () => {
    native.getEdgeRuntimeStatus.mockResolvedValue({
      backend: 'mnn',
      runtime: { nativeBridge: true, mnnEnabled: true, textReady: true, visionReady: true, device: { appVersionName: '1.0.47' }, version: 'MNN test' },
    });
    native.runEdgeChatEvidence.mockResolvedValue({ backend: 'mnn', text: 'POCKET_MNN_READY' });
    const fixture = nativeMnnFixture();
    const result = await checkSkillOnDevice(fixture);
    expect(result).toMatchObject({ state: 'passed', appVersion: '1.0.47' });
    expect(native.runEdgeChatEvidence).toHaveBeenCalledOnce();
    expect(getSkillDeviceCheck(fixture)).toEqual(result);
  });

  it('fails closed when a native MNN Skill cannot reach the bridge', async () => {
    native.getEdgeRuntimeStatus.mockResolvedValue({ backend: 'stub', error: 'not_native' });
    await expect(checkSkillOnDevice(nativeMnnFixture())).resolves.toMatchObject({
      state: 'failed', detail: expect.stringContaining('未连接 Android MNN 原生桥'),
    });
    expect(native.runEdgeChatEvidence).not.toHaveBeenCalled();
  });
});
