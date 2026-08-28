import { Capacitor } from '@capacitor/core';
import { iosApiOrigin } from './apiOrigin';
import { createIosApiFetch } from './iosApiRouting';

if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios') {
  // AMap can classify WKWebView as an unsupported browser and silently use
  // raster tiles, which ignore our existing mapStyle/features/CSS canvas filters.
  // Set its documented opt-in BEFORE either JSAPI loader runs. AMap still checks
  // for a usable WebGL context; this does not change the theme or spoof the UA.
  // https://lbs.amap.com/faq/js-api/map-js-api/create-project/1060847223
  Reflect.set(window, 'forceWebGL', true);
  window.fetch = createIosApiFetch(window.fetch.bind(window), window.location.href, iosApiOrigin());
}
