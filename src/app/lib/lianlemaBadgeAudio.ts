import catalog from '../../../public/assets/frost-coach-audio/catalog.json';

export const COACH_AUDIO_PROTOCOL = 'pocket-lianlema-audio/v1';
export const COACH_AUDIO_GAIN = 'max' as const;
export const COACH_AUDIO_CLIPS: Record<string, { path: string; bytes: number; sha256: string; durationMs: number }> = catalog;
type Request = { protocol: string; session: string; id: number; type: 'play' | 'stop'; key?: string };
export interface CoachAudioPort {
  connection(): string | undefined;
  available(): boolean;
  load(key: string, signal: AbortSignal): Promise<Uint8Array>;
  play(pcm: Uint8Array, options: { gain: typeof COACH_AUDIO_GAIN }): Promise<void>;
  stop(): Promise<void>;
  reply(data: Record<string, unknown>): void;
  status(message: string): void;
}

/** The component verifies iframe origin/source; this additionally binds its session and ordered requests. */
export class LianlemaBadgeAudio {
  private lastId = 0;
  private generation = 0;
  private active?: AbortController;
  private activeConnection?: string;
  private stopping: Promise<void> = Promise.resolve();
  private closed = false;
  constructor(private session: string, private port: CoachAudioPort) {}
  async receive(value: unknown): Promise<boolean> {
    if (this.closed || !value || typeof value !== 'object') return false;
    const request = value as Request;
    if (request.protocol !== COACH_AUDIO_PROTOCOL || request.session !== this.session ||
        !Number.isSafeInteger(request.id) || request.id <= this.lastId || request.id > 1_000_000_000 ||
        !['play', 'stop'].includes(request.type) || (request.type === 'play' &&
          (typeof request.key !== 'string' || !Object.prototype.hasOwnProperty.call(COACH_AUDIO_CLIPS, request.key)))) return false;
    this.lastId = request.id;
    this.cancel();
    const generation = this.generation;
    if (request.type === 'stop') { this.port.status('已停止 · 仅吧唧出声'); return true; }
    const connection = this.port.connection();
    if (!connection || !this.port.available()) {
      this.port.status('吧唧未就绪 · 手机保持静音'); this.reply(request.id, 'unavailable'); return true;
    }
    const active = new AbortController(); this.active = active; this.activeConnection = connection;
    const check = () => {
      if (this.closed || active.signal.aborted || generation !== this.generation ||
          connection !== this.port.connection() || !this.port.available()) throw new Error('Coach audio cancelled');
    };
    this.port.status('正在传送教练原声 → 吧唧最高音量');
    try {
      await this.stopping; check();
      const pcm = await this.port.load(request.key!, active.signal); check();
      const started = Date.now();
      console.info(`[FrostCoachAudio] transfer_started clip=${request.key} bytes=${pcm.length}`);
      await this.port.play(pcm, { gain: COACH_AUDIO_GAIN }); check();
      this.reply(request.id, 'transferred');
      this.port.status('教练原声已传给吧唧 · 最高音量档（保留静音）· 手机静音');
      console.info(`[FrostCoachAudio] transferred clip=${request.key} bytes=${pcm.length} transfer_ms=${Date.now() - started} heard_by_user=unverified`);
    } catch {
      this.reply(request.id, 'cancelled');
      if (generation === this.generation) this.port.status('语音已暂停或传送失败 · 手机保持静音');
    } finally {
      if (generation === this.generation) { this.active = undefined; this.activeConnection = undefined; }
    }
    return true;
  }
  private reply(id: number, status: string) {
    if (!this.closed) this.port.reply({ protocol: COACH_AUDIO_PROTOCOL, session: this.session, type: 'result', id, status });
  }
  private cancel() {
    ++this.generation; this.active?.abort(); this.active = undefined; this.activeConnection = undefined;
    // Serialize resets so an older stop cannot cut off the next clip after its download completes.
    this.stopping = this.stopping.then(() => this.port.stop()).catch(() => {});
  }
  stateChanged() {
    if (this.active && (!this.port.available() || this.activeConnection !== this.port.connection())) {
      this.cancel(); this.port.status('录音、后台或断连：语音暂停 · 手机静音');
    }
  }
  dispose() { this.closed = true; this.cancel(); }
}

const cached = new Map<string, Uint8Array>();
/** Packaged original recordings only. No caller-controlled URL, network TTS or phone Audio element. */
export async function loadCoachPcm(key: string, signal: AbortSignal): Promise<Uint8Array> {
  if (!Object.prototype.hasOwnProperty.call(COACH_AUDIO_CLIPS, key)) throw new Error('Unknown coach clip');
  const clip = COACH_AUDIO_CLIPS[key];
  const hit = cached.get(key);
  if (hit) return hit;
  const response = await fetch(clip.path, { signal });
  if (!response.ok) throw new Error('Coach audio asset unavailable');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length !== clip.bytes || bytes.length > 960000 || bytes.length % 2) throw new Error('Invalid coach audio');
  const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
  if (sha !== clip.sha256) throw new Error('Coach audio integrity failure');
  if (cached.size >= 8) cached.delete(cached.keys().next().value!);
  cached.set(key, bytes);
  return bytes;
}
