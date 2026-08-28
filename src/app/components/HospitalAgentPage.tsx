import { useEffect, useState } from 'react';
import { ChevronLeft, RefreshCw } from 'lucide-react';
import skillIndex from '../../../agents/hospital_agent_example/data/skills/skills_index.json';
import { checkHospitalAgentHealth, HOSPITAL_CONNECTION_STATES, type HospitalConnectionState } from '../lib/health/hospitalAgent';
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
  const [connection, setConnection] = useState<HospitalConnectionState>('checking');
  const [retry, setRetry] = useState(0);
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  useEffect(() => {
    const controller = new AbortController();
    setConnection('checking');
    // Bound the browser request too: a stale proxy must not leave the page checking forever.
    const timeout = window.setTimeout(() => {
      controller.abort();
      setConnection('bridge_unavailable');
    }, 12_000);
    void checkHospitalAgentHealth(controller.signal).then((status) => {
      if (!controller.signal.aborted) setConnection(status);
    }).catch(() => {
      if (!controller.signal.aborted) setConnection('bridge_unavailable');
    }).finally(() => window.clearTimeout(timeout));
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [retry]);

  const state = HOSPITAL_CONNECTION_STATES[connection];
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
          <h2 className="mt-2 text-base font-black">虚拟诊疗 · 多角色协作</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-black/60">接入本项目 hospital_agent_example：分诊、追问、专科会诊与安全审查。</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="border border-black bg-white p-2"><b className="text-xl">{DEPARTMENTS.length}</b><span className="ml-2 text-[10px]">覆盖科室</span></div>
            <div className="border border-black bg-white p-2"><b className="text-xl">{SKILL_COUNT}</b><span className="ml-2 text-[10px]">本地疾病 Skills</span></div>
          </div>
          <p className="mt-2 text-[9px] leading-relaxed text-black/50">数量来自本地 Skill 索引，不代表已完成临床验证。</p>
        </section>

        <section aria-label="医院 Agent 连接状态" className="border-2 border-black bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-black">后端连接</h2>
            <span role="status" className={`border border-black px-2 py-1 text-[9px] font-bold ${connection === 'reachable' ? 'bg-[#e3f4f0] text-[#187b73]' : 'bg-[#fff0b5]'}`}>{state.label}</span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-black/60">{state.detail}</p>
          <button type="button" disabled={connection === 'checking'} onClick={() => setRetry((value) => value + 1)} className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 border-2 border-black bg-[#e3f4f0] text-[11px] font-bold disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${connection === 'checking' ? 'animate-spin' : ''}`} />
            {connection === 'checking' ? '正在检测…' : '重新检测连接'}
          </button>
          <details className="mt-3 border-t border-black/15 pt-2 text-[10px] leading-relaxed">
            <summary className="cursor-pointer font-bold">部署接入说明</summary>
            <p className="mt-2 text-black/60">在 Pocket Buddy 服务端设置以下变量，然后重启服务。地址必须指向朋友部署的医生 Agent，不是比赛患者服务。</p>
            <code className="mt-2 block break-all border border-black/15 bg-[#f5f5f5] p-2">HOSPITAL_AGENT_BASE_URL</code>
            <p className="mt-2 text-black/60">若部署要求 Bearer 认证，再设置 HOSPITAL_AGENT_API_TOKEN。凭据仅保存在服务端，不放入 VITE_ 变量或浏览器。</p>
            <p className="mt-2 text-black/60">SDK 0.2.2 的 /test 会启动虚拟患者评测，远端调用还需要比赛授权；它不是用户聊天接口。本页仅接入 GET /health。</p>
          </details>
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
        <p className="px-1 pb-2 text-[10px] leading-relaxed text-black/55">仅用于虚拟诊疗研究与演示，不提供真实医疗诊断或处方。本页不会上传个人健康数据，也不会自动启动训练或比赛评测。</p>
      </div>
    </div>
  );
}
