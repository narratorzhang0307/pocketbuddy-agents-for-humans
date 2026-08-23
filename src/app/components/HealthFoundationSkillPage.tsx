import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Database, ShieldCheck, Workflow } from 'lucide-react';
import { HealthSkillRegistry } from '../../../frost-agent/taskmaster';
import {
  SERVER_HEALTH_CONTROL_PLANE,
  assessReadiness,
  type ReadinessInput,
} from '../../../frost-agent/skills/health/foundation';
import HealthSkillRuntimePanel from './HealthSkillRuntimePanel';
import LifestyleSkillRuntimePanel, { LIFESTYLE_SKILL_IDS } from './LifestyleSkillRuntimePanel';
import { acceptTaskHandoff } from '../../../frost-agent/harness/taskHandoff';

interface Props {
  skillId: string;
  onBack: () => void;
}

const BRIDGE_REQUIRED = new Set(['frost.healthsync', 'frost.garmin-readonly', 'frost.wger-planner', 'frost.mealie-kitchen']);
const ACCENT = '#00ee86';

export default function HealthFoundationSkillPage({ skillId, onBack }: Props) {
  const skill = useMemo(() => new HealthSkillRegistry().load(skillId), [skillId]);
  const [readinessInput, setReadinessInput] = useState<ReadinessInput>({
    sleepHours: 7,
    hrvDeltaPct: 0,
    restingHeartRateDeltaBpm: 0,
    fatigue: 3,
    pain: 0,
  });
  const [taskmasterTaskId, setTaskmasterTaskId] = useState<string>();
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const target = skillId === 'frost.meal-lens' ? 'frost-meal-lens' : '';
    if (!target) return;
    void acceptTaskHandoff(target).then((handoff) => setTaskmasterTaskId(handoff?.taskmasterTaskId));
  }, [skillId]);
  const decision = useMemo(() => assessReadiness(readinessInput), [readinessInput]);
  const showReadiness = skillId === 'frost.running-coach' || skillId === 'frost.endurance-guard';
  const lifestyleSkill = LIFESTYLE_SKILL_IDS.has(skillId);
  useEffect(() => { mainRef.current?.scrollTo({ top: 0 }); }, [skillId]);

  if (!skill) return <div className="grid h-full place-items-center bg-[#f2eee2]">Skill 未登记</div>;
  const provenance = skill.provenance;
  const status = BRIDGE_REQUIRED.has(skillId) ? '本地连接器模式' : '契约与安全门已就绪';
  const patchReadiness = (field: keyof ReadinessInput, value: number) => setReadinessInput((current) => ({ ...current, [field]: value }));

  return (
    <div className="flex h-full flex-col bg-[#f2eee2] text-[#111]">
      <header className="flex shrink-0 items-center gap-3 border-b-4 border-black bg-white px-3 py-2.5">
        <button type="button" onClick={onBack} aria-label="返回 Skills" className="grid h-10 w-10 place-items-center border-2 border-black bg-white active:translate-y-px">
          <ChevronLeft className="h-5 w-5" strokeWidth={3} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-pixel text-[10px] tracking-wider">FROST HEALTH SKILL</div>
          <h1 className="mt-0.5 truncate text-[17px] font-black">{skill.title}</h1>
        </div>
        <span className="border-2 border-black px-2 py-1 font-pixel text-[6px]" style={{ background: ACCENT }}>{status}</span>
      </header>

      <main ref={mainRef} className="flex-1 overflow-y-auto p-4">
        <section className="border-2 border-black bg-white p-3">
          <div className="flex items-start gap-3">
            <Workflow className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <div className="font-pixel text-[7px] text-[#087c49]">{skill.skill_id}</div>
              <p className="mt-2 text-[11px] font-medium leading-relaxed">{skill.description}</p>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="border-2 border-black bg-[#e8f8ef] p-2.5">
              <div className="font-pixel text-[7px]">SERVER MODEL CONTROL PLANE</div>
              <b className="mt-1 block text-[11px]">Gemma · {SERVER_HEALTH_CONTROL_PLANE.provider}</b>
              <p className="mt-1 text-[8.5px] leading-relaxed text-black/55">只做路由、证据综合与草案；不生成健康事实，不覆盖安全门。</p>
              <span className="mt-2 inline-block border border-black bg-white px-1.5 py-1 font-pixel text-[5px]">AUTHENTICATED SERVER</span>
            </div>
            <div className="border-2 border-black bg-[#fff5cc] p-2.5">
              <div className="font-pixel text-[7px]">DETERMINISTIC TOOLS</div>
              <p className="mt-1 text-[8.5px] leading-relaxed">{skill.steps.map((step) => step.tool).join(' · ')}</p>
              <p className="mt-2 text-[8px] text-black/50">权限：{skill.permissions.join(' / ')}</p>
            </div>
          </div>
        </section>

        {showReadiness && (
          <section className="mt-3 border-2 border-black bg-white p-3">
            <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /><h2 className="font-pixel text-[8px]">READINESS SAFETY GATE</h2></div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {([
                ['sleepHours', '睡眠 h'], ['hrvDeltaPct', 'HRV Δ%'], ['restingHeartRateDeltaBpm', 'RHR Δbpm'], ['fatigue', '疲劳 0-10'], ['pain', '疼痛 0-10'],
              ] as Array<[keyof ReadinessInput, string]>).map(([field, label]) => (
                <label key={field} className="text-[8px] font-bold">{label}
                  <input type="number" value={Number(readinessInput[field] ?? 0)} onChange={(event) => patchReadiness(field, Number(event.target.value))} className="mt-1 w-full border-2 border-black bg-[#f7f1df] px-2 py-2 text-[11px] outline-none" />
                </label>
              ))}
            </div>
            <div className="mt-3 border-2 border-black p-2.5" style={{ background: decision.band === 'green' ? '#dff5e9' : decision.band === 'red' ? '#ffd9d2' : '#fff3cd' }}>
              <div className="font-pixel text-[8px]">{decision.band.toUpperCase()} · MAX {decision.maxIntensity.toUpperCase()}</div>
              <p className="mt-1 text-[9px]">{decision.reasons.join('；') || '暂无降级信号'} · 置信度 {Math.round(decision.confidence * 100)}%</p>
            </div>
          </section>
        )}

        {lifestyleSkill
          ? <LifestyleSkillRuntimePanel skillId={skillId} taskmasterTaskId={taskmasterTaskId} />
          : <HealthSkillRuntimePanel skillId={skillId} readiness={decision} />}

        <section className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="border-2 border-black bg-white p-3">
            <h2 className="font-pixel text-[8px]">WORKFLOW</h2>
            <ol className="mt-2 space-y-2">
              {skill.steps.map((step, index) => <li key={step.id} className="grid grid-cols-[28px_1fr] gap-2 border-t border-black/20 pt-2 first:border-0 first:pt-0"><b className="font-pixel text-[7px]">{String(index + 1).padStart(2, '0')}</b><span className="text-[9px] leading-relaxed"><b>{step.tool}</b><br />{step.purpose}</span></li>)}
            </ol>
          </div>
          <div className="border-2 border-black bg-[#fff0ed] p-3">
            <h2 className="font-pixel text-[8px]">STOP RULES</h2>
            <ul className="mt-2 space-y-2 text-[9px] leading-relaxed">{skill.stop_rules.map((rule) => <li key={rule} className="flex gap-2"><span>×</span><span>{rule}</span></li>)}</ul>
          </div>
        </section>

        <section className="mt-3 border-2 border-black bg-white p-3 text-[8px] leading-relaxed">
          <div className="flex items-center gap-2 font-pixel text-[7px]"><Database className="h-4 w-4" />PROVENANCE</div>
          <p className="mt-2">{provenance.adaptation}</p>
          {provenance.source_url && <a href={provenance.source_url} target="_blank" rel="noreferrer" className="mt-1 block break-all text-[#087c49] underline">{provenance.source_url}@{provenance.source_commit?.slice(0, 12)}</a>}
          <p className="mt-1 text-black/45">License: {provenance.license || '未声明'} · Frost adapter v{provenance.version}</p>
        </section>
      </main>
    </div>
  );
}
