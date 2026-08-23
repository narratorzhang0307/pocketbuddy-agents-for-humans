import { z } from 'zod';

export const llmGenerateSchema = z.object({
  prompt: z.string().trim().min(1).max(12000),
  system: z.string().trim().max(4000).optional(),
  json: z.boolean().optional().default(false),
  task: z.string().trim().min(1).max(80).optional().default('default'),
}).strict();

export type LlmGenerateInput = z.infer<typeof llmGenerateSchema>;
