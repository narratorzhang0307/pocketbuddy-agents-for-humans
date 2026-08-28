import { CURRENT_CITY_USER_ID } from './seed';
import { gcj02ToWgs84 } from '../location/chinaCoordinates';
import { distanceInMeters } from '../spatial/amapWalkingRoute';
import type {
  CityEvent,
  CityEventKind,
  DutyMode,
  DutySession,
  GeoPoint,
  ProvenanceLevel,
  Visibility,
} from './types';

const STORAGE_KEY = 'shangjie.cityWorld.events.v1';
const EVENT_WORLD_SCHEMA_VERSION = 2;
const MAX_STORED_DUTY_ROUTE_POINTS = 1_200;

interface EventWorldState {
  schemaVersion: 2;
  duties: DutySession[];
  events: CityEvent[];
}

type StoredDutySession = Omit<DutySession, 'ownerId'> & {
  ownerId?: string;
};

type StoredCityEvent = Omit<CityEvent, 'ownerId'> & {
  ownerId?: string;
};

type StoredEventWorldState = {
  schemaVersion?: number;
  duties?: StoredDutySession[];
  events?: StoredCityEvent[];
};

const DUTY_MODES = new Set<DutyMode>([
  'test',
  'gps-companion',
  'delegated',
]);
const DUTY_STATUSES = new Set<DutySession['status']>([
  'draft',
  'running',
  'paused',
  'completed',
  'cancelled',
]);
const EVENT_KINDS = new Set<CityEventKind>([
  'duty-started',
  'duty-completed',
  'arrived',
  'passed-bloom',
  'agent-encounter',
  'postcard-delivered',
  'skill-discovered',
  'skill-installed',
  'skill-published',
  'newspaper-picked-up',
  'dream',
]);
const VISIBILITIES = new Set<Visibility>([
  'private',
  'unlisted',
  'public',
]);
const PROVENANCE_LEVELS = new Set<ProvenanceLevel>([
  'firsthand',
  'agent-report',
  'retold',
  'dream',
]);

interface AppendCityEventInput {
  id?: string;
  ownerId?: string;
  kind: CityEventKind;
  createdAt?: string;
  actorAgentIds: string[];
  dutySessionId?: string;
  bloomId?: string;
  geo?: GeoPoint;
  visibility?: Visibility;
  provenance: ProvenanceLevel;
  payload?: Record<string, unknown>;
}

function defaults(): EventWorldState {
  return {
    schemaVersion: EVENT_WORLD_SCHEMA_VERSION,
    duties: [],
    events: [],
  };
}

export function dutyRouteDistanceMeters(route: readonly GeoPoint[]): number {
  let total = 0;
  for (let index = 1; index < route.length; index += 1) {
    const previous = route[index - 1];
    const current = route[index];
    total += distanceInMeters(
      [previous.lng, previous.lat],
      [current.lng, current.lat],
    );
  }
  return total;
}

export function recoverInterruptedDutySessions(
  duties: readonly DutySession[],
  completedAt = new Date().toISOString(),
): DutySession[] {
  return duties.map((duty) =>
    duty.status === 'running'
      ? {
          ...duty,
          status: 'cancelled',
          completedAt:
            duty.startedAt &&
            timestampPrecedes(completedAt, duty.startedAt)
              ? duty.startedAt
              : completedAt,
        }
      : { ...duty },
  );
}

function normalizeGeoPoint(point: GeoPoint, legacyGcj02: boolean): GeoPoint {
  if (!legacyGcj02) return { ...point };
  const [lng, lat] = gcj02ToWgs84([point.lng, point.lat]);
  return { ...point, lng, lat };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isValidTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    Number.isFinite(Date.parse(value))
  );
}

function assertValidTimestamp(value: string, label: string) {
  if (!isValidTimestamp(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

function timestampPrecedes(value: string, reference: string): boolean {
  return Date.parse(value) < Date.parse(reference);
}

function eventOccursWithinDuty(
  event: Pick<CityEvent, 'createdAt'>,
  duty: Pick<DutySession, 'startedAt' | 'completedAt'>,
): boolean {
  if (
    duty.startedAt &&
    timestampPrecedes(event.createdAt, duty.startedAt)
  ) {
    return false;
  }
  if (
    duty.completedAt &&
    timestampPrecedes(duty.completedAt, event.createdAt)
  ) {
    return false;
  }
  return true;
}

function readGeoPoint(value: unknown): GeoPoint | null {
  if (!isRecord(value)) return null;
  const lng = value.lng;
  const lat = value.lat;
  if (
    typeof lng !== 'number' ||
    typeof lat !== 'number' ||
    !Number.isFinite(lng) ||
    !Number.isFinite(lat) ||
    lng < -180 ||
    lng > 180 ||
    lat < -90 ||
    lat > 90
  ) {
    return null;
  }
  const accuracy = value.accuracy;
  return {
    lng,
    lat,
    ...(
      typeof accuracy === 'number' &&
      Number.isFinite(accuracy) &&
      accuracy >= 0
        ? { accuracy }
        : {}
    ),
  };
}

function requireGeoPoint(value: unknown, label: string): GeoPoint {
  const point = readGeoPoint(value);
  if (!point) throw new Error(`Invalid ${label}.`);
  return point;
}

function cloneEventPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  try {
    const cloned = JSON.parse(JSON.stringify(payload)) as unknown;
    if (!isRecord(cloned)) throw new Error();
    return cloned;
  } catch {
    throw new Error('Invalid city event payload.');
  }
}

function readStoredEventPayload(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  try {
    return cloneEventPayload(value);
  } catch {
    return {};
  }
}

function compactDutyRoute(route: readonly GeoPoint[]): GeoPoint[] {
  let compacted = [...route];
  while (compacted.length > MAX_STORED_DUTY_ROUTE_POINTS) {
    const finalIndex = compacted.length - 1;
    compacted = compacted.filter(
      (_sample, index) =>
        index === 0 || index === finalIndex || index % 2 === 0,
    );
  }
  return compacted;
}

function normalizeStoredDuty(
  value: unknown,
  legacyGcj02: boolean,
): DutySession | null {
  if (!isRecord(value) || !isRecord(value.allowedArea)) return null;
  const center = readGeoPoint(value.allowedArea.center);
  const radiusMeters = value.allowedArea.radiusMeters;
  if (
    typeof value.id !== 'string' ||
    typeof value.agentId !== 'string' ||
    !DUTY_MODES.has(value.mode as DutyMode) ||
    !DUTY_STATUSES.has(value.status as DutySession['status']) ||
    !center ||
    typeof radiusMeters !== 'number' ||
    !Number.isFinite(radiusMeters) ||
    radiusMeters < 0
  ) {
    return null;
  }
  const route = compactDutyRoute(
    Array.isArray(value.route)
      ? value.route
          .map(readGeoPoint)
          .filter((point): point is GeoPoint => Boolean(point))
          .map((point) => normalizeGeoPoint(point, legacyGcj02))
      : [],
  );
  const startedAt = isValidTimestamp(value.startedAt)
    ? value.startedAt
    : undefined;
  const storedCompletedAt = isValidTimestamp(value.completedAt)
    ? value.completedAt
    : undefined;
  const completedAt =
    storedCompletedAt &&
    startedAt &&
    timestampPrecedes(storedCompletedAt, startedAt)
      ? startedAt
      : storedCompletedAt;
  return {
    id: value.id,
    ownerId:
      typeof value.ownerId === 'string'
        ? value.ownerId
        : CURRENT_CITY_USER_ID,
    agentId: value.agentId,
    mode: value.mode as DutyMode,
    status: value.status as DutySession['status'],
    allowedArea: {
      center: normalizeGeoPoint(center, legacyGcj02),
      radiusMeters,
    },
    route,
    ...(startedAt ? { startedAt } : {}),
    ...(completedAt ? { completedAt } : {}),
    eventIds: Array.isArray(value.eventIds)
      ? value.eventIds.filter(
          (eventId): eventId is string => typeof eventId === 'string',
        )
      : [],
  };
}

function normalizeStoredEvent(
  value: unknown,
  dutyOwnerById: ReadonlyMap<string, string>,
  legacyGcj02: boolean,
): CityEvent | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !isValidTimestamp(value.createdAt) ||
    !EVENT_KINDS.has(value.kind as CityEventKind) ||
    !VISIBILITIES.has(value.visibility as Visibility) ||
    !PROVENANCE_LEVELS.has(value.provenance as ProvenanceLevel)
  ) {
    return null;
  }
  const dutySessionId =
    typeof value.dutySessionId === 'string'
      ? value.dutySessionId
      : undefined;
  const geo = readGeoPoint(value.geo);
  return {
    id: value.id,
    ownerId:
      (dutySessionId ? dutyOwnerById.get(dutySessionId) : undefined) ??
      (typeof value.ownerId === 'string'
        ? value.ownerId
        : CURRENT_CITY_USER_ID),
    kind: value.kind as CityEventKind,
    createdAt: value.createdAt,
    actorAgentIds: Array.isArray(value.actorAgentIds)
      ? value.actorAgentIds.filter(
          (agentId): agentId is string => typeof agentId === 'string',
        )
      : [],
    ...(dutySessionId ? { dutySessionId } : {}),
    ...(typeof value.bloomId === 'string'
      ? { bloomId: value.bloomId }
      : {}),
    ...(geo
      ? { geo: normalizeGeoPoint(geo, legacyGcj02) }
      : {}),
    visibility: value.visibility as Visibility,
    provenance: value.provenance as ProvenanceLevel,
    payload: readStoredEventPayload(value.payload),
  };
}

function removeLegacyMapPreviewEvents(events: readonly CityEvent[]): CityEvent[] {
  const previewVisits = events.filter(
    (event) =>
      event.kind === 'passed-bloom' &&
      event.payload.interaction === 'map-preview',
  );
  if (previewVisits.length === 0) return [...events];

  return events.filter((event) => {
    if (
      event.kind === 'passed-bloom' &&
      event.payload.interaction === 'map-preview'
    ) {
      return false;
    }
    if (event.kind !== 'agent-encounter') return true;

    const eventTime = Date.parse(event.createdAt);
    if (!Number.isFinite(eventTime)) return true;
    return !previewVisits.some((preview) => {
      const previewTime = Date.parse(preview.createdAt);
      return (
        preview.bloomId === event.bloomId &&
        preview.dutySessionId === event.dutySessionId &&
        Number.isFinite(previewTime) &&
        Math.abs(eventTime - previewTime) <= 5_000
      );
    });
  });
}

export function migrateEventWorldState(
  parsed: StoredEventWorldState | null,
  recoveredAt = new Date().toISOString(),
): EventWorldState | null {
  if (
    parsed?.schemaVersion !== 1 &&
    parsed?.schemaVersion !== EVENT_WORLD_SCHEMA_VERSION
  ) {
    return null;
  }

  const legacyGcj02 = parsed.schemaVersion === 1;
  const loadedDuties = Array.isArray(parsed.duties) ? parsed.duties : [];
  const seenDutyIds = new Set<string>();
  const duties = recoverInterruptedDutySessions(
    loadedDuties
      .map((duty) => normalizeStoredDuty(duty, legacyGcj02))
      .filter((duty): duty is DutySession => Boolean(duty))
      .filter((duty) => {
        if (seenDutyIds.has(duty.id)) return false;
        seenDutyIds.add(duty.id);
        return true;
      }),
    recoveredAt,
  );
  const dutyOwnerById = new Map(
    duties.map((duty) => [duty.id, duty.ownerId]),
  );
  const dutyById = new Map(duties.map((duty) => [duty.id, duty]));
  const loadedEvents = Array.isArray(parsed.events) ? parsed.events : [];
  const seenEventIds = new Set<string>();
  const migratedEvents = removeLegacyMapPreviewEvents(
    loadedEvents
      .map((event) =>
        normalizeStoredEvent(event, dutyOwnerById, legacyGcj02),
      )
      .filter((event): event is CityEvent => {
        if (!event) return false;
        if (!event.dutySessionId) return true;
        const duty = dutyById.get(event.dutySessionId);
        return Boolean(duty && eventOccursWithinDuty(event, duty));
      }),
  ).filter((event) => {
    if (seenEventIds.has(event.id)) return false;
    seenEventIds.add(event.id);
    return true;
  });
  const existingEventIds = new Set(migratedEvents.map((event) => event.id));
  const recoveredCancellationEvents: CityEvent[] = duties
    .filter(
      (duty) =>
        duty.status === 'cancelled' &&
        !existingEventIds.has(`${duty.id}:completed`),
    )
    .map((duty) => ({
      id: `${duty.id}:completed`,
      ownerId: duty.ownerId,
      kind: 'duty-completed',
      createdAt: duty.completedAt ?? recoveredAt,
      actorAgentIds: [duty.agentId],
      dutySessionId: duty.id,
      geo: duty.route[duty.route.length - 1] ?? duty.allowedArea.center,
      visibility: 'private',
      provenance:
        duty.mode === 'gps-companion' ? 'firsthand' : 'agent-report',
      payload: {
        status: 'cancelled',
        routePointCount: duty.route.length,
        routeDistanceMeters:
          Math.round(dutyRouteDistanceMeters(duty.route) * 10) / 10,
        recovered: true,
      },
    }));
  const events = [...migratedEvents, ...recoveredCancellationEvents];
  const eventIdsByDuty = new Map<string, string[]>();
  events.forEach((event) => {
    if (!event.dutySessionId) return;
    const ids = eventIdsByDuty.get(event.dutySessionId) ?? [];
    ids.push(event.id);
    eventIdsByDuty.set(event.dutySessionId, ids);
  });

  return {
    schemaVersion: EVENT_WORLD_SCHEMA_VERSION,
    duties: duties.map((duty) => ({
      ...duty,
      eventIds: eventIdsByDuty.get(duty.id) ?? [],
    })),
    events,
  };
}

function load(): EventWorldState {
  if (typeof localStorage === 'undefined') return defaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw
      ? (JSON.parse(raw) as StoredEventWorldState)
      : null;
    const normalized = migrateEventWorldState(parsed);
    if (!normalized) return defaults();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // 存储只读或已满时，仍继续使用成功加载并迁移后的内存状态。
    }
    return normalized;
  } catch {
    return defaults();
  }
}

let state = load();
const subscribers = new Set<() => void>();
let fallbackId = 0;

function nextId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}:${crypto.randomUUID()}`;
  }
  fallbackId += 1;
  return `${prefix}:${Date.now()}:${fallbackId}`;
}

function persist() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 隐私模式下保留本次会话的内存状态。
  }
}

function emit() {
  subscribers.forEach((subscriber) => {
    try {
      subscriber();
    } catch (error) {
      console.error('City event subscriber failed.', error);
    }
  });
}

export function subscribeCityEvents(subscriber: () => void): () => void {
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}

export function listDutySessions(ownerId = CURRENT_CITY_USER_ID): DutySession[] {
  return state.duties
    .filter((duty) => duty.ownerId === ownerId)
    .map((duty) => ({
      ...duty,
      allowedArea: {
        ...duty.allowedArea,
        center: { ...duty.allowedArea.center },
      },
      route: duty.route.map((point) => ({ ...point })),
      eventIds: [...duty.eventIds],
    }));
}

export function getDutySession(id: string): DutySession | undefined {
  const duty = state.duties.find((candidate) => candidate.id === id);
  return duty
    ? {
        ...duty,
        allowedArea: {
          ...duty.allowedArea,
          center: { ...duty.allowedArea.center },
        },
        route: duty.route.map((point) => ({ ...point })),
        eventIds: [...duty.eventIds],
      }
    : undefined;
}

export function listCityEvents(ownerId = CURRENT_CITY_USER_ID): CityEvent[] {
  const dutyIds = new Set(listDutySessions(ownerId).map((duty) => duty.id));
  return state.events
    .filter(
      (event) =>
        event.ownerId === ownerId &&
        (!event.dutySessionId || dutyIds.has(event.dutySessionId)),
    )
    .map((event) => ({
      ...event,
      actorAgentIds: [...event.actorAgentIds],
      geo: event.geo ? { ...event.geo } : undefined,
      payload: cloneEventPayload(event.payload),
    }));
}

export function appendCityEvent(input: AppendCityEventInput): CityEvent {
  const id = input.id ?? nextId('event');
  const linkedDuty = input.dutySessionId
    ? state.duties.find((duty) => duty.id === input.dutySessionId)
    : undefined;
  if (input.dutySessionId && !linkedDuty) {
    throw new Error(`Unknown duty session: ${input.dutySessionId}`);
  }
  const ownerId =
    linkedDuty?.ownerId ?? input.ownerId ?? CURRENT_CITY_USER_ID;
  const existing = state.events.find((event) => event.id === id);
  if (existing) {
    if (existing.ownerId !== ownerId) {
      throw new Error(`City event ${id} already belongs to another owner.`);
    }
    if (
      existing.kind !== input.kind ||
      existing.dutySessionId !== input.dutySessionId ||
      existing.bloomId !== input.bloomId
    ) {
      throw new Error(
        `City event ${id} conflicts with an existing event identity.`,
      );
    }
    return {
      ...existing,
      actorAgentIds: [...existing.actorAgentIds],
      geo: existing.geo ? { ...existing.geo } : undefined,
      payload: cloneEventPayload(existing.payload),
    };
  }
  if (!EVENT_KINDS.has(input.kind)) {
    throw new Error(`Invalid city event kind: ${input.kind}`);
  }
  const visibility = input.visibility ?? 'private';
  if (!VISIBILITIES.has(visibility)) {
    throw new Error(`Invalid city event visibility: ${visibility}`);
  }
  if (!PROVENANCE_LEVELS.has(input.provenance)) {
    throw new Error(
      `Invalid city event provenance: ${input.provenance}`,
    );
  }
  const createdAt = input.createdAt ?? new Date().toISOString();
  assertValidTimestamp(createdAt, 'city event time');
  if (
    linkedDuty?.startedAt &&
    timestampPrecedes(createdAt, linkedDuty.startedAt)
  ) {
    throw new Error('City event cannot precede its duty session.');
  }
  if (
    linkedDuty?.completedAt &&
    timestampPrecedes(linkedDuty.completedAt, createdAt)
  ) {
    throw new Error('City event cannot follow its duty session.');
  }
  const geo = input.geo
    ? requireGeoPoint(input.geo, 'city event location')
    : undefined;
  const payload = cloneEventPayload(input.payload ?? {});

  const event: CityEvent = {
    id,
    // 值日内事件必须继承值日所有者；调用方传错 owner 时也不能产生
    // 一个对所有用户都不可见的“幽灵事件”。
    ownerId,
    kind: input.kind,
    createdAt,
    actorAgentIds: [...input.actorAgentIds],
    dutySessionId: input.dutySessionId,
    bloomId: input.bloomId,
    geo,
    visibility,
    provenance: input.provenance,
    payload,
  };
  state = { ...state, events: [...state.events, event] };

  if (event.dutySessionId) {
    state = {
      ...state,
      duties: state.duties.map((duty) =>
        duty.id === event.dutySessionId
          ? { ...duty, eventIds: [...duty.eventIds, event.id] }
          : duty,
      ),
    };
  }

  persist();
  emit();
  return {
    ...event,
    actorAgentIds: [...event.actorAgentIds],
    geo: event.geo ? { ...event.geo } : undefined,
    payload: cloneEventPayload(event.payload),
  };
}

export function startDutySession({
  agentId,
  mode,
  center,
  radiusMeters,
  ownerId = CURRENT_CITY_USER_ID,
  startedAt = new Date().toISOString(),
}: {
  agentId: string;
  mode: DutyMode;
  center: GeoPoint;
  radiusMeters: number;
  ownerId?: string;
  startedAt?: string;
}): DutySession {
  if (!DUTY_MODES.has(mode)) {
    throw new Error(`Invalid duty mode: ${mode}`);
  }
  assertValidTimestamp(startedAt, 'duty start time');
  const dutyCenter = requireGeoPoint(center, 'duty center');
  if (!Number.isFinite(radiusMeters) || radiusMeters < 0) {
    throw new Error(`Invalid duty radius: ${radiusMeters}`);
  }
  const duty: DutySession = {
    id: nextId('duty'),
    ownerId,
    agentId,
    mode,
    status: 'running',
    allowedArea: {
      center: dutyCenter,
      radiusMeters,
    },
    route: [],
    startedAt,
    eventIds: [],
  };
  const previousState = state;
  state = { ...state, duties: [...state.duties, duty] };
  try {
    appendCityEvent({
      id: `${duty.id}:started`,
      kind: 'duty-started',
      createdAt: startedAt,
      actorAgentIds: [agentId],
      ownerId,
      dutySessionId: duty.id,
      geo: dutyCenter,
      provenance: mode === 'gps-companion' ? 'firsthand' : 'agent-report',
      payload: { mode },
    });
  } catch (error) {
    state = previousState;
    persist();
    throw error;
  }
  persist();
  return getDutySession(duty.id) ?? duty;
}

export function appendDutyRoutePoint(dutyId: string, point: GeoPoint) {
  const routePoint = readGeoPoint(point);
  if (!routePoint) return;
  let changed = false;
  state = {
    ...state,
    duties: state.duties.map((duty) => {
      if (duty.id !== dutyId || duty.status !== 'running') return duty;
      const lastPoint = duty.route[duty.route.length - 1];
      if (
        lastPoint &&
        lastPoint.lng === routePoint.lng &&
        lastPoint.lat === routePoint.lat
      ) {
        return duty;
      }
      changed = true;
      const route = [...duty.route, routePoint];
      if (route.length <= MAX_STORED_DUTY_ROUTE_POINTS) {
        return { ...duty, route };
      }
      return {
        ...duty,
        route: compactDutyRoute(route),
      };
    }),
  };
  if (!changed) return;
  persist();
  emit();
}

export function finishDutySession(
  dutyId: string,
  status: 'completed' | 'cancelled' = 'completed',
  completedAt = new Date().toISOString(),
): DutySession | undefined {
  const duty = state.duties.find((candidate) => candidate.id === dutyId);
  if (!duty || duty.status === 'completed' || duty.status === 'cancelled') {
    return duty ? getDutySession(duty.id) : undefined;
  }
  if (status !== 'completed' && status !== 'cancelled') {
    throw new Error(`Invalid duty completion status: ${status}`);
  }
  assertValidTimestamp(completedAt, 'duty completion time');
  if (
    duty.startedAt &&
    timestampPrecedes(completedAt, duty.startedAt)
  ) {
    throw new Error('Duty completion cannot precede its start.');
  }

  const previousState = state;
  state = {
    ...state,
    duties: state.duties.map((candidate) =>
      candidate.id === dutyId
        ? { ...candidate, status, completedAt }
        : candidate,
    ),
  };
  try {
    appendCityEvent({
      id: `${dutyId}:completed`,
      kind: 'duty-completed',
      createdAt: completedAt,
      actorAgentIds: [duty.agentId],
      ownerId: duty.ownerId,
      dutySessionId: duty.id,
      geo: duty.route[duty.route.length - 1] ?? duty.allowedArea.center,
      provenance:
        duty.mode === 'gps-companion' ? 'firsthand' : 'agent-report',
      payload: {
        status,
        routePointCount: duty.route.length,
        routeDistanceMeters:
          Math.round(dutyRouteDistanceMeters(duty.route) * 10) / 10,
      },
    });
  } catch (error) {
    state = previousState;
    persist();
    throw error;
  }
  persist();
  return getDutySession(dutyId);
}

export function resetCityEventWorld() {
  state = defaults();
  fallbackId = 0;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // noop
    }
  }
  emit();
}
