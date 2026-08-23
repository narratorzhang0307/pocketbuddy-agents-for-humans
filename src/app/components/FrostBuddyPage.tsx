import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Check, PackageOpen, Play, Workflow } from 'lucide-react';
import type { FrostPlan, FrostPlanStep } from '../../../frost-agent/harness/skillRouter';
import { stageTaskHandoff } from '../../../frost-agent/harness/taskHandoff';
import { expertForSkill } from '../../../frost-agent/harness/expertRouter';
import { answerFrostMemoryRecallRequest } from '../../../frost-agent/harness/longTermMemory';
import { getSuggestion, subscribeHeartbeat, adoptSuggestion } from '../../../frost-agent/harness/heartbeat';
import { derive, STATE_LABEL, type FrostState } from '../../../frost-agent/buddy/poses';
import { themeFor, THEME_LABEL, type FrostTheme } from '../../../frost-agent/buddy/themes';
import FrostMemoryPanel from './FrostMemoryPanel';
import { startHerMotionTask, startMealTask } from '../lib/healthTaskmasterRuntime';
import { hasActiveFrostAgentSession, readFrostAgentEvents, scheduleFrostAgentGoal, sendFrostAgentMessage, type FrostAgentRunResult } from '../lib/fitnessAgentRuntime';
import './FrostBuddyPage.css';

// FROST · 总编排入口。
// 用户只和 Frost 对话；Frost 读取 Skill 目录，生成可审计计划，并把明确、低风险的任务直接交给目标 Skill。

interface Turn {
  role: 'user' | 'frost';
  text: string;
  trace?: string[];
  plan?: FrostPlan;
  userText?: string;
}

interface Props {
  onBack: () => void;
  onRun?: (target: string) => void;   // 跳到目标 Skill 运行页
}

// 高频快捷入口不做自动执行，只打开目标 Skill。
const QUICK: { label: string; target: string }[] = [
  { label: '跑步路线规划', target: 'frost-run-route' },
  { label: '练了吗 · 动作纠正', target: 'lianlema-coach' },
  { label: 'Her Motion 热身', target: 'her-motion' },
  { label: 'wger 训练计划', target: 'frost-wger-planner' },
  { label: 'Mealie 恢复厨房', target: 'frost-mealie-kitchen' },
  { label: '健康同步', target: 'frost-healthsync' },
  { label: '包装食品', target: 'frost-openfoodfacts' },
  { label: '中国健康库', target: 'frost-cn-health-library' },
  { label: '户外窗口', target: 'frost-outdoor-window' },
  { label: '睡眠侦探', target: 'frost-sleep-detective' },
  { label: '饮食镜头', target: 'frost-meal-lens' },
];

// 两个本机视觉 Skill 打开工作区本身没有外部副作用；摄像头权限仍由目标 Skill 向用户申请。
const AUTO_DISPATCH_TARGETS = new Set([
  'her-motion',
  'lianlema-coach',
  'frost-meal-lens',
  'frost-wger-planner',
  'frost-mealie-kitchen',
]);

const FROST_DACHSHUND_AVATAR = '/assets/pocket-buddy/packages/holiday-christmas-dachshund/portrait-frost-no-hat-v2.png';
const FROST_OPENING_LINE = '我是 Frost。你说目标，我会先在已装备的 Skills 里选择能力、列出计划和权限，再把任务交到正确入口；没有把握时，我不会擅自执行。';
const TASK_SKILL_UI: Record<string, { id: string; name: string; target: string }> = {
  'frost.run-route': { id: 'frost.run-route', name: '跑步路线规划', target: 'frost-run-route' },
  'frost.her-motion-warmup': { id: 'pocket.her-motion', name: 'Her Motion 热身', target: 'her-motion' },
  'frost.nutrition-log': { id: 'frost.meal-lens', name: '饮食镜头', target: 'frost-meal-lens' },
  'frost.phone-free-run': { id: 'frost.running-coach', name: '无手机跑步', target: 'frost-running-coach' },
  'frost.nature-moment': { id: 'frost.nature-moment', name: '自然时刻', target: 'earth' },
  'frost.daily-review': { id: 'frost.daily-review', name: '每日健康总结', target: 'agent-skills' },
};

function dailyGoalRunAt(text: string, now = new Date()): string | null {
  if (!text.includes('每天')) return null;
  const match = text.match(/每天(?:早上|上午|中午|下午|晚上)?\s*(\d{1,2})\s*点/);
  if (!match) return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  let hour = Math.max(0, Math.min(23, Number(match[1])));
  if (/(下午|晚上)/.test(match[0]) && hour < 12) hour += 12;
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.toISOString();
}

function harnessPlan(result: FrostAgentRunResult, userText: string): FrostPlan | undefined {
  if (!result.task) return undefined;
  const ui = TASK_SKILL_UI[result.task.skill_id];
  if (!ui) return undefined;
  const step: FrostPlanStep = {
    id: `${result.task.task_id}:step`, skillId: ui.id, skillName: ui.name, target: ui.target,
    objective: userText.slice(0, 240), reason: `Taskmaster 已选择 ${result.task.skill_id}`,
    availability: 'equipped',
    permissions: [...new Set(result.task.actions.flatMap((action) => action.permissions?.length ? action.permissions : [action.permission]))],
    requiresConfirmation: result.task.status === 'waiting_confirmation',
  };
  return {
    id: result.task.task_id, mode: 'single', source: 'local-fallback', summary: `Taskmaster · ${ui.name}`,
    steps: [step], ready: true, createdAt: result.task.created_at,
  };
}

function harnessReply(result: FrostAgentRunResult): string {
  const assistant = [...result.events].reverse().find((event) => event.type === 'assistant.message' && typeof event.data.text === 'string');
  if (!result.task) {
    if (assistant && typeof assistant.data.text === 'string') return assistant.data.text;
    return result.session.status === 'failed' ? 'Taskmaster 没有安全完成这次决策。' : 'Frost 已处理这次目标。';
  }
  if (result.task.status === 'waiting_confirmation') return 'Taskmaster 已准备好任务，需要你明确确认后继续。';
  if (result.task.status === 'waiting_external') {
    const action = result.task.actions[result.task.next_action_index];
    const reason = typeof action?.result?.waiting_reason === 'string'
      ? action.result.waiting_reason
      : `正在等待 ${action?.tool || '外部 Provider'} 返回真实结果`;
    return `Taskmaster 已暂停在「${action?.purpose || action?.tool || '当前步骤'}」：${reason}。恢复后对我说“继续”。`;
  }
  if (result.task.status === 'completed') return 'Taskmaster 已完成任务，并只写入了经过校验的事实。';
  if (result.task.status === 'failed' || result.task.status === 'safe_stopped') return `Taskmaster 已停止：${result.task.error || result.task.status}`;
  if (assistant && typeof assistant.data.text === 'string') return assistant.data.text;
  return `Taskmaster 正在处理 ${TASK_SKILL_UI[result.task.skill_id]?.name || result.task.skill_id}。`;
}

function harnessTrace(result: FrostAgentRunResult): string[] {
  return result.events.flatMap((event) => {
    if (event.type === 'decision.recorded' && typeof event.data.decision === 'object' && event.data.decision) {
      const action = (event.data.decision as { next_action?: { type?: string } }).next_action?.type;
      return action ? [`DECISION · ${action}`] : [];
    }
    if (event.type === 'tool.called' && typeof event.data.tool === 'string') return [`TOOL · ${event.data.tool}`];
    if (event.type === 'tool.result' && typeof event.data.tool === 'string') return [`OBSERVATION · ${event.data.tool}`];
    if (event.type === 'session.status_changed' && typeof event.data.status === 'string') return [`STATE · ${event.data.status}`];
    return [];
  }).slice(-10);
}

function FrostDachshundAvatar({ size, className = '' }: { size: number; className?: string }) {
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden bg-[#F6F0E4] ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label="Frost 腊肠犬头像"
    >
      <img src={FROST_DACHSHUND_AVATAR} alt="" aria-hidden="true" draggable={false} className="h-full w-full object-contain" />
    </span>
  );
}

export default function FrostBuddyPage({ onBack, onRun }: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<FrostState | null>(null);   // 一次性脉冲：celebrate / dizzy
  const [theme, setTheme] = useState<FrostTheme>('none');         // 当前聊天主题（换装）
  const [sug, setSug] = useState(getSuggestion());
  const endRef = useRef<HTMLDivElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => subscribeHeartbeat(() => setSug(getSuggestion())), []);
  useEffect(() => {
    if (!hasActiveFrostAgentSession()) return;
    let active = true;
    void readFrostAgentEvents().then((events) => {
      if (!active) return;
      const completed = [...events].reverse().find((event) => event.type === 'assistant.message' && typeof event.data.text === 'string');
      if (!completed || typeof completed.data.text !== 'string') return;
      const completedText = completed.data.text;
      setTurns((current) => current.length > 0 ? current : [{
        role: 'frost', text: completedText,
        trace: ['SESSION RESTORED · 本地事件日志', `EVENT · ${completed.event_id}`],
      }]);
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns.length, busy]);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  const buddyState = useMemo<FrostState>(
    () => flash ?? derive({ busy, attention: !!sug }),
    [flash, busy, sug],
  );
  const pulse = (s: FrostState, ms: number) => {
    setFlash(s);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), ms);
  };

  const handoffStep = async (plan: FrostPlan, step: FrostPlanStep, userText: string) => {
    let taskmasterTaskId: string | undefined;
    if (step.skillId === 'pocket.her-motion') {
      const task = await startHerMotionTask({
        taskId: `${plan.id}:${step.id}`,
        planId: plan.id,
        stepId: step.id,
        objective: step.objective,
      });
      if (task.status === 'failed' || task.status === 'safe_stopped') throw new Error(task.error || 'taskmaster_start_failed');
      taskmasterTaskId = task.task_id;
    } else if (step.skillId === 'frost.meal-lens') {
      const task = await startMealTask({
        taskId: `${plan.id}:${step.id}`,
        planId: plan.id,
        stepId: step.id,
        objective: step.objective,
      });
      if (task.status === 'failed' || task.status === 'safe_stopped') throw new Error(task.error || 'taskmaster_start_failed');
      taskmasterTaskId = task.task_id;
    }
    stageTaskHandoff(plan, step, userText, taskmasterTaskId);
    onRun?.(step.target);
  };

  const send = async (preset?: string) => {
    const text = (preset ?? input).trim();
    if (!text || busy) return;
    setInput('');
    setTurns((t) => [...t, { role: 'user', text }]);
    setBusy(true);
    try {
      const memoryReply = await answerFrostMemoryRecallRequest(text);
      if (memoryReply !== null) {
        setTurns((t) => [...t, {
          role: 'frost',
          text: memoryReply,
          trace: ['本机长期记忆检索 · 未调用 Qwen/MNN', '只读取已确认交接摘要 · 不含聊天、图片与 OCR 正文'],
        }]);
        pulse('celebrate', 1200);
        return;
      }
      const runAt = dailyGoalRunAt(text);
      if (runAt) {
        const goalId = await scheduleFrostAgentGoal({
          objective: text.replace(/^每天(?:早上|上午|中午|下午|晚上)?\s*\d{0,2}\s*点?/, '').trim() || text,
          run_at: runAt,
          interval_ms: 24 * 60 * 60 * 1000,
          max_rounds: 30,
        });
        setTurns((t) => [...t, {
          role: 'frost',
          text: `已创建本地自主目标。Frost 会在 ${new Date(runAt).toLocaleString()} 由 Goal Driver 唤醒，最多执行 30 轮。`,
          trace: [`GOAL · ${goalId}`, 'SCHEDULE · 24H', 'BUDGET · 30 ROUNDS'],
        }]);
        pulse('celebrate', 1600);
        return;
      }

      const result = await sendFrostAgentMessage(text);
      const plan = harnessPlan(result, text);
      setTurns((t) => [...t, { role: 'frost', text: harnessReply(result), trace: harnessTrace(result), plan, userText: text }]);
      setTheme(themeFor(text, 'general'));
      pulse(result.session.status === 'failed' ? 'dizzy' : 'celebrate', 1600);
      const step = plan?.steps[0];
      if (result.task?.status === 'waiting_external' && step && AUTO_DISPATCH_TARGETS.has(step.target) && onRun) {
        stageTaskHandoff(plan!, step, text, result.task.task_id);
        onRun(step.target);
      }
    } catch {
      setTurns((t) => [...t, { role: 'frost', text: '我这边断了一下，再说一遍？' }]);
      pulse('dizzy', 1500);
    } finally {
      setBusy(false);
    }
  };

  const dispatchStep = async (plan: FrostPlan, step: FrostPlanStep, userText: string) => {
    if (busy) return;
    if (step.availability !== 'equipped') { onRun?.('agent-plaza'); return; }
    try {
      await handoffStep(plan, step, userText);
    } catch {
      pulse('dizzy', 1500);
    }
  };

  const takeSuggestion = () => {
    const s = adoptSuggestion();
    setSug(getSuggestion());
    if (s?.target) onRun?.(s.target);
  };

  return (
    <div className="h-full flex flex-col bg-[#EAEAEA] font-sans">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b-2 border-black bg-white shrink-0">
        <button onClick={onBack} className="w-8 h-8 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
          <ChevronLeft className="w-4 h-4" strokeWidth={3} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-pixel text-[11px] tracking-wider truncate text-black">FROST</div>
          <div className="text-[9px] text-black/45 truncate">你的 Frost · 装备并调用 Skills</div>
        </div>
      </div>

      {/* Frost 的常用 Skill 快捷入口。 */}
      <div className="shrink-0 overflow-hidden border-b-2 border-black bg-white px-3 py-2">
        <div className="flex w-full flex-wrap items-center gap-2">
          <span className="font-pixel text-[6px] tracking-widest text-black/35 shrink-0">调用 Skill →</span>
          {QUICK.map((q) => (
            <button
              key={q.target}
              onClick={() => { if (!busy) onRun?.(q.target); }}
              disabled={busy}
              className="shrink-0 border-2 border-black bg-[#EAEAEA] px-2 py-1 text-[10px] text-black outline-none focus:outline-none active:translate-y-px hover:bg-[#00ff88]/15 transition-colors disabled:opacity-40"
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>

      <section className="frost-encounter" aria-label="与 Frost 对话">
        <div className="frost-encounter__panel">
          <div className="frost-encounter__scene">
            <header className="frost-encounter__identity">
              <div className="frost-encounter__portrait">
                <FrostDachshundAvatar size={104} />
              </div>
              <div>
                <span className="frost-encounter__eyebrow">MY AGENT</span>
                <h2>FROST</h2>
                <p>技能编排伙伴</p>
                <small>POCKET EARTH</small>
                <small>LOCAL PERSONA · PRIVATE</small>
              </div>
            </header>

            <div className="frost-encounter__dialogue-column">
              <div className="frost-encounter__meters" aria-label="Frost 状态">
                <span>状态 <b>{STATE_LABEL[buddyState]}</b></span>
                <span>主题 <b>{theme === 'none' ? '无' : THEME_LABEL[theme]}</b></span>
                <span>SKILLS <b>13</b></span>
                <span>模式 <b>TASKMASTER</b></span>
              </div>

              <div className="frost-encounter__transcript" aria-live="polite">
                {turns.length === 0 && (
                  <div className="frost-encounter__line is-frost">
                    <span>FROST</span>
                    <div className="frost-encounter__line-content">
                      <p>{FROST_OPENING_LINE}</p>
                      <div className="frost-encounter__examples">
                        试试：「把这份书单整理后落地图」「规划京都两天行程」「用看展搭子整理这张展签」
                      </div>
                    </div>
                  </div>
                )}

                {turns.map((turn, i) => (
                  <div key={i} className={`frost-encounter__line is-${turn.role === 'user' ? 'player' : 'frost'}`}>
                    <span>{turn.role === 'user' ? '你' : 'FROST'}</span>
                    <div className="frost-encounter__line-content">
                      {turn.text && <p>{turn.text}</p>}

                      {turn.plan && (
                        <section className="frost-encounter__plan" aria-label="Frost Skill 计划">
                          <header>
                            <Workflow className="h-4 w-4 shrink-0" strokeWidth={2.5} />
                            <div>
                              <div className="frost-encounter__plan-title">SKILL PLAN · {turn.plan.mode.toUpperCase()}</div>
                              <div className="frost-encounter__plan-meta">{turn.plan.source === 'qwen' ? '云端 Qwen 语义规划' : turn.plan.source === 'mnn' ? '端侧 Qwen / MNN 规划' : 'Frost 端侧编排'} · {turn.plan.steps.length} 步</div>
                            </div>
                            <span className="frost-encounter__plan-status">{turn.plan.ready ? '可运行' : '待装备'}</span>
                          </header>
                          <ol>
                            {turn.plan.steps.map((step, index) => (
                              <li key={step.id}>
                                <span className="frost-encounter__plan-index">{String(index + 1).padStart(2, '0')}</span>
                                <div className="frost-encounter__plan-step">
                                  <b>{step.skillName} · {step.availability === 'equipped' ? '已装备' : step.availability === 'installed' ? '已登记·待装备' : '未安装'}</b>
                                  <p>专家交接 · {expertForSkill(step.skillId).name} / {expertForSkill(step.skillId).role}</p>
                                  <p>{step.objective}</p>
                                  <p>{step.reason}</p>
                                  <details className="frost-encounter__permissions">
                                    <summary>权限边界 · {step.permissions.length} 项{step.requiresConfirmation ? ' · 写入前确认' : ''}</summary>
                                    <div>{step.permissions.map((permission) => <span key={permission}>{permission}</span>)}</div>
                                  </details>
                                  <button
                                    type="button"
                                    onClick={() => { void dispatchStep(turn.plan!, step, turn.userText || step.objective); }}
                                    aria-label={step.availability === 'equipped' ? `运行 ${step.skillName}` : `装备 ${step.skillName}`}
                                  >
                                    {step.availability === 'equipped' ? <span><Play className="inline h-3 w-3" fill="currentColor" /> 运行</span> : <span><PackageOpen className="inline h-3 w-3" /> 装备</span>}
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ol>
                          <div className="frost-encounter__plan-note">
                            <Check className="h-3 w-3 shrink-0" />Frost 只负责选择与交接；目标 Skill 的质量门和确认门继续生效。
                          </div>
                        </section>
                      )}

                      {turn.trace && turn.trace.length > 0 && (
                        <details className="frost-encounter__trace">
                          <summary>TRACE / EVIDENCE · {turn.trace.length} EVENTS</summary>
                          <div>{turn.trace.slice(0, 10).map((step, idx) => <div key={idx}>{String(idx + 1).padStart(2, '0')} · {step.replace(/^●\s*/, '')}</div>)}</div>
                        </details>
                      )}
                    </div>
                  </div>
                ))}

                {busy && (
                  <div className="frost-encounter__line is-frost is-thinking">
                    <span>FROST</span><p>正在编排……</p>
                  </div>
                )}
                <div ref={endRef} />
              </div>

              {sug && !busy && (
                <div className="frost-encounter__suggestion">
                  <div><strong>NEXT MOVE</strong><p>{sug.text}</p></div>
                  <button type="button" onClick={takeSuggestion}>{sug.cta || '运行'}</button>
                </div>
              )}
            </div>
          </div>

          <FrostMemoryPanel />

          <form className="frost-encounter__composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
              placeholder="对 FROST 说一句……"
              aria-label="对 FROST 说一句"
            />
            <button type="submit" disabled={busy || !input.trim()}>发送</button>
          </form>
          <footer>
            <span>FROST AGENT READY</span>
            <span>AGENT LOOP · TASKMASTER</span>
          </footer>
        </div>
      </section>
    </div>
  );
}
