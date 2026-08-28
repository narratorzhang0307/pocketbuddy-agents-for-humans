/** Local presentation only: no BLE commands, recording, widgets or network updates. */
export const FROST_ARRIVAL_ATLAS = '/assets/frost-arrival/20260828-v1/atlas.webp';
export const FROST_ARRIVAL_DURATION = 5_000;
export const FROST_ARRIVAL_LOADING_LIMIT = 6_000;
export type FrostArrivalPhase = 'run' | 'wag' | 'approach' | 'greet' | 'settle' | 'done';

export function frostArrivalAt(elapsed: number): { phase: FrostArrivalPhase; frame: number; travel: number } {
  const time = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0);
  if (time < 1_600) {
    const progress = time / 1_600;
    return { phase: 'run', frame: Math.floor(time / 100) % 4, travel: Math.pow(1 - progress, 1.5) };
  }
  if (time < 2_900) return { phase: 'wag', frame: 4 + Math.floor((time - 1_600) / 160) % 4, travel: 0 };
  if (time < 3_800) return { phase: 'approach', frame: 8 + Math.floor((time - 2_900) / 225), travel: 0 };
  if (time < 4_450) {
    const greeting = time - 3_800;
    const frame = greeting < 130 ? 12 : greeting < 230 ? 13 : greeting < 330 ? 14
      : greeting < 420 ? 13 : greeting < 540 ? 15 : 12;
    return { phase: 'greet', frame, travel: 0 };
  }
  return { phase: time < FROST_ARRIVAL_DURATION ? 'settle' : 'done', frame: 12, travel: 0 };
}

export function frostArrivalPosition(frame: number): string {
  const index = Math.max(0, Math.min(15, Math.trunc(Number.isFinite(frame) ? frame : 12)));
  return `${(index % 4) * 100 / 3}% ${Math.floor(index / 4) * 100 / 3}%`;
}
