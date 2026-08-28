export type DeviceState = 'BOOT' | 'PAIRING' | 'READY' | 'WORKOUT_RUNNING' | 'PAUSED' | 'NATURE_CAPTURE' | 'UPLOAD_PENDING' | 'SYNC_PENDING' | 'SAFE_STOP';
export type DeviceSignal = 'booted' | 'pair' | 'paired' | 'start_workout' | 'pause' | 'resume' | 'long_press' | 'capture_saved' | 'upload_done' | 'finish_workout' | 'sync_done' | 'danger' | 'reset_safe_stop';

const transitions: Record<DeviceState, Partial<Record<DeviceSignal, DeviceState>>> = {
  BOOT: { booted: 'PAIRING', danger: 'SAFE_STOP' },
  PAIRING: { pair: 'PAIRING', paired: 'READY', danger: 'SAFE_STOP' },
  READY: { start_workout: 'WORKOUT_RUNNING', danger: 'SAFE_STOP' },
  WORKOUT_RUNNING: { pause: 'PAUSED', long_press: 'NATURE_CAPTURE', finish_workout: 'SYNC_PENDING', danger: 'SAFE_STOP' },
  PAUSED: { resume: 'WORKOUT_RUNNING', long_press: 'NATURE_CAPTURE', finish_workout: 'SYNC_PENDING', danger: 'SAFE_STOP' },
  NATURE_CAPTURE: { capture_saved: 'UPLOAD_PENDING', danger: 'SAFE_STOP' },
  UPLOAD_PENDING: { upload_done: 'WORKOUT_RUNNING', danger: 'SAFE_STOP' },
  SYNC_PENDING: { sync_done: 'READY', danger: 'SAFE_STOP' },
  SAFE_STOP: { reset_safe_stop: 'READY' },
};

export function transitionDevice(state: DeviceState, signal: DeviceSignal): DeviceState {
  const next = transitions[state][signal];
  if (!next) throw new Error(`invalid_device_transition:${state}:${signal}`);
  return next;
}
