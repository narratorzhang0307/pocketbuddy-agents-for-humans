export const MAP_AGENT_REFERENCE_ZOOM = 18.9;
export const MAP_AGENT_MIN_SCALE = 0.25;
export const MAP_AGENT_MAX_SCALE = 1.85;
export const MAP_AGENT_MIN_PIXEL_RATIO = 1.5;
export const MAP_AGENT_MAX_PIXEL_RATIO = 2;
export const LIVE_OUTING_MIN_VISUAL_SCALE = 0.9;
export const LIVE_OUTING_MAX_VISUAL_SCALE = 1.45;

export function mapAgentScaleAtZoom(zoom: number) {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(
    MAP_AGENT_MAX_SCALE,
    Math.max(
      MAP_AGENT_MIN_SCALE,
      2 ** (zoom - MAP_AGENT_REFERENCE_ZOOM),
    ),
  );
}

export function mapAgentPixelRatio(devicePixelRatio: number) {
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) {
    return MAP_AGENT_MIN_PIXEL_RATIO;
  }
  return Math.min(
    MAP_AGENT_MAX_PIXEL_RATIO,
    Math.max(MAP_AGENT_MIN_PIXEL_RATIO, devicePixelRatio),
  );
}

/**
 * Live companions are game characters, not survey markers. Keep them readable
 * when the user zooms out, while still allowing a little close-up growth.
 */
export function liveOutingVisualScaleAtZoom(zoom: number) {
  return Math.min(
    LIVE_OUTING_MAX_VISUAL_SCALE,
    Math.max(LIVE_OUTING_MIN_VISUAL_SCALE, mapAgentScaleAtZoom(zoom)),
  );
}

export function liveOutingFrameInterval(
  moving: boolean,
  companionCount: number,
  desktopPreview: boolean,
  reducedMotion = false,
) {
  const safeCompanionCount = Number.isFinite(companionCount)
    ? Math.max(1, Math.floor(companionCount))
    : 1;
  let framesPerSecond: number;

  if (desktopPreview) {
    framesPerSecond = moving ? 18 : 12;
  } else if (moving) {
    framesPerSecond = safeCompanionCount >= 4 ? 24 : 30;
  } else {
    framesPerSecond = safeCompanionCount >= 3 ? 15 : 20;
  }

  if (reducedMotion) framesPerSecond = Math.min(framesPerSecond, 12);
  return 1000 / framesPerSecond;
}
