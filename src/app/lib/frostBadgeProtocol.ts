// Agent_link v1 + documented Frost OJBadge extensions. This module never executes agent tools.
export const BADGE_IDENTITY = 'ab883c83-3fcc-4a0f-a951-e18d0c944da4';
export const BADGE_STATES = ['sleep', 'idle', 'busy', 'attention', 'celebrate', 'dizzy', 'heart'] as const;
export type BadgePose = typeof BADGE_STATES[number];
export interface BadgeFrame { kind: number; command: number; sequence: number; payload: Uint8Array }

export function parseBadgeFrame(bytes: Uint8Array): BadgeFrame {
  if (bytes.length < 6 || bytes[0] !== 1 || ![1, 2, 3].includes(bytes[1])) throw new Error('无效的吧唧协议帧');
  const length = bytes[4] | bytes[5] << 8;
  if (bytes.length !== length + 6) throw new Error('吧唧协议帧长度不符');
  return { kind: bytes[1], command: bytes[2], sequence: bytes[3], payload: bytes.slice(6) };
}

export function badgeCommand(command: number, sequence: number, payload = new Uint8Array()): Uint8Array {
  if (payload.length > 480) throw new Error('控制包过长');
  return Uint8Array.from([1, 1, command, sequence, payload.length & 255, payload.length >> 8, ...payload]);
}

export function badgeActuation(id: string, args: Uint8Array): Uint8Array {
  const name = new TextEncoder().encode(id);
  if (!name.length || name.length > 63) throw new Error('无效的硬件端点');
  return Uint8Array.from([name.length, ...name, ...args]);
}

export class BadgeManifest {
  private bytes: number[] = [];
  private next = 0;
  reset() { this.bytes = []; this.next = 0; }
  push(p: Uint8Array): { caps: number; io: { id: string }[] } | undefined {
    if (p.length < 2 || p[1] > 1) throw new Error('无效的能力清单片段');
    if (p[0] === 0) this.reset();
    if (p[0] !== this.next++) { this.reset(); throw new Error('能力清单丢包，请重新连接'); }
    this.bytes.push(...p.slice(2));
    if (this.bytes.length > 32768) { this.reset(); throw new Error('能力清单超过限制'); }
    if (!p[1]) return;
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(this.bytes)));
    this.reset();
    if (!value || typeof value !== 'object' || !('io' in value) || !Array.isArray(value.io) ||
        !value.io.every((io: unknown) => !!io && typeof io === 'object' && 'id' in io && typeof io.id === 'string')) {
      throw new Error('无效的能力清单');
    }
    return value as { caps: number; io: { id: string }[] };
  }
}

export interface BadgeBattery { valid: boolean; percent: number | null; millivolts: number; milliamps: number; charging: boolean; full: boolean }
export function parseBadgeBattery(p: Uint8Array): BadgeBattery {
  if (p.length !== 10 || p[0] !== 1 || p[1] !== 2) throw new Error('无效的电量数据');
  const view = new DataView(p.buffer, p.byteOffset, p.byteLength);
  const flags = view.getUint16(8, true);
  const valid = p[2] === 1 && p[3] <= 100;
  const milliamps = view.getInt16(6, true);
  return { valid, percent: valid ? p[3] : null, millivolts: view.getUint16(4, true), milliamps,
    charging: valid && milliamps > 10, full: valid && !!(flags & 0x200) };
}

export class BadgeRecording {
  private session: number | undefined;
  private sequence = 0;
  private chunks: Uint8Array[] = [];
  bytes = 0;
  error: string | undefined;
  push(p: Uint8Array) {
    if (this.error) return;
    if (p.length < 9 || (p.length - 9) % 2) { this.error = '语音包格式错误'; return; }
    const view = new DataView(p.buffer, p.byteOffset, p.byteLength);
    const session = view.getUint32(0, true), sequence = view.getUint32(4, true);
    if (this.session === undefined) this.session = session;
    if (session !== this.session || sequence !== this.sequence++) { this.error = '语音丢包或会话不符'; return; }
    if (this.bytes + p.length - 9 > 960000) { this.error = '录音超过 30 秒限制'; return; }
    const pcm = p.slice(9);
    this.chunks.push(pcm); this.bytes += pcm.length;
  }
  finish(expectedSamples: number): Uint8Array {
    if (this.error || this.bytes !== expectedSamples * 2 || this.bytes === 0) throw new Error(this.error || '录音不完整或为空');
    const result = new Uint8Array(this.bytes);
    let offset = 0;
    for (const chunk of this.chunks) { result.set(chunk, offset); offset += chunk.length; }
    return result;
  }
}

export function pcmWave(pcm: Uint8Array): Uint8Array {
  if (pcm.length % 2) throw new Error('PCM 必须包含完整采样');
  const wave = new Uint8Array(44 + pcm.length), v = new DataView(wave.buffer);
  const word = (offset: number, text: string) => wave.set(new TextEncoder().encode(text), offset);
  word(0, 'RIFF'); v.setUint32(4, 36 + pcm.length, true); word(8, 'WAVE'); word(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  word(36, 'data'); v.setUint32(40, pcm.length, true); wave.set(pcm, 44);
  return wave;
}

export function badgeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
export function badgeBytes(base64: string): Uint8Array { return Uint8Array.from(atob(base64), c => c.charCodeAt(0)); }
