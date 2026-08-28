type DetachableMarker<Position> = {
  hide: () => void;
  setMap?: (map: unknown | null) => void;
  setPosition: (position: Position) => void;
  show: () => void;
};

type DetachableMarkerEntry<Position> = {
  button: {
    hidden: boolean;
  };
  map: unknown;
  marker: DetachableMarker<Position>;
  visible: boolean;
};

type LazyDetachableMarkerEntry<
  Position,
  Marker extends DetachableMarker<Position>,
> = Omit<DetachableMarkerEntry<Position>, "marker"> & {
  marker: Marker | null;
};

export function setDetachableMarkerVisibility<Position>(
  entry: DetachableMarkerEntry<Position>,
  visible: boolean,
  position: Position,
) {
  if (entry.visible === visible) return;

  entry.visible = visible;
  entry.button.hidden = !visible;
  if (visible) {
    entry.marker.setMap?.(entry.map);
    // AMap may retain a stale screen projection while detached. Re-applying
    // the authoritative geo position before showing keeps the flower grounded.
    entry.marker.setPosition(position);
    entry.marker.show();
    return;
  }

  entry.marker.hide();
  // Unlike Marker#hide(), detaching removes its DOM and event work from the
  // active map while keeping the React host ready for an instant reload.
  entry.marker.setMap?.(null);
}

export function setLazyDetachableMarkerVisibility<
  Position,
  Marker extends DetachableMarker<Position>,
>(
  entry: LazyDetachableMarkerEntry<Position, Marker>,
  visible: boolean,
  position: Position,
  createMarker: () => Marker,
): Marker | null {
  if (!entry.marker) {
    entry.visible = false;
    entry.button.hidden = true;
    if (!visible) return null;
    entry.marker = createMarker();
  }

  const visibilityEntry = {
    button: entry.button,
    map: entry.map,
    marker: entry.marker,
    visible: entry.visible,
  };
  setDetachableMarkerVisibility(visibilityEntry, visible, position);
  entry.visible = visibilityEntry.visible;
  return entry.marker;
}
