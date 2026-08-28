import { distanceInMeters, type RoutePoint } from '../spatial/amapWalkingRoute';

export type LocationCoordinateSystem = 'wgs84' | 'gcj02';

export type LocationSample = {
  position: RoutePoint;
  accuracyMeters: number;
  timestamp: number;
  speedMetersPerSecond: number | null;
  headingDegrees: number | null;
  coordinateSystem: LocationCoordinateSystem;
};

export type FilteredLocation = LocationSample & {
  movedMeters: number;
  moving: boolean;
};

export type LocationProviderErrorCode =
  | 'unsupported'
  | 'insecure-context'
  | 'permission-denied'
  | 'position-unavailable'
  | 'timeout'
  | 'unknown';

export type LocationProviderError = {
  code: LocationProviderErrorCode;
  message: string;
};

export type StopLocationWatch = () => void;

export interface LocationProvider {
  readonly source: 'browser' | 'native-amap';
  start(
    onSample: (sample: LocationSample) => void,
    onError: (error: LocationProviderError) => void,
  ): StopLocationWatch;
}

const MAX_ACCEPTED_ACCURACY_METERS = 65;
const MAX_WALKING_SPEED_METERS_PER_SECOND = 13;
const MIN_MOVEMENT_METERS = 0.9;
const FIRST_FIX_WATCHDOG_MS = 22_000;
const TRANSIENT_RETRY_DELAY_MS = 1_500;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function validPosition([lng, lat]: RoutePoint) {
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= -180 &&
    lng <= 180 &&
    lat >= -90 &&
    lat <= 90
  );
}

/**
 * Filters browser GPS noise before a point reaches the map. It intentionally
 * stays conservative: uncertain points are ignored instead of making the
 * character jump across a block.
 */
export class LiveLocationFilter {
  private previousRaw: LocationSample | null = null;
  private previousFiltered: FilteredLocation | null = null;

  reset() {
    this.previousRaw = null;
    this.previousFiltered = null;
  }

  push(sample: LocationSample): FilteredLocation | null {
    if (
      !validPosition(sample.position) ||
      !Number.isFinite(sample.accuracyMeters) ||
      sample.accuracyMeters < 0 ||
      sample.accuracyMeters > MAX_ACCEPTED_ACCURACY_METERS ||
      !Number.isFinite(sample.timestamp)
    ) {
      return null;
    }

    if (!this.previousRaw || !this.previousFiltered) {
      const first = {
        ...sample,
        movedMeters: 0,
        moving: false,
      };
      this.previousRaw = sample;
      this.previousFiltered = first;
      return first;
    }

    const elapsedSeconds = (sample.timestamp - this.previousRaw.timestamp) / 1000;
    if (elapsedSeconds <= 0) return null;

    const rawDistance = distanceInMeters(
      this.previousRaw.position,
      sample.position,
    );
    const plausibleDistance = Math.max(
      24,
      this.previousRaw.accuracyMeters + sample.accuracyMeters,
      elapsedSeconds * MAX_WALKING_SPEED_METERS_PER_SECOND,
    );
    const substantiallyMoreAccurate =
      sample.accuracyMeters < this.previousRaw.accuracyMeters * 0.55;
    if (rawDistance > plausibleDistance && !substantiallyMoreAccurate) {
      return null;
    }

    const previousPosition = this.previousFiltered.position;
    const smoothing = clamp(
      0.2 + rawDistance / 34 - sample.accuracyMeters / 260,
      0.16,
      0.72,
    );
    const nextPosition: RoutePoint =
      rawDistance < MIN_MOVEMENT_METERS
        ? previousPosition
        : [
            previousPosition[0] +
              (sample.position[0] - previousPosition[0]) * smoothing,
            previousPosition[1] +
              (sample.position[1] - previousPosition[1]) * smoothing,
          ];
    const movedMeters = distanceInMeters(previousPosition, nextPosition);
    const measuredSpeed = rawDistance / elapsedSeconds;
    const reportedSpeed = sample.speedMetersPerSecond;
    const speedMetersPerSecond =
      reportedSpeed !== null &&
      Number.isFinite(reportedSpeed) &&
      reportedSpeed >= 0
        ? Math.min(reportedSpeed, MAX_WALKING_SPEED_METERS_PER_SECOND)
        : measuredSpeed;
    const moving =
      rawDistance >= MIN_MOVEMENT_METERS &&
      speedMetersPerSecond >= 0.45;
    const filtered = {
      ...sample,
      position: nextPosition,
      speedMetersPerSecond,
      movedMeters,
      moving,
    };

    this.previousRaw = sample;
    this.previousFiltered = filtered;
    return filtered;
  }
}

function isIosDevice() {
  const userAgent = navigator.userAgent || '';
  return (
    /iPad|iPhone|iPod/.test(userAgent) ||
    (/Macintosh/.test(userAgent) && navigator.maxTouchPoints > 1)
  );
}

function browserError(error: GeolocationPositionError): LocationProviderError {
  if (error.code === error.PERMISSION_DENIED) {
    return {
      code: 'permission-denied',
      message: isIosDevice()
        ? '定位权限未开启；请在 iPhone「设置 > 隐私与安全性 > 定位服务」中允许“上街去”'
        : '定位权限未开启',
    };
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return { code: 'position-unavailable', message: '暂时无法取得手机位置' };
  }
  if (error.code === error.TIMEOUT) {
    return { code: 'timeout', message: '获取位置超时，请走到开阔处重试' };
  }
  return { code: 'unknown', message: error.message || '手机定位失败' };
}

export function createBrowserLocationProvider(): LocationProvider {
  return {
    source: 'browser',
    start(onSample, onError) {
      if (!globalThis.isSecureContext) {
        onError({
          code: 'insecure-context',
          message: '手机浏览器需要通过 HTTPS 打开才能使用 GPS',
        });
        return () => {};
      }
      if (!navigator.geolocation) {
        onError({ code: 'unsupported', message: '当前浏览器不支持手机定位' });
        return () => {};
      }

      let stopped = false;
      let watchId: number | null = null;
      let watchGeneration = 0;
      let firstFixWatchdog: ReturnType<typeof globalThis.setTimeout> | null =
        null;
      let retryTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
      const clearFirstFixWatchdog = () => {
        if (firstFixWatchdog === null) return;
        globalThis.clearTimeout(firstFixWatchdog);
        firstFixWatchdog = null;
      };
      const clearWatch = () => {
        watchGeneration += 1;
        clearFirstFixWatchdog();
        if (watchId === null) return;
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      };
      const clearRetryTimer = () => {
        if (retryTimer === null) return;
        globalThis.clearTimeout(retryTimer);
        retryTimer = null;
      };
      const scheduleRestart = () => {
        clearWatch();
        clearRetryTimer();
        if (stopped || document.visibilityState === 'hidden') return;
        retryTimer = globalThis.setTimeout(() => {
          retryTimer = null;
          beginWatch();
        }, TRANSIENT_RETRY_DELAY_MS);
      };
      function beginWatch() {
        if (stopped || watchId !== null || document.visibilityState === 'hidden') {
          return;
        }
        const generation = watchGeneration + 1;
        watchGeneration = generation;
        firstFixWatchdog = globalThis.setTimeout(() => {
          firstFixWatchdog = null;
          if (stopped || generation !== watchGeneration) return;
          onError({
            code: 'timeout',
            message: 'GPS 首次定位超时，正在自动重试…',
          });
          scheduleRestart();
        }, FIRST_FIX_WATCHDOG_MS);
        try {
          watchId = navigator.geolocation.watchPosition(
            (position) => {
              if (stopped || generation !== watchGeneration) return;
              // 弱精度坐标仍交给上层显示信号提示，但不能把它误当成
              // 首次有效定位，否则界面会永远停在“正在连接 GPS”。
              if (position.coords.accuracy <= MAX_ACCEPTED_ACCURACY_METERS) {
                clearFirstFixWatchdog();
              }
              const speed = position.coords.speed;
              const heading = position.coords.heading;
              onSample({
                position: [position.coords.longitude, position.coords.latitude],
                accuracyMeters: position.coords.accuracy,
                timestamp: position.timestamp,
                speedMetersPerSecond:
                  typeof speed === 'number' && Number.isFinite(speed)
                    ? speed
                    : null,
                headingDegrees:
                  typeof heading === 'number' && Number.isFinite(heading)
                    ? heading
                    : null,
                coordinateSystem: 'wgs84',
              });
            },
            (error) => {
              if (stopped || generation !== watchGeneration) return;
              const normalizedError = browserError(error);
              onError(normalizedError);
              if (
                normalizedError.code === 'timeout' ||
                normalizedError.code === 'position-unavailable' ||
                normalizedError.code === 'unknown'
              ) {
                scheduleRestart();
              } else {
                clearFirstFixWatchdog();
              }
            },
            {
              enableHighAccuracy: true,
              maximumAge: 1_000,
              timeout: 15_000,
            },
          );
        } catch (error) {
          clearFirstFixWatchdog();
          const errorName =
            error && typeof error === 'object' && 'name' in error
              ? String(error.name)
              : '';
          onError({
            code:
              errorName === 'SecurityError' || errorName === 'NotAllowedError'
                ? 'permission-denied'
                : 'unsupported',
            message:
              errorName === 'SecurityError' || errorName === 'NotAllowedError'
                ? '浏览器阻止了定位；请在网站设置中允许位置权限'
                : '当前浏览器无法启动手机定位',
          });
        }
      }
      const handleVisibility = () => {
        if (document.visibilityState === 'hidden') {
          clearRetryTimer();
          clearWatch();
        } else {
          clearRetryTimer();
          beginWatch();
        }
      };

      document.addEventListener('visibilitychange', handleVisibility);
      beginWatch();
      return () => {
        stopped = true;
        document.removeEventListener('visibilitychange', handleVisibility);
        clearRetryTimer();
        clearWatch();
      };
    },
  };
}
