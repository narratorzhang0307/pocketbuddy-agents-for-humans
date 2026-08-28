import type { RoutePoint } from '../spatial/amapWalkingRoute';
import { gcj02ToWgs84 } from './chinaCoordinates';
import type { LocationSample } from './liveLocation';

type AmapLngLat = {
  getLng?: () => number;
  getLat?: () => number;
  lng?: number;
  lat?: number;
};

function toRoutePoint(value: AmapLngLat | undefined): RoutePoint | null {
  const lng = Number(value?.getLng?.() ?? value?.lng);
  const lat = Number(value?.getLat?.() ?? value?.lat);
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
}

/**
 * Browser Geolocation returns WGS84 while AMap renders GCJ-02 in mainland
 * China. Native AMap providers can pass gcj02 and skip this conversion.
 */
export function locationSampleToAmap(
  AMap: any,
  sample: LocationSample,
): Promise<RoutePoint> {
  if (sample.coordinateSystem === 'gcj02') {
    return Promise.resolve(sample.position);
  }

  return new Promise((resolve, reject) => {
    try {
      AMap.convertFrom(
        sample.position,
        'gps',
        (status: string, result: { info?: string; locations?: AmapLngLat[] }) => {
          const converted = toRoutePoint(result?.locations?.[0]);
          if (status === 'complete' && converted) {
            resolve(converted);
          } else {
            reject(new Error(result?.info || 'GPS 坐标转换失败'));
          }
        },
      );
    } catch (error) {
      reject(error);
    }
  });
}

/** Convert a native AMap position into the product's WGS84 data domain. */
export function amapPositionToWgs84(position: RoutePoint): RoutePoint {
  return gcj02ToWgs84(position);
}

/** Normalize either browser GPS or native AMap samples before persistence. */
export function locationSampleToWgs84(sample: LocationSample): RoutePoint {
  return sample.coordinateSystem === 'wgs84'
    ? [...sample.position]
    : amapPositionToWgs84(sample.position);
}
