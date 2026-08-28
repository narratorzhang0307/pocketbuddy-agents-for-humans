import { HER_MOTION_AUDIO_PROTOCOL } from '../../../../vendor/her-motion/src/frostBridge';

export const HER_MOTION_VOICE_TEST = 'Her Motion 语音由圆形硬件播放，手机保持静音。';
export interface HerMotionAudioPort {
  connection(): string | undefined;
  available(): boolean;
  speak(text: string, signal: AbortSignal): Promise<void>;
  status(message: string): void;
  now(): number;
}

/** The host checks frame identity; this binds speech to a session and ordered, bounded cues. */
export class HerMotionBadgeAudio {
  private lastId = 0;
  private lastStarted = -Infinity;
  private lastText = '';
  private active?: { controller: AbortController; connection: string };
  private closed = false;
  constructor(private sessionId: string, private port: HerMotionAudioPort) {}

  async receive(value: unknown): Promise<boolean> {
    if (this.closed || !value || typeof value !== 'object') return false;
    const cue = value as Record<string, unknown>;
    if (cue.protocol !== HER_MOTION_AUDIO_PROTOCOL || cue.sessionId !== this.sessionId
      || !Number.isSafeInteger(cue.id) || (cue.id as number) <= this.lastId || (cue.id as number) > 1_000_000_000
      || !['speak', 'stop'].includes(String(cue.type))) return false;
    if (cue.type === 'speak' && (typeof cue.text !== 'string' || !cue.text.trim() || [...cue.text].length > 100)) return false;
    this.lastId = cue.id as number;
    if (cue.type === 'stop') this.stop();
    else await this.play((cue.text as string).trim());
    return true;
  }

  test(): Promise<void> { return this.play(HER_MOTION_VOICE_TEST); }

  private async play(text: string): Promise<void> {
    const connection = this.port.connection();
    if (this.closed || !connection || !this.port.available()) {
      if (!this.closed) this.port.status('硬件未就绪或对话处理中 · 手机静音');
      return;
    }
    const now = this.port.now();
    // Never queue old coaching behind a conversation or repeatedly interrupt the same observation.
    if (this.active || now - this.lastStarted < 5000 || (text === this.lastText && now - this.lastStarted < 20000)) return;
    const active = { controller: new AbortController(), connection };
    this.active = active; this.lastStarted = now; this.lastText = text;
    this.port.status('手机合成 → 正在传给硬件');
    try {
      await this.port.speak(text, active.controller.signal);
      if (this.active !== active || active.controller.signal.aborted) return;
      if (connection !== this.port.connection() || !this.port.available()) { this.stop(); return; }
      this.port.status('语音已传给硬件 · 手机静音');
      console.info('[HerMotionVoice] transferred transport=badge_pcm phone_speaker=false heard_by_user=unverified');
    } catch (error) {
      if (this.active === active) this.port.status(`硬件语音未完成 · 手机静音：${String(error).slice(0, 150)}`);
    } finally {
      if (this.active === active) this.active = undefined;
    }
  }

  stop() {
    const active = this.active; this.active = undefined;
    active?.controller.abort();
    if (!this.closed) this.port.status('提示已暂停 · 手机静音');
  }
  stateChanged() {
    if (this.active && (this.active.connection !== this.port.connection() || !this.port.available())) this.stop();
  }
  dispose() { this.closed = true; this.stop(); }
}
