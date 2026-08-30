import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import GardenEncounter3D from '../../../vendor/legacy-city/src/app/components/GardenEncounter3D';
import { cancelVoiceMapMode, claimVoiceMapMode, failVoiceMapMode, getVoiceMapState, isVoiceMapCommand,
  reportVoiceMapReady, subscribeVoiceMapMode, tryVoiceMapCommand, VOICE_MAP_READY_MESSAGE, VOICE_MAP_TIMEOUT_MS,
} from '../../../vendor/legacy-city/src/app/lib/location/voiceMapMode';
import type { VoiceTreeFix } from '../../../vendor/legacy-city/src/app/lib/pocket-plants/voicePlanting';
import { DEFAULT_OUTING_GUIDE_ID, getCityCompanionGuide } from '../../../vendor/legacy-city/src/app/lib/skills/city-companion';
import { RIGGED_DACHSHUND_MAP_AGENT } from '../../../vendor/legacy-city/src/app/lib/agent3d/profiles';

let serial = 0;
let documentStub: EventTarget & { visibilityState: string };
const id = () => `map-test:recording:${++serial}`;
const fix = (): VoiceTreeFix => ({ position: [120.15, 30.25], wgs84Position: [120.145, 30.253], accuracyM: 8, timestamp: Date.now() });
beforeEach(() => {
  vi.useFakeTimers();
  documentStub = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  vi.stubGlobal('document', documentStub);
});
afterEach(() => {
  const current = getVoiceMapState();
  if (current) cancelVoiceMapMode(current.inputId);
  vi.useRealTimers(); vi.unstubAllGlobals();
});

describe('hardware map-mode entry', () => {
  it.each(['进入地图模式', '打开地图模式。', '请帮我进入地图模式吧', '切换到地图模式', '进入真实GPS散步模式', '进 入 地 图 模 式'])('accepts %s', text => {
    expect(isVoiceMapCommand(text)).toBe(true);
  });
  it.each(['不要进入地图模式', '退出地图模式', '怎么进入地图模式', '进入地图模式？', '他说“进入地图模式”',
    '明天进入地图模式', '进入地图模式并种树', '进入演示地图模式', '帮我种下一颗树', '帮我识别下鸟叫'])('does not execute %s', text => {
    const previous = getVoiceMapState();
    expect(tryVoiceMapCommand(text, id())).toBeNull();
    expect(getVoiceMapState()).toBe(previous);
  });
  it('navigates now, survives lazy loading, and only resolves after a fresh converted GPS fix', async () => {
    const inputId = id();
    const done = vi.fn();
    const result = tryVoiceMapCommand('进入地图模式', inputId)!;
    void result.then(done);
    const openMap = vi.fn();
    const unsubscribe = subscribeVoiceMapMode(request => { if (request?.status === 'opening') openMap(request.inputId); });
    expect(openMap).toHaveBeenCalledExactlyOnceWith(inputId);
    expect(getVoiceMapState()?.status).toBe('opening');
    expect(reportVoiceMapReady(inputId, fix())).toBe(false);
    expect(claimVoiceMapMode(inputId)).toBe(true);
    expect(claimVoiceMapMode(inputId)).toBe(false);
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    expect(getVoiceMapState()?.status).toBe('locating');
    expect(reportVoiceMapReady(inputId, fix())).toBe(true);
    await expect(result).resolves.toEqual({ inputId, status: 'ready', message: VOICE_MAP_READY_MESSAGE });
    expect(openMap).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    unsubscribe();
  });
  it.each(['missing', 'stale', 'future', 'inaccurate', 'invalid-map', 'invalid-wgs'] as const)('cannot announce readiness from a %s fix', async mode => {
    const inputId = id();
    const result = tryVoiceMapCommand('进入地图模式', inputId)!;
    claimVoiceMapMode(inputId);
    const sample = fix();
    if (mode === 'stale') sample.timestamp -= 15_001;
    if (mode === 'future') sample.timestamp += 1000;
    if (mode === 'inaccurate') sample.accuracyM = 66;
    if (mode === 'invalid-map') sample.position = [NaN, 30];
    if (mode === 'invalid-wgs') sample.wgs84Position = [120, 91];
    expect(reportVoiceMapReady(inputId, mode === 'missing' ? null : sample)).toBe(false);
    expect(getVoiceMapState()?.status).toBe('locating');
    cancelVoiceMapMode(inputId);
    await expect(result).resolves.toMatchObject({ status: 'cancelled' });
  });
  it('deduplicates an input before and after readiness without reopening the map', async () => {
    const inputId = id();
    const result = tryVoiceMapCommand('进入地图模式', inputId)!;
    expect(tryVoiceMapCommand('进入地图模式', inputId)).toBe(result);
    claimVoiceMapMode(inputId); reportVoiceMapReady(inputId, fix()); await result;
    const listener = vi.fn();
    const unsubscribe = subscribeVoiceMapMode(listener);
    expect(tryVoiceMapCommand('进入地图模式', inputId)).toBe(result);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].status).toBe('ready');
    unsubscribe();
  });
  it.each(['before-mount', 'during-gps'] as const)('cancels %s on a replaced recording or connection/foreground loss', async phase => {
    const inputId = id(), controller = new AbortController();
    const result = tryVoiceMapCommand('进入地图模式', inputId, controller.signal)!;
    if (phase === 'during-gps') claimVoiceMapMode(inputId);
    controller.abort();
    await expect(result).resolves.toMatchObject({ status: 'cancelled' });
    expect(claimVoiceMapMode(inputId)).toBe(false);
    expect(reportVoiceMapReady(inputId, fix())).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('cancels immediately when the document becomes hidden, without replay on return', async () => {
    const inputId = id();
    const result = tryVoiceMapCommand('进入地图模式', inputId)!;
    claimVoiceMapMode(inputId);
    documentStub.visibilityState = 'hidden'; documentStub.dispatchEvent(new Event('visibilitychange'));
    await expect(result).resolves.toMatchObject({ status: 'cancelled' });
    documentStub.visibilityState = 'visible'; documentStub.dispatchEvent(new Event('visibilitychange'));
    expect(claimVoiceMapMode(inputId)).toBe(false);
    expect(reportVoiceMapReady(inputId, fix())).toBe(false);
  });
  it.each(['opening', 'locating'] as const)('bounds %s waiting and rejects late GPS callbacks', async phase => {
    const inputId = id();
    const result = tryVoiceMapCommand('进入地图模式', inputId)!;
    if (phase === 'locating') claimVoiceMapMode(inputId);
    vi.advanceTimersByTime(VOICE_MAP_TIMEOUT_MS);
    await expect(result).resolves.toMatchObject({ status: 'failed', message: expect.stringContaining('尚未就绪') });
    expect(reportVoiceMapReady(inputId, fix())).toBe(false);
    expect(claimVoiceMapMode(inputId)).toBe(false);
  });
  it('reports permission/map failure truthfully, without reporting ready', async () => {
    const inputId = id();
    const result = tryVoiceMapCommand('进入地图模式', inputId)!;
    claimVoiceMapMode(inputId);
    expect(failVoiceMapMode(inputId, '定位权限未开启')).toBe(true);
    await expect(result).resolves.toMatchObject({ status: 'failed', message: '定位权限未开启' });
    expect(reportVoiceMapReady(inputId, fix())).toBe(false);
  });
  it('supersedes the old request and ignores its late success/failure', async () => {
    const oldId = id(), newId = id();
    const old = tryVoiceMapCommand('进入地图模式', oldId)!;
    claimVoiceMapMode(oldId);
    const current = tryVoiceMapCommand('进入地图模式', newId)!;
    await expect(old).resolves.toMatchObject({ status: 'cancelled' });
    expect(reportVoiceMapReady(oldId, fix())).toBe(false);
    expect(failVoiceMapMode(oldId, '旧定位失败')).toBe(false);
    claimVoiceMapMode(newId); reportVoiceMapReady(newId, fix());
    await expect(current).resolves.toMatchObject({ inputId: newId, status: 'ready' });
  });
  it.each(['hidden', 'aborted', 'no-id'] as const)('does not navigate for %s input', async mode => {
    const previous = getVoiceMapState(), controller = new AbortController();
    if (mode === 'hidden') documentStub.visibilityState = 'hidden';
    if (mode === 'aborted') controller.abort();
    await expect(tryVoiceMapCommand('进入地图模式', mode === 'no-id' ? '' : id(), controller.signal)).resolves.toMatchObject({ status: 'cancelled' });
    expect(getVoiceMapState()).toBe(previous);
  });
  it('wires the central street view, defaults to the real male/dog assets, and passes GPS + leash explicitly', () => {
    const source = (path: string) => readFileSync(path, 'utf8');
    const app = source('src/app/App.tsx');
    expect(app).toContain("request?.status === 'opening'");
    expect(app).toContain("setActiveTab('earth')");
    const tab = source('vendor/legacy-city/src/app/components/MyMapTab.tsx');
    expect(tab).toContain("setStreetView('街头')");
    const map = source('vendor/legacy-city/src/app/components/StreetGardenLab.tsx');
    expect(map).toContain('startLiveOuting(getCityCompanionGuide(DEFAULT_OUTING_GUIDE_ID).profile, [DEFAULT_OUTING_PET], "leash", [], "gps", inputId)');
    expect(map).toContain('setOutingPetIds([DEFAULT_OUTING_PET_ID])');
    expect(map).toContain('setOutingPocketBuddyIds([])');
    expect(map).toContain('reportVoiceMapReady(voiceMapRequestIdRef.current, voiceTreeFixRef.current)');
    expect(map).toContain('if (voiceRequestId) {'); // GPS failure stops, never enters the demo fallback.
    expect(map).toContain('const message = `真实 GPS 未就绪：');
    const male = getCityCompanionGuide(DEFAULT_OUTING_GUIDE_ID);
    expect(male.label).toBe('男主');
    expect(RIGGED_DACHSHUND_MAP_AGENT.species).toBe('dachshund');
    for (const profile of [male.profile, RIGGED_DACHSHUND_MAP_AGENT]) {
      expect(profile.visual?.representation).toBe('rigged-3d');
      expect(existsSync(`public${profile.visual!.mapGlbUrl!.split('?')[0]}`)).toBe(true);
    }
    for (const file of ['FrostBirdSession.swift', 'FrostBadgePlugin.swift']) {
      expect(source(`native/frost-badge/ios/${file}`)).toContain('"进入地图模式", "打开地图模式"');
    }
  });
  it('renders one male lead, one dog and the GPS/leash controls through the existing scene component', () => {
    const male = getCityCompanionGuide(DEFAULT_OUTING_GUIDE_ID).profile;
    const html = renderToStaticMarkup(React.createElement(GardenEncounter3D, {
      mode: 'gps', locationMode: 'gps', companionMode: 'leash', plantName: '', anchor: [200, 300],
      heading: 0, moving: false, accuracyMeters: 8, guide: male, follower: RIGGED_DACHSHUND_MAP_AGENT,
      followers: [RIGGED_DACHSHUND_MAP_AGENT], actionMessage: VOICE_MAP_READY_MESSAGE, onClose: () => {},
    }));
    expect(html).toContain(`data-guide-id="${male.id}"`);
    expect(html).toContain(`data-follower-id="${RIGGED_DACHSHUND_MAP_AGENT.id}"`);
    expect(html).toContain('data-follower-count="1"');
    expect(html).toContain('data-location-mode="gps"');
    expect(html).toContain('data-companion-mode="leash"');
    expect(html).toContain('牵绳同行');
    expect(html).toContain(VOICE_MAP_READY_MESSAGE);
    expect(html).not.toContain('杭州场景巡游中');
  });
});
