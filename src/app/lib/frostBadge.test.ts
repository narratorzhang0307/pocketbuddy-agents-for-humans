import { beforeEach, describe, expect, it, vi } from 'vitest';
import { badgeActuation, badgeBase64, badgeBytes, parseBadgeFrame } from './frostBadgeProtocol';
import { BADGE_AVATAR_ENDPOINT, skillAvatarFor } from './skill/avatars';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import cloudCatalog from './skill/avatarCloudCatalog.json';

const JPEG_ENDPOINT = 'avatar_jpeg_v1';
const cloudBytes = (index: number) => readFileSync(resolve('public/assets/skill-avatars/20260827/hardware-round', `${cloudCatalog.find(item => item.index === index)!.id}.jpg`));

const fixture = vi.hoisted(() => ({
  callbacks: new Map<string, (event: Record<string, unknown>) => void>(),
  native: { scan: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), write: vi.fn(), playPcm: vi.fn(), stopAudio: vi.fn(), cancelSynthesis: vi.fn(), synthesizeSpeech: vi.fn(), transcribePcm: vi.fn(), cancelTranscription: vi.fn(), addListener: vi.fn(), configureBirdListening: vi.fn(), startBirdSession: vi.fn(), stopBirdSession: vi.fn(), birdStatus: vi.fn() },
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, isPluginAvailable: () => true, getPlatform: () => 'ios' },
  registerPlugin: () => fixture.native,
}));
function packet(id: number, payload: number[], kind = 3, sequence = 0) {
  const bytes = Uint8Array.from([1, kind, id, sequence, payload.length & 255, payload.length >> 8, ...payload]);
  fixture.callbacks.get('packet')?.({ data: badgeBase64(bytes), channel: 'test' });
}
beforeEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules(); vi.resetAllMocks(); fixture.callbacks.clear();
  fixture.native.addListener.mockImplementation(async (name, fn) => { fixture.callbacks.set(name, fn); return { remove: vi.fn() }; });
  fixture.native.scan.mockResolvedValue({ devices: [{ id: 'badge-test', name: 'Frost-OJBadge', rssi: -42 }] });
  fixture.native.connect.mockResolvedValue({ id: 'badge-test', mtu: 247, maxWriteBytes: 244 });
  fixture.native.disconnect.mockResolvedValue(undefined); fixture.native.playPcm.mockResolvedValue(undefined);
  fixture.native.stopAudio.mockResolvedValue(undefined);
  fixture.native.cancelSynthesis.mockResolvedValue(undefined);
  fixture.native.synthesizeSpeech.mockResolvedValue({ data: 'AAAQAA==', sampleRate: 16000, onDevice: true });
  fixture.native.cancelTranscription.mockResolvedValue(undefined);
  fixture.native.transcribePcm.mockResolvedValue({ text: '帮我规划跑步路线', locale: 'zh-CN', onDevice: true });
  fixture.native.birdStatus.mockResolvedValue({ enabled: false, active: false, busy: false, state: 'idle', message: '' });
  fixture.native.configureBirdListening.mockImplementation(async ({ enabled }) => ({ enabled, active: false, busy: false, state: 'idle', message: '' }));
  fixture.native.startBirdSession.mockResolvedValue({ enabled: true, active: true, busy: false, state: 'ready', message: '请长按触屏' });
  fixture.native.stopBirdSession.mockResolvedValue(undefined);
  fixture.native.write.mockImplementation(async ({ data }) => {
    const f = parseBadgeFrame(badgeBytes(data));
    packet(f.command, [f.command, 0, 0, 0], 2, f.sequence);
  });
});
async function connect() {
  const { frostBadge } = await import('./frostBadge');
  await frostBadge.scan(); await frostBadge.connect('badge-test'); return frostBadge;
}
function recording() {
  packet(0x64, [1, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  packet(0x64, [1, 3, 0, 1, 2, 0, 0, 0, 24, 0, 0, 0]);
  packet(0x40, [1, 0, 0, 0, 0, 0, 0, 0, 0, 12, 0, 24, 0]);
}
function manifest(endpoints: string[]) {
  const json = new TextEncoder().encode(JSON.stringify({ caps: 1, io: endpoints.map(id => ({ id })) }));
  packet(0x18, [0, 1, ...json]);
}
const motionWrites = () => fixture.native.write.mock.calls.map(([{ data }]) => parseBadgeFrame(badgeBytes(data)))
  .filter(frame => frame.command === 0x33 && new TextDecoder().decode(frame.payload.slice(1, 7)) === 'motion');
const volumeWrites = () => fixture.native.write.mock.calls.map(([{ data }]) => parseBadgeFrame(badgeBytes(data)))
  .filter(frame => frame.command === 0x33 && frame.payload.length === 11
    && new TextDecoder().decode(frame.payload.slice(1, 9)) === 'speaker0' && frame.payload[9] === 2)
  .map(frame => frame.payload[10]);

function cloudDownloads() {
  const fetcher = vi.fn(async (url: string) => {
    const item = cloudCatalog.find(item => item.jpegUrl === url)!;
    return new Response(cloudBytes(item.index), { headers: { 'content-length': String(item.bytes) } });
  });
  vi.stubGlobal('fetch', fetcher); return fetcher;
}
function cloudReceipt(args: Uint8Array, token = args[2] | args[3] << 8) {
  const index = args[1], op = args[0], item = cloudCatalog.find(item => item.index === index)!;
  const value = op === 0 ? 0 : op === 1 ? new DataView(args.buffer, args.byteOffset, args.byteLength).getUint32(4, true) + args.length - 8 : item.crc32;
  packet(0x64, [1, 5, index, op + 1, token & 255, token >> 8, value & 255, value >>> 8 & 255, value >>> 16 & 255, value >>> 24]);
}
function cloudReceiver(hold: (args: Uint8Array) => boolean = () => false) {
  const received: Uint8Array[] = [];
  fixture.native.write.mockImplementation(async ({ data }) => {
    const frame = parseBadgeFrame(badgeBytes(data));
    packet(frame.command, [frame.command, 0, 0, 0], 2, frame.sequence);
    if (frame.command !== 0x33 || new TextDecoder().decode(frame.payload.slice(1, 1 + frame.payload[0])) !== JPEG_ENDPOINT) return;
    const args = frame.payload.slice(1 + frame.payload[0]); received.push(args);
    if (!hold(args)) cloudReceipt(args);
  });
  return received;
}

describe('Frost badge integration boundary', () => {
  it.each(['帮我识别下鸟叫', '帮我打开下识别鸟类声音的agent'])('hands %s to native and prevents ordinary avatar/pose traffic during the session', async text => {
    const client = await connect(); manifest(['bird_mode_v1', BADGE_AVATAR_ENDPOINT, JPEG_ENDPOINT]);
    expect(await client.tryBirdCommand(text)).toBe(true);
    expect(fixture.native.configureBirdListening).toHaveBeenCalledExactlyOnceWith({ enabled: true });
    expect(fixture.native.startBirdSession).toHaveBeenCalledTimes(1);
    fixture.native.write.mockClear();
    await client.projectAvatar('frost.wger'); await client.projectPose('celebrate');
    expect(fixture.native.write).not.toHaveBeenCalled();
    expect(await client.tryBirdCommand('退出识鸟')).toBe(true);
    expect(fixture.native.stopBirdSession).toHaveBeenCalledTimes(1);
  });
  it('requires upgraded firmware and a released microphone before native activation', async () => {
    const client = await connect();
    await expect(client.startBirdSession()).rejects.toThrow('0.2.15');
    expect(fixture.native.configureBirdListening).not.toHaveBeenCalled();
    manifest(['bird_mode_v1']);
    packet(0x64, [1, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    await expect(client.startBirdSession()).rejects.toThrow('先松手');
    expect(fixture.native.startBirdSession).not.toHaveBeenCalled();
  });
  it.each([
    { active: true, busy: false, state: 'ready' },
    { active: false, busy: true, state: 'recognizing' },
  ])('defers a health summary while Bird is $state and permits it after Bird releases the screen', async bird => {
    const client = await connect(); manifest(['screen0']);
    fixture.native.write.mockClear();
    fixture.callbacks.get('birdStatus')!({ enabled: true, ...bird, message: '' });
    await expect(client.projectHealthSummary('Meals 1', () => true)).rejects.toThrow('低优先级摘要同步');
    expect(fixture.native.write).not.toHaveBeenCalled();
    fixture.callbacks.get('birdStatus')!({ enabled: true, active: false, busy: false, state: 'idle', message: '' });
    await client.projectHealthSummary('Meals 1', () => true);
    expect(fixture.native.write).toHaveBeenCalledTimes(1);
  });
  it('rechecks Bird ownership before sending a queued health summary', async () => {
    const client = await connect(); manifest(['screen0']);
    fixture.native.write.mockClear();
    const pending = client.projectHealthSummary('Meals 1', () => true);
    fixture.callbacks.get('birdStatus')!({ enabled: true, active: true, busy: false, state: 'ready', message: '' });
    await expect(pending).rejects.toThrow('低优先级摘要同步');
    expect(fixture.native.write).not.toHaveBeenCalled();
  });
  it.each(['status', 'start-result', 'configure-result'])('retransfers the old Skill JPEG after native Bird takes the screen via %s', async source => {
    const client = await connect(), fetcher = cloudDownloads(), received = cloudReceiver();
    manifest(['bird_mode_v1', BADGE_AVATAR_ENDPOINT, JPEG_ENDPOINT]);
    await client.projectAvatar(cloudCatalog[0].id);
    const transferred = received.length;
    fixture.native.write.mockClear();
    if (source === 'status') fixture.callbacks.get('birdStatus')!({ enabled: true, active: true, busy: false, state: 'ready', message: '' });
    else if (source === 'start-result') await client.startBirdSession();
    else {
      fixture.native.configureBirdListening.mockResolvedValue({ enabled: true, active: false, busy: true, state: 'loading', message: '' });
      await client.configureBirdListening(true);
    }
    await client.projectAvatar(cloudCatalog[0].id);
    expect(fixture.native.write).not.toHaveBeenCalled();
    expect(received).toHaveLength(transferred);
    fixture.callbacks.get('birdStatus')!({ enabled: true, active: false, busy: false, state: 'idle', message: '' });
    await client.projectAvatar(cloudCatalog[0].id);
    expect(received).toHaveLength(transferred * 2);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(['queued', 'in-flight'])('keeps a %s avatar transfer paused until Bird releases the screen', async phase => {
    const client = await connect(), fetcher = cloudDownloads();
    let held = false;
    const received = cloudReceiver(args => {
      if (phase === 'in-flight' && !held && args[0] === 1) { held = true; return true; }
      return false;
    });
    manifest([BADGE_AVATAR_ENDPOINT, JPEG_ENDPOINT]);
    const transfer = client.projectAvatar(cloudCatalog[0].id);
    if (phase === 'in-flight') await vi.waitFor(() => expect(held).toBe(true));
    fixture.callbacks.get('birdStatus')!({ enabled: true, active: true, busy: false, state: 'ready', message: '' });
    const count = fixture.native.write.mock.calls.length;
    await transfer;
    await client.projectAvatar(cloudCatalog[0].id);
    expect(fixture.native.write).toHaveBeenCalledTimes(count);
    fixture.callbacks.get('birdStatus')!({ enabled: true, active: false, busy: false, state: 'idle', message: '' });
    await client.projectAvatar(cloudCatalog[0].id);
    expect(client.snapshot().avatar).toEqual({ index: 1, status: 'ready' });
    expect(received.filter(p => p[0] === 0)).toHaveLength(phase === 'in-flight' ? 2 : 1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('reuses a native foreground transcript and clears it when a new bird recording begins', async () => {
    const client = await connect();
    fixture.callbacks.get('birdStatus')!({ enabled: true, active: true, busy: true, state: 'recording', message: '正在录制' });
    expect(client.snapshot().recording).toBe(true);
    expect(client.snapshot().pcm).toBeUndefined();
    fixture.callbacks.get('nativeVoice')!({ id: 'foreground-command', data: badgeBase64(Uint8Array.of(12, 0, 24, 0)), text: '查天气', peak: 24 });
    expect(await client.transcribeRecording()).toMatchObject({ text: '查天气' });
    expect(fixture.native.transcribePcm).not.toHaveBeenCalled();
    fixture.callbacks.get('birdStatus')!({ enabled: true, active: true, busy: true, state: 'recording', message: '正在录制' });
    expect(client.snapshot().pcm).toBeUndefined();
    expect(client.snapshot().nativeTranscript).toBeUndefined();
  });
  it('keeps the dog local and transfers a verified OSS portrait only once, with a volatile device cache', async () => {
    const client = await connect(), fetcher = cloudDownloads(), received = cloudReceiver();
    manifest([BADGE_AVATAR_ENDPOINT, JPEG_ENDPOINT]);
    await client.projectAvatar('frost');
    expect(fetcher).not.toHaveBeenCalled();
    await client.projectAvatar(cloudCatalog[0].id);
    expect(client.snapshot().avatar).toEqual({ index: 1, status: 'ready' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(received[0][0]).toBe(0); expect(received.at(-1)![0]).toBe(2);
    const reconstructed = Buffer.concat(received.filter(p => p[0] === 1).map(p => Buffer.from(p.slice(8))));
    expect(reconstructed).toEqual(cloudBytes(1));
    expect(fixture.native.write.mock.calls.every(([{ data }]) => badgeBytes(data).length <= 244)).toBe(true);
    const count = received.length;
    await client.projectAvatar(cloudCatalog[0].id);
    await client.projectAvatar('frost');
    await client.projectAvatar(cloudCatalog[0].id);
    expect(received).toHaveLength(count); expect(fetcher).toHaveBeenCalledTimes(1);
    await client.disconnect(); await client.connect('badge-test'); manifest([BADGE_AVATAR_ENDPOINT, JPEG_ENDPOINT]);
    await client.projectAvatar(cloudCatalog[0].id);
    expect(received.length).toBe(count * 2); // Reconnection cannot assume hardware RAM survived.
    expect(fetcher).toHaveBeenCalledTimes(1); // Verified phone cache is reusable.
  });
  it.each(['offline', 'corrupt'])('retains Frost and sends no JPEG when OSS is %s', async failure => {
    const client = await connect(), received = cloudReceiver(); manifest([BADGE_AVATAR_ENDPOINT, JPEG_ENDPOINT]);
    const damaged = new Uint8Array(cloudBytes(1)); damaged[0] ^= 1;
    vi.stubGlobal('fetch', vi.fn(async () => failure === 'offline' ? new Response('', { status: 503 }) : new Response(damaged)));
    await expect(client.projectAvatar(cloudCatalog[0].id)).rejects.toThrow(failure === 'offline' ? '下载失败' : '完整性');
    expect(received).toHaveLength(0);
    expect(client.snapshot().avatar).toMatchObject({ index: 0, status: 'fallback' });
  });
  it('requires a matching decoded-image receipt, not merely the command ACK', async () => {
    const client = await connect(); cloudDownloads();
    const received = cloudReceiver(args => args[0] === 2); manifest([BADGE_AVATAR_ENDPOINT, JPEG_ENDPOINT]);
    const transfer = client.projectAvatar(cloudCatalog[0].id);
    await vi.waitFor(() => expect(received.at(-1)?.[0]).toBe(2));
    expect(client.snapshot().avatar?.status).toBe('loading');
    const commit = received.at(-1)!;
    cloudReceipt(commit, 999); await Promise.resolve();
    expect(client.snapshot().avatar?.status).toBe('loading');
    cloudReceipt(commit); await transfer;
    expect(client.snapshot().avatar?.status).toBe('ready');
  });
  it('cancels a superseded OSS fetch and never commits the old skill', async () => {
    const client = await connect(), received = cloudReceiver(); manifest([BADGE_AVATAR_ENDPOINT, JPEG_ENDPOINT]);
    const fetcher = vi.fn((url: string, options: RequestInit) => {
      if (url === cloudCatalog[0].jpegUrl) return new Promise<Response>((_, reject) => options.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
      return Promise.resolve(new Response(cloudBytes(2)));
    });
    vi.stubGlobal('fetch', fetcher);
    const first = client.projectAvatar(cloudCatalog[0].id);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await client.projectAvatar(cloudCatalog[1].id); await first;
    expect(received.every(p => p[1] === 2)).toBe(true);
    expect(client.snapshot().avatar).toEqual({ index: 2, status: 'ready' });
  });
  it('pauses an in-flight portrait for recording and resumes only after the final PCM tail', async () => {
    const client = await connect(); cloudDownloads(); let held = false;
    const received = cloudReceiver(args => { if (!held && args[0] === 1) { held = true; return true; } return false; });
    manifest([BADGE_AVATAR_ENDPOINT, JPEG_ENDPOINT]);
    const transfer = client.projectAvatar(cloudCatalog[0].id);
    await vi.waitFor(() => expect(held).toBe(true));
    packet(0x64, [1, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]); await transfer;
    const count = received.length;
    packet(0x64, [1, 3, 0, 1, 2, 0, 0, 0, 24, 0, 0, 0]);
    await Promise.resolve(); expect(received).toHaveLength(count);
    packet(0x40, [1, 0, 0, 0, 0, 0, 0, 0, 0, 12, 0, 24, 0]);
    await vi.waitFor(() => expect(client.snapshot().avatar).toEqual({ index: 1, status: 'ready' }));
    expect(received.filter(p => p[0] === 0)).toHaveLength(2);
  });
  it.each([25, 40, 60])('uses codec maximum 100 for coach output from baseline %i, preserving PCM and restoring the baseline', async base => {
    const client = await connect(), pcm = Uint8Array.of(255, 127, 0, 128, 16, 0);
    await client.setVolume(base); fixture.native.write.mockClear();
    fixture.native.playPcm.mockImplementation(async () => { expect(volumeWrites()).toEqual([100]); });
    await client.playPcm(pcm, { gain: 'max' });
    expect(fixture.native.playPcm).toHaveBeenCalledExactlyOnceWith({ data: badgeBase64(pcm) });
    await client.stopPlayback();
    expect(volumeWrites()).toEqual([100, base]);
  });
  it('allows the firmware stop reset to settle before applying codec maximum', async () => {
    vi.useFakeTimers();
    try {
      const client = await connect(); await client.stopPlayback(); fixture.native.write.mockClear();
      const playing = client.playPcm(Uint8Array.of(12, 0), { gain: 'max' });
      await vi.advanceTimersByTimeAsync(99);
      expect(volumeWrites()).toEqual([]); expect(fixture.native.playPcm).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1); await playing;
      expect(volumeWrites()).toEqual([100]);
    } finally { vi.useRealTimers(); }
  });
  it.each(['stop', 'record', 'disconnect'])('does not send maximum volume or old PCM if %s happens while reset is settling', async action => {
    vi.useFakeTimers();
    try {
      const client = await connect(); fixture.native.write.mockClear();
      const playing = client.playPcm(Uint8Array.of(12, 0), { gain: 'max' });
      const rejected = expect(playing).rejects.toThrow();
      if (action === 'stop') await client.stopPlayback();
      if (action === 'record') packet(0x64, [1, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      if (action === 'disconnect') await client.disconnect();
      await vi.advanceTimersByTimeAsync(100); await rejected;
      expect(volumeWrites()).not.toContain(100); expect(fixture.native.playPcm).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it('preserves explicit mute even when a coach requests the maximum', async () => {
    const client = await connect(); await client.setVolume(0);
    await client.playPcm(Uint8Array.of(12, 0), { gain: 'max' });
    await client.stopPlayback(); expect(volumeWrites()).toEqual([0, 0]);
  });
  it.each(['pcm', 'speech', 'tone'])('restores ordinary volume before %s output after maximum coach playback', async output => {
    const client = await connect(); await client.playPcm(Uint8Array.of(12, 0), { gain: 'max' });
    if (output === 'pcm') await client.playPcm(Uint8Array.of(24, 0));
    if (output === 'speech') await client.speakText('普通 Frost 回复');
    if (output === 'tone') await client.testSpeaker();
    expect(volumeWrites()).toEqual([100, 25]);
  });
  it('restores ordinary volume after a failed maximum-level transfer without replay', async () => {
    const client = await connect(); fixture.native.playPcm.mockRejectedValueOnce(new Error('transport failed'));
    await expect(client.playPcm(Uint8Array.of(12, 0), { gain: 'max' })).rejects.toThrow('transport failed');
    expect(volumeWrites()).toEqual([100, 25]); expect(fixture.native.playPcm).toHaveBeenCalledTimes(1);
  });
  it('raises coach hardware output from 25 to 50 (at least 4x amplitude), preserving PCM bits', async () => {
    const client = await connect(), pcm = Uint8Array.of(255, 127, 0, 128, 16, 0);
    fixture.native.playPcm.mockImplementation(async () => { expect(volumeWrites()).toEqual([50]); });
    await client.playPcm(pcm, { gain: 4 });
    expect(volumeWrites()).toEqual([50]);
    expect(10 ** ((50 - 25) * 0.5 / 20)).toBeGreaterThanOrEqual(4);
    expect(fixture.native.playPcm).toHaveBeenCalledExactlyOnceWith({ data: badgeBase64(pcm) });
    await client.stopPlayback();
    expect(volumeWrites()).toEqual([50, 25]);
  });
  it.each(['pcm', 'speech', 'tone'])('restores the normal level before %s output after a coach clip', async output => {
    const client = await connect();
    await client.playPcm(Uint8Array.of(12, 0), { gain: 4 });
    if (output === 'pcm') await client.playPcm(Uint8Array.of(24, 0));
    if (output === 'speech') await client.speakText('普通 Frost 回复');
    if (output === 'tone') await client.testSpeaker();
    expect(volumeWrites()).toEqual([50, 25]);
  });
  it.each([[0, 0], [30, 55], [40, 60]])('respects requested level %i and the existing hardware cap when boosting', async (base, boosted) => {
    const client = await connect(); await client.setVolume(base);
    await client.playPcm(Uint8Array.of(12, 0), { gain: 4 });
    await client.stopPlayback();
    expect(volumeWrites()).toEqual(base === boosted ? [base, boosted] : [base, boosted, base]);
  });
  it.each([4, 'max'] as const)('does not send late coach PCM at %s when stopped while its volume change is pending', async gain => {
    const client = await connect(); let finish!: () => void;
    const level = gain === 'max' ? 100 : 50;
    fixture.native.write.mockImplementationOnce(async ({ data }) => {
      const frame = parseBadgeFrame(badgeBytes(data));
      await new Promise<void>(resolve => { finish = resolve; });
      packet(frame.command, [frame.command, 0, 0, 0], 2, frame.sequence);
    });
    const playing = client.playPcm(Uint8Array.of(12, 0), { gain });
    const rejected = expect(playing).rejects.toThrow('取消');
    await vi.waitFor(() => expect(volumeWrites()).toEqual([level]));
    const stopping = client.stopPlayback(); finish(); await rejected; await stopping;
    expect(fixture.native.playPcm).not.toHaveBeenCalled();
    expect(volumeWrites()).toEqual([level, 25]);
  });
  it('restores the baseline after a failed coach transfer without replaying the clip', async () => {
    const client = await connect(); fixture.native.playPcm.mockRejectedValueOnce(new Error('transport failed'));
    await expect(client.playPcm(Uint8Array.of(12, 0), { gain: 4 })).rejects.toThrow('transport failed');
    expect(volumeWrites()).toEqual([50, 25]);
    expect(fixture.native.playPcm).toHaveBeenCalledTimes(1);
  });
  it('does not let an old delayed stop lower or reset a newer coach clip', async () => {
    const client = await connect(); await client.playPcm(Uint8Array.of(12, 0), { gain: 4 });
    let finish!: () => void;
    fixture.native.stopAudio.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const stopping = client.stopPlayback();
    await client.playPcm(Uint8Array.of(24, 0), { gain: 4 });
    const count = fixture.native.write.mock.calls.length; finish(); await stopping;
    expect(fixture.native.write).toHaveBeenCalledTimes(count);
    expect(volumeWrites()).toEqual([50, 50]);
  });
  it.each([4, 'max'] as const)('honors a newer explicit mute before starting PCM when a %s reply was delayed', async gain => {
    const client = await connect(); let finish!: () => void;
    fixture.native.write.mockImplementationOnce(async ({ data }) => {
      const frame = parseBadgeFrame(badgeBytes(data));
      await new Promise<void>(resolve => { finish = resolve; });
      packet(frame.command, [frame.command, 0, 0, 0], 2, frame.sequence);
    });
    fixture.native.playPcm.mockImplementation(async () => { expect(volumeWrites().at(-1)).toBe(0); });
    const playing = client.playPcm(Uint8Array.of(12, 0), { gain });
    await vi.waitFor(() => expect(volumeWrites()).toEqual([gain === 'max' ? 100 : 50]));
    const muted = client.setVolume(0); finish(); await Promise.all([muted, playing]);
    await client.stopPlayback(); expect(volumeWrites().at(-1)).toBe(0);
  });
  it.each([4, 'max'] as const)('restores the ordinary setting after reconnect instead of inheriting a %s coach boost', async gain => {
    const client = await connect(); await client.playPcm(Uint8Array.of(12, 0), { gain });
    await client.disconnect(); await client.connect('badge-test');
    await client.playPcm(Uint8Array.of(24, 0));
    expect(volumeWrites()).toEqual([gain === 'max' ? 100 : 50, 25]);
  });
  it.each([0, -1, 5, NaN, Infinity])('rejects invalid playback gain %s before hardware writes', async gain => {
    const client = await connect(); fixture.native.write.mockClear();
    await expect(client.playPcm(Uint8Array.of(12, 0), { gain })).rejects.toThrow('增益');
    expect(fixture.native.write).not.toHaveBeenCalled();
    expect(fixture.native.playPcm).not.toHaveBeenCalled();
  });
  it('uses a one-byte portrait index only with versioned firmware support and coalesces rapid switches', async () => {
    const client = await connect();
    const avatarWrites = () => fixture.native.write.mock.calls.map(([{ data }]) => parseBadgeFrame(badgeBytes(data)))
      .filter(frame => frame.command === 0x33 && new TextDecoder().decode(frame.payload.slice(1, 1 + frame.payload[0])) === BADGE_AVATAR_ENDPOINT);
    await client.projectAvatar('frost.run-route');
    expect(avatarWrites()).toHaveLength(0);
    manifest([BADGE_AVATAR_ENDPOINT, 'avatar_state']);
    const sending = client.projectAvatar('frost.run-route');
    void client.projectAvatar('frost.sleep-detective');
    void client.projectAvatar('frost.meal-lens');
    await sending;
    expect(avatarWrites().at(-1)?.payload).toEqual(badgeActuation(BADGE_AVATAR_ENDPOINT, Uint8Array.of(skillAvatarFor('frost.meal-lens').badgeIndex)));
    const count = avatarWrites().length;
    await client.projectAvatar('frost.meal-lens');
    expect(avatarWrites()).toHaveLength(count);
    await client.projectAvatar('unregistered');
    expect(avatarWrites().at(-1)?.payload.at(-1)).toBe(0);
    await client.disconnect(); await client.connect('badge-test'); manifest([BADGE_AVATAR_ENDPOINT]);
    await client.projectAvatar('frost');
    expect(avatarWrites()).toHaveLength(count + 2);
  });
  it('only stops legacy animation once per connection, never uploads or starts animation', async () => {
    const client = await connect();
    manifest(['speaker0', 'motion']); manifest(['speaker0', 'motion']);
    await vi.waitFor(() => expect(motionWrites()).toHaveLength(1));
    expect(motionWrites()[0].payload).toEqual(badgeActuation('motion', Uint8Array.of(4, 0)));
    recording(); await client.transcribeRecording();
    expect(fixture.native.transcribePcm).toHaveBeenCalledTimes(1);
    expect(motionWrites()).toHaveLength(1);
    await client.disconnect(); await client.connect('badge-test'); manifest(['speaker0', 'motion']);
    await vi.waitFor(() => expect(motionWrites()).toHaveLength(2));
    expect(motionWrites().every(frame => frame.payload.at(-2) === 4 && frame.payload.at(-1) === 0)).toBe(true);
  });
  it('does not send animation commands to firmware without that legacy endpoint', async () => {
    await connect(); manifest(['speaker0', 'avatar_state']);
    expect(motionWrites()).toHaveLength(0);
  });
  it('a failed legacy stop neither disconnects the badge nor prevents local transcription', async () => {
    const client = await connect();
    fixture.native.write.mockImplementationOnce(async ({ data }) => {
      const f = parseBadgeFrame(badgeBytes(data)); packet(f.command, [f.command, 1, 1, 0], 2, f.sequence);
    });
    manifest(['motion']);
    await vi.waitFor(() => expect(motionWrites()).toHaveLength(1));
    expect(client.snapshot()).toMatchObject({ status: 'connected', error: undefined });
    recording(); await client.transcribeRecording();
    expect(fixture.native.transcribePcm).toHaveBeenCalledTimes(1);
    expect(motionWrites()).toHaveLength(1);
  });
  it('never starts an already aborted skill cue', async () => {
    const client = await connect(), owner = new AbortController(); owner.abort();
    await expect(client.speakText('过期提示', owner.signal)).rejects.toThrow('播放已取消');
    expect(fixture.native.synthesizeSpeech).not.toHaveBeenCalled();
  });
  it('does not let a delayed old stop reset a newer speech stream', async () => {
    const client = await connect();
    let finishStop!: () => void;
    fixture.native.stopAudio.mockImplementationOnce(() => new Promise<void>(resolve => { finishStop = resolve; }));
    const stop = client.stopPlayback();
    await client.speakText('新回复');
    const writes = fixture.native.write.mock.calls.length;
    finishStop(); await stop;
    expect(fixture.native.write).toHaveBeenCalledTimes(writes);
  });
  it('cancels only the speech owned by an aborted skill, not a newer Frost reply', async () => {
    const client = await connect(), owner = new AbortController();
    let finishOld!: (value: unknown) => void;
    fixture.native.synthesizeSpeech.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
    const old = client.speakText('旧动作提示', owner.signal);
    const rejected = expect(old).rejects.toThrow('旧回复不会重放');
    await vi.waitFor(() => expect(fixture.native.synthesizeSpeech).toHaveBeenCalledTimes(1));
    await client.speakText('新的对话回复');
    const stops = fixture.native.stopAudio.mock.calls.length;
    owner.abort();
    finishOld({ data: 'AAAQAA==', sampleRate: 16000, onDevice: true });
    await rejected;
    expect(fixture.native.stopAudio).toHaveBeenCalledTimes(stops);
    expect(fixture.native.playPcm).toHaveBeenCalledTimes(1);
  });
  it('aborts a skill during synthesis without replaying late PCM', async () => {
    const client = await connect(), owner = new AbortController();
    let finish!: (value: unknown) => void;
    fixture.native.synthesizeSpeech.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = client.speakText('动作提示', owner.signal);
    const rejected = expect(pending).rejects.toThrow('旧回复不会重放');
    await vi.waitFor(() => expect(fixture.native.synthesizeSpeech).toHaveBeenCalledTimes(1));
    owner.abort();
    finish({ data: 'AAAQAA==', sampleRate: 16000, onDevice: true });
    await rejected;
    expect(fixture.native.playPcm).not.toHaveBeenCalled();
  });
  it('synthesizes bounded speech locally and uses the existing PCM channel, without paid services', async () => {
    const client = await connect();
    await client.speakText('你好');
    expect(fixture.native.synthesizeSpeech).toHaveBeenCalledExactlyOnceWith({ text: '你好' });
    expect(fixture.native.playPcm).toHaveBeenCalledExactlyOnceWith({ data: 'AAAQAA==' });
    await expect(client.speakText('字'.repeat(101))).rejects.toThrow('100 字');
    fixture.native.synthesizeSpeech.mockResolvedValueOnce({ data: 'AAAQAA==', sampleRate: 16000, onDevice: false });
    await expect(client.speakText('错误来源')).rejects.toThrow('格式');
    expect(fixture.native.playPcm).toHaveBeenCalledTimes(1);
  });
  it.each(['stop', 'record', 'disconnect'])('discards speech that finishes synthesizing after %s', async action => {
    const client = await connect();
    let resolve!: (value: unknown) => void;
    fixture.native.synthesizeSpeech.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const speaking = client.speakText('旧回复');
    const rejected = expect(speaking).rejects.toThrow('旧回复不会重放');
    await vi.waitFor(() => expect(fixture.native.synthesizeSpeech).toHaveBeenCalledTimes(1));
    if (action === 'stop') await client.stopPlayback();
    if (action === 'disconnect') await client.disconnect();
    if (action === 'record') packet(0x64, [1, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    resolve({ data: 'AAAQAA==', sampleRate: 16000, onDevice: true });
    await rejected;
    expect(fixture.native.playPcm).not.toHaveBeenCalled();
  });
  it('shows live phone reception but permits ASR only after matching the hardware sample count', async () => {
    const client = await connect();
    packet(0x64, [1, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    packet(0x40, [1, 0, 0, 0, 0, 0, 0, 0, 0, ...new Array(3200).fill(12)]);
    expect(client.snapshot().receivedBytes).toBe(3200);
    expect(client.snapshot().pcm).toBeUndefined();
    await expect(client.transcribeRecording()).rejects.toThrow('完成一段录音');
    // 1600 samples, measured peak=1000, no device-side dropped chunks.
    packet(0x64, [1, 3, 0, 1, 64, 6, 0, 0, 232, 3, 0, 0]);
    expect(client.snapshot().captureStats).toEqual({ samples: 1600, peak: 1000, dropped: 0, reason: 1, complete: true });
    await client.transcribeRecording();
    expect(fixture.native.transcribePcm).toHaveBeenCalledTimes(1);
  });
  it('rejects missing audio slices immediately and does not expose a partial recording to ASR', async () => {
    const client = await connect();
    packet(0x64, [1, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    packet(0x40, [1, 0, 0, 0, 1, 0, 0, 0, 0, 12, 0]); // sequence 0 was lost
    expect(client.snapshot().error).toContain('语音丢包');
    packet(0x64, [1, 3, 0, 1, 2, 0, 0, 0, 24, 0, 0, 0]);
    await expect(client.transcribeRecording()).rejects.toThrow('完成一段录音');
    expect(client.snapshot().pcmId).toBeUndefined();
    expect(fixture.native.transcribePcm).not.toHaveBeenCalled();
  });
  it('rejects a zero-length or missing-start capture rather than leaving a false ready state', async () => {
    const client = await connect();
    packet(0x64, [1, 3, 0, 1, 2, 0, 0, 0, 24, 0, 0, 0]);
    expect(client.snapshot().error).toContain('开始事件');
    packet(0x64, [1, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    packet(0x64, [1, 3, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(client.snapshot().error).toContain('录音为空');
    expect(client.snapshot().pcm).toBeUndefined();
  });
  it('marks a tail timeout as incomplete and never runs paid or local ASR automatically', async () => {
    vi.useFakeTimers();
    try {
      const client = await connect();
      packet(0x64, [1, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      packet(0x64, [1, 3, 0, 1, 2, 0, 0, 0, 24, 0, 0, 0]);
      await vi.advanceTimersByTimeAsync(5000);
      expect(client.snapshot().error).toContain('未完整到达');
      expect(client.snapshot().captureStats?.complete).toBe(false);
      expect(fixture.native.transcribePcm).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it('accepts a slowly draining tail beyond 5 seconds only when valid packets keep arriving', async () => {
    vi.useFakeTimers();
    try {
      const client = await connect();
      packet(0x64, [1, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      packet(0x64, [1, 3, 0, 1, 64, 6, 0, 0, 232, 3, 0, 0]); // 1600 samples
      await vi.advanceTimersByTimeAsync(4000);
      packet(0x40, [1, 0, 0, 0, 0, 0, 0, 0, 0, ...new Array(1600).fill(12)]);
      expect(client.snapshot().pcm).toBeUndefined();
      await vi.advanceTimersByTimeAsync(4000);
      packet(0x40, [1, 0, 0, 0, 1, 0, 0, 0, 0, ...new Array(1600).fill(24)]);
      expect(client.snapshot().captureStats?.complete).toBe(true);
      expect(client.snapshot().pcm?.length).toBe(3200);
      expect(fixture.native.transcribePcm).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it('bounds a continuously progressing but incomplete tail to 30 seconds', async () => {
    vi.useFakeTimers();
    try {
      const client = await connect();
      packet(0x64, [1, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      packet(0x64, [1, 3, 0, 1, 128, 62, 0, 0, 232, 3, 0, 0]); // 16000 samples
      for (let sequence = 0; sequence < 7; sequence++) {
        await vi.advanceTimersByTimeAsync(4000);
        packet(0x40, [1, 0, 0, 0, sequence, 0, 0, 0, 0, ...new Array(320).fill(12)]);
      }
      expect(client.snapshot().error).toBeUndefined();
      await vi.advanceTimersByTimeAsync(2000);
      expect(client.snapshot().error).toContain('未完整到达');
      expect(client.snapshot().pcmId).toBeUndefined();
      expect(fixture.native.transcribePcm).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it('clears a missing-end recording without treating the received bytes as complete', async () => {
    vi.useFakeTimers();
    try {
      const client = await connect();
      packet(0x64, [1, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      packet(0x40, [1, 0, 0, 0, 0, 0, 0, 0, 0, ...new Array(3200).fill(12)]);
      await vi.advanceTimersByTimeAsync(45000);
      expect(client.snapshot().recording).toBe(false);
      expect(client.snapshot().error).toContain('未收到录音结束信息');
      expect(client.snapshot().pcm).toBeUndefined();
      await expect(client.transcribeRecording()).rejects.toThrow('完成一段录音');
      expect(fixture.native.transcribePcm).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it('only transcribes complete audio on explicit request and returns provenance for the same Agent input', async () => {
    const client = await connect();
    await expect(client.transcribeRecording()).rejects.toThrow('完成一段录音');
    recording();
    expect(fixture.native.transcribePcm).not.toHaveBeenCalled();
    const result = await client.transcribeRecording();
    expect(result).toEqual({ text: '帮我规划跑步路线', inputId: client.snapshot().pcmId });
    expect(result.inputId.startsWith(`${client.snapshot().connectionId}:recording:`)).toBe(true);
    client.clearRecording();
    expect(client.snapshot().pcmId).toBeUndefined();
  });
  it('discards stale transcription after deletion or a new recording and rejects non-local results', async () => {
    const client = await connect(); recording();
    let finish!: (value: unknown) => void;
    fixture.native.transcribePcm.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const operation = client.transcribeRecording();
    client.clearRecording();
    finish({ text: '旧录音', onDevice: true });
    await expect(operation).rejects.toThrow('旧识别结果已丢弃');
    recording();
    fixture.native.transcribePcm.mockResolvedValueOnce({ text: '云端文字', onDevice: false });
    await expect(client.transcribeRecording()).rejects.toThrow('本机未识别到文字');
  });
  it('does not reuse touch identity across connections or accept packets after disconnect', async () => {
    const client = await connect(); const first = client.snapshot().connectionId;
    packet(0x64, [1, 1, 14, 0, 0, 0, 78, 0, 123, 0]);
    await client.disconnect();
    packet(0x64, [1, 1, 15, 0, 0, 0, 78, 0, 123, 0]);
    expect(client.snapshot().lastTouch).toBeUndefined();
    await client.connect('badge-test');
    expect(client.snapshot().connectionId).not.toBe(first);
    expect(client.snapshot().lastTouch).toBeUndefined();
  });
  it('projects the current Frost state after connect using official IoActuate', async () => {
    const client = await connect();
    await client.projectPose('busy');
    const sent = fixture.native.write.mock.calls.map(([x]) => parseBadgeFrame(badgeBytes(x.data)));
    const last = sent.at(-1)!;
    expect(last.command).toBe(0x33);
    expect(new TextDecoder().decode(last.payload.slice(1, -1))).toBe('avatar_state');
    expect(last.payload.at(-1)).toBe(2);
  });
  it('treats a touch as input only and never sends an approval or tool result', async () => {
    const client = await connect();
    const before = fixture.native.write.mock.calls.length;
    packet(0x64, [1, 1, 14, 0, 0, 0, 78, 0, 123, 0]);
    expect(client.snapshot().lastTouch).toEqual({ count: 14, x: 78, y: 123 });
    expect(fixture.native.write.mock.calls.length).toBe(before);
  });
  it('waits for the complete mic tail before permitting replay and clears explicit deletion', async () => {
    const client = await connect();
    packet(0x64, [1, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    packet(0x64, [1, 3, 0, 1, 2, 0, 0, 0, 24, 0, 0, 0]);
    expect(client.snapshot().pcm).toBeUndefined();
    packet(0x40, [1, 0, 0, 0, 0, 0, 0, 0, 0, 12, 0, 24, 0]);
    expect(client.snapshot().pcm).toEqual(Uint8Array.of(12, 0, 24, 0));
    await client.playRecording();
    expect(fixture.native.playPcm).toHaveBeenCalledTimes(1);
    client.clearRecording(); expect(client.snapshot().pcm).toBeUndefined();
  });
  it('does not return a successful control result when the device rejects it', async () => {
    const client = await connect();
    fixture.native.write.mockImplementation(async ({ data }) => {
      const f = parseBadgeFrame(badgeBytes(data));
      packet(f.command, [f.command, 1, 0xeb, 3], 2, f.sequence);
    });
    await expect(client.testSpeaker()).rejects.toThrow('1003');
  });
  it('identifies a missing hardware reply without discarding received audio or retrying the action', async () => {
    vi.useFakeTimers();
    try {
      const client = await connect(); recording();
      const captured = client.snapshot().pcm;
      fixture.native.write.mockClear();
      fixture.native.write.mockImplementation(async () => {});
      const operation = client.projectPose('attention');
      const failure = operation.catch(error => error);
      await vi.advanceTimersByTimeAsync(8000);
      expect(await failure).toBeInstanceOf(Error);
      expect((await failure).message).toContain('圆屏状态同步回执超时');
      expect(fixture.native.write).toHaveBeenCalledTimes(1);
      expect(client.snapshot()).toMatchObject({ status: 'connected', pcm: captured, captureStats: { complete: true } });
      await client.transcribeRecording();
      expect(fixture.native.transcribePcm).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  it('stops the audio producer before resetting the badge playback queue', async () => {
    const client = await connect();
    const calls: string[] = [];
    fixture.native.cancelSynthesis.mockImplementation(async () => { calls.push('synthesis'); });
    fixture.native.stopAudio.mockImplementation(async () => { calls.push('producer'); });
    fixture.native.write.mockImplementation(async ({ data }) => {
      const f = parseBadgeFrame(badgeBytes(data)); calls.push('device');
      packet(f.command, [f.command, 0, 0, 0], 2, f.sequence);
    });
    await client.stopPlayback(); expect(calls).toEqual(['synthesis', 'producer', 'device']);
  });
  it('plays synthesized PCM through the same transport and rejects recording-time playback', async () => {
    const client = await connect();
    await client.playPcm(Uint8Array.of(0, 0, 16, 0));
    expect(fixture.native.playPcm).toHaveBeenCalledWith({ data: 'AAAQAA==' });
    const last = parseBadgeFrame(badgeBytes(fixture.native.write.mock.calls.at(-1)![0].data));
    expect(last.command).toBe(5); expect(last.payload).toEqual(Uint8Array.of(0, 0, 0, 0, 3));
    await expect(client.playPcm(Uint8Array.of(0))).rejects.toThrow('PCM16');
    packet(0x64, [1, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    await expect(client.playPcm(Uint8Array.of(0, 0))).rejects.toThrow('停止录音');
    expect(fixture.native.playPcm).toHaveBeenCalledTimes(1);
  });
  it('rejects pending operations and invalidates old queued commands on disconnect', async () => {
    const client = await connect();
    fixture.native.write.mockImplementation(async () => {});
    const operation = client.testSpeaker();
    const rejected = expect(operation).rejects.toThrow('test disconnect');
    await Promise.resolve(); await Promise.resolve();
    fixture.callbacks.get('connection')?.({ connected: false, reason: 'test disconnect' });
    await rejected;
    expect(client.snapshot().status).toBe('disconnected');
  });
});
