import { z } from 'zod';

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() => z.union([
  z.string(), z.number().finite(), z.boolean(), z.null(),
  z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema),
]));

export const healthEventSchema = z.object({
  schema_version: z.literal(1),
  protocol: z.literal('health_event/v1'),
  event_id: z.string().trim().min(1).max(160),
  user_id: z.string().trim().min(1).max(160),
  occurred_at: z.string().datetime({ offset: true }),
  domain: z.enum(['meal', 'workout', 'nature', 'skill', 'device']),
  type: z.enum(['meal_confirmed', 'run_completed', 'nature_captured', 'skill_completed', 'device_state_changed']),
  source: z.object({ device_id: z.string().trim().min(1).max(160), provider: z.string().trim().min(1).max(160) }).strict(),
  facts: z.record(z.string(), jsonValueSchema),
  confidence: z.number().min(0).max(1),
  provenance: z.object({
    model_version: z.string().trim().min(1).max(160),
    tool_version: z.string().trim().min(1).max(160),
    input_hash: z.string().trim().min(1).max(256),
  }).strict(),
  visibility: z.enum(['private', 'friends', 'public']),
  media_ids: z.array(z.string().trim().min(1).max(160)).max(40),
  sync: z.object({ state: z.enum(['local', 'pending', 'synced', 'failed']), revision: z.number().int().min(0) }).strict(),
  supersedes_event_id: z.string().trim().min(1).max(160).optional(),
}).strict().superRefine((event, context) => {
  if (event.domain === 'skill' && event.type === 'skill_completed') {
    if (typeof event.facts.session_id !== 'string' || !event.facts.session_id.trim()) {
      context.addIssue({ code: 'custom', path: ['facts', 'session_id'], message: 'skill_completed 缺少 session_id' });
    }
    if (typeof event.facts.skill_id !== 'string' || !event.facts.skill_id.trim()) {
      context.addIssue({ code: 'custom', path: ['facts', 'skill_id'], message: 'skill_completed 缺少 skill_id' });
    }
  }
});

export const healthEventBatchSchema = z.object({ events: z.array(z.unknown()).min(1).max(100) }).strict();
export type StoredHealthEvent = z.infer<typeof healthEventSchema>;
