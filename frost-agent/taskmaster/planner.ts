import type { FrostTaskKind, FrostTaskRequest, JsonObject } from './contracts';

export interface HealthIntentCandidate { kind: FrostTaskKind; confidence: number }
export interface HealthIntentModel {
  location: 'local' | 'cloud';
  classify(input: { text: string; allowed_kinds: FrostTaskKind[] }): Promise<unknown>;
}
export interface PlanMessageOptions {
  user_id: string;
  input?: JsonObject;
  source?: FrostTaskRequest['source'];
  allow_cloud?: boolean;
  now?: Date;
}
export interface MessagePlanResult {
  request: FrostTaskRequest | null;
  source: 'local-rule' | 'model' | 'none';
  confidence: number;
  reason: string;
}

const allowedKinds: FrostTaskKind[] = ['log_meal', 'start_workout', 'plan_run_route', 'complete_run', 'capture_nature', 'daily_review'];
const rules: Array<{ kind: FrostTaskKind; pattern: RegExp }> = [
  { kind: 'complete_run', pattern: /(跑完|跑步结束|结束跑步|完成.*(跑步|运动)|同步.*路线)/i },
  { kind: 'plan_run_route', pattern: /(带我跑|开始跑步|慢跑).*(\d+(?:\.\d+)?\s*(公里|km|米)|\d+\s*分钟|路线|导航|跑到|跑去)|(规划|生成).*(跑步|慢跑).*路线/i },
  { kind: 'log_meal', pattern: /(这顿|早餐|午餐|晚餐|夜宵|吃了|食物|菜品|食材|热量|卡路里|营养)/i },
  { kind: 'capture_nature', pattern: /(自然时刻|鸟叫|鸟声|植物|昆虫|沿途.*记录|记录.*自然)/i },
  { kind: 'daily_review', pattern: /(今日|今天|一天).*(总结|回顾)|每日总结|明天.*建议/i },
  { kind: 'start_workout', pattern: /(开始|准备|带我|指导).*(跑步|运动|健身|瑜伽|热身)|跑前热身/i },
];

function taskId(kind: FrostTaskKind, now: Date): string {
  return `health-${kind}-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseCandidate(value: unknown): HealthIntentCandidate | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !['kind', 'confidence'].includes(key))) return null;
  if (!allowedKinds.includes(record.kind as FrostTaskKind)) return null;
  if (typeof record.confidence !== 'number' || record.confidence < 0 || record.confidence > 1) return null;
  return { kind: record.kind as FrostTaskKind, confidence: record.confidence };
}

function buildRequest(kind: FrostTaskKind, options: PlanMessageOptions): FrostTaskRequest {
  const now = options.now || new Date();
  // 不把自然语言原文写入长期任务；只携带调用方已结构化、明确授权的输入。
  return {
    task_id: taskId(kind, now), user_id: options.user_id, kind,
    requested_at: now.toISOString(), input: structuredClone(options.input || {}), source: options.source || 'user',
  };
}

export async function planHealthMessage(text: string, options: PlanMessageOptions, model?: HealthIntentModel): Promise<MessagePlanResult> {
  const normalized = text.trim();
  if (!normalized) return { request: null, source: 'none', confidence: 0, reason: 'empty_message' };
  const match = rules.find((rule) => rule.pattern.test(normalized));
  if (match) return { request: buildRequest(match.kind, options), source: 'local-rule', confidence: 0.95, reason: `matched:${match.kind}` };
  if (!model) return { request: null, source: 'none', confidence: 0, reason: 'no_health_intent_match' };
  if (model.location === 'cloud' && !options.allow_cloud) return { request: null, source: 'none', confidence: 0, reason: 'cloud_planner_requires_consent' };
  const candidate = parseCandidate(await model.classify({ text: normalized, allowed_kinds: allowedKinds }));
  if (!candidate || candidate.confidence < 0.7) return { request: null, source: 'none', confidence: candidate?.confidence || 0, reason: 'invalid_or_low_confidence_plan' };
  return { request: buildRequest(candidate.kind, options), source: 'model', confidence: candidate.confidence, reason: `model:${candidate.kind}` };
}
