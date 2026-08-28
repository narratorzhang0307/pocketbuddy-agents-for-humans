import { describe, expect, it } from 'vitest';
import { FrostAgentLoop, completeDecision } from './agentLoop';
import { InMemoryFrostSessionLog } from './sessionLog';
import { FrostAgentToolRegistry } from './toolRegistry';
import type { FrostAgentModelAdapter } from './contracts';

function loopFor(model: FrostAgentModelAdapter, options = { max_steps: 4, max_tool_calls: 1, deadline_ms: 1000 }) {
  const log = new InMemoryFrostSessionLog();
  const tools = new FrostAgentToolRegistry();
  tools.register({ name: 'test.read', description: 'read', read_only: true, risk: 'low', async execute() { return { status: 'success', data: {} }; } });
  const loop = new FrostAgentLoop(FrostAgentLoop.createSession('budget-session', 'user'), model, tools, log, options);
  return { loop, log };
}

const call = () => ({ ...completeDecision('test'), next_action: { type: 'call_tool', tool: 'test.read', arguments: {} } });

describe('Frost bounded turns', () => {
  it('renews tool budget per turn while preserving cumulative counters and unique call ids', async () => {
    const { loop, log } = loopFor({ async decide(context) {
      return context.events.some((event) => event.type === 'tool.result' && event.data.turn === context.turn) ? completeDecision('done') : call();
    } });
    await loop.initialize();
    for (let n = 0; n < 16; n++) { await loop.followup({ text: 'next' }); await loop.whenIdle(); }
    expect(loop.getSession()).toMatchObject({ status: 'idle', counters: { turns: 16, tool_calls: 16 } });
    const ids = (await log.list('budget-session')).filter((event) => event.type === 'tool.called').map((event) => event.data.call_id);
    expect(new Set(ids).size).toBe(16);
  });

  it('still refuses excess tool calls in a single turn', async () => {
    const { loop, log } = loopFor({ async decide() { return call(); } });
    await loop.initialize(); await loop.followup({ text: 'loop' }); await loop.whenIdle();
    expect(loop.getSession().status).toBe('failed');
    expect((await log.list('budget-session')).find((event) => event.type === 'session.stopped')?.data.reason).toBe('max_tool_calls_exceeded');
  });

  it('stops a hung model at the deadline even when the adapter ignores AbortSignal', async () => {
    const { loop, log } = loopFor({ decide() { return new Promise(() => {}); } }, { max_steps: 4, max_tool_calls: 1, deadline_ms: 20 });
    await loop.initialize(); await loop.followup({ text: 'hang' }); await loop.whenIdle();
    expect(loop.getSession().status).toBe('failed');
    expect((await log.list('budget-session')).find((event) => event.type === 'session.stopped')?.data.reason).toBe('agent_deadline_exceeded');
  });

  it('cancels a hung model and discards queued work without resurrecting the session', async () => {
    const { loop, log } = loopFor({ decide() { return new Promise(() => {}); } });
    await loop.initialize(); await loop.followup({ text: 'hang' });
    await loop.followup({ text: 'queued' });
    await loop.cancel(); await loop.whenIdle();
    expect(loop.getSession().status).toBe('stopped');
    expect((await log.list('budget-session')).some((event) => event.type === 'inbox.discarded')).toBe(true);
  });
});
