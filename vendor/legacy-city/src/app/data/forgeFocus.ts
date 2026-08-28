export type ForgeSection = 'shape' | 'pocket' | 'avatar';

export interface ForgeFocusRequest {
  section: ForgeSection;
  entityId?: string;
}

let pending: ForgeFocusRequest | null = null;
const subscribers = new Set<(request: ForgeFocusRequest) => void>();

export function requestForgeFocus(request: ForgeFocusRequest) {
  pending = request;
  subscribers.forEach((subscriber) => subscriber(request));
}

export function consumeForgeFocus() {
  const request = pending;
  pending = null;
  return request;
}

export function getPendingForgeFocus() {
  return pending;
}

export function subscribeForgeFocus(
  subscriber: (request: ForgeFocusRequest) => void,
) {
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}
