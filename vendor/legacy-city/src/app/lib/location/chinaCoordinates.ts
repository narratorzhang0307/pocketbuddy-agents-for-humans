export type Coordinate = readonly [number, number];

const PI = Math.PI;
const EARTH_SEMI_MAJOR_AXIS = 6378245;
const ECCENTRICITY_SQUARED = 0.006693421622965943;

function isOutsideMainlandChina([lng, lat]: Coordinate) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLatitude(lngOffset: number, latOffset: number) {
  let value =
    -100 +
    2 * lngOffset +
    3 * latOffset +
    0.2 * latOffset * latOffset +
    0.1 * lngOffset * latOffset +
    0.2 * Math.sqrt(Math.abs(lngOffset));
  value +=
    ((20 * Math.sin(6 * lngOffset * PI) +
      20 * Math.sin(2 * lngOffset * PI)) *
      2) /
    3;
  value +=
    ((20 * Math.sin(latOffset * PI) +
      40 * Math.sin((latOffset / 3) * PI)) *
      2) /
    3;
  value +=
    ((160 * Math.sin((latOffset / 12) * PI) +
      320 * Math.sin((latOffset * PI) / 30)) *
      2) /
    3;
  return value;
}

function transformLongitude(lngOffset: number, latOffset: number) {
  let value =
    300 +
    lngOffset +
    2 * latOffset +
    0.1 * lngOffset * lngOffset +
    0.1 * lngOffset * latOffset +
    0.1 * Math.sqrt(Math.abs(lngOffset));
  value +=
    ((20 * Math.sin(6 * lngOffset * PI) +
      20 * Math.sin(2 * lngOffset * PI)) *
      2) /
    3;
  value +=
    ((20 * Math.sin(lngOffset * PI) +
      40 * Math.sin((lngOffset / 3) * PI)) *
      2) /
    3;
  value +=
    ((150 * Math.sin((lngOffset / 12) * PI) +
      300 * Math.sin((lngOffset / 30) * PI)) *
      2) /
    3;
  return value;
}

function coordinateOffset([lng, lat]: Coordinate): [number, number] {
  const latitude = transformLatitude(lng - 105, lat - 35);
  const longitude = transformLongitude(lng - 105, lat - 35);
  const latitudeRadians = (lat / 180) * PI;
  const sinLatitude = Math.sin(latitudeRadians);
  const magic = 1 - ECCENTRICITY_SQUARED * sinLatitude * sinLatitude;
  const sqrtMagic = Math.sqrt(magic);
  const latitudeOffset =
    (latitude * 180) /
    (((EARTH_SEMI_MAJOR_AXIS * (1 - ECCENTRICITY_SQUARED)) /
      (magic * sqrtMagic)) *
      PI);
  const longitudeOffset =
    (longitude * 180) /
    ((EARTH_SEMI_MAJOR_AXIS / sqrtMagic) *
      Math.cos(latitudeRadians) *
      PI);
  return [longitudeOffset, latitudeOffset];
}

/** Convert global WGS84 coordinates to the GCJ-02 coordinates used by AMap. */
export function wgs84ToGcj02(coordinate: Coordinate): [number, number] {
  if (isOutsideMainlandChina(coordinate)) return [...coordinate];
  const [lngOffset, latOffset] = coordinateOffset(coordinate);
  return [coordinate[0] + lngOffset, coordinate[1] + latOffset];
}

/** Convert AMap's GCJ-02 coordinates back to WGS84 with iterative refinement. */
export function gcj02ToWgs84(coordinate: Coordinate): [number, number] {
  if (isOutsideMainlandChina(coordinate)) return [...coordinate];

  let wgsLng = coordinate[0];
  let wgsLat = coordinate[1];
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const [gcjLng, gcjLat] = wgs84ToGcj02([wgsLng, wgsLat]);
    wgsLng -= gcjLng - coordinate[0];
    wgsLat -= gcjLat - coordinate[1];
  }
  return [wgsLng, wgsLat];
}
