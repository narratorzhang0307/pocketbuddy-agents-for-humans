import { recordHealth } from '../harness/health';
import { callEdgeRequest } from './httpEdge';
import type { EdgeChatOpts } from './types';

export type TravelRuntimePhase = 'checking' | 'ready' | 'unavailable';

export interface TravelPlannerRuntimeStatus {
  phase: TravelRuntimePhase;
  engine: 'mnn' | 'stub';
  baseReady: boolean;
  adapterReady: boolean;
  baseModel: 'Qwen3-VL-2B-Instruct';
  adapter: 'travel-planner';
  runtime: 'MNN 3.6.1';
  error?: string;
}

export async function getTravelPlannerRuntimeStatus(): Promise<TravelPlannerRuntimeStatus> {
  const response = await callEdgeRequest({ task: 'runtime_status' }, 6500);
  const runtime = response.runtime;
  const baseReady = response.backend === 'mnn' && runtime?.textReady === true;
  const adapterReady = runtime?.adapters?.['travel-planner']?.installed === true;
  const ready = baseReady && adapterReady;
  recordHealth('edge.travel-planner.status', ready, response.error);
  return {
    phase: ready ? 'ready' : 'unavailable',
    engine: ready ? 'mnn' : 'stub',
    baseReady,
    adapterReady,
    baseModel: 'Qwen3-VL-2B-Instruct',
    adapter: 'travel-planner',
    runtime: 'MNN 3.6.1',
    error: response.error,
  };
}

export async function runQwenAdapter(
  prompt: string,
  options: EdgeChatOpts & { adapter: 'travel-planner' },
): Promise<{ text: string; backend: 'mnn' | 'stub'; error?: string; elapsedMs?: number; model?: string; adapterLoaded?: boolean }> {
  const response = await callEdgeRequest({
    task: 'chat',
    prompt,
    system: options.system,
    json: options.json,
    adapter: options.adapter,
    maxTokens: options.maxTokens,
    model: options.model,
  }, 75000);
  const ok = response.backend === 'mnn' && typeof response.text === 'string' && response.text.trim().length > 0;
  recordHealth('edge.travel-planner.inference', ok, response.error);
  return {
    text: ok ? response.text!.trim() : '', backend: ok ? 'mnn' : 'stub', error: response.error,
    elapsedMs: response.stats?.elapsedMs, model: response.model, adapterLoaded: response.adapterLoaded,
  };
}

/** Same travel contract without the adapter, used for explicit A/B and LoRA failure recovery. */
export async function runQwenBase(
  prompt: string,
  options: EdgeChatOpts = {},
): Promise<{ text: string; backend: 'mnn' | 'stub'; error?: string; elapsedMs?: number; model?: string }> {
  const response = await callEdgeRequest({ task: 'chat', prompt, system: options.system, json: options.json, maxTokens: options.maxTokens, model: options.model }, 75000);
  const ok = response.backend === 'mnn' && typeof response.text === 'string' && response.text.trim().length > 0;
  recordHealth('edge.travel-base.inference', ok, response.error);
  return {
    text: ok ? response.text!.trim() : '', backend: ok ? 'mnn' : 'stub', error: response.error,
    elapsedMs: response.stats?.elapsedMs, model: response.model,
  };
}

/** Qwen base is exposed only for a source-grounded travel-place brief. */
export async function runQwenGroundedPlaceBrief(
  prompt: string,
  system: string,
): Promise<{ text: string; backend: 'mnn' | 'stub'; error?: string }> {
  const response = await callEdgeRequest({
    task: 'chat',
    purpose: 'travel-place-brief',
    prompt,
    system,
    maxTokens: 768,
  }, 75000);
  const ok = response.backend === 'mnn' && typeof response.text === 'string' && response.text.trim().length > 0;
  recordHealth('edge.travel-place-brief.inference', ok, response.error);
  return { text: ok ? response.text!.trim() : '', backend: ok ? 'mnn' : 'stub', error: response.error };
}
