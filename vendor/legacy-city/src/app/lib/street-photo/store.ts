import type { RoutePoint } from "../spatial/amapWalkingRoute";

export type StreetPhotoSubjectKind =
  | "guide"
  | "walking-companion"
  | "pocket-buddy"
  | "plant";

export type StreetPhotoSubject = {
  id: string;
  name: string;
  kind: StreetPhotoSubjectKind;
  imageUrl?: string;
  color?: string;
};

export type StreetPhotoPlant = {
  id: string;
  name: string;
  imageUrl: string;
  position: RoutePoint;
  source: "city" | "pocket";
};

export type StreetPhotoMapView = {
  center: RoutePoint;
  zoom: number;
  rotation: number;
  pitch: number;
};

export type StreetPhotoFrame = {
  dataUrl: string;
  width: number;
  height: number;
  source: "live-map";
  mapView: StreetPhotoMapView;
};

export type StreetPhotoScene = {
  city: string;
  place: string;
  position: RoutePoint;
  guide: StreetPhotoSubject;
  companions: StreetPhotoSubject[];
  pocketBuddies: StreetPhotoSubject[];
  nearbyPlant: StreetPhotoPlant | null;
  frame?: StreetPhotoFrame;
};

export type StreetPhoto = StreetPhotoScene & {
  id: string;
  capturedAt: string;
  hostPlant: StreetPhotoPlant | null;
};

const STORAGE_KEY = "carry-the-cosmos.street-photos.v1";
const subscribers = new Set<() => void>();
let memoryPhotos: StreetPhoto[] = [];

function isRoutePoint(value: unknown): value is RoutePoint {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((coordinate) => Number.isFinite(coordinate))
  );
}

function isStreetPhotoSubject(value: unknown): value is StreetPhotoSubject {
  if (!value || typeof value !== "object") return false;
  const subject = value as Partial<StreetPhotoSubject>;
  return (
    typeof subject.id === "string" &&
    typeof subject.name === "string" &&
    ["guide", "walking-companion", "pocket-buddy", "plant"].includes(
      subject.kind || "",
    )
  );
}

function isStreetPhotoPlant(value: unknown): value is StreetPhotoPlant {
  if (!value || typeof value !== "object") return false;
  const plant = value as Partial<StreetPhotoPlant>;
  return (
    typeof plant.id === "string" &&
    typeof plant.name === "string" &&
    typeof plant.imageUrl === "string" &&
    isRoutePoint(plant.position) &&
    (plant.source === "city" || plant.source === "pocket")
  );
}

function isStreetPhotoFrame(value: unknown): value is StreetPhotoFrame {
  if (!value || typeof value !== "object") return false;
  const frame = value as Partial<StreetPhotoFrame>;
  return (
    frame.source === "live-map" &&
    typeof frame.dataUrl === "string" &&
    frame.dataUrl.startsWith("data:image/") &&
    typeof frame.width === "number" &&
    Number.isFinite(frame.width) &&
    frame.width > 0 &&
    typeof frame.height === "number" &&
    Number.isFinite(frame.height) &&
    frame.height > 0 &&
    Boolean(
      frame.mapView &&
        isRoutePoint(frame.mapView.center) &&
        Number.isFinite(frame.mapView.zoom) &&
        Number.isFinite(frame.mapView.rotation) &&
        Number.isFinite(frame.mapView.pitch),
    )
  );
}

function isStreetPhoto(value: unknown): value is StreetPhoto {
  if (!value || typeof value !== "object") return false;
  const photo = value as Partial<StreetPhoto>;
  return (
    typeof photo.id === "string" &&
    typeof photo.capturedAt === "string" &&
    typeof photo.city === "string" &&
    typeof photo.place === "string" &&
    isRoutePoint(photo.position) &&
    isStreetPhotoSubject(photo.guide) &&
    Array.isArray(photo.companions) &&
    photo.companions.every(isStreetPhotoSubject) &&
    Array.isArray(photo.pocketBuddies) &&
    photo.pocketBuddies.every(isStreetPhotoSubject) &&
    (photo.nearbyPlant === null || isStreetPhotoPlant(photo.nearbyPlant)) &&
    (photo.hostPlant === null || isStreetPhotoPlant(photo.hostPlant)) &&
    (photo.frame === undefined || isStreetPhotoFrame(photo.frame))
  );
}

export function cloneStreetPhotoScene(scene: StreetPhotoScene): StreetPhotoScene {
  return {
    ...scene,
    position: [...scene.position],
    guide: { ...scene.guide },
    companions: scene.companions.map((subject) => ({ ...subject })),
    pocketBuddies: scene.pocketBuddies.map((subject) => ({ ...subject })),
    nearbyPlant: scene.nearbyPlant
      ? { ...scene.nearbyPlant, position: [...scene.nearbyPlant.position] }
      : null,
    frame: scene.frame
      ? {
          ...scene.frame,
          mapView: {
            ...scene.frame.mapView,
            center: [...scene.frame.mapView.center],
          },
        }
      : undefined,
  };
}

export function readStreetPhotos(): StreetPhoto[] {
  if (typeof localStorage === "undefined") return [...memoryPhotos];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isStreetPhoto) : [];
  } catch {
    return [];
  }
}

export function writeStreetPhotos(photos: readonly StreetPhoto[]): void {
  memoryPhotos = [...photos];
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(photos));
    } catch {
      // Private browsing and full storage must not break an active outing.
    }
  }
  subscribers.forEach((subscriber) => subscriber());
}

export function saveStreetPhoto(
  scene: StreetPhotoScene,
  hostPlant: StreetPhotoPlant | null,
  capturedAt = new Date().toISOString(),
): StreetPhoto {
  const frozenScene = cloneStreetPhotoScene(scene);
  const photo: StreetPhoto = {
    ...frozenScene,
    id: `street-photo-${capturedAt}-${Math.random().toString(36).slice(2, 8)}`,
    capturedAt,
    hostPlant: hostPlant
      ? { ...hostPlant, position: [...hostPlant.position] }
      : null,
  };
  writeStreetPhotos([...readStreetPhotos(), photo]);
  return photo;
}

export function getStreetPhotoMarkerImage(photo: StreetPhoto): string {
  return (
    photo.frame?.dataUrl ||
    photo.companions[0]?.imageUrl ||
    photo.pocketBuddies[0]?.imageUrl ||
    photo.guide.imageUrl ||
    photo.hostPlant?.imageUrl ||
    ""
  );
}

export function subscribeStreetPhotos(subscriber: () => void): () => void {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

export function removeStreetPhoto(id: string): void {
  writeStreetPhotos(readStreetPhotos().filter((photo) => photo.id !== id));
}

export function resetStreetPhotosForTests(): void {
  memoryPhotos = [];
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore inaccessible browser storage in tests.
    }
  }
  subscribers.forEach((subscriber) => subscriber());
}
