import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { POCKET_PLANT_ASSETS } from '../../../vendor/legacy-city/src/app/lib/pocket-plants/catalog';
import { POCKET_PLANTINGS_STORAGE_KEY, readPocketPlantings } from '../../../vendor/legacy-city/src/app/lib/pocket-plants/planting';
import { isVoiceTreeCommand, registerVoiceTreeMap, tryVoiceTreeCommand, VOICE_TREE_ASSET_ID,
  VOICE_TREE_MAX_FIX_AGE_MS, type VoiceTreeContext } from '../../../vendor/legacy-city/src/app/lib/pocket-plants/voicePlanting';

let context: VoiceTreeContext;
let release: () => void;
let input = 0;
const onResult = vi.fn();
const command = (id = `badge:plant-test:recording:${++input}`) => tryVoiceTreeCommand('帮我种下一颗树', id);

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('window', { localStorage: { getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }) } });
  vi.stubGlobal('document', { visibilityState: 'visible' });
  context = { walking: true, mode: 'gps', fix: {
    position: [120.15, 30.25], wgs84Position: [120.145, 30.253], accuracyM: 8, timestamp: Date.now(),
  } };
  onResult.mockClear();
  release = registerVoiceTreeMap({ context: () => context, onResult });
});
afterEach(() => { release(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('explicit local tree command', () => {
  it.each(['帮我种下一颗树', '帮我种下一棵树。', '请帮我种一棵树吧！', '种树', '在这里种下一棵树', '帮 我 种 下 一 颗 树'])('accepts %s', text => {
    expect(isVoiceTreeCommand(text)).toBe(true);
  });
  it.each(['不要帮我种下一颗树', '别种树', '取消种树', '怎么种树', '帮我种下一棵树？', '我说“帮我种下一颗树”',
    '明天帮我种下一颗树', '帮我种下一颗树然后拍照', '帮我种两棵树', '帮我识别下鸟叫', '退出识鸟'])('does not execute %s', text => {
    expect(tryVoiceTreeCommand(text, `negative:${text}`)).toBeNull();
    expect(readPocketPlantings()).toHaveLength(0);
  });
  it('uses an existing tree asset, and writes one private device-local GPS planting without touching seed inventory', () => {
    const result = command();
    expect(POCKET_PLANT_ASSETS.find(asset => asset.id === VOICE_TREE_ASSET_ID)?.name).toBe('枇杷');
    expect(result?.status).toBe('planted');
    expect(readPocketPlantings()).toEqual([expect.objectContaining({
      assetId: VOICE_TREE_ASSET_ID, position: [120.15, 30.25], wgs84Position: [120.145, 30.253], accuracyM: 8,
      storageScope: 'device-local', visibility: 'private', source: 'app', place: '真实 GPS 散步位置',
      collectedAt: new Date(context.fix!.timestamp).toISOString(),
    })]);
    expect(window.localStorage.setItem).toHaveBeenCalledTimes(1);
    expect(window.localStorage.setItem).toHaveBeenCalledWith(POCKET_PLANTINGS_STORAGE_KEY, expect.any(String));
    expect(onResult).toHaveBeenCalledExactlyOnceWith(result);
  });
  it('uses the newest GPS fix and preserves earlier trees', () => {
    command();
    context.fix!.position = [121.5, 31.2];
    context.fix!.wgs84Position = [121.495, 31.202];
    command();
    expect(readPocketPlantings().map(planting => planting.position)).toEqual([[120.15, 30.25], [121.5, 31.2]]);
  });
  it.each(['unmounted', 'stopped', 'preview', 'no-fix', 'hidden'] as const)('blocks %s with no planting', mode => {
    if (mode === 'unmounted') release();
    if (mode === 'stopped') context.walking = false;
    if (mode === 'preview') context.mode = 'preview';
    if (mode === 'no-fix') context.fix = null;
    if (mode === 'hidden') vi.stubGlobal('document', { visibilityState: 'hidden' });
    expect(command()?.status).toBe('blocked');
    expect(readPocketPlantings()).toHaveLength(0);
  });
  it.each(['stale', 'future', 'no-time', 'inaccurate', 'negative-accuracy', 'nan-accuracy', 'bad-map', 'bad-wgs'] as const)('blocks %s GPS', mode => {
    if (mode === 'stale') context.fix!.timestamp -= VOICE_TREE_MAX_FIX_AGE_MS + 1;
    if (mode === 'future') context.fix!.timestamp += 60_000;
    if (mode === 'no-time') context.fix!.timestamp = NaN;
    if (mode === 'inaccurate') context.fix!.accuracyM = 66;
    if (mode === 'negative-accuracy') context.fix!.accuracyM = -1;
    if (mode === 'nan-accuracy') context.fix!.accuracyM = NaN;
    if (mode === 'bad-map') context.fix!.position = [NaN, 30];
    if (mode === 'bad-wgs') context.fix!.wgs84Position = [181, 30];
    expect(command()?.status).toBe('blocked');
    expect(readPocketPlantings()).toHaveLength(0);
  });
  it('does not replant a recording on duplicate delivery or remount', () => {
    const id = `duplicate:${++input}`;
    const result = command(id);
    release();
    release = registerVoiceTreeMap({ context: () => context, onResult });
    expect(command(id)).toBe(result);
    expect(readPocketPlantings()).toHaveLength(1);
    expect(onResult).toHaveBeenCalledTimes(1);
  });
  it('also deduplicates an input already in the persisted ledger', () => {
    const result = command()!;
    const persistedInput = `persisted:${++input}`;
    window.localStorage.setItem(POCKET_PLANTINGS_STORAGE_KEY, JSON.stringify([{ ...result.planting, sourceEventId: persistedInput }]));
    expect(command(persistedInput)?.message).toContain('没有重复种植');
    expect(readPocketPlantings()).toHaveLength(1);
  });
  it('does not queue a blocked command for a future GPS fix; a new recording is required', () => {
    const id = `blocked:${++input}`;
    context.mode = 'preview';
    expect(command(id)?.status).toBe('blocked');
    context.mode = 'gps';
    expect(command(id)?.status).toBe('blocked');
    expect(readPocketPlantings()).toHaveLength(0);
    expect(command()?.status).toBe('planted');
  });
  it('reports a storage failure truthfully without losing existing trees', () => {
    const prior = command()!.planting;
    vi.mocked(window.localStorage.setItem).mockImplementation(() => { throw new Error('quota exceeded'); });
    expect(command()).toMatchObject({ status: 'failed', message: expect.stringContaining('未能保存') });
    expect(readPocketPlantings()).toEqual([prior]);
  });
  it('rejects missing input identity', () => {
    expect(command('')?.status).toBe('blocked');
    expect(readPocketPlantings()).toHaveLength(0);
  });
  it('only opts in the Pocket Earth central map and includes native ASR phrases on both existing paths', () => {
    const source = (path: string) => readFileSync(path, 'utf8');
    expect(source('vendor/legacy-city/src/app/components/MyMapTab.tsx')).toContain('voiceTreePlanting={pocketEarthMode}');
    expect(source('vendor/legacy-city/src/app/components/GardenKnowledgeMap.tsx')).toContain('voiceTreePlanting={voiceTreePlanting}');
    const map = source('vendor/legacy-city/src/app/components/StreetGardenLab.tsx');
    expect(map).toContain('if (!voiceTreePlanting) return;');
    expect(map).toContain('fix: voiceTreeFixRef.current');
    expect(map).toContain('timestamp: filtered.timestamp, accuracyM: filtered.accuracyMeters');
    for (const file of ['FrostBirdSession.swift', 'FrostBadgePlugin.swift']) {
      expect(source(`native/frost-badge/ios/${file}`)).toContain('"帮我种下一颗树", "帮我种下一棵树"');
    }
  });
});
