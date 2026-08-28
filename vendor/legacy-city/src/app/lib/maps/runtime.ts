export type GeoPosition = [number, number];

export type GeoPixel = {
  x: number;
  y: number;
};

export type GeoLngLat = {
  lng: number;
  lat: number;
};

export interface GeoMarkerHandle {
  remove(): void;
  setPosition(position: GeoPosition): void;
  getPosition(): GeoLngLat;
}

export interface GeoPopupHandle {
  remove(): void;
  setPosition(position: GeoPosition): void;
  open(): void;
  isOpen(): boolean;
  getElement(): HTMLElement;
}

export interface CityMapRuntime {
  project(position: GeoPosition): GeoPixel;
  unproject(pixel: GeoPixel | [number, number]): GeoLngLat;
  flyTo(options: {
    center: GeoPosition;
    zoom?: number;
    duration?: number;
  }): void;
  getZoom(): number;
  getCenter(): GeoLngLat;
  getBounds(): {
    contains(position: GeoPosition): boolean;
  };
  getContainer(): HTMLElement;
  getCanvas(): HTMLElement;
  on(event: 'move', handler: () => void): void;
  off(event: 'move', handler: () => void): void;
  once(event: 'idle' | 'style.load', handler: () => void): void;
  isStyleLoaded(): boolean;
  createMarker(options: {
    element: HTMLElement;
    position: GeoPosition;
    draggable?: boolean;
    anchor?: 'center' | 'bottom-center';
    zIndex?: number;
    zooms?: [number, number];
  }): GeoMarkerHandle;
  createPopup(options: {
    element: HTMLElement;
    position: GeoPosition;
    offset?: number;
    className?: string;
    zIndex?: number;
  }): GeoPopupHandle;
}
