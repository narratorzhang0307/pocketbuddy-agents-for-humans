import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Camera, Check, Database, Footprints, HeartPulse,
  MapPin, Play, Save, ShieldCheck, Sparkles, Volume2, WandSparkles,
} from 'lucide-react';
import {
  compileSkillDraft, getCanvasSkill, previewSkillGraph, saveCanvasSkill,
  type CompiledSkillGraph, type SkillBlockCapability, type SkillCanvasDraft,
  type SkillCanvasNode, type SkillRunTrace,
} from '../../../frost-agent/skill-canvas';
import SkillDeckBuilder, { type SkillCardDefinition, type SkillDeckTemplate } from './SkillDeckBuilder';

type Stage = 'sketch' | 'structure' | 'run';
type TemplateId = 'morning-run' | 'gentle-recovery' | 'outdoor-reset';

interface Props { skillId?: string | null; onSaved?: () => void }

const BLOCKS: SkillCardDefinition[] = [
  { capability: 'trigger.manual', label: '开始', detail: '点击或定时', family: '触发', color: '#ffd34e', icon: Play, serial: '01', description: '告诉 Skill 何时开始行动，是每个技能画布的第一声口令。', input: '用户点击、语音或时间条件', output: '一次可审计的启动事件', permission: '无需额外权限', metrics: { speed: 5, reliability: 5, privacy: 5, energy: 1 } },
  { capability: 'sensor.location', label: '当前位置', detail: '路线与距离', family: '感知', color: '#7fcfff', icon: MapPin, serial: '02', description: '读取获得授权的位置摘要，为路线、距离和户外行动提供现场感。', input: '系统定位与地图上下文', output: '位置、距离与路线意图', permission: '运行时请求位置', metrics: { speed: 4, reliability: 4, privacy: 2, energy: 3 } },
  { capability: 'sensor.health', label: '身体状态', detail: 'HRV 与恢复', family: '感知', color: '#7fcfff', icon: HeartPulse, serial: '03', description: '把睡眠、HRV 与近期负荷整理成最少必要的身体状态摘要。', input: '本机健康聚合字段', output: '恢复与负荷摘要', permission: '请求健康摘要', metrics: { speed: 4, reliability: 4, privacy: 3, energy: 2 } },
  { capability: 'model.qwen', label: 'Frost 判断', detail: 'Qwen 推理', family: '思考', color: '#7cff6b', icon: Sparkles, serial: '04', description: '结合目标和现场状态形成下一步建议，但不会替代确定性安全规则。', input: '目标、上下文与能力结果', output: '结构化判断与解释', permission: '调用端侧或自托管模型', metrics: { speed: 3, reliability: 4, privacy: 4, energy: 4 } },
  { capability: 'model.pose', label: '看懂动作', detail: '本地姿态', family: '思考', color: '#7cff6b', icon: Camera, serial: '05', description: '在本地提取动作关键点，以连续帧与置信度判断动作是否稳定。', input: '获得授权的相机帧', output: '姿态关键点与动作事件', permission: '请求摄像头与本地模型', metrics: { speed: 4, reliability: 4, privacy: 4, energy: 4 } },
  { capability: 'gate.safety', label: '安全守门', detail: '异常就停止', family: '守护', color: '#cdb7ff', icon: ShieldCheck, serial: '06', description: '把疼痛、眩晕、呼吸异常和用户停止请求变成不可绕过的边界。', input: '身体事件与用户反馈', output: '继续、降级或立即停止', permission: '只读取当前任务事件', metrics: { speed: 5, reliability: 5, privacy: 5, energy: 1 } },
  { capability: 'action.voice', label: '陪我行动', detail: '语音与提醒', family: '行动', color: '#ff9b69', icon: Volume2, serial: '07', description: '把计划变成合适时机的一句陪伴、提醒或行动确认。', input: '已确认的行动指令', output: '语音、震动或界面提醒', permission: '请求通知能力', metrics: { speed: 5, reliability: 4, privacy: 4, energy: 2 } },
  { capability: 'store.local', label: '记住结果', detail: '只存在本机', family: '记忆', color: '#f4edda', icon: Database, serial: '08', description: '把完成结果、主观感受和证据保存在本机，供下一次任务复盘。', input: '结果、反馈与 Evidence', output: '本地健康事件记录', permission: '写入本地健康记忆', metrics: { speed: 5, reliability: 5, privacy: 5, energy: 1 } },
];

const TEMPLATES: Array<SkillDeckTemplate & { id: TemplateId }> = [
  { id: 'morning-run', label: '晨跑伙伴', detail: '恢复状态 → 安全陪跑', accent: '#7cff6b' },
  { id: 'gentle-recovery', label: '温和恢复', detail: '看懂动作 → 温柔提醒', accent: '#d8c9ff' },
  { id: 'outdoor-reset', label: '出门透气', detail: '位置环境 → 散步陪伴', accent: '#bfefff' },
];

const PERMISSION_LABEL: Record<string, string> = {
  'read:location': '位置', 'read:health_events': '健康摘要',
  'run:model': '端侧 / Qwen 模型', 'capture:camera': '摄像头',
  'notify:user': '提醒', 'write:health_events': '本地健康记忆',
};

const STAGES: Array<{ id: Stage; number: string; label: string; hint: string }> = [
  { id: 'sketch', number: '01', label: '草图', hint: '先把想法摆上来' },
  { id: 'structure', number: '02', label: '结构', hint: 'Frost 整理依赖' },
  { id: 'run', number: '03', label: '试跑', hint: 'Canvas 结构预览' },
];

function blockDefinition(capability: SkillBlockCapability): SkillCardDefinition {
  return BLOCKS.find((block) => block.capability === capability)!;
}

function makeNode(capability: SkillBlockCapability, index: number, label?: string): SkillCanvasNode {
  const block = blockDefinition(capability);
  return {
    id: `${capability}-${Date.now().toString(36)}-${index}`,
    capability, label: label || block.label, detail: block.detail,
    x: 5 + (index % 2) * 50 + (index % 3 === 0 ? 2 : 0),
    y: 58 + Math.floor(index / 2) * 104 + (index % 2 ? 12 : 0),
  };
}

function templateDraft(template: TemplateId, existingId?: string): SkillCanvasDraft {
  const now = new Date().toISOString();
  const config: Record<TemplateId, { title: string; prompt: string; capabilities: SkillBlockCapability[]; labels: string[] }> = {
    'morning-run': {
      title: '晨跑伙伴', prompt: '先看看今天的恢复状态，再安全地陪我完成晨跑。',
      capabilities: ['trigger.manual', 'sensor.health', 'model.qwen', 'gate.safety', 'action.voice', 'store.local'],
      labels: ['我说开始', '看看身体', '安排今天', '不舒服就停', '一路陪我', '留下一次复盘'],
    },
    'gentle-recovery': {
      title: '温和恢复', prompt: '看懂我的恢复动作，只做温柔提醒，出现疼痛就停下。',
      capabilities: ['trigger.manual', 'model.pose', 'model.qwen', 'gate.safety', 'action.voice', 'store.local'],
      labels: ['准备好了', '看懂动作', '判断节奏', '疼痛就停', '轻声提醒', '记住感受'],
    },
    'outdoor-reset': {
      title: '出门透气', prompt: '根据我所在的位置安排一段轻松散步，并在合适的时候提醒我回家。',
      capabilities: ['trigger.manual', 'sensor.location', 'model.qwen', 'gate.safety', 'action.voice', 'store.local'],
      labels: ['想出去走走', '看看附近', '安排散步', '守住边界', '边走边陪', '收好这段路'],
    },
  };
  const selected = config[template];
  return {
    id: existingId || `canvas-${Date.now().toString(36)}`,
    title: selected.title, prompt: selected.prompt,
    nodes: selected.capabilities.map((capability, index) => makeNode(capability, index, selected.labels[index])),
    edges: [], created_at: now, updated_at: now,
  };
}

function StageRail({ stage, hasTrace, onChange }: { stage: Stage; hasTrace: boolean; onChange: (stage: Stage) => void }) {
  return <nav aria-label="Skill Canvas 阶段" className="border-b-2 border-black bg-[#f7f1df] px-3 py-2.5">
    <div className="mx-auto grid max-w-[760px] grid-cols-3">
      {STAGES.map((item, index) => {
        const active = stage === item.id;
        const completed = STAGES.findIndex((candidate) => candidate.id === stage) > index;
        const enabled = item.id !== 'run' || hasTrace;
        return <button key={item.id} type="button" disabled={!enabled} onClick={() => onChange(item.id)} className="group relative flex min-w-0 items-center gap-2 px-1 text-left disabled:opacity-25">
          {index > 0 && <span className={`absolute right-1/2 top-[13px] h-[2px] w-full ${completed || active ? 'bg-black' : 'bg-black/15'}`} />}
          <span className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-black font-pixel text-[5px] ${active ? 'bg-black text-[#7cff6b]' : completed ? 'bg-[#7cff6b]' : 'bg-white'}`}>
            {completed ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : item.number}
          </span>
          <span className="relative z-10 min-w-0 bg-[#f7f1df] pr-1"><b className="block text-[9px]">{item.label}</b><small className="hidden truncate text-[6.5px] text-black/40 sm:block">{item.hint}</small></span>
        </button>;
      })}
    </div>
  </nav>;
}

function StructuredFlow({ draft }: { draft: SkillCanvasDraft }) {
  return <div className="border-[3px] border-black bg-[#171a18] p-3 shadow-[5px_5px_0_#000]">
    <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2"><span className="font-pixel text-[5px] text-[#7cff6b]">COMPILED ORDER</span><span className="font-pixel text-[5px] text-white/35">{draft.nodes.length} STEPS</span></div>
    {draft.nodes.map((node, index) => { const block = blockDefinition(node.capability); const Icon = block.icon; return <div key={node.id} className="relative mb-2.5 grid grid-cols-[34px_1fr_auto] items-center gap-2.5 border border-white/15 bg-white p-2.5 last:mb-0">
      {index < draft.nodes.length - 1 && <span className="absolute left-[26px] top-[47px] h-4 border-l-2 border-dotted border-[#7cff6b]" />}<span className="grid h-8 w-8 place-items-center rounded-full border-2 border-black" style={{ background: block.color }}><Icon className="h-4 w-4" /></span><span><small className="font-pixel text-[5px] text-black/35">{String(index + 1).padStart(2, '0')} · {block.family}</small><b className="mt-1 block text-[10px]">{node.label}</b><small className="mt-0.5 block text-[7px] text-black/40">{node.detail}</small></span><ArrowRight className="h-4 w-4 text-black/20" />
    </div>; })}
  </div>;
}

function RunStatus({ trace, visibleSteps }: { trace: SkillRunTrace; visibleSteps: number }) {
  return <div className="space-y-2">{trace.steps.map((step, index) => { const visible = index < visibleSteps; const active = index === visibleSteps; return <div key={step.node_id} className={`relative grid grid-cols-[34px_1fr_auto] items-center gap-2 border-2 px-2.5 py-2.5 transition-all duration-300 ${visible ? 'border-black bg-white' : active ? 'translate-x-1 border-black bg-[#fff0b5]' : 'border-black/15 bg-white/40 text-black/30'}`}>
    {index < trace.steps.length - 1 && <span className="absolute left-[25px] top-[42px] h-4 border-l-2 border-dashed border-black/25" />}<span className={`grid h-8 w-8 place-items-center rounded-full border-2 ${visible ? 'border-black bg-[#7cff6b]' : active ? 'border-black bg-[#ffd34e]' : 'border-black/15 bg-white'}`}>{visible ? <Check className="h-4 w-4" strokeWidth={3} /> : active ? <Footprints className="h-4 w-4 animate-pulse" /> : <span className="font-pixel text-[6px]">{String(index + 1).padStart(2, '0')}</span>}</span><span><b className="block text-[10px]">{step.label}</b><small className="mt-0.5 block text-[7px] leading-relaxed text-black/45">{visible ? step.evidence : active ? 'Frost 正在走到这里…' : '等待上一步'}</small></span><span className="font-pixel text-[5px]">{visible ? 'DONE' : active ? 'NOW' : 'NEXT'}</span>
  </div>; })}</div>;
}

export default function SkillCanvasTab({ skillId, onSaved }: Props) {
  const sequenceRef = useRef(100);
  const [stage, setStage] = useState<Stage>('sketch');
  const [draft, setDraft] = useState<SkillCanvasDraft>(() => getCanvasSkill(skillId || '')?.draft || templateDraft('morning-run'));
  const [compiled, setCompiled] = useState<CompiledSkillGraph | null>(null);
  const [trace, setTrace] = useState<SkillRunTrace | null>(null);
  const [visibleSteps, setVisibleSteps] = useState(0);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!skillId) return;
    const record = getCanvasSkill(skillId);
    if (!record) return;
    setDraft(record.draft); setCompiled(record.graph); setTrace(record.latest_run || null);
    setVisibleSteps(record.latest_run?.steps.length || 0); setStage('structure'); setSaved(true);
  }, [skillId]);

  useEffect(() => {
    if (stage !== 'run' || !trace || visibleSteps >= trace.steps.length) return;
    const timer = window.setTimeout(() => setVisibleSteps((value) => value + 1), 420);
    return () => window.clearTimeout(timer);
  }, [stage, trace, visibleSteps]);

  const compileResult = useMemo(() => compileSkillDraft(draft), [draft]);
  const updateDraft = (next: SkillCanvasDraft) => {
    setDraft({ ...next, updated_at: new Date().toISOString() });
    setSaved(false); setCompiled(null); setTrace(null);
  };
  const chooseTemplate = (template: TemplateId) => {
    updateDraft(templateDraft(template, draft.id));
  };
  const addBlock = (capability: SkillBlockCapability, targetIndex = draft.nodes.length) => {
    sequenceRef.current += 1;
    const nodes = [...draft.nodes];
    nodes.splice(Math.min(targetIndex, nodes.length), 0, makeNode(capability, draft.nodes.length + sequenceRef.current));
    updateDraft({
      ...draft,
      nodes,
    });
  };
  const removeNode = (id: string) => updateDraft({ ...draft, nodes: draft.nodes.filter((node) => node.id !== id) });
  const reorderNode = (id: string, targetIndex: number) => {
    const fromIndex = draft.nodes.findIndex((node) => node.id === id);
    if (fromIndex < 0 || fromIndex === targetIndex) return;
    const nodes = [...draft.nodes];
    const [node] = nodes.splice(fromIndex, 1);
    nodes.splice(Math.min(targetIndex, nodes.length), 0, node);
    updateDraft({ ...draft, nodes });
  };
  const showStructure = () => {
    setDraft(compileResult.structured); setStage('structure');
  };
  const startPreview = () => {
    const result = compileSkillDraft(draft); setDraft(result.structured);
    if (!result.ok || !result.graph) return;
    const nextTrace = previewSkillGraph(result.graph);
    setCompiled(result.graph); setTrace(nextTrace); setVisibleSteps(0); setSaved(false); setStage('run');
  };
  const save = () => {
    if (!compiled || !trace || visibleSteps < trace.steps.length) return;
    saveCanvasSkill(compiled, draft, trace); setSaved(true); onSaved?.();
  };

  return <div className="relative flex h-full flex-col overflow-hidden bg-[#e8e5dc]">
    <StageRail stage={stage} hasTrace={!!trace} onChange={setStage} />
    <div className="min-h-0 flex-1 overflow-y-auto">
      {stage === 'sketch' && <SkillDeckBuilder
        draft={draft}
        cards={BLOCKS}
        templates={TEMPLATES}
        onChange={updateDraft}
        onTemplate={(id) => chooseTemplate(id as TemplateId)}
        onAdd={addBlock}
        onRemove={removeNode}
        onReorder={reorderNode}
      />}
      {stage === 'structure' && <section className="mx-auto max-w-[880px] p-3 md:p-5">
        <header className="mb-3 grid grid-cols-[1fr_auto] gap-3 border-[3px] border-black bg-[#7cff6b] p-4"><span><small className="font-pixel text-[6px]">FROST STRUCTURED YOUR SKETCH</small><h2 className="mt-1.5 text-[23px] font-black">现在，它有顺序了</h2><p className="mt-1 text-[8px] leading-relaxed text-black/55">你提供想法；Frost 补上依赖、权限和停止规则。</p></span><span className="grid h-12 w-12 place-items-center rounded-full border-2 border-black bg-white"><WandSparkles className="h-5 w-5" /></span></header>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.35fr)_minmax(230px,.65fr)]"><StructuredFlow draft={compileResult.structured} /><aside className="space-y-3">
          <div className="border-2 border-black bg-[#fffaf0] p-3"><div className="flex items-start justify-between gap-2"><span><b className="block font-pixel text-[7px]">PERMISSION ENVELOPE</b><small className="mt-1 block text-[7px] leading-relaxed text-black/45">运行到对应步骤时才请求</small></span><ShieldCheck className="h-5 w-5" /></div><div className="mt-3 flex flex-wrap gap-1.5">{compileResult.graph?.permissions.map((permission) => <span key={permission} className="rounded-full border border-black bg-white px-2 py-1 text-[7px] font-bold">{PERMISSION_LABEL[permission] || permission}</span>) || <span className="text-[7px] text-black/40">修复问题后生成权限清单</span>}</div></div>
          <div className="border-2 border-black bg-white p-3"><small className="font-pixel text-[6px] text-black/40">PREVIEW BOUNDARY</small><b className="mt-1.5 block text-[11px]">试跑不会偷读真实数据</b><p className="mt-1.5 text-[8px] leading-relaxed text-black/45">只检查任务图；不读取 GPS、HRV、相机或模型结果。</p></div>
          {compileResult.issues.length === 0 && <div className="grid grid-cols-[32px_1fr] gap-2 border-2 border-black bg-[#dff5e9] p-3"><span className="grid h-8 w-8 place-items-center rounded-full border-2 border-black bg-[#7cff6b]"><Check className="h-4 w-4" /></span><span><b className="block text-[10px]">结构已通过编译</b><small className="mt-1 block text-[7px] text-black/45">仅生成任务图；尚未注册为可执行能力</small></span></div>}
        </aside></div>
        {compileResult.issues.length > 0 && <div role="alert" className="mt-3 border-2 border-[#b3261e] bg-[#fff0ed] p-3"><b className="text-[10px] text-[#8b1c16]">还差一点</b>{compileResult.issues.map((issue) => <p key={`${issue.code}-${issue.node_id || ''}`} className="mt-1 text-[8px] text-[#8b1c16]">· {issue.message}</p>)}</div>}
      </section>}
      {stage === 'run' && trace && <section className="mx-auto max-w-[760px] p-3 md:p-5">
        <header className="mb-3 border-[3px] border-black bg-[#fff0b5] p-4 shadow-[5px_5px_0_#000]"><div className="flex items-start justify-between gap-3"><span><small className="font-pixel text-[6px]">SKILL TASKMASTER · PREVIEW RUN</small><h2 className="mt-1.5 text-[23px] font-black">{visibleSteps >= trace.steps.length ? '这条任务能跑通' : '伙伴正在走一遍'}</h2><p className="mt-1 text-[8px] leading-relaxed text-black/55">{trace.note}</p></span><span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-black ${visibleSteps >= trace.steps.length ? 'bg-[#7cff6b]' : 'bg-white'}`}>{visibleSteps >= trace.steps.length ? <Check className="h-6 w-6" strokeWidth={3} /> : <Footprints className="h-6 w-6 animate-pulse" />}</span></div></header>
        <RunStatus trace={trace} visibleSteps={visibleSteps} />
        {visibleSteps >= trace.steps.length && <div className="mt-3 border-[3px] border-black bg-[#7cff6b] p-4 shadow-[5px_5px_0_#000]"><small className="font-pixel text-[6px]">COMPILED · {compiled?.nodes.length || 0} STEPS · {compiled?.permissions.length || 0} PERMISSIONS</small><h3 className="mt-1.5 text-[18px] font-black">{saved ? '已经装进 MY SKILLS' : '保存成你的 Skill'}</h3><p className="mt-1 text-[8px] leading-relaxed text-black/55">{saved ? '以后可以从 MY SKILLS 打开、修改和再次试跑。' : '任务图、权限清单和本次 Evidence 会一起保存在本机。'}</p><button type="button" disabled={saved} onClick={save} className="mt-3 flex w-full items-center justify-center gap-2 border-2 border-black bg-white px-3 py-3 font-pixel text-[7px] shadow-[3px_3px_0_#000] disabled:bg-white/60 disabled:text-black/45 disabled:shadow-none">{saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}{saved ? '已保存到 MY SKILLS' : '保存到 MY SKILLS'}</button></div>}
      </section>}
    </div>
    <footer className="shrink-0 border-t-[3px] border-black bg-white p-2.5"><div className="mx-auto max-w-[760px]">
      {stage === 'sketch' && <button type="button" disabled={draft.nodes.length === 0} onClick={showStructure} className="flex w-full items-center justify-center gap-2 border-2 border-black bg-black px-3 py-3 font-pixel text-[7px] text-[#7cff6b] shadow-[3px_3px_0_#7cff6b] disabled:opacity-30"><WandSparkles className="h-4 w-4" />让 FROST 把草图变成任务 <ArrowRight className="h-4 w-4" /></button>}
      {stage === 'structure' && <div className="grid grid-cols-[92px_1fr] gap-2"><button type="button" onClick={() => setStage('sketch')} className="flex items-center justify-center gap-1 border-2 border-black bg-white px-2 py-3 font-pixel text-[6px]"><ArrowLeft className="h-3.5 w-3.5" />再摆摆</button><button type="button" disabled={!compileResult.ok} onClick={startPreview} className="flex items-center justify-center gap-2 border-2 border-black bg-[#7cff6b] px-2 py-3 font-pixel text-[7px] shadow-[3px_3px_0_#000] disabled:bg-black/20 disabled:shadow-none"><Play className="h-4 w-4" fill="currentColor" />交给 SKILL TASKMASTER</button></div>}
      {stage === 'run' && <button type="button" onClick={() => setStage('structure')} className="flex w-full items-center justify-center gap-2 border-2 border-black bg-white px-3 py-3 font-pixel text-[7px]"><ArrowLeft className="h-4 w-4" />返回检查结构</button>}
    </div></footer>
  </div>;
}
