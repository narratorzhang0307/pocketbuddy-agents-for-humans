export interface AmapBuildingLayer {
  show(): void;
  hide(): void;
}

interface BuildingMap {
  add(layer: AmapBuildingLayer): void;
  remove(layer: AmapBuildingLayer): void;
}

interface BuildingApi {
  Buildings: new (options: Record<string, unknown>) => AmapBuildingLayer;
}

// Buildings is optional. In particular, an iOS WebView can load the base map
// but reject this 3D layer; never create it just to immediately hide it.
export function setAmapBuildingsVisible(
  map: BuildingMap,
  api: BuildingApi,
  current: AmapBuildingLayer | null,
  visible: boolean,
): AmapBuildingLayer | null {
  if (!visible) {
    current?.hide();
    return current;
  }
  if (current) {
    current.show();
    return current;
  }

  const layer = new api.Buildings({
    zooms: [16.8, 20],
    zIndex: 44,
    heightFactor: 0.55,
    wallColor: "#ffffff",
    roofColor: "#ffffff",
  });
  try {
    map.add(layer);
    return layer;
  } catch (error) {
    // add() may have partially attached the layer before the renderer failed.
    try { map.remove(layer); } catch { /* Keep the original SDK failure. */ }
    throw error;
  }
}

export function formatAmapError(error: unknown): string {
  // Safari's stack omits the message; Capacitor serializes Error objects as {}.
  const detail = error instanceof Error
    ? `${error.name}: ${error.message}\n${error.stack || ""}`
    : String(error);
  return detail.replace(
    /([?&](?:key|jscode|securityJsCode|token)=)[^&\s)]+/gi,
    "$1[REDACTED]",
  );
}
