export const GARDEN_CENTER: [number, number] = [120.15462, 30.27249];
export const GARDEN_ZOOM = 17.35;
export const GARDEN_PITCH = 40;
export const GARDEN_ROTATION = -13;

export function readGardenSceneZoom(value: unknown): number | null {
  const zoom = Number(value);
  return Number.isFinite(zoom) ? zoom : null;
}

export function mapMarkerScaleAtZoom(
  zoom: number,
  referenceZoom: number,
  minimumScale: number,
  maximumScale = 1,
) {
  return Math.min(
    maximumScale,
    Math.max(minimumScale, 2 ** (zoom - referenceZoom)),
  );
}

export function gardenPostcardMapScale(
  mapScale: number,
  hostBaseScale: number,
  minimumHostScale: number,
) {
  return Math.max(mapScale, minimumHostScale / hostBaseScale);
}

export function gardenPostcardOffsetAtScale(
  mapScale: number,
): [number, number] {
  return [30 * mapScale, -48 * mapScale];
}
