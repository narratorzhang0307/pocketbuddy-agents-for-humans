import {
  gcj02ToWgs84,
  wgs84ToGcj02,
} from '../location/chinaCoordinates';
import type {
  CityMapRuntime,
  GeoMarkerHandle,
  GeoPixel,
  GeoPopupHandle,
  GeoPosition,
} from './runtime';

type AmapLngLat = {
  getLng?: () => number;
  getLat?: () => number;
  lng?: number;
  lat?: number;
};

type AmapPixel = {
  getX?: () => number;
  getY?: () => number;
  x?: number;
  y?: number;
};

type AmapMarker = {
  getPosition?: () => AmapLngLat;
  setAnchor?: (anchor: 'top-center' | 'bottom-center') => void;
  setOffset?: (offset: AmapPixel | GeoPosition) => void;
  setPosition?: (position: GeoPosition) => void;
  setMap?: (map: unknown | null) => void;
  show?: () => void;
  hide?: () => void;
};

type ViewportMarkerRecord = {
  marker: AmapMarker;
  position: GeoPosition;
  zooms?: [number, number];
  visible: boolean | null;
};

export type AmapMap = {
  getCenter?: () => AmapLngLat;
  getBounds?: () => {
    contains?: (position: GeoPosition) => boolean;
  };
  getZoom?: () => number;
  getContainer?: () => HTMLElement;
  lngLatToContainer?: (position: GeoPosition) => AmapPixel;
  containerToLngLat?: (pixel: GeoPixel | [number, number]) => AmapLngLat;
  setZoomAndCenter?: (
    zoom: number,
    center: GeoPosition,
    immediately?: boolean,
    duration?: number,
  ) => void;
  on?: (event: string, handler: () => void) => void;
  off?: (event: string, handler: () => void) => void;
  remove?: (overlay: unknown) => void;
};

const readAmapCoordinates = (
  value: AmapLngLat | undefined,
): GeoPosition | null => {
  const rawLng = value?.getLng?.() ?? value?.lng;
  const rawLat = value?.getLat?.() ?? value?.lat;
  if (rawLng == null || rawLat == null) return null;
  const lng = Number(rawLng);
  const lat = Number(rawLat);
  return Number.isFinite(lng) && Number.isFinite(lat)
    ? [lng, lat]
    : null;
};

const readAmapPixel = (value: AmapPixel | undefined): GeoPixel | null => {
  const rawX = value?.getX?.() ?? value?.x;
  const rawY = value?.getY?.() ?? value?.y;
  if (rawX == null || rawY == null) return null;
  const x = Number(rawX);
  const y = Number(rawY);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
};

const amapPixel = (value: AmapPixel | undefined): GeoPixel =>
  readAmapPixel(value) ?? { x: 0, y: 0 };

const readFiniteNumber = (value: unknown): number | null => {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export const isFiniteGeoPosition = (
  position: GeoPosition | null | undefined,
): position is GeoPosition =>
  Array.isArray(position) &&
  Number.isFinite(position[0]) &&
  Number.isFinite(position[1]) &&
  Math.abs(position[0]) <= 180 &&
  Math.abs(position[1]) <= 90;

type PopupViewportPadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

type PopupPlacementInput = {
  point: GeoPixel;
  popupSize: {
    width: number;
    height: number;
  };
  viewportSize: {
    width: number;
    height: number;
  };
  offset?: number;
  padding?: PopupViewportPadding;
};

export type AmapPopupPlacement = {
  anchor: 'top-center' | 'bottom-center';
  offset: GeoPixel;
};

const DEFAULT_POPUP_VIEWPORT_PADDING: PopupViewportPadding = {
  top: 96,
  right: 12,
  bottom: 64,
  left: 12,
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

/**
 * Keeps a coordinate-anchored card inside the usable map viewport.
 *
 * The city action rail and world-layer notice occupy the top of the map, while
 * the collapsed Skill control occupies the bottom-left. A card normally sits
 * above its point; near the top it flips below, then receives only the small
 * horizontal/vertical correction required to remain readable.
 */
export function resolveAmapPopupPlacement({
  point,
  popupSize,
  viewportSize,
  offset = 18,
  padding = DEFAULT_POPUP_VIEWPORT_PADDING,
}: PopupPlacementInput): AmapPopupPlacement {
  const isNearViewport =
    point.x >= -popupSize.width &&
    point.x <= viewportSize.width + popupSize.width &&
    point.y >= -popupSize.height &&
    point.y <= viewportSize.height + popupSize.height;
  if (!isNearViewport) {
    return {
      anchor: 'bottom-center',
      offset: { x: 0, y: -offset },
    };
  }

  const roomAbove = point.y - padding.top;
  const roomBelow = viewportSize.height - padding.bottom - point.y;
  const requiredHeight = popupSize.height + offset;
  const placeAbove =
    roomAbove >= requiredHeight ||
    (roomBelow < requiredHeight && roomAbove >= roomBelow);
  const anchor = placeAbove ? 'bottom-center' : 'top-center';

  const rawLeft = point.x - popupSize.width / 2;
  const maxLeft =
    viewportSize.width - padding.right - popupSize.width;
  const desiredLeft = clamp(rawLeft, padding.left, maxLeft);

  const rawTop = placeAbove
    ? point.y - offset - popupSize.height
    : point.y + offset;
  const maxTop =
    viewportSize.height - padding.bottom - popupSize.height;
  const desiredTop = clamp(rawTop, padding.top, maxTop);

  return {
    anchor,
    offset: {
      x: desiredLeft - rawLeft,
      y: (placeAbove ? -offset : offset) + desiredTop - rawTop,
    },
  };
}

export function createAmapRuntime(map: AmapMap): CityMapRuntime {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AMap = (window as any).AMap;
  let lastKnownAmapCenter = readAmapCoordinates(map.getCenter?.());
  let lastKnownZoom = readFiniteNumber(map.getZoom?.()) ?? 14;
  const readMapCenter = () => {
    const center = readAmapCoordinates(map.getCenter?.());
    if (center) lastKnownAmapCenter = center;
    return lastKnownAmapCenter;
  };
  const readMapZoom = () => {
    const zoom = readFiniteNumber(map.getZoom?.());
    if (zoom !== null) lastKnownZoom = zoom;
    return lastKnownZoom;
  };
  const viewportEvents = [
    'mapmove',
    'zoomchange',
    'rotatechange',
    'pitchchange',
    'resize',
  ];
  const viewportMarkers = new Set<ViewportMarkerRecord>();
  let markerVisibilityFrame: number | null = null;
  let markerVisibilityEventsAttached = false;
  const requestFrame =
    window.requestAnimationFrame?.bind(window) ??
    ((callback: FrameRequestCallback) =>
      globalThis.setTimeout(callback, 0));
  const cancelFrame =
    window.cancelAnimationFrame?.bind(window) ??
    globalThis.clearTimeout.bind(globalThis);

  const removeMarker = (marker: AmapMarker) => {
    // AMap accepts either Marker#setMap(null) or Map#remove(marker).
    // Calling both can make the second path touch an already-detached layer
    // while the shared map is being rebuilt.
    if (marker.setMap) {
      marker.setMap(null);
    } else {
      map.remove?.(marker);
    }
  };

  const refreshMarkerVisibility = () => {
    markerVisibilityFrame = null;
    const bounds = map.getBounds?.();
    const zoom = readMapZoom();
    viewportMarkers.forEach((record) => {
      const rawPosition = record.marker.getPosition?.();
      const amapPosition =
        readAmapCoordinates(rawPosition) ??
        wgs84ToGcj02(record.position);
      const withinBounds =
        bounds?.contains?.(amapPosition) ?? true;
      const withinZoom =
        !record.zooms ||
        (zoom >= record.zooms[0] && zoom <= record.zooms[1]);
      const visible = withinBounds && withinZoom;
      if (record.visible === visible) return;
      record.visible = visible;
      if (visible) {
        record.marker.show?.();
      } else {
        record.marker.hide?.();
      }
    });
  };

  const scheduleMarkerVisibility = () => {
    if (markerVisibilityFrame !== null) return;
    markerVisibilityFrame = requestFrame(refreshMarkerVisibility);
  };

  const attachMarkerVisibilityTracking = () => {
    if (markerVisibilityEventsAttached) return;
    viewportEvents.forEach((event) =>
      map.on?.(event, scheduleMarkerVisibility),
    );
    markerVisibilityEventsAttached = true;
  };

  const detachMarkerVisibilityTracking = () => {
    if (!markerVisibilityEventsAttached) return;
    viewportEvents.forEach((event) =>
      map.off?.(event, scheduleMarkerVisibility),
    );
    markerVisibilityEventsAttached = false;
    if (markerVisibilityFrame !== null) {
      cancelFrame(markerVisibilityFrame);
      markerVisibilityFrame = null;
    }
  };

  return {
    project: (position) =>
      isFiniteGeoPosition(position)
        ? amapPixel(map.lngLatToContainer?.(wgs84ToGcj02(position)))
        : { x: 0, y: 0 },
    unproject: (pixel) => {
      const coordinates: [number, number] = Array.isArray(pixel)
        ? pixel
        : [pixel.x, pixel.y];
      const amapInput = AMap.Pixel
        ? new AMap.Pixel(coordinates[0], coordinates[1])
        : pixel;
      const [lng, lat] = gcj02ToWgs84(
        readAmapCoordinates(map.containerToLngLat?.(amapInput)) ??
          readMapCenter() ??
          [0, 0],
      );
      return { lng, lat };
    },
    flyTo: ({ center, zoom, duration }) => {
      if (!isFiniteGeoPosition(center)) return;
      const amapCenter = wgs84ToGcj02(center);
      const nextZoom = readFiniteNumber(zoom) ?? readMapZoom();
      lastKnownAmapCenter = amapCenter;
      lastKnownZoom = nextZoom;
      map.setZoomAndCenter?.(
        nextZoom,
        amapCenter,
        duration === 0,
        duration,
      );
    },
    getZoom: readMapZoom,
    getCenter: () => {
      const [lng, lat] = gcj02ToWgs84(readMapCenter() ?? [0, 0]);
      return { lng, lat };
    },
    getBounds: () => {
      const bounds = map.getBounds?.();
      return {
        contains: (position) =>
          isFiniteGeoPosition(position) &&
          (bounds?.contains?.(wgs84ToGcj02(position)) ?? true),
      };
    },
    getContainer: () => map.getContainer?.() ?? document.body,
    getCanvas: () =>
      map.getContainer?.().querySelector<HTMLElement>('canvas') ??
      map.getContainer?.() ??
      document.body,
    on: (_event, handler) => {
      viewportEvents.forEach((event) => map.on?.(event, handler));
    },
    off: (_event, handler) => {
      viewportEvents.forEach((event) => map.off?.(event, handler));
    },
    once: (_event, handler) => queueMicrotask(handler),
    isStyleLoaded: () => true,
    createMarker: ({
      element,
      position,
      draggable = false,
      anchor = 'center',
      zIndex = 220,
      zooms,
    }) => {
      if (!isFiniteGeoPosition(position)) {
        const fallback = gcj02ToWgs84(readMapCenter() ?? [0, 0]);
        return {
          remove: () => {},
          setPosition: () => {},
          getPosition: () => ({ lng: fallback[0], lat: fallback[1] }),
        } satisfies GeoMarkerHandle;
      }
      const marker = new AMap.Marker({
        map,
        position: wgs84ToGcj02(position),
        content: element,
        draggable,
        anchor,
        zIndex,
        zooms,
      }) as AmapMarker;
      const record: ViewportMarkerRecord = {
        marker,
        position,
        zooms,
        visible: null,
      };
      let removed = false;
      viewportMarkers.add(record);
      attachMarkerVisibilityTracking();
      scheduleMarkerVisibility();

      return {
        remove: () => {
          if (removed) return;
          removed = true;
          viewportMarkers.delete(record);
          if (viewportMarkers.size === 0) {
            detachMarkerVisibilityTracking();
          }
          removeMarker(marker);
        },
        setPosition: (nextPosition) => {
          if (!isFiniteGeoPosition(nextPosition)) return;
          record.position = nextPosition;
          marker.setPosition?.(wgs84ToGcj02(nextPosition));
          scheduleMarkerVisibility();
        },
        getPosition: () => {
          const rawPosition = marker.getPosition?.();
          const [lng, lat] = gcj02ToWgs84(
            readAmapCoordinates(rawPosition) ??
              wgs84ToGcj02(record.position),
          );
          return { lng, lat };
        },
      } satisfies GeoMarkerHandle;
    },
    createPopup: ({
      element,
      position,
      offset = 18,
      className,
      zIndex = 260,
    }) => {
      const host = document.createElement('div');
      host.className = ['city-map-popup', className]
        .filter(Boolean)
        .join(' ');
      host.style.position = 'relative';
      host.style.width = 'max-content';
      host.appendChild(element);
      let marker: AmapMarker | null = null;
      let currentPosition = position;
      let placementFrame = 0;
      let placementObserver: ResizeObserver | null = null;
      let placementEventsAttached = false;
      const pixelForOffset = (x: number, y: number) =>
        AMap.Pixel ? new AMap.Pixel(x, y) : [x, y] as GeoPosition;
      const refreshPlacement = () => {
        placementFrame = 0;
        if (!marker) return;
        const container = map.getContainer?.();
        if (!container) return;
        const containerRect = container.getBoundingClientRect();
        const hostRect = host.getBoundingClientRect();
        const width = host.offsetWidth || hostRect.width;
        const height = host.offsetHeight || hostRect.height;
        const viewportWidth = container.clientWidth || containerRect.width;
        const viewportHeight = container.clientHeight || containerRect.height;
        if (
          width <= 0 ||
          height <= 0 ||
          viewportWidth <= 0 ||
          viewportHeight <= 0
        ) {
          return;
        }
        const point = readAmapPixel(
          map.lngLatToContainer?.(wgs84ToGcj02(currentPosition)),
        );
        if (!point) return;
        const placement = resolveAmapPopupPlacement({
          point,
          popupSize: { width, height },
          viewportSize: {
            width: viewportWidth,
            height: viewportHeight,
          },
          offset,
        });
        marker.setAnchor?.(placement.anchor);
        marker.setOffset?.(
          pixelForOffset(placement.offset.x, placement.offset.y),
        );
      };
      const schedulePlacement = () => {
        if (placementFrame) cancelFrame(placementFrame);
        placementFrame = requestFrame(refreshPlacement);
      };
      const attachPlacementTracking = () => {
        if (!placementEventsAttached) {
          viewportEvents.forEach((event) =>
            map.on?.(event, schedulePlacement),
          );
          placementEventsAttached = true;
        }
        if (!placementObserver && typeof ResizeObserver !== 'undefined') {
          placementObserver = new ResizeObserver(schedulePlacement);
          placementObserver.observe(host);
        }
        schedulePlacement();
      };
      const detachPlacementTracking = () => {
        if (placementFrame) {
          cancelFrame(placementFrame);
          placementFrame = 0;
        }
        placementObserver?.disconnect();
        placementObserver = null;
        if (placementEventsAttached) {
          viewportEvents.forEach((event) =>
            map.off?.(event, schedulePlacement),
          );
          placementEventsAttached = false;
        }
      };
      const open = () => {
        if (marker || !isFiniteGeoPosition(currentPosition)) return;
        marker = new AMap.Marker({
          map,
          position: wgs84ToGcj02(currentPosition),
          content: host,
          anchor: 'bottom-center',
          offset: AMap.Pixel ? new AMap.Pixel(0, -offset) : undefined,
          zIndex,
        }) as AmapMarker;
        attachPlacementTracking();
      };
      open();
      return {
        remove: () => {
          if (!marker) return;
          detachPlacementTracking();
          removeMarker(marker);
          marker = null;
        },
        setPosition: (nextPosition) => {
          if (!isFiniteGeoPosition(nextPosition)) return;
          currentPosition = nextPosition;
          marker?.setPosition?.(wgs84ToGcj02(nextPosition));
          schedulePlacement();
        },
        open,
        isOpen: () => marker !== null,
        getElement: () => host,
      } satisfies GeoPopupHandle;
    },
  };
}
