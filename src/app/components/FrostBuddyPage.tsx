import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, Check, PackageOpen, Play, Workflow } from 'lucide-react';
import type { FrostPlan, FrostPlanStep } from '../../../frost-agent/harness/skillRouter';
import { expertForSkill } from '../../../frost-agent/harness/expertRouter';
import { getSuggestion, subscribeHeartbeat, adoptSuggestion } from '../../../frost-agent/harness/heartbeat';
import { derive, STATE_LABEL, type FrostState } from '../../../frost-agent/buddy/poses';
import { themeFor, THEME_LABEL, type FrostTheme } from '../../../frost-agent/buddy/themes';
import FrostMemoryPanel from './FrostMemoryPanel';
import FrostBadgePanel from './FrostBadgePanel';
import { openPresence } from '../lib/frostPresence';
import { hasActiveFrostAgentSession, readFrostAgentSnapshot, sendFrostAgentMessage, subscribeFrostAgentEvents, subscribeFrostAgentRuns, type FrostMessageOrigin } from '../lib/frostAgentRuntime';
import { createFrostAutoNavigation, prepareFrostAgentHandoff } from '../lib/frostAgentNavigation';
import { presentFrostAgentRun } from '../lib/frostAgentPresentation';
import { FROST_AVATAR } from '../lib/skill/avatars';
import { BUILTIN_SKILLS, getEquippedSkill } from '../lib/skill';
import './FrostBuddyPage.css';

// Frost 的展示与页面导航；所有对话只进入同一个 Agent Runtime。

interface Turn {
  role: 'user' | 'frost';
  text: string;
  trace?: string[];
  plan?: FrostPlan;
  userText?: string;
  taskmasterTaskId?: string;
  routeChoices?: string[];
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
  { label: '包装食品', target: 'frost-openfoodfacts' },
  { label: '中国健康库', target: 'frost-cn-health-library' },
  { label: '户外窗口', target: 'frost-outdoor-window' },
  { label: '睡眠侦探', target: 'frost-sleep-detective' },
  { label: '饮食确认', target: 'frost-meal-lens' },
];

const FROST_DACHSHUND_AVATAR = FROST_AVATAR.src;
const FROST_OPENING_LINE = '我是 Frost。你说目标，我会先在已装备的 Skills 里选择能力、列出计划和权限，再把任务交到正确入口；没有把握时，我不会擅自执行。';
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
  const [inputOrigin, setInputOrigin] = useState<FrostMessageOrigin>({ channel: 'phone' });
  const [sending, setBusy] = useState(false);
  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const busy = sending || runtimeBusy || navigating;
  const equippedSkillCount = BUILTIN_SKILLS.filter((skill) => getEquippedSkill(skill.identity.id)).length;
  const [flash, setFlash] = useState<FrostState | null>(null);   // 一次性脉冲：celebrate / dizzy
  const [theme, setTheme] = useState<FrostTheme>('none');         // 当前聊天主题（换装）
  const [sug, setSug] = useState(getSuggestion());
  const endRef = useRef<HTMLDivElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;

  useEffect(() => subscribeHeartbeat(() => setSug(getSuggestion())), []);
  useEffect(() => {
    let active = true;
    const seen = new Set<string>();
    const navigate = createFrostAutoNavigation({
      isActive: () => active && !!onRunRef.current && document.visibilityState !== 'hidden',
      open: target => onRunRef.current?.(target),
    });
    const unobserve = subscribeFrostAgentEvents(event => {
      if (event.type === 'session.status_changed') setRuntimeBusy(event.data.status === 'running');
      if (event.type === 'user.message' && event.data.source === 'user') {
        const text = (event.data.content as { text?: string })?.text;
        if (typeof text === 'string') setTurns(current => [...current, { role: 'user', text }]);
      }
    });
    const unruns = subscribeFrostAgentRuns(notice => {
      const { result, input } = notice;
      const last = [...result.events].reverse().find(event => event.type === 'assistant.message');
      const key = last?.event_id || `${result.session.session_id}:${result.events.at(-1)?.seq}`;
      const view = presentFrostAgentRun(result, input?.text || '');
      // Badge navigation lives at the App root so it also works when this conversation is not mounted.
      if (input?.origin.channel === 'phone' && view.autoStep) {
        setNavigating(true);
        void navigate(notice).catch(error => {
          if (active) setTurns(current => [...current, { role: 'frost', text: `能力页面未打开：${error instanceof Error ? error.message : String(error)}。可在计划中重试。` }]);
        }).finally(() => { if (active) setNavigating(false); });
      }
      if (seen.has(key)) return;
      seen.add(key);
      setTurns(current => [...current, { role: 'frost', text: view.text, trace: view.trace, plan: view.plan,
        userText: input?.text, taskmasterTaskId: view.taskmasterTaskId, routeChoices: view.routeChoices }]);
    });
    if (hasActiveFrostAgentSession()) void readFrostAgentSnapshot().then((snapshot) => {
      if (!active) return;
      const user = [...snapshot.events].reverse().find(event => event.type === 'user.message' && event.data.source === 'user');
      const text = (user?.data.content as { text?: string })?.text || '';
      const events = snapshot.events.filter(event => event.seq >= (user?.seq || 0));
      const view = presentFrostAgentRun({ ...snapshot, events }, text);
      const completed = [...events].reverse().find(event => event.type === 'assistant.message');
      if (completed) seen.add(completed.event_id);
      setRuntimeBusy(snapshot.session.status === 'running');
      setTurns(current => current.length ? current : [
        ...(text ? [{ role: 'user' as const, text }] : []),
        ...(completed ? [{ role: 'frost' as const, text: view.text, trace: ['SESSION RESTORED · 本地事件日志', ...view.trace],
          plan: view.plan, userText: text, taskmasterTaskId: view.taskmasterTaskId, routeChoices: view.routeChoices }] : []),
      ]);
    }).catch(() => {});
    return () => { active = false; unobserve(); unruns(); };
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

  const handoffStep = async (plan: FrostPlan, step: FrostPlanStep, userText: string, existingTaskId?: string) => {
    await prepareFrostAgentHandoff(plan, step, userText, existingTaskId);
    onRunRef.current?.(step.target);
  };

  const send = async (preset?: string) => {
    const text = (preset ?? input).trim();
    if (!text || busy) return;
    const origin: FrostMessageOrigin = preset === undefined ? inputOrigin : { channel: 'phone' };
    setInput('');
    setInputOrigin({ channel: 'phone' });
    setBusy(true);
    try {
      const result = await sendFrostAgentMessage(text, origin);
      setTheme(themeFor(text, 'general'));
      pulse(result.session.status === 'failed' || result.session.status === 'stopped' ? 'dizzy' : 'celebrate', 1600);
    } catch (error) {
      setInput(text); setInputOrigin(origin);
      setTurns((t) => [...t, { role: 'frost', text: error instanceof Error ? error.message : '这次未完成，请检查后重试。' }]);
      pulse('dizzy', 1500);
    } finally {
      setBusy(false);
    }
  };

  const dispatchStep = async (plan: FrostPlan, step: FrostPlanStep, userText: string, taskmasterTaskId?: string) => {
    if (busy) return;
    if (step.availability !== 'equipped') {
      setTurns(t => [...t, { role: 'frost', text: `${step.skillName} 尚未装备，请先在 Skills 中加载。未跳转主页。` }]);
      return;
    }
    try {
      await handoffStep(plan, step, userText, taskmasterTaskId);
    } catch (error) {
      setTurns(t => [...t, { role: 'frost', text: error instanceof Error ? error.message : 'Skill 页面未能打开。' }]);
      pulse('dizzy', 1500);
    }
  };

  const takeSuggestion = () => {
    const s = adoptSuggestion();
    setSug(getSuggestion());
    if (s?.target) onRun?.(s.target);
  };

  return (
    <div className="frost-buddy-page h-full min-h-0 min-w-0 flex flex-col bg-[#EAEAEA] font-sans">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b-2 border-black bg-white shrink-0">
        <button onClick={onBack} className="w-8 h-8 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
          <ChevronLeft className="w-4 h-4" strokeWidth={3} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-pixel text-[11px] tracking-wider truncate text-black">FROST</div>
          <div className="text-[9px] text-black/45 truncate">你的 Frost · 装备并调用 Skills</div>
        </div>
        <button type="button" onClick={openPresence} className="rounded-full border border-black/20 bg-[#eef4e8] px-3 py-2 text-[11px]">桌面伙伴</button>
      </div>

      <FrostBadgePanel reply={[...turns].reverse().find(turn => turn.role === 'frost')?.text} onVoiceDraft={draft => {
        setInput(draft.text); setInputOrigin({ channel: 'badge_voice', inputId: draft.inputId });
      }} />
      {/* 快捷 Skills 默认收起，为对话区留出空间。 */}
      <details className="frost-quick-skills group shrink-0 overflow-hidden border-b-2 border-black bg-white">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-[#00a85a] [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2 text-[11px] font-bold text-black">
            调用 Skills
            <span className="text-[10px] font-normal text-black/45">{QUICK.length} 项快捷入口</span>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-black">
            <span className="group-open:hidden">展开</span>
            <span className="hidden group-open:inline">收起</span>
            <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
          </span>
        </summary>
        <div className="flex w-full flex-wrap items-center gap-2 border-t border-black/10 px-3 py-2">
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
      </details>

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
                <span>SKILLS <b>{equippedSkillCount}</b></span>
                <span>模式 <b>TASKMASTER</b></span>
              </div>

              <div className="frost-encounter__transcript" aria-live="polite">
                {turns.length === 0 && (
                  <div className="frost-encounter__line is-frost">
                    <span>FROST</span>
                    <div className="frost-encounter__line-content">
                      <p>{FROST_OPENING_LINE}</p>
                      <div className="frost-encounter__examples">
                        试试：「帮我规划下西湖的跑步路线」「规划 5 公里跑步路线，风景好、少路口」
                      </div>
                    </div>
                  </div>
                )}

                {turns.map((turn, i) => (
                  <div key={i} className={`frost-encounter__line is-${turn.role === 'user' ? 'player' : 'frost'}`}>
                    <span>{turn.role === 'user' ? '你' : 'FROST'}</span>
                    <div className="frost-encounter__line-content">
                      {turn.text && <p>{turn.text}</p>}
                      {turn.routeChoices?.length && i === turns.length - 1 ? <div className="mt-3 flex flex-wrap gap-2" aria-label="跑步路线条件">
                        {turn.routeChoices.map(choice => <button key={choice} type="button" disabled={busy} onClick={() => void send(choice)} className="min-h-10 border-2 border-black bg-[#e3f7ed] px-3 py-2 text-[12px] font-bold disabled:opacity-40">{choice}</button>)}
                        <button type="button" disabled={busy} onClick={() => void send('取消规划')} className="min-h-10 px-2 text-[12px] underline disabled:opacity-40">取消</button>
                      </div> : null}

                      {turn.plan && (
                        <section className="frost-encounter__plan" aria-label="Frost Skill 计划">
                          <header>
                            <Workflow className="h-4 w-4 shrink-0" strokeWidth={2.5} />
                            <div>
                              <div className="frost-encounter__plan-title">SKILL PLAN · {turn.plan.mode.toUpperCase()}</div>
                              <div className="frost-encounter__plan-meta">{turn.plan.source === 'qwen' ? '云端模型语义规划' : turn.plan.source === 'mnn' ? '端侧 Qwen / MNN 规划' : 'Frost 端侧编排'} · {turn.plan.steps.length} 步</div>
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
                                    onClick={() => { void dispatchStep(turn.plan!, step, turn.userText || step.objective, turn.taskmasterTaskId); }}
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

          {inputOrigin.channel === 'badge_voice' && <p className="px-3 text-xs">吧唧语音草稿 · 请核对后发送，不能代替权限确认。 <button type="button" onClick={() => { setInput(''); setInputOrigin({ channel: 'phone' }); }}>清除草稿，改用手机输入</button></p>}
          <form className="frost-encounter__composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input
              type="text"
              value={input}
              onChange={(e) => { setInput(e.target.value); if (!e.target.value) setInputOrigin({ channel: 'phone' }); }}
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
