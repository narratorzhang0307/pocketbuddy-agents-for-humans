import type { GeoPosition } from '../maps/runtime';
import { gcj02ToWgs84 } from '../location/chinaCoordinates';

// These three anchors come from AMap and are therefore GCJ-02. CityMapRuntime
// accepts WGS84 and performs the GCJ-02 conversion at its boundary; keeping the
// conversion here prevents the route from being shifted into the lake twice.
const AMAP_SUDI_SOUTH: GeoPosition = [120.139291, 30.240338];
const AMAP_SUDI_MIDDLE: GeoPosition = [120.135764, 30.251448];
const AMAP_SUDI_NORTH: GeoPosition = [120.13255, 30.26610];

export const SUDI_SOUTH: GeoPosition = gcj02ToWgs84(AMAP_SUDI_SOUTH);
export const SUDI_MIDDLE: GeoPosition = gcj02ToWgs84(AMAP_SUDI_MIDDLE);
export const SUDI_NORTH: GeoPosition = gcj02ToWgs84(AMAP_SUDI_NORTH);

const interpolate = (from: GeoPosition, to: GeoPosition, progress: number): GeoPosition => [
  from[0] + (to[0] - from[0]) * progress,
  from[1] + (to[1] - from[1]) * progress,
];

// 以高德“苏堤”POI与南、北端为锚点，沿南北堤路分成 21 个声景观察位。
export const SUDI_ROUTE: readonly GeoPosition[] = Array.from({ length: 21 }, (_, index) => {
  if (index <= 9) return interpolate(SUDI_SOUTH, SUDI_MIDDLE, index / 9);
  return interpolate(SUDI_MIDDLE, SUDI_NORTH, (index - 9) / 11);
});
