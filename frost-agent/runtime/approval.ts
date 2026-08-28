import type { JsonObject } from '../taskmaster/contracts';
import type { FrostAgentToolApprovalGate, FrostAgentToolApprovalRequest } from './contracts';

export const FROST_APPROVAL_PROTOCOL = 'frost-tool-approval/v1' as const;

export interface FrostApprovalReceipt {
  protocol: typeof FROST_APPROVAL_PROTOCOL;
  approval_id: string;
  session_id: string;
  tool: string;
  input_digest: string;
  decision: 'allow' | 'deny';
  reason: string;
  issued_at: string;
  expires_at: string;
  consumed_at?: string;
}

export interface FrostApprovalStore {
  put(receipt: FrostApprovalReceipt): Promise<void>;
  consume(sessionId: string, tool: string, inputDigest: string, now: string): Promise<FrostApprovalReceipt | null>;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function frostToolInputDigest(tool: string, input: JsonObject): string {
  const value = `${tool}\n${stableJson(input)}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export class InMemoryFrostApprovalStore implements FrostApprovalStore {
  private readonly receipts = new Map<string, FrostApprovalReceipt>();

  async put(receipt: FrostApprovalReceipt): Promise<void> {
    if (this.receipts.has(receipt.approval_id)) throw new Error(`approval_id_conflict:${receipt.approval_id}`);
    this.receipts.set(receipt.approval_id, structuredClone(receipt));
  }

  async consume(sessionId: string, tool: string, inputDigest: string, now: string): Promise<FrostApprovalReceipt | null> {
    const receipt = [...this.receipts.values()].find((item) => item.session_id === sessionId
      && item.tool === tool
      && item.input_digest === inputDigest
      && !item.consumed_at
      && item.expires_at > now);
    if (!receipt) return null;
    receipt.consumed_at = now;
    this.receipts.set(receipt.approval_id, receipt);
    return structuredClone(receipt);
  }
}

export async function issueFrostApproval(
  store: FrostApprovalStore,
  input: {
    approval_id: string;
    session_id: string;
    tool: string;
    arguments: JsonObject;
    decision: 'allow' | 'deny';
    reason: string;
    issued_at?: string;
    ttl_ms?: number;
  },
): Promise<FrostApprovalReceipt> {
  const issuedAt = input.issued_at || new Date().toISOString();
  const receipt: FrostApprovalReceipt = {
    protocol: FROST_APPROVAL_PROTOCOL,
    approval_id: input.approval_id,
    session_id: input.session_id,
    tool: input.tool,
    input_digest: frostToolInputDigest(input.tool, input.arguments),
    decision: input.decision,
    reason: input.reason,
    issued_at: issuedAt,
    expires_at: new Date(new Date(issuedAt).getTime() + (input.ttl_ms ?? 5 * 60 * 1000)).toISOString(),
  };
  await store.put(receipt);
  return structuredClone(receipt);
}

export class ReceiptApprovalGate implements FrostAgentToolApprovalGate {
  constructor(private readonly store: FrostApprovalStore, private readonly now: () => Date = () => new Date()) {}

  async check(request: FrostAgentToolApprovalRequest) {
    const receipt = await this.store.consume(
      request.context.session.session_id,
      request.tool.name,
      frostToolInputDigest(request.tool.name, request.input),
      this.now().toISOString(),
    );
    if (!receipt) return { decision: 'ask' as const, reason: 'structured_tool_approval_required' };
    return { decision: receipt.decision, reason: receipt.reason };
  }
}
