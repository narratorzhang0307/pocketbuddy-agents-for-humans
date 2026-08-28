import type { StreetPhotoFrame, StreetPhotoMapView } from "./store";
import { importWithChunkRecovery } from "../runtime/lazyRetry";

type AmapViewLike = {
  getCenter?: () => unknown;
  getZoom?: () => number;
  getRotation?: () => number;
  getPitch?: () => number;
};

const CAPTURE_IGNORE_SELECTOR = [
  "iframe",
  ".amap-logo",
  ".amap-copyright",
  ".amap-controls",
].join(",");

const HTML2CANVAS_IGNORE_ATTRIBUTE = "data-html2canvas-ignore";
const CAPTURE_ROOT_ATTRIBUTE = "data-street-photo-capture-root";
const CAPTURE_TIMEOUT_MS = 5_000;

const COLOR_STYLE_FALLBACKS: ReadonlyArray<readonly [string, string]> = [
  ["color", "rgb(17, 17, 17)"],
  ["background-color", "rgba(0, 0, 0, 0)"],
  ["border-top-color", "rgb(17, 17, 17)"],
  ["border-right-color", "rgb(17, 17, 17)"],
  ["border-bottom-color", "rgb(17, 17, 17)"],
  ["border-left-color", "rgb(17, 17, 17)"],
  ["outline-color", "rgb(17, 17, 17)"],
  ["text-decoration-color", "rgb(17, 17, 17)"],
  ["box-shadow", "none"],
  ["text-shadow", "none"],
  ["fill", "rgb(17, 17, 17)"],
  ["stroke", "rgb(17, 17, 17)"],
];

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readMapCenter(map: AmapViewLike | null): [number, number] {
  const center = map?.getCenter?.() as
    | { lng?: number; lat?: number; getLng?: () => number; getLat?: () => number }
    | [number, number]
    | undefined;
  if (Array.isArray(center)) {
    return [numberOr(center[0], 0), numberOr(center[1], 0)];
  }
  return [
    numberOr(center?.lng ?? center?.getLng?.(), 0),
    numberOr(center?.lat ?? center?.getLat?.(), 0),
  ];
}

export function readStreetPhotoMapView(
  map: AmapViewLike | null,
): StreetPhotoMapView {
  return {
    center: readMapCenter(map),
    zoom: numberOr(map?.getZoom?.(), 0),
    rotation: numberOr(map?.getRotation?.(), 0),
    pitch: numberOr(map?.getPitch?.(), 0),
  };
}

function encodeCaptureCanvas(source: HTMLCanvasElement): StreetPhotoFrame | null {
  const maxWidth = 720;
  const scale = Math.min(1, maxWidth / source.width);
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const context = output.getContext("2d");
  if (!context) return null;
  context.drawImage(source, 0, 0, width, height);
  return {
    dataUrl: output.toDataURL("image/webp", 0.8),
    width,
    height,
    source: "live-map",
    mapView: { center: [0, 0], zoom: 0, rotation: 0, pitch: 0 },
  };
}

function intersects(
  elementRect: DOMRect,
  captureRect: Pick<DOMRect, "left" | "top" | "right"> & { bottom: number },
): boolean {
  return (
    elementRect.width > 0 &&
    elementRect.height > 0 &&
    elementRect.right > captureRect.left &&
    elementRect.left < captureRect.right &&
    elementRect.bottom > captureRect.top &&
    elementRect.top < captureRect.bottom
  );
}

function temporarilyIgnoreOffscreenMapContent(
  mapElement: HTMLElement,
  visibleHeight: number,
): () => void {
  const mapRect = mapElement.getBoundingClientRect();
  const captureRect = {
    left: mapRect.left,
    right: mapRect.right,
    top: mapRect.top,
    bottom: mapRect.top + visibleHeight,
  };
  const ignored: Element[] = [];
  mapElement
    .querySelectorAll<HTMLElement>(`.amap-marker, ${CAPTURE_IGNORE_SELECTOR}`)
    .forEach((element) => {
      const style = window.getComputedStyle(element);
      const shouldIgnore =
        element.matches(CAPTURE_IGNORE_SELECTOR) ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number.parseFloat(style.opacity || "1") <= 0 ||
        !intersects(element.getBoundingClientRect(), captureRect);
      if (!shouldIgnore || element.hasAttribute(HTML2CANVAS_IGNORE_ATTRIBUTE)) {
        return;
      }
      element.setAttribute(HTML2CANVAS_IGNORE_ATTRIBUTE, "true");
      ignored.push(element);
    });
  return () => {
    ignored.forEach((element) =>
      element.removeAttribute(HTML2CANVAS_IGNORE_ATTRIBUTE),
    );
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout = 0;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = window.setTimeout(
      () => reject(new Error("城市现场取景超时，请稍后重试")),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    window.clearTimeout(timeout);
  }
}

function normalizeUnsupportedColors(
  clonedDocument: Document,
  captureToken: string,
): void {
  const root = clonedDocument.querySelector<HTMLElement>(
    `[${CAPTURE_ROOT_ATTRIBUTE}="${captureToken}"]`,
  );
  const cloneWindow = clonedDocument.defaultView;
  if (!root || !cloneWindow) return;
  [root, ...root.querySelectorAll<HTMLElement>("*")].forEach((element) => {
    const computed = cloneWindow.getComputedStyle(element);
    COLOR_STYLE_FALLBACKS.forEach(([property, fallback]) => {
      if (computed.getPropertyValue(property).includes("color(")) {
        element.style.setProperty(property, fallback, "important");
      }
    });
  });
}

export async function captureStreetPhotoFrame(
  mapStage: HTMLElement,
  map: AmapViewLike | null,
): Promise<StreetPhotoFrame | null> {
  const { default: html2canvas } = await importWithChunkRecovery(() => import("html2canvas"));
  const stageRect = mapStage.getBoundingClientRect();
  const mapElement = mapStage.querySelector<HTMLElement>(".sg-amap");
  if (!mapElement) return null;
  const cameraRect = mapStage
    .querySelector<HTMLElement>(".opc-camera-rig")
    ?.getBoundingClientRect();
  const visibleHeight = Math.max(
    160,
    Math.min(
      stageRect.height,
      cameraRect ? cameraRect.top - stageRect.top - 8 : stageRect.height,
    ),
  );
  const pixelRatio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const restoreIgnoredContent = temporarilyIgnoreOffscreenMapContent(
    mapElement,
    visibleHeight,
  );
  const captureToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  mapElement.setAttribute(CAPTURE_ROOT_ATTRIBUTE, captureToken);
  let fullCanvas: HTMLCanvasElement;
  try {
    fullCanvas = await withTimeout(
      html2canvas(mapElement, {
        backgroundColor: "#f4f0de",
        width: Math.round(stageRect.width),
        height: Math.round(visibleHeight),
        windowWidth: document.documentElement.clientWidth,
        windowHeight: document.documentElement.clientHeight,
        scale: pixelRatio,
        logging: false,
        useCORS: true,
        allowTaint: false,
        imageTimeout: 2_500,
        onclone: (clonedDocument) =>
          normalizeUnsupportedColors(clonedDocument, captureToken),
        ignoreElements: (element) =>
          element.matches?.(CAPTURE_IGNORE_SELECTOR) ?? false,
      }),
      CAPTURE_TIMEOUT_MS,
    );
  } finally {
    mapElement.removeAttribute(CAPTURE_ROOT_ATTRIBUTE);
    restoreIgnoredContent();
  }
  const frame = encodeCaptureCanvas(fullCanvas);
  if (!frame) return null;
  return { ...frame, mapView: readStreetPhotoMapView(map) };
}
