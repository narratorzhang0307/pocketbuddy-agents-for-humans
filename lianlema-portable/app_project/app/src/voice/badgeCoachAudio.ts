/** Embedded audio requests contain only an existing clip key, never a URL or task command. */
export const BADGE_AUDIO_PROTOCOL = 'pocket-lianlema-audio/v1';
export interface BadgeAudioReply { protocol: string; session: string; id: number; type: string; status: string }
interface Port {
  session: string;
  post(data: unknown): void;
  listen(receive: (data: BadgeAudioReply) => void): () => void;
}

export class BadgeCoachAudio {
  private sequence = 0;
  private pending?: { id: number; resolve(): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> };
  private unlisten: () => void;
  constructor(private port: Port) {
    this.unlisten = port.listen(data => {
      if (!data || data.protocol !== BADGE_AUDIO_PROTOCOL || data.session !== port.session ||
          data.type !== 'result' || data.id !== this.pending?.id) return;
      const pending = this.pending;
      if (!pending) return;
      this.pending = undefined; clearTimeout(pending.timer);
      if (data.status === 'transferred') pending.resolve();
      else pending.reject(new Error('吧唧语音未播放；不会切回手机扬声器'));
    });
  }
  play(key: string): Promise<void> {
    this.cancelPending();
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending?.id !== id) return;
        this.stop();
      }, 45000);
      this.pending = { id, resolve, reject, timer };
      this.port.post({ protocol: BADGE_AUDIO_PROTOCOL, session: this.port.session, type: 'play', id, key });
    });
  }
  private cancelPending() {
    const pending = this.pending; this.pending = undefined;
    if (pending) { clearTimeout(pending.timer); pending.reject(new Error('教练语音已取消')); }
  }
  stop() {
    this.cancelPending();
    this.port.post({ protocol: BADGE_AUDIO_PROTOCOL, session: this.port.session, type: 'stop', id: ++this.sequence });
  }
  dispose() { this.stop(); this.unlisten(); }
}

const params = typeof window === 'undefined' ? undefined : new URLSearchParams(window.location.search);
// An invalid/missing host handshake must stay silent, not fall through to expo-av.
export const badgeAudioRequested = params?.get('embed') === 'frost' && params.get('frostAudio') === 'badge-v1';
function embeddedOutput(): BadgeCoachAudio | undefined {
  if (!badgeAudioRequested || typeof window === 'undefined' || window.parent === window) return;
  const session = params?.get('frostAudioSession') || '';
  const parentOrigin = params?.get('frostParentOrigin');
  if (!/^[a-f0-9-]{36}$/.test(session) || !['capacitor://localhost', 'https://pocketbuddy.throughtheglass.art'].includes(parentOrigin || '')) return;
  return new BadgeCoachAudio({ session,
    // WKWebView custom schemes can have an opaque origin. Only public clip IDs cross this message.
    post: data => window.parent.postMessage(data, parentOrigin === 'capacitor://localhost' ? '*' : parentOrigin!),
    listen: receive => {
      const listener = (event: MessageEvent) => {
        if (event.source !== window.parent || (event.origin !== parentOrigin && !(parentOrigin === 'capacitor://localhost' && event.origin === 'null'))) return;
        receive(event.data);
      };
      window.addEventListener('message', listener);
      return () => window.removeEventListener('message', listener);
    },
  });
}
export const badgeCoachAudio = embeddedOutput();
