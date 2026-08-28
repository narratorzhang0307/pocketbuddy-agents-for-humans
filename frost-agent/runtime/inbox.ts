import type { JsonObject } from '../taskmaster/contracts';

export type FrostInboxTarget = 'next-turn' | 'next-step';
export type FrostInboxMode = 'followup' | 'steer' | 'inject';
export type FrostInboxSource = 'user' | 'device' | 'skill' | 'goal' | 'system';

export interface FrostInboxItem {
  message_id: string;
  target: FrostInboxTarget;
  mode: FrostInboxMode;
  source: FrostInboxSource;
  content: JsonObject;
  created_at: string;
}

export interface EnqueueFrostInboxItem {
  message_id?: string;
  mode: FrostInboxMode;
  source: FrostInboxSource;
  content: JsonObject;
  created_at?: string;
}

function targetFor(mode: FrostInboxMode): FrostInboxTarget {
  return mode === 'followup' ? 'next-turn' : 'next-step';
}

export class FrostInbox {
  private readonly nextTurn: FrostInboxItem[] = [];
  private readonly nextStep: FrostInboxItem[] = [];
  private sequence = 0;

  enqueue(input: EnqueueFrostInboxItem): FrostInboxItem {
    const target = targetFor(input.mode);
    this.sequence += 1;
    const item: FrostInboxItem = {
      message_id: input.message_id || `inbox:${this.sequence}`,
      target,
      mode: input.mode,
      source: input.source,
      content: structuredClone(input.content),
      created_at: input.created_at || new Date().toISOString(),
    };
    if (this.find(item.message_id)) throw new Error(`inbox_message_id_conflict:${item.message_id}`);
    (target === 'next-turn' ? this.nextTurn : this.nextStep).push(item);
    return structuredClone(item);
  }

  claim(target: FrostInboxTarget): FrostInboxItem[] {
    const queue = target === 'next-turn' ? this.nextTurn : this.nextStep;
    const claimed = queue.splice(0, queue.length);
    return claimed.map((item) => structuredClone(item));
  }

  remove(messageId: string): FrostInboxItem | null {
    for (const queue of [this.nextTurn, this.nextStep]) {
      const index = queue.findIndex((item) => item.message_id === messageId);
      if (index >= 0) return structuredClone(queue.splice(index, 1)[0]);
    }
    return null;
  }

  clear(): FrostInboxItem[] {
    const removed = [...this.nextTurn.splice(0), ...this.nextStep.splice(0)];
    return removed.map((item) => structuredClone(item));
  }

  has(target?: FrostInboxTarget): boolean {
    if (target === 'next-turn') return this.nextTurn.length > 0;
    if (target === 'next-step') return this.nextStep.length > 0;
    return this.nextTurn.length > 0 || this.nextStep.length > 0;
  }

  hasWakingInput(): boolean {
    return this.nextTurn.length > 0 || this.nextStep.some((item) => item.mode === 'steer');
  }

  snapshot(): FrostInboxItem[] {
    return [...this.nextTurn, ...this.nextStep].map((item) => structuredClone(item));
  }

  private find(messageId: string): FrostInboxItem | null {
    return [...this.nextTurn, ...this.nextStep].find((item) => item.message_id === messageId) || null;
  }
}
