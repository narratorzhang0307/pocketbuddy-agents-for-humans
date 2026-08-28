import { isFreshVoiceTreeFix, type VoiceTreeFix } from '../pocket-plants/voicePlanting';

export const VOICE_MAP_TIMEOUT_MS = 45_000;
export const VOICE_MAP_READY_MESSAGE = '定位已就绪，可以种树了。';
export type VoiceMapState = {
  inputId: string;
  status: 'opening' | 'locating' | 'ready' | 'failed' | 'cancelled';
  message: string;
};
type PendingRequest = {
  inputId: string;
  resolve: (result: VoiceMapState) => void;
  timer: ReturnType<typeof setTimeout>;
  release: () => void;
};

let state: VoiceMapState | null = null;
let pending: PendingRequest | undefined;
const listeners = new Set<(value: VoiceMapState | null) => void>();
const requests = new Map<string, Promise<VoiceMapState>>();
const foreground = () => typeof document !== 'undefined' && document.visibilityState === 'visible';
const emit = () => { for (const listener of listeners) listener(state); };
export const getVoiceMapState = () => state;

/** Replay only the current state, so lazy-loaded tabs can catch a live request. */
export function subscribeVoiceMapMode(listener: (value: VoiceMapState | null) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => { listeners.delete(listener); };
}

export function isVoiceMapCommand(text: string): boolean {
  const compact = text.replace(/[\s，,。.!！、；;：:]/g, '');
  return /^(?:请|麻烦)?(?:帮我)?(?:进入|打开|切换到)(?:地图模式|真实GPS散步模式)(?:吧)?$/i.test(compact);
}

function finish(inputId: string, status: 'ready' | 'failed' | 'cancelled', message: string): boolean {
  if (!pending || pending.inputId !== inputId) return false;
  const request = pending;
  pending = undefined;
  clearTimeout(request.timer);
  request.release();
  const result = { inputId, status, message };
  state = result;
  emit();
  request.resolve(result);
  return true;
}

export function failVoiceMapMode(inputId: string, message: string): boolean {
  return finish(inputId, 'failed', message);
}
export function cancelVoiceMapMode(inputId: string, message = '已取消这次地图定位，请重新说“进入地图模式”。'): boolean {
  return finish(inputId, 'cancelled', message);
}

/** The real central map claims once, after its map runtime is ready. */
export function claimVoiceMapMode(inputId: string): boolean {
  if (!pending || pending.inputId !== inputId || state?.status !== 'opening' || !foreground()) return false;
  state = { inputId, status: 'locating', message: '已选择男主牵小狗，正在请求手机真实 GPS；首次使用请在手机允许定位。' };
  emit();
  return true;
}

export function reportVoiceMapReady(inputId: string, fix: VoiceTreeFix | null): boolean {
  if (state?.inputId !== inputId || state.status !== 'locating' || !isFreshVoiceTreeFix(fix)) return false;
  if (!foreground()) return cancelVoiceMapMode(inputId);
  return finish(inputId, 'ready', VOICE_MAP_READY_MESSAGE);
}

/** No Agent turn, persisted queue or seed requirement. Permission remains the OS's decision. */
export function tryVoiceMapCommand(text: string, inputId: string, signal?: AbortSignal): Promise<VoiceMapState> | null {
  if (!isVoiceMapCommand(text)) return null;
  const previous = requests.get(inputId);
  if (previous) return previous;
  if (!inputId || signal?.aborted || !foreground()) {
    return Promise.resolve({ inputId, status: 'cancelled', message: '请保持手机 App 前台，再按键说“进入地图模式”。' });
  }
  if (pending) cancelVoiceMapMode(pending.inputId);
  let resolve!: PendingRequest['resolve'];
  const result = new Promise<VoiceMapState>(done => { resolve = done; });
  requests.set(inputId, result);
  if (requests.size > 256) requests.delete(requests.keys().next().value!);
  const abort = () => { cancelVoiceMapMode(inputId); };
  const visibility = () => { if (!foreground()) abort(); };
  pending = { inputId, resolve,
    timer: setTimeout(() => failVoiceMapMode(inputId, '真实 GPS 尚未就绪，未启用种树。请检查定位权限和信号后，重新说“进入地图模式”。'), VOICE_MAP_TIMEOUT_MS),
    release: () => { signal?.removeEventListener('abort', abort); document.removeEventListener('visibilitychange', visibility); },
  };
  signal?.addEventListener('abort', abort, { once: true });
  document.addEventListener('visibilitychange', visibility);
  state = { inputId, status: 'opening', message: '正在打开中间地图，并选择男主牵小狗的真实 GPS 散步模式。' };
  emit();
  return result;
}
