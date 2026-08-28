import { EXERCISES, type SupportedExercise } from '../types';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const KEY = 'pocket.lianlema.camera-analysis-consent.v1:';
function localStore(): Store | undefined {
  try { return typeof window === 'undefined' ? undefined : window.localStorage; } catch { return; }
}
function scope(base: string): string {
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid model scope');
  return url.origin + url.pathname.replace(/\/+$/, '');
}

/** A user preference for this exact analysis endpoint, not a replacement for OS camera permission. */
export function rememberedTraining(base: string, storage = localStore()): SupportedExercise | undefined {
  try {
    const value = JSON.parse(storage?.getItem(KEY + scope(base)) || 'null');
    if (value?.version === 1 && EXERCISES.some(exercise => exercise.value === value.exercise)) return value.exercise;
  } catch { /* Unavailable/corrupt storage means ask again. */ }
  return undefined;
}
export function rememberTraining(base: string, exercise: SupportedExercise, storage = localStore()): void {
  try { storage?.setItem(KEY + scope(base), JSON.stringify({ version: 1, exercise })); } catch { /* Session still works. */ }
}
export function forgetTraining(base: string, storage = localStore()): void {
  try { storage?.removeItem(KEY + scope(base)); } catch { /* OS permission remains authoritative. */ }
}

/** Consume an explicit embedded launch once; reload/back must not silently start the same camera task. */
export function consumeFrostTraining(search: string, embedded: boolean, foreground: boolean, storage: Store | undefined): boolean {
  if (!embedded || !foreground || !storage) return false;
  const params = new URLSearchParams(search), runId = params.get('frostRunId') || '';
  if (params.get('embed') !== 'frost' || params.get('frostAutoStart') !== '1' || !runId || runId.length > 256 ||
      !['capacitor://localhost', 'https://pocketbuddy.throughtheglass.art'].includes(params.get('frostParentOrigin') || '')) return false;
  try {
    const key = 'pocket.lianlema.consumed-starts.v1';
    const parsed = JSON.parse(storage.getItem(key) || '[]');
    const seen: string[] = Array.isArray(parsed) ? parsed.filter(value => typeof value === 'string').slice(-31) : [];
    if (seen.includes(runId)) return false;
    storage.setItem(key, JSON.stringify([...seen, runId]));
    return true;
  } catch { return false; }
}

export function reportTrainingStage(type: 'camera-ready' | 'frame-analyzed' | 'training-stopped' | 'camera-blocked'): void {
  if (typeof window === 'undefined' || window.parent === window) return;
  const params = new URLSearchParams(window.location.search);
  if (params.get('embed') !== 'frost') return;
  const origin = params.get('frostParentOrigin');
  if (!['capacitor://localhost', 'https://pocketbuddy.throughtheglass.art'].includes(origin || '')) return;
  window.parent.postMessage({ protocol: 'pocket-lianlema/v1', type, runId: params.get('frostRunId') },
    origin === 'capacitor://localhost' ? '*' : origin!);
}

export function reportTrainingCompletion(workout: { input_mode: 'live'; duration_sec: number; exercise_name: string; total_reps: number; observed_frames: number }): void {
  if (typeof window === 'undefined' || window.parent === window) return;
  const params = new URLSearchParams(window.location.search), origin = params.get('frostParentOrigin');
  if (params.get('embed') !== 'frost' || !params.get('frostRunId') || !['capacitor://localhost', 'https://pocketbuddy.throughtheglass.art'].includes(origin || '')) return;
  window.parent.postMessage({ protocol: 'pocket-lianlema/v1', type: 'workout-completed', runId: params.get('frostRunId'), workout }, origin === 'capacitor://localhost' ? '*' : origin!);
}
