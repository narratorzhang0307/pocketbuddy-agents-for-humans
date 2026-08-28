import { getPocketBuddyCharacterPackage } from './buddyPackages.generated';
import { horizontalMapBuddyAvoidanceOffset } from './mapBuddyPlantAvoidance';

type MapBuddyMotionOptions = {
  initialDelayMs?: number;
  dialogueIntervalMs?: number;
  dialogueDurationMs?: number;
};

let activeSpeakingHost: HTMLElement | null = null;
let activeSpeakingTimer = 0;
let activeFrameTimer = 0;
let activeFrameImage: HTMLImageElement | null = null;
let activeFrameOriginalUrl = '';
const spotlightFrameTimers = new Map<HTMLElement, number>();
const spotlightFrameIndexes = new Map<HTMLElement, number>();

function spotlightTargetCount() {
  const mobile = window.matchMedia?.('(max-width: 700px), (pointer: coarse)').matches;
  // 地图上的角色均来自已有动图包；手机默认页也至少同时展示九只放大角色。
  return mobile ? 9 : 12;
}
const SPOTLIGHT_MIN_DURATION_MS = 20_000;
const SPOTLIGHT_MAX_DURATION_MS = 60_000;
const SPOTLIGHT_COOLDOWN_MS = 15_000;
const SPOTLIGHT_FALLBACK_SCALE = 2.45;
const COLLISION_PADDING = 5;
const COLLISION_SETTLE_MS = 1_200;
const LIVE_OUTING_COLLISION_SELECTOR = '[data-map-avatar-collision-zone="true"]';
const MAP_PLANT_COLLISION_SELECTOR =
  '.city-buddy-garden-anchor.is-screen-visible .city-buddy-garden-home__plant, '
  + '.sg-map-plant.is-in-viewport .sg-game-sprite, '
  + '[data-hangzhou-polaroid-flower], '
  + '.sg-user-pocket-plant';

const spotlightHosts = new Set<HTMLElement>();
const activeSpotlightDeadlines = new Map<HTMLElement, number>();
const spotlightCooldowns = new Map<HTMLElement, number>();
let spotlightTimer = 0;
let spotlightVisibilityTimer = 0;
let spotlightSettleTimer = 0;
let spotlightRandomState = Date.now() >>> 0;

function restoreActivePackageFrame() {
  window.clearTimeout(activeFrameTimer);
  activeFrameTimer = 0;
  const spotlightHost = activeFrameImage?.closest<HTMLElement>(
    '.is-map-buddy-spotlight',
  );
  if (activeFrameImage?.isConnected && activeFrameOriginalUrl && !spotlightHost) {
    activeFrameImage.src = activeFrameOriginalUrl;
  }
  activeFrameImage = null;
  activeFrameOriginalUrl = '';
}

function stopSpotlightFrameMotion(host: HTMLElement, restorePortrait = true) {
  const timer = spotlightFrameTimers.get(host);
  if (timer) window.clearInterval(timer);
  spotlightFrameTimers.delete(host);
  spotlightFrameIndexes.delete(host);
  if (!restorePortrait) return;
  const characterPackage = getPocketBuddyCharacterPackage(
    host.dataset.pocketBuddyPackageId,
  );
  const image = host.querySelector<HTMLImageElement>(
    '.city-buddy-garden-home__buddy, .magical-animal-map-marker__sprite',
  );
  if (
    characterPackage
    && image
    && host.dataset.mapAssetVisible !== 'false'
  ) {
    image.src = characterPackage.visual.portraitUrl;
  }
}

function startSpotlightFrameMotion(host: HTMLElement) {
  stopSpotlightFrameMotion(host, false);
  const characterPackage = getPocketBuddyCharacterPackage(
    host.dataset.pocketBuddyPackageId,
  );
  const image = host.querySelector<HTMLImageElement>(
    '.city-buddy-garden-home__buddy, .magical-animal-map-marker__sprite',
  );
  if (
    !characterPackage
    || !image
    || host.dataset.mapAssetVisible === 'false'
  ) {
    return;
  }
  const advance = () => {
    const frameIndex = spotlightFrameIndexes.get(host) ?? 0;
    const frame = characterPackage.motion.frames[frameIndex % characterPackage.motion.frames.length];
    image.src = frame.url;
    spotlightFrameIndexes.set(host, frameIndex + 1);
  };
  advance();
  spotlightFrameTimers.set(
    host,
    window.setInterval(advance, Math.max(520, characterPackage.map.action_hold_ms)),
  );
}

type BuddyCollisionRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

function spotlightRandom() {
  spotlightRandomState += 0x6d2b79f5;
  let value = spotlightRandomState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function spotlightDuration() {
  return Math.round(
    SPOTLIGHT_MIN_DURATION_MS +
      spotlightRandom() *
        (SPOTLIGHT_MAX_DURATION_MS - SPOTLIGHT_MIN_DURATION_MS),
  );
}

function releaseSpotlight(host: HTMLElement, addCooldown = true) {
  stopSpotlightFrameMotion(host);
  host.classList.remove('is-map-buddy-spotlight');
  activeSpotlightDeadlines.delete(host);
  if (addCooldown && host.isConnected) {
    spotlightCooldowns.set(host, Date.now() + SPOTLIGHT_COOLDOWN_MS);
  } else {
    spotlightCooldowns.delete(host);
  }
}

function buddyCollisionRect(
  host: HTMLElement,
  enlarged: boolean,
): BuddyCollisionRect | null {
  const visual = host.firstElementChild as HTMLElement | null;
  const stage = host.querySelector<HTMLElement>(
    '.city-buddy-garden-home__buddy-stage, .magical-animal-map-marker__sprite-stage',
  );
  if (!visual || !stage) return null;
  const anchor = host.getBoundingClientRect();
  const actual = stage.getBoundingClientRect();
  const mapScale =
    Number.parseFloat(
      getComputedStyle(visual).getPropertyValue('--map-scale'),
    ) || 1;
  const focusScale = enlarged
    ? Number.parseFloat(
        getComputedStyle(visual).getPropertyValue('--spotlight-scale'),
      ) || SPOTLIGHT_FALLBACK_SCALE
    : 1;
  const width = Math.max(stage.offsetWidth * mapScale * focusScale, actual.width);
  const height = Math.max(
    stage.offsetHeight * mapScale * focusScale,
    actual.height,
  );
  const anchorX = anchor.left + anchor.width / 2;
  const anchorY = anchor.bottom;
  const spotlightOffset = enlarged
    ? Number.parseFloat(
        getComputedStyle(visual).getPropertyValue(
          '--buddy-spotlight-offset-x',
        ),
      ) || 0
    : 0;
  const plantAvoidanceOffset = Number.parseFloat(
    getComputedStyle(visual).getPropertyValue('--map-buddy-avoid-offset-x'),
  ) || 0;
  const centerX =
    anchorX + (spotlightOffset + plantAvoidanceOffset) * mapScale;
  return {
    left: centerX - width / 2 - COLLISION_PADDING,
    top: anchorY - height - COLLISION_PADDING,
    right: centerX + width / 2 + COLLISION_PADDING,
    bottom: anchorY + COLLISION_PADDING,
  };
}

type PlantCollisionObstacle = {
  host: HTMLElement | null;
  rect: BuddyCollisionRect;
};

function mapPlantCollisionObstacles(): PlantCollisionObstacle[] {
  return [...document.querySelectorAll<HTMLElement>(MAP_PLANT_COLLISION_SELECTOR)]
    .map((plant) => {
      const bounds = plant.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return null;
      return {
        host: plant.closest<HTMLElement>('.city-buddy-garden-anchor'),
        rect: {
          left: bounds.left,
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
        },
      } satisfies PlantCollisionObstacle;
    })
    .filter(
      (obstacle): obstacle is PlantCollisionObstacle => obstacle !== null,
    );
}

function overlapsAnotherPlant(
  host: HTMLElement,
  rect: BuddyCollisionRect,
  obstacles = mapPlantCollisionObstacles(),
) {
  return obstacles.some(
    (obstacle) =>
      obstacle.host !== host && collisionRectsOverlap(rect, obstacle.rect),
  );
}

function placeBuddyBesidePlants(
  host: HTMLElement,
  enlarged: boolean,
  obstacles = mapPlantCollisionObstacles(),
) {
  const visual = host.firstElementChild as HTMLElement | null;
  if (!visual) return null;
  visual.style.setProperty('--map-buddy-avoid-offset-x', '0px');
  const baseRect = buddyCollisionRect(host, enlarged);
  if (!baseRect) return null;
  const obstacleRects = obstacles
    .filter((obstacle) => obstacle.host !== host)
    .map((obstacle) => obstacle.rect);
  const screenOffset = horizontalMapBuddyAvoidanceOffset(
    baseRect,
    obstacleRects,
    window.innerWidth,
  );
  const mapScale =
    Number.parseFloat(
      getComputedStyle(visual).getPropertyValue('--map-scale'),
    ) || 1;
  visual.style.setProperty(
    '--map-buddy-avoid-offset-x',
    `${(screenOffset / mapScale).toFixed(1)}px`,
  );
  return buddyCollisionRect(host, enlarged);
}

function collisionRectsOverlap(
  first: BuddyCollisionRect,
  second: BuddyCollisionRect,
) {
  return (
    first.left < second.right &&
    first.right > second.left &&
    first.top < second.bottom &&
    first.bottom > second.top
  );
}

function liveOutingCollisionRects(): BuddyCollisionRect[] {
  return [...document.querySelectorAll<HTMLElement>(LIVE_OUTING_COLLISION_SELECTOR)]
    .map((zone) => {
      const rect = zone.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      // The Three.js canvas is deliberately larger than the visible guide and
      // walking pets. Protect its central/lower footprint without clearing an
      // unnecessarily large empty rectangle around the party.
      const protectedWidth = Math.min(rect.width, Math.max(104, rect.width * 0.72));
      const protectedHeight = Math.min(rect.height, Math.max(118, rect.height * 0.58));
      const centerX = rect.left + rect.width / 2;
      return {
        left: centerX - protectedWidth / 2 - COLLISION_PADDING,
        top: rect.bottom - protectedHeight - COLLISION_PADDING,
        right: centerX + protectedWidth / 2 + COLLISION_PADDING,
        bottom: rect.bottom + COLLISION_PADDING,
      } satisfies BuddyCollisionRect;
    })
    .filter((rect): rect is BuddyCollisionRect => rect !== null);
}

function spotlightFits(host: HTMLElement) {
  const plantObstacles = mapPlantCollisionObstacles();
  const candidate = placeBuddyBesidePlants(host, true, plantObstacles);
  if (!candidate) return false;
  if (overlapsAnotherPlant(host, candidate, plantObstacles)) return false;
  if (
    liveOutingCollisionRects().some((protectedRect) =>
      collisionRectsOverlap(candidate, protectedRect),
    )
  ) {
    return false;
  }
  return [...activeSpotlightDeadlines.keys()].every((activeHost) => {
    const active = buddyCollisionRect(activeHost, true);
    return !active || !collisionRectsOverlap(candidate, active);
  });
}

function removeOverlappingSpotlights() {
  const placed: BuddyCollisionRect[] = liveOutingCollisionRects();
  const plantObstacles = mapPlantCollisionObstacles();
  [...activeSpotlightDeadlines.entries()]
    .sort((first, second) => first[1] - second[1])
    .forEach(([host]) => {
      const rect = placeBuddyBesidePlants(host, true, plantObstacles);
      if (
        !rect
        || overlapsAnotherPlant(host, rect, plantObstacles)
        || placed.some((item) => collisionRectsOverlap(rect, item))
      ) {
        releaseSpotlight(host, false);
        return;
      }
      placed.push(rect);
    });
}

function applyBuddyCollisionVisibility(visibleHosts: HTMLElement[]) {
  const visibleHostSet = new Set(visibleHosts);
  spotlightHosts.forEach((host) => {
    if (!visibleHostSet.has(host)) {
      host.classList.remove('is-map-buddy-collision-suppressed');
    }
  });
  const placed: BuddyCollisionRect[] = liveOutingCollisionRects();
  const plantObstacles = mapPlantCollisionObstacles();
  [...visibleHosts]
    .sort((first, second) => {
      const focusDifference =
        Number(activeSpotlightDeadlines.has(second)) -
        Number(activeSpotlightDeadlines.has(first));
      if (focusDifference !== 0) return focusDifference;
      return (first.dataset.mapBuddyFocusId ?? '').localeCompare(
        second.dataset.mapBuddyFocusId ?? '',
      );
    })
    .forEach((host) => {
      const rect = placeBuddyBesidePlants(
        host,
        activeSpotlightDeadlines.has(host),
        plantObstacles,
      );
      const suppressed =
        !rect
        || overlapsAnotherPlant(host, rect, plantObstacles)
        || placed.some((item) => collisionRectsOverlap(rect, item));
      host.classList.toggle('is-map-buddy-collision-suppressed', suppressed);
      if (!suppressed && rect) placed.push(rect);
      if (suppressed && host === activeSpeakingHost) {
        host.classList.remove('is-speaking');
        activeSpeakingHost = null;
      }
    });
}

function chooseSpotlightHost(visibleHosts: HTMLElement[], now: number) {
  const available = visibleHosts.filter(
    (host) => !activeSpotlightDeadlines.has(host) && spotlightFits(host),
  );
  const visiblePriorityCount = visibleHosts.filter(
    (host) => host.dataset.mapBuddySpotlightPriority === 'true',
  ).length;
  const activePriorityCount = [...activeSpotlightDeadlines.keys()].filter(
    (host) => host.dataset.mapBuddySpotlightPriority === 'true',
  ).length;
  const priorityAvailable = available.filter(
    (host) => host.dataset.mapBuddySpotlightPriority === 'true',
  );
  const preferred = (
    activePriorityCount < Math.min(9, visiblePriorityCount)
    && priorityAvailable.length > 0
  ) ? priorityAvailable : available;
  const rested = preferred.filter(
    (host) => (spotlightCooldowns.get(host) ?? 0) <= now,
  );
  const pool = rested.length > 0 ? rested : preferred;
  if (pool.length === 0) return null;

  const activeGroupCounts = new Map<string, number>();
  activeSpotlightDeadlines.forEach((_deadline, host) => {
    const group = host.dataset.mapBuddyFocusGroup ?? 'map';
    activeGroupCounts.set(group, (activeGroupCounts.get(group) ?? 0) + 1);
  });
  const lowestGroupCount = Math.min(
    ...pool.map(
      (host) =>
        activeGroupCounts.get(host.dataset.mapBuddyFocusGroup ?? 'map') ?? 0,
    ),
  );
  const balancedPool = pool.filter(
    (host) =>
      (activeGroupCounts.get(host.dataset.mapBuddyFocusGroup ?? 'map') ?? 0) ===
      lowestGroupCount,
  );
  return balancedPool[Math.floor(spotlightRandom() * balancedPool.length)];
}

function scheduleNextSpotlightExpiry() {
  window.clearTimeout(spotlightTimer);
  spotlightTimer = 0;
  if (activeSpotlightDeadlines.size === 0) return;
  const nextDeadline = Math.min(...activeSpotlightDeadlines.values());
  spotlightTimer = window.setTimeout(
    reconcileSpotlights,
    Math.max(100, nextDeadline - Date.now()),
  );
}

function reconcileSpotlights() {
  window.clearTimeout(spotlightTimer);
  spotlightTimer = 0;
  const previousSpotlights = new Set(activeSpotlightDeadlines.keys());
  const now = Date.now();
  const visibleHosts = [...spotlightHosts].filter(
    (host) =>
      host.isConnected && host.classList.contains('is-screen-visible'),
  );
  const visibleHostSet = new Set(visibleHosts);
  activeSpotlightDeadlines.forEach((deadline, host) => {
    if (!visibleHostSet.has(host)) releaseSpotlight(host, false);
    else if (deadline <= now) releaseSpotlight(host);
  });
  removeOverlappingSpotlights();

  const targetCount = Math.min(spotlightTargetCount(), visibleHosts.length);
  while (activeSpotlightDeadlines.size < targetCount) {
    const host = chooseSpotlightHost(visibleHosts, now);
    if (!host) break;
    host.classList.add('is-map-buddy-spotlight');
    startSpotlightFrameMotion(host);
    activeSpotlightDeadlines.set(host, now + spotlightDuration());
  }

  applyBuddyCollisionVisibility(visibleHosts);
  scheduleNextSpotlightExpiry();
  const spotlightMembershipChanged =
    previousSpotlights.size !== activeSpotlightDeadlines.size ||
    [...previousSpotlights].some(
      (host) => !activeSpotlightDeadlines.has(host),
    );
  if (spotlightMembershipChanged) queueSettledCollisionCheck();
}

function queueSpotlightReconcile() {
  if (spotlightVisibilityTimer) return;
  spotlightVisibilityTimer = window.setTimeout(() => {
    spotlightVisibilityTimer = 0;
    reconcileSpotlights();
  }, 60);
}

function queueSettledCollisionCheck() {
  window.clearTimeout(spotlightSettleTimer);
  spotlightSettleTimer = window.setTimeout(
    queueSpotlightReconcile,
    COLLISION_SETTLE_MS,
  );
}

export function refreshMapBuddyCollisionLayout() {
  queueSpotlightReconcile();
  queueSettledCollisionCheck();
}

function registerSpotlightHosts(hosts: readonly HTMLElement[]) {
  hosts.forEach((host) => spotlightHosts.add(host));

  return () => {
    hosts.forEach((host) => {
      spotlightHosts.delete(host);
      releaseSpotlight(host, false);
    });
    if (spotlightHosts.size > 0) {
      queueSpotlightReconcile();
      return;
    }
    window.clearTimeout(spotlightTimer);
    window.clearTimeout(spotlightVisibilityTimer);
    window.clearTimeout(spotlightSettleTimer);
    spotlightTimer = 0;
    spotlightVisibilityTimer = 0;
    spotlightSettleTimer = 0;
    activeSpotlightDeadlines.clear();
    spotlightCooldowns.clear();
    spotlightFrameTimers.forEach((timer) => window.clearInterval(timer));
    spotlightFrameTimers.clear();
    spotlightFrameIndexes.clear();
  };
}

/**
 * Runs character motion only while its geographic marker is on screen.
 * Dialogue is scheduled one host at a time, avoiding hundreds of concurrent
 * opacity animations on top of the map canvas.
 */
export function installMapBuddyMotion(
  hosts: readonly HTMLElement[],
  {
    initialDelayMs = 1_800,
    dialogueIntervalMs = 4_800,
    dialogueDurationMs = 2_700,
  }: MapBuddyMotionOptions = {},
) {
  let dialogueTimer = 0;
  let dialogueCursor = 0;
  const hostSet = new Set(hosts);
  const unregisterSpotlightHosts = registerSpotlightHosts(hosts);

  const visibilityObserver =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver((observedEntries) => {
          observedEntries.forEach((entry) => {
            entry.target.classList.toggle(
              'is-screen-visible',
              entry.isIntersecting,
            );
            if (!entry.isIntersecting && entry.target === activeSpeakingHost) {
              activeSpeakingHost.classList.remove('is-speaking');
              activeSpeakingHost = null;
            }
          });
          queueSpotlightReconcile();
        });

  if (visibilityObserver) {
    hosts.forEach((host) => visibilityObserver.observe(host));
  } else {
    hosts.forEach((host) => host.classList.add('is-screen-visible'));
    queueSpotlightReconcile();
  }

  const showNextDialogue = () => {
    activeSpeakingHost?.classList.remove('is-speaking');
    activeSpeakingHost = null;
    window.clearTimeout(activeSpeakingTimer);
    restoreActivePackageFrame();

    const candidates = hosts.filter(
      (host) =>
        host.isConnected &&
        host.classList.contains('is-screen-visible') &&
        !host.classList.contains('is-map-buddy-collision-suppressed'),
    );
    if (candidates.length === 0) return;
    activeSpeakingHost = candidates[dialogueCursor % candidates.length];
    dialogueCursor += 1;
    const characterPackage = getPocketBuddyCharacterPackage(
      activeSpeakingHost.dataset.pocketBuddyPackageId,
    );
    if (characterPackage) {
      const cue =
        characterPackage.dialogue.ambient[
          dialogueCursor % characterPackage.dialogue.ambient.length
        ];
      const speech = activeSpeakingHost.querySelector<HTMLElement>(
        '.city-buddy-garden-home__speech, .magical-animal-map-marker__speech',
      );
      const image = activeSpeakingHost.querySelector<HTMLImageElement>(
        '.city-buddy-garden-home__buddy, .magical-animal-map-marker__sprite',
      );
      const frame = characterPackage.motion.frames.find(
        (entry) => entry.action === cue.action,
      );
      if (speech) speech.textContent = cue.text;
      if (image && frame) {
        activeFrameImage = image;
        activeFrameOriginalUrl = characterPackage.visual.portraitUrl;
        image.src = frame.url;
        activeFrameTimer = window.setTimeout(
          restoreActivePackageFrame,
          characterPackage.map.action_hold_ms,
        );
      }
    }
    activeSpeakingHost.classList.add('is-speaking');
    activeSpeakingTimer = window.setTimeout(() => {
      activeSpeakingHost?.classList.remove('is-speaking');
      activeSpeakingHost = null;
    }, dialogueDurationMs);
  };

  const dialogueEnabled =
    dialogueIntervalMs > 0 && dialogueDurationMs > 0;
  const initialTimer = dialogueEnabled
    ? window.setTimeout(() => {
        showNextDialogue();
        dialogueTimer = window.setInterval(
          showNextDialogue,
          dialogueIntervalMs,
        );
      }, initialDelayMs)
    : 0;

  return () => {
    visibilityObserver?.disconnect();
    unregisterSpotlightHosts();
    window.clearTimeout(initialTimer);
    window.clearInterval(dialogueTimer);
    if (activeSpeakingHost && hostSet.has(activeSpeakingHost)) {
      window.clearTimeout(activeSpeakingTimer);
      restoreActivePackageFrame();
      activeSpeakingHost.classList.remove('is-speaking');
      activeSpeakingHost = null;
    }
    hosts.forEach((host) => {
      host.classList.remove(
        'is-screen-visible',
        'is-speaking',
        'is-map-buddy-spotlight',
        'is-map-buddy-collision-suppressed',
      );
    });
  };
}
