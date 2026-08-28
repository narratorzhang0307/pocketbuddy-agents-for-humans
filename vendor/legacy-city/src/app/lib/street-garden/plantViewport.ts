import type { WorldLayer } from "../city-world/types";

export type ProjectedPixel = {
  getX?: () => unknown;
  getY?: () => unknown;
  x?: unknown;
  y?: unknown;
};

type ViewportSize = {
  width: number;
  height: number;
};

type GardenMarkerViewportInput = {
  layer: WorldLayer;
  pixel: ProjectedPixel | null | undefined;
  viewport: ViewportSize;
  previousVisible: boolean;
  padding?: number;
};

export type GardenMarkerViewportCandidate = {
  id: string;
  pixel: ProjectedPixel | null | undefined;
  priority?: number;
};

type GardenMarkerViewportSelectionInput = {
  layer: WorldLayer;
  candidates: readonly GardenMarkerViewportCandidate[];
  viewport: ViewportSize;
  maxVisible: number;
  minSpacing: number;
  padding?: number;
};

export const GARDEN_MARKER_VIEWPORT_PADDING = 240;

const readFiniteNumber = (value: unknown): number | null => {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

function readPixelCoordinate(
  pixel: ProjectedPixel | null | undefined,
  axis: "x" | "y",
) {
  if (!pixel) return null;
  const getter = axis === "x" ? pixel.getX : pixel.getY;
  const raw = pixel[axis] ?? getter?.call(pixel);
  return readFiniteNumber(raw);
}

export function resolveGardenMarkerViewportVisibility({
  layer,
  pixel,
  viewport,
  previousVisible: _previousVisible,
  padding = GARDEN_MARKER_VIEWPORT_PADDING,
}: GardenMarkerViewportInput): boolean {
  if (layer !== "public") return true;

  const x = readPixelCoordinate(pixel, "x");
  const y = readPixelCoordinate(pixel, "y");
  const width = readFiniteNumber(viewport.width);
  const height = readFiniteNumber(viewport.height);
  const safePadding = readFiniteNumber(padding);
  if (
    x === null ||
    y === null ||
    width === null ||
    height === null ||
    width <= 0 ||
    height <= 0 ||
    safePadding === null ||
    safePadding < 0
  ) {
    // Projection and container geometry are briefly unavailable while AMap
    // boots or rebuilds its camera. Keeping an earlier `true` value here can
    // leave every marker attached forever when Android misses the first
    // `complete` event, so public markers fail closed and the next sync pass
    // restores the genuinely visible set.
    return false;
  }

  return (
    x >= -safePadding &&
    x <= width + safePadding &&
    y >= -safePadding &&
    y <= height + safePadding
  );
}

/**
 * Selects a bounded, spatially separated set of public garden markers.
 *
 * AMap's Android WebView/standalone-PWA startup can briefly project many
 * distinct coordinates onto one pixel. The degenerate-projection guard keeps
 * that frame empty; scheduled camera syncs populate it once projection is
 * trustworthy. The hard budget is a final rendering invariant, independent
 * of SDK timing and device pixel ratio.
 */
export function selectGardenMarkerViewportIds({
  layer,
  candidates,
  viewport,
  maxVisible,
  minSpacing,
  padding,
}: GardenMarkerViewportSelectionInput): Set<string> {
  if (layer !== "public") {
    return new Set(candidates.map((candidate) => candidate.id));
  }

  const width = readFiniteNumber(viewport.width);
  const height = readFiniteNumber(viewport.height);
  const safeMaxVisible = Math.max(0, Math.floor(maxVisible));
  const safeMinSpacing = Math.max(0, minSpacing);
  if (
    width === null ||
    height === null ||
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(safeMaxVisible) ||
    safeMaxVisible <= 0 ||
    !Number.isFinite(safeMinSpacing)
  ) {
    return new Set();
  }

  const defaultPadding = Math.min(
    GARDEN_MARKER_VIEWPORT_PADDING,
    Math.max(48, width * 0.16),
  );
  const safePadding = readFiniteNumber(padding ?? defaultPadding);
  if (safePadding === null || safePadding < 0) return new Set();

  const projected = candidates.flatMap((candidate) => {
    const x = readPixelCoordinate(candidate.pixel, "x");
    const y = readPixelCoordinate(candidate.pixel, "y");
    if (x === null || y === null) return [];
    return [{
      id: candidate.id,
      x,
      y,
      priority: readFiniteNumber(candidate.priority) ?? 0,
      inside: x >= 0 && x <= width && y >= 0 && y <= height,
      distanceToCenter: Math.hypot(x - width / 2, y - height / 2),
    }];
  });

  if (projected.length >= 4) {
    const uniquePixels = new Set(
      projected.map(({ x, y }) => `${Math.round(x * 2)}:${Math.round(y * 2)}`),
    );
    if (uniquePixels.size <= 1) return new Set();
  }

  const ordered = projected
    .filter(
      ({ x, y }) =>
        x >= -safePadding &&
        x <= width + safePadding &&
        y >= -safePadding &&
        y <= height + safePadding,
    )
    .sort((left, right) =>
      Number(right.inside) - Number(left.inside) ||
      right.priority - left.priority ||
      left.distanceToCenter - right.distanceToCenter ||
      left.id.localeCompare(right.id),
    );

  const selected: typeof ordered = [];
  for (const candidate of ordered) {
    if (selected.length >= safeMaxVisible) break;
    const overlaps = selected.some(
      (existing) =>
        Math.hypot(candidate.x - existing.x, candidate.y - existing.y) <
        safeMinSpacing,
    );
    if (!overlaps) selected.push(candidate);
  }

  return new Set(selected.map((candidate) => candidate.id));
}
