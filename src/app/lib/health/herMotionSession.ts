import type { FrostTaskHandoff } from '../../../../frost-agent/harness/taskHandoff';
import { validateHealthEvent, type HealthEvent, type JsonObject } from '../../../../frost-agent/taskmaster/contracts';
import { shouldAutoStartHerMotion } from './herMotionLaunch';

export const HER_MOTION_SESSION_PROTOCOL = 'pocket-skill-session/v1' as const;
export const HER_MOTION_BRIDGE_PROTOCOL = 'pocket-her-motion-bridge/v1' as const;
export const HER_MOTION_SESSION_EVENT = 'pocket-earth:her-motion-session-changed';
export const HER_MOTION_HEALTH_EVENT = 'pocket-earth:health-event-changed';

const STORAGE_KEY = 'pe.health.her-motion-sessions.v1';
const HEALTH_EVENT_STORAGE_KEY = 'pe.health.events.v1';
const MAX_SESSIONS = 50;
const MAX_HEALTH_EVENTS = 500;

export type HerMotionSessionStatus = 'running' | 'completed' | 'cancelled';

export interface HerMotionSessionEvent {
  type: 'launched' | 'opened' | 'workout-started' | 'pose-confirmed' | 'completed' | 'cancelled';
  at: string;
  detail: string;
}

export interface HerMotionSkillSession {
  protocol: typeof HER_MOTION_SESSION_PROTOCOL;
  sessionId: string;
  skillId: 'pocket.her-motion';
  skillName: 'Her Motion';
  status: HerMotionSessionStatus;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  durationSec?: number;
  domain?: string;
  exerciseId?: string;
  exerciseName?: string;
  poseConfirmed: boolean;
  confidence?: number;
  stopReason?: string;
  healthEventId?: string;
  source: 'her-motion-local-vision';
  privacy: 'private-local';
  planId?: string;
  stepId?: string;
  taskmasterTaskId?: string;
  events: HerMotionSessionEvent[];
}

export interface HerMotionBridgeMessage {
  protocol: typeof HER_MOTION_BRIDGE_PROTOCOL;
  sessionId: string;
  type: 'opened' | 'workout-started' | 'pose-confirmed' | 'completed' | 'cancelled';
  at: string;
  domain?: string;
  exerciseId?: string;
  exerciseName?: string;
  durationSec?: number;
  confidence?: number;
  poseConfirmed?: boolean;
  stopReason?: string;
}

function storage(): Storage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; } catch { return undefined; }
}

function notify(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(HER_MOTION_SESSION_EVENT));
}

function read(): HerMotionSkillSession[] {
  try {
    const parsed = JSON.parse(storage()?.getItem(STORAGE_KEY) || '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is HerMotionSkillSession => (
      !!item && typeof item === 'object'
      && (item as HerMotionSkillSession).protocol === HER_MOTION_SESSION_PROTOCOL
      && typeof (item as HerMotionSkillSession).sessionId === 'string'
    ));
  } catch { return []; }
}

function write(sessions: HerMotionSkillSession[]): void {
  try { storage()?.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS))); } catch { /* private mode */ }
  notify();
}

function readHealthEvents(): HealthEvent[] {
  try {
    const parsed = JSON.parse(storage()?.getItem(HEALTH_EVENT_STORAGE_KEY) || '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((event): event is HealthEvent => validateHealthEvent(event).ok);
  } catch { return []; }
}

function writeHealthEvent(event: HealthEvent): void {
  const events = readHealthEvents();
  const index = events.findIndex((item) => item.event_id === event.event_id);
  if (index >= 0) events[index] = event;
  else events.unshift(event);
  try { storage()?.setItem(HEALTH_EVENT_STORAGE_KEY, JSON.stringify(events.slice(0, MAX_HEALTH_EVENTS))); } catch { /* private mode */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(HER_MOTION_HEALTH_EVENT));
}

function eventDetail(message: HerMotionBridgeMessage): string {
  if (message.type === 'opened') return 'Her Motion 已接收 Frost 会话';
  if (message.type === 'workout-started') return `开始 ${message.exerciseName || message.exerciseId || '动作陪伴'}`;
  if (message.type === 'pose-confirmed') return `本地视觉确认动作${typeof message.confidence === 'number' ? ` · ${Math.round(message.confidence * 100)}%` : ''}`;
  if (message.type === 'completed') return `完成 ${message.exerciseName || message.exerciseId || '动作陪伴'} · ${Math.max(0, Math.round(message.durationSec || 0))} 秒`;
  return 'Her Motion 会话已取消';
}

function safeNumber(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, value));
}

export function listHerMotionSessions(): HerMotionSkillSession[] {
  return read().sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function listHerMotionHealthEvents(): HealthEvent[] {
  return readHealthEvents().filter((event) => event.source.provider === 'her-motion');
}

export function getHerMotionSession(sessionId: string): HerMotionSkillSession | null {
  return read().find((session) => session.sessionId === sessionId) ?? null;
}

/** A host reload cannot keep an iframe camera session alive; close those orphaned runs honestly. */
export function cancelAbandonedHerMotionSessions(): number {
  const sessions = read();
  const running = sessions.filter((session) => session.status === 'running');
  if (!running.length) return 0;
  const at = new Date().toISOString();
  const recoveredEvent: HerMotionSessionEvent = { type: 'cancelled', at, detail: 'Pocket Buddy 恢复页面时安全结束了未完成会话' };
  const next = sessions.map((session): HerMotionSkillSession => session.status !== 'running' ? session : ({
    ...session,
    status: 'cancelled',
    updatedAt: at,
    stopReason: 'host_recovered',
    events: [...session.events, recoveredEvent].slice(-30),
  }));
  write(next);
  return running.length;
}

export function subscribeHerMotionSessions(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(HER_MOTION_SESSION_EVENT, listener);
  return () => window.removeEventListener(HER_MOTION_SESSION_EVENT, listener);
}

export function createHerMotionSession(handoff?: FrostTaskHandoff | null, taskmasterTaskId?: string): HerMotionSkillSession {
  const at = new Date().toISOString();
  const session: HerMotionSkillSession = {
    protocol: HER_MOTION_SESSION_PROTOCOL,
    sessionId: `her-motion-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    skillId: 'pocket.her-motion',
    skillName: 'Her Motion',
    status: 'running',
    startedAt: at,
    updatedAt: at,
    poseConfirmed: false,
    source: 'her-motion-local-vision',
    privacy: 'private-local',
    ...(handoff ? { planId: handoff.planId, stepId: handoff.stepId } : {}),
    ...(taskmasterTaskId || handoff?.taskmasterTaskId ? { taskmasterTaskId: taskmasterTaskId || handoff?.taskmasterTaskId } : {}),
    events: [{ type: 'launched', at, detail: 'Frost 已创建并打开 Her Motion Skill 会话' }],
  };
  write([session, ...read()]);
  return session;
}

export function applyHerMotionBridgeMessage(message: HerMotionBridgeMessage): HerMotionSkillSession | null {
  if (message.protocol !== HER_MOTION_BRIDGE_PROTOCOL || !message.sessionId || !message.at) return null;
  const sessions = read();
  const index = sessions.findIndex((session) => session.sessionId === message.sessionId);
  if (index < 0 || sessions[index].status !== 'running') return null;
  const current = sessions[index];
  const status: HerMotionSessionStatus = message.type === 'completed' ? 'completed' : message.type === 'cancelled' ? 'cancelled' : 'running';
  const healthEventId = message.type === 'completed' ? `health:${current.sessionId}` : current.healthEventId;
  const next: HerMotionSkillSession = {
    ...current,
    status,
    updatedAt: message.at,
    ...(message.type === 'completed' ? { completedAt: message.at } : {}),
    ...(message.domain ? { domain: message.domain.slice(0, 40) } : {}),
    ...(message.exerciseId ? { exerciseId: message.exerciseId.slice(0, 80) } : {}),
    ...(message.exerciseName ? { exerciseName: message.exerciseName.slice(0, 80) } : {}),
    ...(safeNumber(message.durationSec, 0, 24 * 3600) !== undefined ? { durationSec: Math.round(safeNumber(message.durationSec, 0, 24 * 3600)!) } : {}),
    poseConfirmed: current.poseConfirmed || message.type === 'pose-confirmed' || message.poseConfirmed === true,
    ...(safeNumber(message.confidence, 0, 1) !== undefined ? { confidence: safeNumber(message.confidence, 0, 1) } : {}),
    ...(message.stopReason ? { stopReason: message.stopReason.slice(0, 80) } : {}),
    ...(healthEventId ? { healthEventId } : {}),
    events: [...current.events, { type: message.type, at: message.at, detail: eventDetail(message) }].slice(-30),
  };
  sessions[index] = next;
  write(sessions);
  if (message.type === 'completed' && !next.taskmasterTaskId) {
    const facts: JsonObject = {
      session_id: next.sessionId,
      skill_id: next.skillId,
      pose_confirmed: next.poseConfirmed,
      duration_sec: next.durationSec ?? 0,
      ...(next.domain ? { domain: next.domain } : {}),
      ...(next.exerciseId ? { exercise_id: next.exerciseId } : {}),
      ...(next.exerciseName ? { exercise_name: next.exerciseName } : {}),
      ...(next.planId ? { plan_id: next.planId } : {}),
      ...(next.stepId ? { step_id: next.stepId } : {}),
    };
    const event: HealthEvent = {
      protocol: 'health_event/v1',
      event_id: healthEventId!,
      user_id: 'local-user',
      occurred_at: message.at,
      domain: 'skill',
      type: 'skill_completed',
      source: { device_id: 'browser-local', provider: 'her-motion' },
      facts,
      confidence: next.confidence ?? (next.poseConfirmed ? 0.7 : 0.4),
      provenance: {
        model_version: 'her-motion-bundled-mediapipe-pose/1.0',
        tool_version: 'her-motion-frost-adapter/1.0.0',
        input_hash: next.sessionId,
      },
      visibility: 'private',
      sync: { state: 'pending', revision: 1 },
    };
    if (validateHealthEvent(event).ok) writeHealthEvent(event);
  }
  return next;
}

export function buildHerMotionSkillUrl(launchUrl: string, session: HerMotionSkillSession, handoff?: FrostTaskHandoff | null): string {
  const url = new URL(launchUrl, window.location.href);
  url.searchParams.set('frost_session_id', session.sessionId);
  url.searchParams.set('frost_skill_id', session.skillId);
  const parent = new URL(window.location.href);
  url.searchParams.set('frost_origin', parent.origin === 'null' ? `${parent.protocol}//${parent.host}` : parent.origin);
  url.searchParams.set('frost_return_url', window.location.href.split('#')[0]);
  url.searchParams.set('frost_embed', '1');
  if (session.planId) url.searchParams.set('frost_plan_id', session.planId);
  if (session.stepId) url.searchParams.set('frost_step_id', session.stepId);
  if (session.taskmasterTaskId) url.searchParams.set('frost_task_id', session.taskmasterTaskId);
  for (const key of ['frost_auto_camera', 'frost_run_id', 'frost_requested_at']) url.searchParams.delete(key);
  if (handoff && shouldAutoStartHerMotion(handoff)) {
    url.searchParams.set('frost_auto_camera', '1');
    url.searchParams.set('frost_run_id', handoff.runId);
    url.searchParams.set('frost_requested_at', handoff.createdAt);
  }
  return url.toString();
}

export function isHerMotionFrameEvent(event: MessageEvent, launchUrl: string, expectedSource?: () => MessageEventSource | null): boolean {
  const expectedUrl = new URL(launchUrl, window.location.href);
  const nativeFrame = expectedUrl.protocol === 'capacitor:' && expectedUrl.host === 'localhost';
  const expectedOrigin = nativeFrame ? 'capacitor://localhost' : expectedUrl.origin;
  if (event.origin !== expectedOrigin && !(nativeFrame && expectedSource && event.origin === 'null')) return false;
  if (expectedSource) {
    const source = expectedSource();
    if (!source || event.source !== source) return false;
  }
  return true;
}

export function installHerMotionBridge(launchUrl: string, expectedSource?: () => MessageEventSource | null, expectedSessionId?: string): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onMessage = (event: MessageEvent<unknown>) => {
    if (!isHerMotionFrameEvent(event, launchUrl, expectedSource) || !event.data || typeof event.data !== 'object') return;
    const message = event.data as Partial<HerMotionBridgeMessage>;
    if (message.protocol !== HER_MOTION_BRIDGE_PROTOCOL || typeof message.sessionId !== 'string' || typeof message.type !== 'string' || typeof message.at !== 'string') return;
    if (expectedSessionId && message.sessionId !== expectedSessionId) return;
    if (!['opened', 'workout-started', 'pose-confirmed', 'completed', 'cancelled'].includes(message.type)) return;
    applyHerMotionBridgeMessage(message as HerMotionBridgeMessage);
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}
