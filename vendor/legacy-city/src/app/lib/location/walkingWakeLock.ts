type WakeLockSentinelLike = {
  release: () => Promise<void>;
  addEventListener?: (type: 'release', listener: () => void) => void;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>;
  };
};

export type WalkingWakeLock = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

/**
 * Keeps an installed iOS/Android PWA awake during a foreground walk. Browsers
 * without Screen Wake Lock simply continue without it.
 */
export function createWalkingWakeLock(): WalkingWakeLock {
  let active = false;
  let sentinel: WakeLockSentinelLike | null = null;
  let acquiring = false;
  const pageIsHidden = () => document.visibilityState === 'hidden';

  const acquire = async () => {
    const wakeLock = (navigator as NavigatorWithWakeLock).wakeLock;
    if (
      !active ||
      sentinel ||
      acquiring ||
      !wakeLock ||
      pageIsHidden()
    ) {
      return;
    }
    acquiring = true;
    try {
      const next = await wakeLock.request('screen');
      if (
        !active ||
        sentinel ||
        pageIsHidden()
      ) {
        await next.release().catch(() => {});
        return;
      }
      sentinel = next;
      next.addEventListener?.('release', () => {
        if (sentinel !== next) return;
        sentinel = null;
        if (active && !pageIsHidden()) void acquire();
      });
    } catch {
      // Wake Lock is an enhancement; location remains usable if the OS refuses.
    } finally {
      acquiring = false;
    }
  };

  const handleVisibility = () => {
    if (document.visibilityState === 'visible') void acquire();
  };

  return {
    async start() {
      if (active) return;
      active = true;
      document.addEventListener('visibilitychange', handleVisibility);
      await acquire();
    },
    async stop() {
      active = false;
      document.removeEventListener('visibilitychange', handleVisibility);
      const current = sentinel;
      sentinel = null;
      await current?.release().catch(() => {});
    },
  };
}
