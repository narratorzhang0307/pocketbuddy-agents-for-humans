import { HEALTH_EVENT_PROTOCOL, type DeviceEvent, type HealthEvent, type JsonObject, validateDeviceEvent } from './contracts';
import type { AppendResult, TaskmasterStore } from './store';

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) { result ^= value.charCodeAt(index); result = Math.imul(result, 16777619); }
  return `fnv1a-${(result >>> 0).toString(16)}`;
}

function validRoutePoints(value: unknown): value is Array<{ latitude: number; longitude: number; at?: string }> {
  return Array.isArray(value) && value.every((point) => point && typeof point === 'object'
    && typeof (point as Record<string, unknown>).latitude === 'number'
    && Number((point as Record<string, unknown>).latitude) >= -90
    && Number((point as Record<string, unknown>).latitude) <= 90
    && typeof (point as Record<string, unknown>).longitude === 'number'
    && Number((point as Record<string, unknown>).longitude) >= -180
    && Number((point as Record<string, unknown>).longitude) <= 180);
}

export function deviceToHealthEvent(device: DeviceEvent): HealthEvent {
  const facts: JsonObject = structuredClone(device.payload);
  if ('route_points' in facts && !validRoutePoints(facts.route_points)) throw new Error('invalid_route_points');
  // 只携带设备真实上报的位置；绝不补点、猜点或用默认坐标伪造路线。
  if (device.geo) facts.geo = structuredClone(device.geo) as unknown as JsonObject;

  let domain: HealthEvent['domain'] = 'device';
  let type: HealthEvent['type'] = 'device_state_changed';
  if (device.kind === 'workout_completed') { domain = 'workout'; type = 'run_completed'; }
  if (device.kind === 'nature_capture') { domain = 'nature'; type = 'nature_captured'; }
  if (device.kind === 'skill_completed') { domain = 'skill'; type = 'skill_completed'; }

  return {
    protocol: HEALTH_EVENT_PROTOCOL,
    event_id: `health:${device.event_id}`,
    user_id: device.user_id,
    occurred_at: device.occurred_at,
    domain,
    type,
    source: { device_id: device.device_id, provider: 'esp32-device-gateway' },
    facts,
    confidence: 1,
    provenance: { model_version: 'none', tool_version: 'device-gateway/1.0.0', input_hash: hash(JSON.stringify(device)) },
    visibility: 'private',
    sync: { state: 'pending', revision: device.sync.revision },
  };
}

export interface DeviceReplayResult {
  accepted: number;
  duplicates: number;
  rejected: Array<{ event_id?: string; errors: string[] }>;
  results: AppendResult[];
}

export async function replayDeviceEvents(store: TaskmasterStore, values: unknown[]): Promise<DeviceReplayResult> {
  const result: DeviceReplayResult = { accepted: 0, duplicates: 0, rejected: [], results: [] };
  for (const value of values) {
    const validation = validateDeviceEvent(value);
    if (!validation.ok || !validation.value) {
      const eventId = value && typeof value === 'object' && 'event_id' in value ? String((value as { event_id?: unknown }).event_id || '') : undefined;
      result.rejected.push({ event_id: eventId, errors: validation.errors });
      continue;
    }
    try {
      const appended = await store.appendHealthEvent(deviceToHealthEvent(validation.value));
      result.results.push(appended);
      if (appended.status === 'duplicate') result.duplicates += 1;
      else result.accepted += 1;
    } catch (error) {
      result.rejected.push({ event_id: validation.value.event_id, errors: [error instanceof Error ? error.message : 'device_replay_failed'] });
    }
  }
  return result;
}
