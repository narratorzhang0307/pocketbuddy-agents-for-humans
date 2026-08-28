import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { BadgeStatus } from './frostBadge';
import type { BadgePose } from './frostBadgeProtocol';
import { BADGE_AVATAR_ENDPOINT, skillAvatarFor } from './skill/avatars';

export interface PresenceStatus {
  available: boolean; sharedContainer: boolean; synced: boolean;
  activitiesEnabled: boolean; active: boolean; endsAt?: number; openCompanion?: boolean;
}
export interface PublicPresence {
  avatarIndex: number; name: string; pose: BadgePose; battery: number | null; connected: boolean;
}
interface NativePresence {
  status(): Promise<PresenceStatus>;
  sync(data: PublicPresence): Promise<void>;
  start(): Promise<void>;
  end(): Promise<void>;
  addListener(event: 'open' | 'shake', listener: () => void): Promise<PluginListenerHandle>;
}
export const nativePresence = registerPlugin<NativePresence>('PocketPresence');
export const presenceAvailable = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
  && Capacitor.isPluginAvailable('PocketPresence');
export const emptyPresenceStatus: PresenceStatus = {
  available: false, sharedContainer: false, synced: false, activitiesEnabled: false, active: false,
};
export const PRESENCE_OPEN = 'pocketbuddy:presence-open';
export function openPresence() { window.dispatchEvent(new Event(PRESENCE_OPEN)); }

/** Explicit allowlist, not a spread of the Agent or badge snapshot. */
export function publicPresence(avatarId: string, pose: BadgePose, badge: BadgeStatus): PublicPresence {
  const avatar = skillAvatarFor(avatarId);
  const percent = badge.battery?.percent;
  return { avatarIndex: avatar.badgeIndex, name: avatar.name, pose,
    connected: badge.status === 'connected',
    battery: badge.status === 'connected' && badge.battery?.valid && Number.isInteger(percent)
      && percent! >= 0 && percent! <= 100 ? percent! : null };
}
let syncQueue: Promise<void> = Promise.resolve();
export function syncPresence(data: PublicPresence) {
  const next = syncQueue.catch(() => {}).then(() => nativePresence.sync(data));
  syncQueue = next; return next;
}

export function arrivalBlockReason(badge: BadgeStatus, avatarIndex: number): string | undefined {
  if (badge.status !== 'connected' || !badge.connectionId) return '先在「电子吧唧」中连接设备。';
  if (badge.recording || badge.bird?.active || badge.bird?.busy) return '先结束录音或识鸟，再接过伙伴。';
  if (!badge.endpoints.includes(BADGE_AVATAR_ENDPOINT)) return '当前固件不支持角色同步。';
  if (badge.avatar?.status !== 'ready' || badge.avatar.index !== avatarIndex) return '等待当前角色同步到吧唧后再试。';
}

/** A new gesture on the same, ready connection only. No recording, approval or AI action. */
export class ArrivalGate {
  private pending?: { connectionId: string; avatarIndex: number; touch?: number; until: number };
  arm(badge: BadgeStatus, avatarIndex: number, now = Date.now()) {
    const error = arrivalBlockReason(badge, avatarIndex);
    if (error) throw new Error(error);
    this.pending = { connectionId: badge.connectionId!, avatarIndex, touch: badge.lastTouch?.count, until: now + 20_000 };
  }
  cancel() { this.pending = undefined; }
  isArmed(badge: BadgeStatus, avatarIndex: number, now = Date.now()) {
    if (this.pending && (now >= this.pending.until || badge.connectionId !== this.pending.connectionId
      || avatarIndex !== this.pending.avatarIndex || arrivalBlockReason(badge, avatarIndex))) this.cancel();
    return !!this.pending;
  }
  accept(source: 'touch' | 'shake', badge: BadgeStatus, avatarIndex: number, now = Date.now()) {
    if (!this.isArmed(badge, avatarIndex, now)) return false;
    if (source === 'touch' && (badge.lastTouch?.count === undefined || badge.lastTouch.count === this.pending!.touch)) return false;
    this.cancel(); return true;
  }
}
