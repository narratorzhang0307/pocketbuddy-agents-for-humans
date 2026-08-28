import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Send } from 'lucide-react';
import skillIndex from '../../../agents/hospital_agent_example/data/skills/skills_index.json';
import { askHospitalAgent, type HospitalAnswer } from '../lib/health/hospitalAgent';
import HospitalAgentAvatar from './HospitalAgentAvatar';

const DEPARTMENT_SKILLS: Record<string, string[]> = skillIndex.skills_by_department;
const DEPARTMENTS = Object.keys(DEPARTMENT_SKILLS);
const SKILL_COUNT = Object.values(DEPARTMENT_SKILLS).reduce((total, skills) => total + skills.length, 0);
const PHASES = ['分诊与主诉整理', '信息差驱动的多轮问诊', '检查策略', '专科会诊与主治决策', '独立安全审查'];

interface Props {
  onBack: () => void;
  backLabel?: string;
}

export default function HospitalAgentPage({ onBack, backLabel = '返回 Agents' }: Props) {
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<HospitalAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const sending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function sendQuestion() {
    if (sending.current) return;
    sending.current = true;
    setBusy(true); setError(''); setAnswer(null);
    try {
      const result = await askHospitalAgent({ question, department, consent: true });
      if (mounted.current) setAnswer(result);
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : '本次回答未完成，请稍后再试。');
    } finally {
      sending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#eaeaea]">
      <header className="flex shrink-0 items-center gap-2 border-b-2 border-black bg-white px-3 py-2.5">
        <button type="button" onClick={onBack} aria-label={backLabel} className="grid h-9 w-9 shrink-0 place-items-center border-2 border-black active:translate-y-px">
          <ChevronLeft className="h-4 w-4" strokeWidth={3} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-black">医院 Agent</h1>
          <p className="mt-0.5 font-pixel text-[6px] text-black/50">HOSPITAL AGENT · VIRTUAL CLINIC</p>
        </div>
        <HospitalAgentAvatar size={36} />
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <section className="border-2 border-black bg-[#e3f4f0] p-3">
          <span className="font-pixel text-[7px] tracking-wider text-[#187b73]">DOCTOR SUB AGENT</span>
          <h2 className="mt-2 text-base font-black">健康信息 · 就医准备</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-black/60">自动使用 App 的 Qwen 旗舰模型配置，帮你整理问题。无需设置模型或服务地址。</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="border border-black bg-white p-2"><b className="text-xl">{DEPARTMENTS.length}</b><span className="ml-2 text-[10px]">覆盖科室</span></div>
            <div className="border border-black bg-white p-2"><b className="text-xl">{SKILL_COUNT}</b><span className="ml-2 text-[10px]">本地疾病 Skills</span></div>
          </div>
          <p className="mt-2 text-[9px] leading-relaxed text-black/50">数量来自本地 Skill 索引，不代表已完成临床验证。</p>
        </section>

        <section aria-label="医院 Agent 健康咨询" data-hospital-qwen="direct-v1" className="border-2 border-black bg-white p-3">
          <h2 className="text-xs font-black">想了解什么？</h2>
          <form onSubmit={(event) => { event.preventDefault(); void sendQuestion(); }}>
            <label htmlFor="hospital-question" className="mt-2 block text-[10px] text-black/60">本次问题 · {department}（可在下方切换科室）</label>
            <textarea id="hospital-question" value={question} onChange={(event) => setQuestion(event.target.value)} disabled={busy} maxLength={600} rows={3}
              placeholder="例如：第一次去心内科就诊，可以提前准备哪些资料？"
              className="mt-2 w-full resize-y border-2 border-black p-2 text-xs leading-relaxed disabled:opacity-60" />
            <p className="mt-2 text-[10px] leading-relaxed text-black/60">点击发送即同意将当前问题与所选科室交给云端 Qwen 处理。不自动附带健康记录、照片或历史对话；本页不保存到健康记忆。</p>
            <button type="submit" disabled={busy || !question.trim()} className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 border-2 border-black bg-[#e3f4f0] text-[11px] font-bold disabled:opacity-50">
              <Send className="h-3.5 w-3.5" />{busy ? 'Qwen 正在回答…' : '同意并发送给 Qwen'}
            </button>
          </form>
          {error && <p role="alert" className="mt-3 text-[11px] leading-relaxed text-[#a03224]">{error}</p>}
          {answer && <div aria-live="polite" className="mt-3 border-t border-black/15 pt-3">
            <p className="text-[10px] text-black/50">本次已由 {answer.model} 回答</p>
            <p className="mt-2 text-[11px] font-bold">{answer.question}</p>
            <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed">{answer.reply}</p>
          </div>}
        </section>

        <section className="border-2 border-black bg-white p-3">
          <h2 className="text-xs font-black">本地知识目录</h2>
          <label htmlFor="hospital-department" className="mt-2 block text-[10px] text-black/60">选择科室查看已收录的疾病 Skill</label>
          <select id="hospital-department" value={department} onChange={(event) => setDepartment(event.target.value)} className="mt-1 w-full min-w-0 border-2 border-black bg-[#f5f5f5] px-2 py-2 text-xs">
            {DEPARTMENTS.map((name) => <option key={name} value={name}>{name} · {DEPARTMENT_SKILLS[name].length} 项</option>)}
          </select>
          <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-black/65">
            {DEPARTMENT_SKILLS[department].map((name) => <li key={name} className="border-l-2 border-[#187b73] pl-2">{name}</li>)}
          </ul>
        </section>

        <section className="border-2 border-black bg-white p-3">
          <h2 className="text-xs font-black">源码中的诊疗流程</h2>
          <p className="mt-1 text-[9px] text-black/50">流程说明，非实时运行进度</p>
          <ol className="mt-2 space-y-2">
            {PHASES.map((phase, index) => <li key={phase} className="flex items-center gap-2 text-[11px]"><span className="grid h-5 w-5 shrink-0 place-items-center border border-black bg-[#e3f4f0] text-[9px] font-bold">{index + 1}</span>{phase}</li>)}
          </ol>
        </section>
        <p className="px-1 pb-2 text-[10px] leading-relaxed text-black/55">AI 健康信息仅供参考，不提供真实医疗诊断或处方。紧急情况请及时就医。上方问答不代表已运行完整多角色诊疗流程，也不会自动启动训练或比赛评测。</p>
      </div>
    </div>
  );
}
