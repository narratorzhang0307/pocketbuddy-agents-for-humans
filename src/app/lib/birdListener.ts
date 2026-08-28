import catalog from '../../../native/frost-badge/ios/BirdCatalog.json';
export const BIRD_ASSETS = catalog;
export interface BirdStatus {
  enabled: boolean; active: boolean; busy: boolean; state: string; message: string;
  speciesId?: string; name?: string; confidence?: number; imageUrl?: string;
  stage?: 'preparing' | 'ready' | 'recording' | 'receiving' | 'validating' | 'transcribing' | 'recognizing' | 'downloading' | 'returning' | 'complete';
  captureId?: string; captureSource?: 'bird' | 'voice';
  receivedBytes?: number; expectedBytes?: number; audioPackets?: number; audioComplete?: boolean;
  peak?: number; dropped?: number; stopReason?: number; httpStatus?: number; modelAudioBytes?: number; imageApplied?: boolean;
}
export function birdIntent(text: string): 'start' | 'stop' | null {
  const t = text.replace(/\s/g, '');
  // Keep in sync with BirdWire.intent: locked-screen ASR never runs this JS.
  const bird = '(?:识鸟|(?:小)?鸟(?:类|儿)?的?(?:叫声|声音|叫|声))';
  if (new RegExp(`(退出|停止|关闭|取消).*${bird}`).test(t)) return 'stop';
  if (new RegExp(`(不要|(?<!识)别|不想|不用).*${bird}`).test(t)) return null;
  return new RegExp(`识鸟|(?:识别|打开|调用|调取|进入|启动).*${bird}|听.*(什么鸟|哪种鸟)|${bird}.*识别`).test(t) ? 'start' : null;
}

/** Native ASR can open Bird without a main-Agent turn; defer only the UI while locked. */
export function createBirdSessionNavigation(options: { isActive(): boolean; open(target: string): void }) {
  let opened = false;
  return (bird?: BirdStatus): boolean => {
    if (!bird?.active) { opened = false; return false; }
    if (opened || !options.isActive()) return false;
    opened = true;
    options.open('frost-bird-listener');
    return true;
  };
}

/** Arm once per page/connection, after the capability manifest arrives. Never starts capture. */
export function createBirdSkillAutoStart(start: () => void) {
  let attemptedConnection: string | undefined;
  return (badge: { status: string; connectionId?: string; endpoints: string[]; recording: boolean; bird?: BirdStatus }): boolean => {
    if (badge.status !== 'connected' || !badge.connectionId) return false;
    if (badge.bird?.active) { attemptedConnection = badge.connectionId; return false; }
    if (attemptedConnection === badge.connectionId || badge.bird?.busy || badge.recording || !badge.endpoints.length) return false;
    // Mark before starting: permission/status updates, failure and explicit exit must not retrigger.
    attemptedConnection = badge.connectionId;
    start();
    return true;
  };
}
