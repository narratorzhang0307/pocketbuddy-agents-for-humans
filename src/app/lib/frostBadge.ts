import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { BADGE_STATES, BadgeManifest, BadgeRecording, badgeActuation, badgeBase64, badgeBytes, badgeCommand,
  parseBadgeBattery, parseBadgeFrame, type BadgeBattery, type BadgePose } from './frostBadgeProtocol';
import { BADGE_AVATAR_ENDPOINT, FROST_AVATAR, SKILL_AVATARS, skillAvatarFor } from './skill/avatars';
import { BADGE_JPEG_ENDPOINT, avatarUploadPackets, loadAvatarJpeg } from './frostAvatarCloud';
import { birdIntent, type BirdStatus } from './birdListener';

export interface BadgeDevice { id: string; name: string; rssi: number }
interface NativeBadge {
  scan(): Promise<{ devices: BadgeDevice[] }>;
  connect(options: { id: string }): Promise<{ id: string; mtu: number; maxWriteBytes: number }>;
  disconnect(): Promise<void>;
  write(options: { data: string }): Promise<void>;
  playPcm(options: { data: string }): Promise<void>;
  stopAudio(): Promise<void>;
  transcribePcm(options: { data: string }): Promise<{ text: string; locale: string; onDevice: boolean }>;
  cancelTranscription(): Promise<void>;
  synthesizeSpeech(options: { text: string }): Promise<{ data: string; sampleRate: number; onDevice: boolean }>;
  cancelSynthesis(): Promise<void>;
  configureBirdListening(options: { enabled: boolean }): Promise<BirdStatus>;
  startBirdSession(): Promise<BirdStatus>;
  stopBirdSession(): Promise<void>;
  birdStatus(): Promise<BirdStatus>;
  addListener(event: 'birdStatus', callback: (e: BirdStatus) => void): Promise<PluginListenerHandle>;
  addListener(event: 'nativeVoice', callback: (e: { data: string; text: string; id: string; peak: number }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'packet', callback: (e: { data: string; channel: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'connection', callback: (e: { connected: boolean; reason?: string }) => void): Promise<PluginListenerHandle>;
}
const native = registerPlugin<NativeBadge>('FrostBadge');
export interface BadgeStatus {
  bird?: BirdStatus;
  nativeTranscript?: { inputId: string; text: string };
  status: 'disconnected' | 'scanning' | 'connecting' | 'connected';
  devices: BadgeDevice[]; deviceId?: string; connectionId?: string; battery?: BadgeBattery;
  endpoints: string[]; microphoneAvailable?: boolean; lastTouch?: { count: number; x: number; y: number };
  recording: boolean; receivedBytes: number; pcm?: Uint8Array; pcmId?: string; error?: string;
  captureStats?: { samples: number; peak: number; dropped: number; reason: number; complete: boolean };
  avatar?: { index: number; status: 'loading' | 'ready' | 'fallback'; message?: string };
}

class FrostBadgeClient {
  private value: BadgeStatus = { status: 'disconnected', devices: [], endpoints: [], recording: false, receivedBytes: 0 };
  private listeners = new Set<() => void>();
  private initialized?: Promise<void>;
  private manifest = new BadgeManifest();
  private sequence = 0;
  private maxWrite = 20;
  private pending = new Map<number, { command: number; resolve: (data: Uint8Array) => void; reject: (e: Error) => void }>();
  private writes: Promise<unknown> = Promise.resolve();
  private capture?: BadgeRecording;
  private expectedSamples?: number;
  private drainTimer?: ReturnType<typeof setTimeout>;
  private captureTimer?: ReturnType<typeof setTimeout>;
  private drainDeadline = 0;
  private pose: BadgePose = 'idle';
  private poseSending = false;
  private avatarIndex = 0;
  private sentAvatarIndex?: number;
  private avatarSending = false;
  private avatarAbort?: AbortController;
  private cachedAvatarIndex?: number;
  private avatarToken = 0;
  private avatarReceipt?: { index: number; token: number; state: number; value: number;
    resolve: () => void; reject: (error: Error) => void; deviceRejected: boolean };
  private connectionGeneration = 0;
  private captureId?: string;
  private transcriptionGeneration = 0;
  private playbackGeneration = 0;
  private playbackBusy = 0;
  private volume = 25; // User-selected baseline; a coach boost must not become the global setting.
  private volumeRevision = 0;
  private volumeOverride = false;
  private legacyAnimationStopped = false;
  subscribe = (callback: () => void) => { this.listeners.add(callback); return () => { this.listeners.delete(callback); }; };
  snapshot = () => this.value;
  supported = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('FrostBadge');
  private update(patch: Partial<BadgeStatus>) {
    if (patch.bird?.active || patch.bird?.busy) {
      this.interruptAvatar();
      // Native Bird shares the board's single volatile JPEG slot; phone bytes stay cached.
      this.cachedAvatarIndex = undefined;
      this.sentAvatarIndex = undefined;
    }
    this.value = { ...this.value, ...patch }; this.listeners.forEach(fn => fn());
  }
  private async init() {
    if (!this.supported()) throw new Error('需要安装包含 FrostBadge 蓝牙插件的手机 App；普通网页不能连接此音频通道。');
    if (!this.initialized) this.initialized = (async () => {
      await native.addListener('packet', e => {
        try { this.packet(badgeBytes(e.data)); } catch (error) { this.update({ error: String(error) }); }
      });
      await native.addListener('connection', e => { if (!e.connected) this.disconnected(e.reason); });
      await native.addListener('birdStatus', bird => {
        this.update({ bird, recording: bird.state === 'recording', ...(bird.state === 'recording' ? { pcm: undefined, pcmId: undefined, nativeTranscript: undefined } : {}) });
      });
      await native.addListener('nativeVoice', e => {
        const pcm = badgeBytes(e.data), inputId = `${this.value.connectionId}:recording:${e.id}`;
        this.update({ pcm, pcmId: inputId, receivedBytes: pcm.length, recording: false,
          nativeTranscript: { inputId, text: e.text },
          captureStats: { samples: pcm.length / 2, peak: e.peak, dropped: 0, reason: 1, complete: true } });
      });
      // Older installed plugins may not expose the bird extension yet.
      if (typeof native.birdStatus === 'function') await native.birdStatus().then(bird => this.update({ bird })).catch(() => {});
    })();
    return this.initialized;
  }
  async scan() {
    await this.init();
    this.update({ status: 'scanning', error: undefined, devices: [] });
    try { const result = await native.scan(); this.update({ status: 'disconnected', devices: result.devices }); }
    catch (error) { this.update({ status: 'disconnected', error: String(error) }); throw error; }
  }
  async connect(id: string) {
    await this.init();
    this.manifest.reset();
    this.sentAvatarIndex = undefined;
    this.cachedAvatarIndex = undefined;
    this.legacyAnimationStopped = false;
    this.update({ status: 'connecting', deviceId: id, connectionId: undefined, lastTouch: undefined, battery: undefined, endpoints: [], microphoneAvailable: undefined, error: undefined });
    const generation = ++this.connectionGeneration;
    try {
      const result = await native.connect({ id });
      if (generation !== this.connectionGeneration) throw new Error('连接已取消');
      this.maxWrite = result.maxWriteBytes;
      this.update({ status: 'connected', connectionId: `badge:${crypto.randomUUID()}` });
      await this.command(0x34, new Uint8Array(), '能力查询');
      await this.projectPose(this.pose);
    } catch (error) { await native.disconnect().catch(() => {}); this.disconnected(String(error)); throw error; }
  }
  async disconnect() { await native.disconnect(); this.disconnected(); }
  async configureBirdListening(enabled: boolean) {
    await this.init();
    if (enabled && !this.value.endpoints.includes('bird_mode_v1')) throw new Error('请连接已更新为0.2.15或更新版本的B板');
    this.interruptAvatar(); await this.writes.catch(() => {});
    const bird = await native.configureBirdListening({ enabled }); this.update({ bird });
  }
  async startBirdSession() {
    if (this.value.recording) throw new Error('请先松手，结束当前录音');
    if (!this.value.bird?.enabled) await this.configureBirdListening(true);
    if (!this.value.endpoints.includes('bird_mode_v1')) throw new Error('当前B板固件不支持识鸟触屏录音');
    this.interruptAvatar(); await this.writes.catch(() => {});
    const bird = await native.startBirdSession(); this.update({ bird });
  }
  async stopBirdSession() { await native.stopBirdSession(); }
  async tryBirdCommand(text: string): Promise<boolean> {
    const intent = birdIntent(text);
    if (!intent) return false;
    if (intent === 'start') await this.startBirdSession(); else await this.stopBirdSession();
    return true;
  }
  private disconnected(reason?: string) {
    this.interruptAvatar();
    ++this.connectionGeneration;
    this.pending.forEach(p => p.reject(new Error(reason || '吧唧已断开'))); this.pending.clear();
    this.capture = undefined; this.expectedSamples = undefined;
    this.captureId = undefined;
    void this.cancelTranscription().catch(() => {});
    void this.cancelSpeech().catch(() => {});
    if (this.drainTimer) clearTimeout(this.drainTimer);
    if (this.captureTimer) clearTimeout(this.captureTimer);
    this.update({ status: 'disconnected', connectionId: undefined, lastTouch: undefined, recording: false, endpoints: [], microphoneAvailable: undefined, battery: undefined, error: reason,
      nativeTranscript: undefined, bird: this.value.bird && { ...this.value.bird, active: false, busy: false, state: 'idle', message: '蓝牙已断开' } });
  }
  private command(id: number, payload = new Uint8Array(), operation = '控制指令', allowed?: () => boolean): Promise<Uint8Array> {
    const generation = this.connectionGeneration;
    const run = async () => {
      if (this.value.status !== 'connected' || generation !== this.connectionGeneration) throw new Error('吧唧未连接');
      if (allowed && !allowed()) throw new Error('状态已变化，取消本次低优先级摘要同步');
      const sequence = this.sequence++ & 127; // 128..255 belong to the native screen-off coordinator.
      const data = badgeCommand(id, sequence, payload);
      if (data.length > this.maxWrite) throw new Error('蓝牙 MTU 太小，无法发送该命令');
      let timer: ReturnType<typeof setTimeout>;
      const response = new Promise<Uint8Array>((resolve, reject) => {
        this.pending.set(sequence, { command: id, resolve, reject });
        timer = setTimeout(() => {
          this.pending.delete(sequence);
          console.warn(`[FrostBadge] control_timeout command=0x${id.toString(16)} sequence=${sequence} operation=${operation} recording=${this.value.recording}`);
          reject(new Error(`蓝牙${operation}回执超时（8 秒未收到硬件确认），不是 Frost 任务超时。`));
        }, 8000);
      });
      void response.catch(() => {});
      try { await native.write({ data: badgeBase64(data) }); return await response; }
      finally { clearTimeout(timer!); this.pending.delete(sequence); }
    };
    const next = this.writes.then(run, run); this.writes = next.catch(() => {}); return next;
  }
  private actuate(id: string, args: Uint8Array, allowed?: () => boolean) {
    const operation = id === 'avatar_state' ? '圆屏状态同步' : id === BADGE_AVATAR_ENDPOINT ? 'Skill 头像切换' : id === 'speaker0' ? '扬声器控制' : id === 'motion' ? '停止旧动画' : '硬件控制';
    return this.command(0x33, badgeActuation(id, args), operation, allowed);
  }
  async testSpeaker() { await this.restoreVolume(); await this.actuate('speaker0', Uint8Array.of(1)); }
  async projectHealthSummary(text: string, allowed: () => boolean): Promise<void> {
    if (!this.value.endpoints.includes('screen0')) throw new Error('当前硬件固件未提供文字屏幕端点');
    const bytes = new TextEncoder().encode(text);
    if (!bytes.length || bytes.length > 255 || bytes.length + 14 > this.maxWrite) throw new Error('摘要超出蓝牙单包容量，未截断或分段覆盖屏幕');
    await this.command(0x33, badgeActuation('screen0', bytes), '今日摘要同步', () => !this.value.recording && !this.playbackBusy
      && !this.value.bird?.active && !this.value.bird?.busy && allowed());
  }
  async setVolume(volume: number) {
    if (!Number.isInteger(volume) || volume < 0 || volume > 60) throw new Error('音量范围为 0–60');
    this.volume = volume;
    await this.applyVolume(volume);
  }
  private async applyVolume(volume: number) {
    const revision = ++this.volumeRevision, connection = this.connectionGeneration;
    // Even a lost reply may have changed the DAC. Keep restoration pending until confirmed.
    this.volumeOverride = true;
    await this.actuate('speaker0', Uint8Array.of(2, volume));
    if (revision === this.volumeRevision && connection === this.connectionGeneration) this.volumeOverride = volume !== this.volume;
  }
  private async restoreVolume() {
    if (this.volumeOverride) await this.applyVolume(this.volume);
  }
  async requestCapture() { await this.command(0x3c, Uint8Array.of(0, 0x30, 0x75), '录音提示'); }
  async stopCapture() { await this.command(0x3d, new Uint8Array(), '停止录音'); }
  async playRecording() {
    const pcm = this.value.pcm;
    if (!pcm?.length) throw new Error('请先完成一段录音');
    await this.playPcm(pcm);
  }
  async playPcm(pcm: Uint8Array, options: { gain?: number | 'max' } = {}) {
    return this.writePcm(pcm, options.gain ?? 1, ++this.playbackGeneration);
  }
  private async writePcm(pcm: Uint8Array, gain: number | 'max', playback: number) {
    if (this.value.status !== 'connected') throw new Error('吧唧未连接');
    if (this.value.recording) throw new Error('请先停止录音');
    if (!pcm.length || pcm.length % 2 || pcm.length > 960000) throw new Error('音频必须是 30 秒内的 16k 单声道 PCM16');
    if (gain !== 'max' && (!Number.isFinite(gain) || gain < 1 || gain > 4)) throw new Error('播放增益范围为 1–4 倍，或 max 最高档');
    const enhanced = gain === 'max' || gain > 1;
    const generation = this.connectionGeneration;
    const check = () => {
      if (generation !== this.connectionGeneration) throw new Error('播放期间连接已改变');
      if (playback !== this.playbackGeneration || this.value.recording) throw new Error('播放已取消，旧回复不会重放');
    };
    this.playbackBusy++;
    this.interruptAvatar();
    try {
      if (enhanced) {
        if (gain === 'max') {
          // Legacy firmware ACKs stop before its 20 ms playback loop clears >60 to 25.
          // Allow that reset to settle, then recheck cancellation before requesting 100.
          await new Promise(resolve => setTimeout(resolve, 100));
          check();
        }
        // 100 is the codec's 0 dB ceiling, not positive DAC gain. Keep original PCM and mute.
        // Numeric boosts retain the prior 60 cap; only the explicit max request uses 100.
        const base = this.volume, requested = base === 0 ? 0 : gain === 'max' ? 100 : base + Math.ceil(40 * Math.log10(gain));
        const boosted = Math.min(gain === 'max' ? 100 : 60, requested);
        await this.applyVolume(boosted);
        if (this.volume !== base) await this.restoreVolume(); // A newer explicit volume choice wins.
        console.info(`[FrostBadge] playback_gain requested=${gain} base=${base} level=${boosted} capped=${boosted < requested} muted=${base === 0} pcm_unchanged=true`);
      } else await this.restoreVolume();
      check();
      await native.playPcm({ data: badgeBase64(pcm) });
      check();
      await this.command(5, Uint8Array.of(0, 0, 0, 0, 3), '播放收尾');
    } catch (error) {
      if (enhanced && playback === this.playbackGeneration && generation === this.connectionGeneration) {
        await this.stopPlayback().catch(() => {});
      }
      throw error;
    } finally { this.playbackBusy--; this.resumeAvatar(); }
  }
  async stopPlayback() {
    // Close the producer first, then drain/reset the device queue. Otherwise new PCM would restart playback.
    const generation = this.playbackGeneration + 1, connection = this.value.connectionId;
    await this.cancelSpeech();
    const current = () => generation === this.playbackGeneration && connection === this.value.connectionId
      && this.value.status === 'connected' && !this.value.recording;
    if (current()) {
      await this.actuate('speaker0', Uint8Array.of(0));
      if (current()) await this.restoreVolume();
    }
  }
  async cancelSpeech() {
    ++this.playbackGeneration;
    if (this.supported()) await Promise.all([native.cancelSynthesis(), native.stopAudio()]);
  }
  async speakText(text: string, signal?: AbortSignal) {
    if (signal?.aborted) throw new Error('播放已取消，旧回复不会重放');
    if (!this.supported() || Capacitor.getPlatform() !== 'ios') throw new Error('本机朗读需要新版 iOS App');
    if (this.value.status !== 'connected' || this.value.recording) throw new Error('请先连接吧唧并结束录音');
    const clean = text.trim();
    if (!clean || [...clean].length > 100) throw new Error('本机朗读限 1–100 字');
    const connection = this.value.connectionId, generation = ++this.playbackGeneration;
    // A closing skill may cancel its own output, never a newer conversation reply.
    const abort = () => { if (generation === this.playbackGeneration) void this.stopPlayback().catch(() => {}); };
    const check = () => {
      if (signal?.aborted || generation !== this.playbackGeneration || connection !== this.value.connectionId || this.value.recording) {
        throw new Error('播放已取消，旧回复不会重放');
      }
    };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      // A newer reply replaces queued speech; never overlap two L2CAP producers.
      await Promise.all([native.cancelSynthesis(), native.stopAudio()]);
      check();
      await this.actuate('speaker0', Uint8Array.of(0));
      check();
      const result = await native.synthesizeSpeech({ text: clean });
      check();
      if (result.onDevice !== true || result.sampleRate !== 16000 || typeof result.data !== 'string' || result.data.length > 1280000) throw new Error('本机语音格式不符合要求');
      await this.writePcm(badgeBytes(result.data), 'max', generation);
      check();
    } finally { signal?.removeEventListener('abort', abort); }
  }
  clearRecording() {
    void this.cancelTranscription().catch(() => {});
    this.update({ pcm: undefined, pcmId: undefined, receivedBytes: 0, captureStats: undefined });
  }
  async transcribeRecording(): Promise<{ text: string; inputId: string }> {
    const { pcm, pcmId, recording } = this.value;
    if (!this.supported() || Capacitor.getPlatform() !== 'ios') throw new Error('本机语音识别需要新版 iOS App');
    if (recording || !pcm?.length || !pcmId) throw new Error('请先完成一段录音');
    if (this.value.nativeTranscript?.inputId === pcmId) return { text: this.value.nativeTranscript.text, inputId: pcmId };
    const generation = ++this.transcriptionGeneration;
    const result = await native.transcribePcm({ data: badgeBase64(pcm) });
    if (generation !== this.transcriptionGeneration || this.value.pcmId !== pcmId) throw new Error('录音已改变，旧识别结果已丢弃');
    if (result.onDevice !== true || typeof result.text !== 'string' || !result.text.trim()) throw new Error('本机未识别到文字，请重试或手动输入');
    return { text: result.text.trim().slice(0, 2000), inputId: pcmId };
  }
  async cancelTranscription() {
    ++this.transcriptionGeneration;
    if (this.supported() && Capacitor.getPlatform() === 'ios') await native.cancelTranscription();
  }
  async projectPose(pose: BadgePose) {
    this.pose = pose;
    if (this.value.status !== 'connected' || this.poseSending || this.value.bird?.active || this.value.bird?.busy) return;
    this.poseSending = true;
    try {
      let sent: BadgePose;
      do {
        sent = this.pose;
        await this.actuate('avatar_state', Uint8Array.of(BADGE_STATES.indexOf(sent)));
      } while (sent !== this.pose && this.value.status === 'connected');
    } finally { this.poseSending = false; }
  }
  async projectAvatar(skillId: string) {
    const requested = skillAvatarFor(skillId).badgeIndex;
    if (requested !== this.avatarIndex) this.interruptAvatar();
    this.avatarIndex = requested;
    if (!this.canProjectAvatar() || this.avatarSending) return;
    const generation = this.connectionGeneration;
    this.avatarSending = true;
    let interrupted = false;
    try {
      while (this.sentAvatarIndex !== this.avatarIndex && this.canProjectAvatar()
        && generation === this.connectionGeneration) {
        const index = this.avatarIndex;
        const abort = new AbortController(); this.avatarAbort = abort;
        const current = () => !abort.signal.aborted && this.canProjectAvatar()
          && generation === this.connectionGeneration && index === this.avatarIndex;
        try {
          if (index && this.value.endpoints.includes(BADGE_JPEG_ENDPOINT) && this.cachedAvatarIndex !== index) {
            // Show resident Frost while fetching, never a stale skill identity.
            await this.actuate(BADGE_AVATAR_ENDPOINT, Uint8Array.of(0), current);
            this.sentAvatarIndex = 0;
            this.update({ avatar: { index, status: 'loading' } });
            const bytes = await loadAvatarJpeg(index, abort.signal);
            const token = ++this.avatarToken & 65535;
            for (const packet of avatarUploadPackets(index, token, bytes, this.maxWrite))
              await this.exchangeAvatar(packet, current);
            if (!current()) throw new Error('头像传输已暂停');
            this.cachedAvatarIndex = index;
          } else await this.actuate(BADGE_AVATAR_ENDPOINT, Uint8Array.of(index), current);
          if (!current()) throw new Error('头像传输已暂停');
          this.sentAvatarIndex = index;
          interrupted = false;
          this.update({ avatar: { index, status: 'ready' } });
        } catch (error) {
          if (!current()) { interrupted = true; if (!this.canProjectAvatar()) return; continue; }
          interrupted = false;
          this.update({ avatar: { index: 0, status: 'fallback', message: String(error) } });
          throw error;
        } finally { if (this.avatarAbort === abort) this.avatarAbort = undefined; }
      }
    } finally {
      this.avatarSending = false;
      if (interrupted && this.canProjectAvatar() && this.sentAvatarIndex !== this.avatarIndex) this.resumeAvatar();
    }
  }
  private canProjectAvatar() {
    return this.value.status === 'connected' && this.value.endpoints.includes(BADGE_AVATAR_ENDPOINT)
      && !this.value.recording && !this.capture && !this.playbackBusy && !this.value.bird?.active && !this.value.bird?.busy;
  }
  private interruptAvatar() {
    this.avatarAbort?.abort();
    this.avatarReceipt?.reject(new Error('头像传输已暂停'));
  }
  private resumeAvatar() {
    const avatar = SKILL_AVATARS.find(item => item.badgeIndex === this.avatarIndex) || FROST_AVATAR;
    void this.projectAvatar(avatar.id).catch(error => console.warn('[FrostBadge] avatar_load_failed', String(error)));
  }
  private async exchangeAvatar(packet: { data: Uint8Array; state: number; value: number }, current: () => boolean) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!current()) throw new Error('头像传输已暂停');
      let timer: ReturnType<typeof setTimeout> | undefined;
      const response = new Promise<void>((resolve, reject) => {
        this.avatarReceipt = { index: packet.data[1], token: packet.data[2] | packet.data[3] << 8,
          state: packet.state, value: packet.value, resolve, reject, deviceRejected: false };
        timer = setTimeout(() => reject(new Error('圆屏头像处理回执超时')), 2200);
      });
      const receipt = this.avatarReceipt!;
      void response.catch(() => {});
      try {
        await this.actuate(BADGE_JPEG_ENDPOINT, packet.data, current);
        await response; return;
      } catch (error) {
        if (!current() || receipt.deviceRejected || attempt === 1) throw error;
        // Retry this exact idempotent transaction, never a newer selection.
      } finally {
        clearTimeout(timer);
        if (this.avatarReceipt === receipt) this.avatarReceipt = undefined;
      }
    }
  }
  private finishCapture() {
    if (this.capture?.error) { this.failCapture(this.capture.error); return; }
    if (!this.capture || this.expectedSamples === undefined || this.capture.bytes < this.expectedSamples * 2) return;
    if (this.drainTimer) clearTimeout(this.drainTimer);
    if (this.captureTimer) clearTimeout(this.captureTimer);
    try {
      const pcm = this.capture.finish(this.expectedSamples);
      this.update({ pcm, pcmId: this.captureId, receivedBytes: pcm.length,
        captureStats: this.value.captureStats && { ...this.value.captureStats, complete: true } });
      console.info(`[FrostBadge] capture_complete bytes=${pcm.length} samples=${this.expectedSamples} peak=${this.value.captureStats?.peak}`);
    }
    catch (error) { this.failCapture(String(error)); }
    this.capture = undefined; this.expectedSamples = undefined; this.captureId = undefined;
    this.resumeAvatar();
  }
  private failCapture(error: string) {
    if (this.drainTimer) clearTimeout(this.drainTimer);
    if (this.captureTimer) clearTimeout(this.captureTimer);
    this.capture = undefined; this.expectedSamples = undefined; this.captureId = undefined;
    this.update({ error, pcm: undefined, pcmId: undefined });
    this.resumeAvatar();
    console.warn(`[FrostBadge] capture_rejected: ${error}`);
  }
  private waitForCaptureTail() {
    if (this.drainTimer) clearTimeout(this.drainTimer);
    if (!this.capture || this.expectedSamples === undefined) return;
    // BLE can still be draining after release. Require progress within 5 seconds,
    // with a fixed 30-second total cap; never infer completion from a quiet gap.
    const wait = Math.min(5000, this.drainDeadline - Date.now());
    if (wait <= 0) { this.failCapture('录音数据未完整到达（尾包等待达到上限），请重试'); return; }
    this.drainTimer = setTimeout(() => this.failCapture('录音数据未完整到达，请重试'), wait);
  }
  private packet(bytes: Uint8Array) {
    const f = parseBadgeFrame(bytes), p = f.payload;
    if (f.kind === 2) {
      const pending = this.pending.get(f.sequence);
      if (!pending || pending.command !== f.command || p.length < 4 || p[0] !== f.command) return;
      if (p[1] || p[2] || p[3]) pending.reject(new Error(`吧唧拒绝命令：${p[2] | p[3] << 8}`));
      else pending.resolve(p.slice(4));
      return;
    }
    if (f.kind !== 3) return;
    if (this.value.status !== 'connected') return;
    if (f.command === 0x18) {
      const manifest = this.manifest.push(p);
      if (manifest) {
        // Upgrade compatibility only: stop a cached loop left by the old App.
        // No asset downloads, uploads, playback commands or automatic retries.
        if (!this.legacyAnimationStopped && manifest.io.some(io => io.id === 'motion')) {
          this.legacyAnimationStopped = true;
          void this.actuate('motion', Uint8Array.of(4, 0)).catch(error => {
            console.warn('[FrostBadge] legacy_animation_stop_failed', String(error));
          });
        }
        this.update({ endpoints: manifest.io.map(io => io.id), microphoneAvailable: !!(manifest.caps & 1) });
      }
    } else if (f.command === 0x40) {
      const previousBytes = this.capture?.bytes || 0;
      this.capture?.push(p);
      // Render progress at most about 10 times/s, not for every small BLE slice.
      if (this.capture && Math.floor(this.capture.bytes / 3200) !== Math.floor(this.value.receivedBytes / 3200)) {
        if (Math.floor(this.capture.bytes / 16000) !== Math.floor(this.value.receivedBytes / 16000)) {
          console.info(`[FrostBadge] capture_progress bytes=${this.capture.bytes}`);
        }
        this.update({ receivedBytes: this.capture.bytes });
      }
      this.finishCapture();
      if (this.capture && this.capture.bytes > previousBytes) this.waitForCaptureTail();
    } else if (f.command === 0x64 && p[0] === 1) {
      if (p[1] === 5 && p.length === 10) {
        const receipt = this.avatarReceipt, view = new DataView(p.buffer, p.byteOffset, p.byteLength);
        if (receipt && receipt.index === p[2] && receipt.token === view.getUint16(4, true)) {
          if (p[3] === 128) { receipt.deviceRejected = true; receipt.reject(new Error(`圆屏拒绝头像传输 (${view.getUint32(6, true)})`)); }
          else if (p[3] === receipt.state && view.getUint32(6, true) === receipt.value) receipt.resolve();
        }
      } else if (p[1] === 2) this.update({ battery: parseBadgeBattery(p) });
      else if (p[1] === 1 && p.length === 10) {
        const v = new DataView(p.buffer, p.byteOffset, p.byteLength);
        // Input only. Never synthesize an approval or a Taskmaster tool-result from a touch.
        this.update({ lastTouch: { count: v.getUint32(2, true), x: v.getUint16(6, true), y: v.getUint16(8, true) } });
      } else if (p[1] === 3 && p.length === 12) {
        if (p[2] === 1) {
          this.interruptAvatar();
          void this.cancelSpeech().catch(() => {});
          void this.cancelTranscription().catch(() => {});
          if (this.drainTimer) clearTimeout(this.drainTimer);
          if (this.captureTimer) clearTimeout(this.captureTimer);
          this.capture = new BadgeRecording(); this.expectedSamples = undefined;
          this.captureId = `${this.value.connectionId}:recording:${crypto.randomUUID()}`;
          this.update({ recording: true, receivedBytes: 0, pcm: undefined, pcmId: undefined, captureStats: undefined, error: undefined });
          console.info('[FrostBadge] capture_start source=badge_microphone');
          // Hardware caps capture at 30s and status retries at 10s. Missing end
          // metadata must not leave the UI recording forever or authorize ASR.
          this.captureTimer = setTimeout(() => {
            this.failCapture('未收到录音结束信息，本次录音已丢弃；请重新连接吧唧');
            this.update({ recording: false });
          }, 45000);
        } else {
          if (this.captureTimer) clearTimeout(this.captureTimer);
          const v = new DataView(p.buffer, p.byteOffset, p.byteLength);
          const stats = { samples: v.getUint32(4, true), peak: v.getUint16(8, true), dropped: v.getUint16(10, true), reason: p[3], complete: false };
          this.update({ recording: false, captureStats: stats });
          console.info(`[FrostBadge] capture_end samples=${stats.samples} peak=${stats.peak} dropped=${stats.dropped} reason=${stats.reason}`);
          if (p[3] > 2 || v.getUint16(10, true)) {
            this.failCapture('录音中断或丢包，请重试'); return;
          }
          if (!this.capture) { this.failCapture(this.value.error || '未收到录音开始事件，请重新录音'); return; }
          if (stats.samples === 0 || stats.samples > 480000) { this.failCapture('录音为空或超过 30 秒，请按住按键说一句话'); return; }
          this.expectedSamples = v.getUint32(4, true);
          this.drainDeadline = Date.now() + 30000;
          this.finishCapture();
          this.waitForCaptureTail();
        }
      }
    }
  }
}

export const frostBadge = new FrostBadgeClient();
