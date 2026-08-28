import type { JsonObject } from '../taskmaster/contracts';
import {
  validateFrostAgentToolResult,
  type FrostAgentToolApprovalGate,
  type FrostAgentToolContext,
  type FrostAgentToolDefinition,
  type FrostAgentToolResult,
} from './contracts';

export interface FrostAgentToolRegistryOptions {
  approval_gate?: FrostAgentToolApprovalGate;
  default_timeout_ms?: number;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
  return value;
}

function linkedAbort(parent: AbortSignal, timeoutMs: number): {
  signal: AbortSignal;
  interrupted: Promise<never>;
  timedOut: () => boolean;
  close: () => void;
} {
  const controller = new AbortController();
  let timeout = false;
  const relay = () => controller.abort(parent.reason);
  if (parent.aborted) relay();
  else parent.addEventListener('abort', relay, { once: true });
  const timer = setTimeout(() => { timeout = true; controller.abort('tool_timeout'); }, timeoutMs);
  const interrupted = new Promise<never>((_resolve, reject) => {
    const stop = () => reject(new Error(timeout ? 'tool_timeout' : 'tool_cancelled'));
    if (controller.signal.aborted) stop();
    else controller.signal.addEventListener('abort', stop, { once: true });
  });
  return {
    signal: controller.signal,
    interrupted,
    timedOut: () => timeout,
    close: () => { clearTimeout(timer); parent.removeEventListener('abort', relay); },
  };
}

export class FrostAgentToolRegistry {
  private readonly tools = new Map<string, FrostAgentToolDefinition>();

  constructor(private readonly options: FrostAgentToolRegistryOptions = {}) {}

  register(tool: FrostAgentToolDefinition): void {
    if (!tool.name.trim()) throw new Error('tool_name_required');
    if (this.tools.has(tool.name)) throw new Error(`agent_tool_already_registered:${tool.name}`);
    this.tools.set(tool.name, tool);
  }

  get(name: string): FrostAgentToolDefinition | null {
    return this.tools.get(name) || null;
  }

  list(): Array<Pick<FrostAgentToolDefinition, 'name' | 'description' | 'read_only' | 'risk' | 'requires_approval'>> {
    return [...this.tools.values()]
      .filter((tool) => tool.model_visible !== false)
      .map(({ name, description, read_only, risk, requires_approval }) => ({ name, description, read_only, risk, requires_approval }));
  }

  async execute(name: string, input: JsonObject, context: FrostAgentToolContext): Promise<FrostAgentToolResult> {
    const tool = this.get(name);
    if (!tool) return { status: 'error', data: { tool: name }, message: `tool_not_found:${name}` };
    const inputErrors = tool.validate_input?.(structuredClone(input)) || [];
    if (inputErrors.length > 0) return { status: 'error', data: { tool: name }, message: `invalid_tool_input:${inputErrors.join('|')}` };
    if (tool.requires_approval) {
      if (!this.options.approval_gate) {
        return { status: 'waiting_user', data: { tool: name, input: structuredClone(input) }, message: 'tool_approval_required' };
      }
      const approval = await this.options.approval_gate.check({
        tool: { name: tool.name, description: tool.description, read_only: tool.read_only, risk: tool.risk },
        input: structuredClone(input),
        context,
      });
      if (approval.decision === 'ask') {
        return { status: 'waiting_user', data: { tool: name, input: structuredClone(input) }, message: approval.reason };
      }
      if (approval.decision === 'deny') return { status: 'cancelled', data: { tool: name }, message: approval.reason };
    }
    const timeoutMs = tool.timeout_ms ?? this.options.default_timeout_ms ?? 30_000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return { status: 'error', data: { tool: name }, message: 'invalid_tool_timeout' };
    const linked = linkedAbort(context.signal, timeoutMs);
    let raw: FrostAgentToolResult;
    try {
      raw = await Promise.race([
        tool.execute(structuredClone(input), { ...context, signal: linked.signal }),
        linked.interrupted,
      ]);
    } catch (error) {
      if (linked.timedOut()) return { status: 'error', data: { tool: name }, message: 'tool_timeout' };
      if (linked.signal.aborted) return { status: 'cancelled', data: { tool: name }, message: 'tool_cancelled' };
      return { status: 'error', data: { tool: name }, message: error instanceof Error ? error.message : 'tool_execution_failed' };
    } finally {
      linked.close();
    }
    const validation = validateFrostAgentToolResult(raw);
    if (!validation.ok || !validation.value) {
      return { status: 'error', data: { tool: name }, message: `invalid_tool_result:${validation.errors.join('|')}` };
    }
    return deepFreeze(structuredClone(validation.value));
  }
}
