export type StreetPane = '种植物' | '街头' | '手帐';

let pending: StreetPane | null = null;
const subs = new Set<(pane: StreetPane) => void>();

export function requestStreetPane(pane: StreetPane): void {
  pending = pane;
  subs.forEach((subscriber) => subscriber(pane));
}

export function consumePendingStreetPane(): StreetPane | null {
  const pane = pending;
  pending = null;
  return pane;
}

export function subscribeStreetPane(
  subscriber: (pane: StreetPane) => void,
): () => void {
  subs.add(subscriber);
  return () => { subs.delete(subscriber); };
}
