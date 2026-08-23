import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from 'react';
import {
  ArrowLeft, ArrowRight, Camera, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Database, Footprints, HeartPulse,
  GripVertical, MapPin, Play, Plus, RotateCcw, Save, ShieldCheck, Sparkles,
  Volume2, WandSparkles, X,
} from 'lucide-react';
import {
  CAPABILITY_CATALOG, CAPABILITY_DEFINITIONS, compileSkillDraft, createBrowserSkillRuntimeDependencies,
  executeStoredSkillGraph, getCanvasSkill, persistCompiledGraph, preflightBrowserSkillRuntime, saveCanvasSkill,
  SkillRuntimeError,
  type CompiledSkillGraph, type SkillBlockCapability, type SkillCanvasDraft,
  type SkillCanvasNode, type SkillRunTrace,
} from '../../../frost-agent/skill-taskmaster';
import { getSkillAvatar, recommendSkillAvatar, SKILL_AVATARS } from '../data/skillAvatarCatalog';

type Stage = 'sketch' | 'structure' | 'run';

interface Props { skillId?: string | null; onSaved?: () => void }

type CardFamily = '启动条件' | '数据输入' | '处理与模型' | '流程控制' | '动作输出' | '状态与证据';
type DragSource = { kind: 'library'; capability: SkillBlockCapability } | { kind: 'slot'; nodeId: string };
type RuntimeNotice = { key: string; message: string; action?: string };

interface AbilityBlock {
  capability: SkillBlockCapability; number: string; label: string; detail: string; family: CardFamily;
  color: string; icon: typeof Play; editorialArtwork: string; blurb: string; input: string; output: string; provider: string;
  stats: { instant: number; privacy: number; evidence: number; risk: number };
}

const BLOCK_VISUALS: Record<SkillBlockCapability, Pick<AbilityBlock, 'number' | 'color' | 'icon' | 'editorialArtwork' | 'stats'>> = {
  'trigger.manual': { number: '01', color: '#e5ba58', icon: Play, editorialArtwork: '01-manual-trigger.png', stats: { instant: 5, privacy: 5, evidence: 3, risk: 1 } },
  'sensor.location': { number: '02', color: '#83b8d2', icon: MapPin, editorialArtwork: '02-location-input.png', stats: { instant: 5, privacy: 2, evidence: 5, risk: 3 } },
  'sensor.health': { number: '03', color: '#72b9ad', icon: HeartPulse, editorialArtwork: '03-health-summary.png', stats: { instant: 4, privacy: 2, evidence: 5, risk: 4 } },
  'model.gemma': { number: '04', color: '#a8b77e', icon: Sparkles, editorialArtwork: '04-semantic-decision.png', stats: { instant: 3, privacy: 4, evidence: 3, risk: 3 } },
  'model.pose': { number: '05', color: '#a99bc6', icon: Camera, editorialArtwork: '05-pose-recognition.png', stats: { instant: 4, privacy: 3, evidence: 4, risk: 4 } },
  'gate.safety': { number: '06', color: '#ad91b8', icon: ShieldCheck, editorialArtwork: '06-safety-gate.png', stats: { instant: 5, privacy: 5, evidence: 5, risk: 1 } },
  'action.voice': { number: '07', color: '#df8a5f', icon: Volume2, editorialArtwork: '07-voice-notification.png', stats: { instant: 5, privacy: 4, evidence: 2, risk: 2 } },
  'state.skill_completed': { number: '08', color: '#95a77a', icon: Database, editorialArtwork: '08-evidence-store.png', stats: { instant: 4, privacy: 5, evidence: 5, risk: 1 } },
};

const BLOCKS: AbilityBlock[] = (Object.keys(CAPABILITY_CATALOG) as SkillBlockCapability[]).map((capability) => {
  const contract = CAPABILITY_CATALOG[capability];
  return {
    capability,
    ...BLOCK_VISUALS[capability],
    label: contract.title,
    detail: contract.detail,
    family: contract.family,
    blurb: contract.description,
    input: contract.inputs[0]?.schema || '用户手势',
    output: contract.outputs[0]?.schema || '无',
    provider: contract.provider,
  };
});

const FAMILY_FILTERS: Array<'全部' | CardFamily> = ['全部', '启动条件', '数据输入', '处理与模型', '流程控制', '动作输出', '状态与证据'];
const STAGE_LABEL = { trigger: '启动条件', sense: '数据输入', think: '处理与模型', guard: '流程控制', act: '动作输出', remember: '状态与证据' } as const;

const PERMISSION_LABEL: Record<string, string> = {
  'read:location': '位置', 'read:health_events': '健康摘要', 'run:model': 'Gemma / 本机模型',
  'capture:camera': '摄像头', 'notify:user': '语音提醒', 'write:health_events': '本机证据 + 完成事实同步',
};

const EDITORIAL_ART_BASE = `${import.meta.env.BASE_URL}assets/skill-cards/editorial-line-art-v1/`;
const EDITORIAL_ART_LAYOUT: Record<SkillBlockCapability, { x: number; y: number; width: number; height: number }> = {
  'trigger.manual': { x: 15, y: 37, width: 130, height: 136 },
  'sensor.location': { x: 14, y: 37, width: 132, height: 137 },
  'sensor.health': { x: 15, y: 37, width: 130, height: 136 },
  'model.gemma': { x: 13, y: 37, width: 134, height: 138 },
  'model.pose': { x: 27, y: 31, width: 106, height: 146 },
  'gate.safety': { x: 14, y: 37, width: 132, height: 138 },
  'action.voice': { x: 15, y: 37, width: 130, height: 138 },
  'state.skill_completed': { x: 14, y: 37, width: 132, height: 138 },
};

function blockDefinition(capability: SkillBlockCapability) {
  return BLOCKS.find((block) => block.capability === capability)!;
}

function makeNode(capability: SkillBlockCapability, index: number, label?: string): SkillCanvasNode {
  const block = blockDefinition(capability);
  return {
    id: `${capability}-${Date.now().toString(36)}-${index}`,
    capability, label: label || block.label, detail: block.detail,
    x: 18 + (index % 2) * 174 + (index % 3 === 0 ? 7 : 0),
    y: 24 + Math.floor(index / 2) * 94 + (index % 2 ? 9 : 0),
  };
}

function emptyDraft(existingId?: string): SkillCanvasDraft {
  const now = new Date().toISOString();
  return {
    id: existingId || `canvas-${Date.now().toString(36)}`,
    title: '', prompt: '', nodes: [],
    edges: [], created_at: now, updated_at: now,
  };
}

function RunStatus({ trace }: { trace: SkillRunTrace }) {
  return <div className="space-y-2">{trace.steps.map((step, index) => {
    const completed = step.status === 'completed';
    const active = step.status === 'running';
    const blocked = step.status === 'blocked';
    return <div key={step.node_id} className={`relative grid grid-cols-[34px_1fr_auto] items-center gap-2 border-2 px-2.5 py-2.5 transition-all duration-300 ${completed ? 'border-black bg-white' : active ? 'translate-x-1 border-black bg-[#fff0b5]' : blocked ? 'border-[#b3261e] bg-[#fff0ed]' : 'border-black/15 bg-white/40 text-black/30'}`}>
      {index < trace.steps.length - 1 && <span className="absolute left-[25px] top-[42px] h-4 border-l-2 border-dashed border-black/25" />}
      <span className={`grid h-8 w-8 place-items-center rounded-full border-2 ${completed ? 'border-black bg-[#00ff88]' : active ? 'border-black bg-[#ffd34e]' : blocked ? 'border-[#b3261e] bg-white' : 'border-black/15 bg-white'}`}>{completed ? <Check className="h-4 w-4" strokeWidth={3} /> : active ? <Footprints className="h-4 w-4 animate-pulse" /> : blocked ? <X className="h-4 w-4" /> : <span className="font-pixel text-[6px]">{String(index + 1).padStart(2, '0')}</span>}</span>
      <span><b className="block text-[10px]">{step.label}{step.attempts > 1 ? ` · ${step.attempts} 次尝试` : ''}</b><small className="mt-0.5 block text-[7px] leading-relaxed text-black/45">{step.evidence}</small>{step.error && <small className="mt-1 block text-[7px] leading-relaxed text-[#8b1c16]">{step.error.message}<br />建议：{step.error.suggested_action}</small>}</span>
      <span className="font-pixel text-[5px]">{completed ? '完成' : active ? '当前' : blocked ? '阻断' : step.status === 'skipped' ? '跳过' : '待执行'}</span>
    </div>;
  })}</div>;
}

function AbilityArtwork({ block, className = '' }: { block: AbilityBlock; className?: string }) {
  const ink = '#171717';
  const shapeIndex = Number(block.number);
  const technicalLabel = block.capability.split('.')[1].toUpperCase();
  const artLayout = EDITORIAL_ART_LAYOUT[block.capability];
  return <div role="img" aria-label={`${block.label}编辑卡片风格图示`} className={`relative grid place-items-center overflow-hidden bg-white ${className}`}>
    <svg viewBox="0 0 160 200" aria-hidden="true" className="h-full w-full select-none">
      <rect width="160" height="200" fill="#fff" />
      {shapeIndex === 1 && <circle cx="80" cy="101" r="59" fill={block.color} />}
      {shapeIndex === 2 && <rect x="22" y="43" width="116" height="116" fill={block.color} transform="rotate(-7 80 101)" />}
      {shapeIndex === 3 && <rect x="12" y="53" width="136" height="96" rx="21" fill={block.color} />}
      {shapeIndex === 4 && <path d="M80 31 149 101 80 171 11 101Z" fill={block.color} />}
      {shapeIndex === 5 && <path d="M80 28 151 165 9 165Z" fill={block.color} />}
      {shapeIndex === 6 && <path d="M80 31 145 67 145 136 80 171 15 136 15 67Z" fill={block.color} />}
      {shapeIndex === 7 && <circle cx="80" cy="101" r="59" fill={block.color} />}
      {shapeIndex === 8 && <rect x="21" y="42" width="118" height="118" rx="4" fill={block.color} transform="rotate(7 80 101)" />}
      <image
        href={`${EDITORIAL_ART_BASE}${block.editorialArtwork}`}
        x={artLayout.x}
        y={artLayout.y}
        width={artLayout.width}
        height={artLayout.height}
        preserveAspectRatio="xMidYMid meet"
        style={{ filter: 'contrast(180%)', mixBlendMode: 'multiply' }}
      />
      <text x="10" y="20" fill={ink} fontFamily="Impact, Arial Black, sans-serif" fontSize="14" fontWeight="900">{block.label}</text>
      <text x="151" y="12" fill={ink} fontFamily="Impact, Arial Black, sans-serif" fontSize="7" fontWeight="900" transform="rotate(90 151 12)">{block.family}</text>
      <text x="10" y="188" fill={ink} fontFamily="Impact, Arial Black, sans-serif" fontSize="7" fontWeight="900" transform="rotate(-90 10 188)">模块 {block.number}</text>
      <text x="150" y="190" textAnchor="end" fill={ink} fontFamily="Impact, Arial Black, sans-serif" fontSize="10" fontWeight="900">{technicalLabel}</text>
    </svg>
  </div>;
}

function MiniAbilityCard({
  block, label, placed = false, onOpen, onRemove, onDragStart,
}: {
  block: AbilityBlock; label?: string; placed?: boolean; onOpen: () => void;
  onRemove?: () => void; onDragStart: (event: ReactDragEvent<HTMLElement>) => void;
}) {
  return <article
    draggable
    tabIndex={0}
    role="button"
    aria-label={`查看${label || block.label}卡牌`}
    onDragStart={onDragStart}
    onClick={onOpen}
    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(); } }}
    className={`${placed ? 'w-full' : 'w-[126px] shrink-0'} group relative cursor-grab overflow-hidden rounded-[3px] border-2 border-[#26231f] bg-white text-left active:cursor-grabbing`}
  >
    <div className="relative overflow-hidden">
      <AbilityArtwork block={block} className={`${placed ? 'aspect-[3/4]' : 'h-[166px]'} w-full`} />
      {placed && <GripVertical className="absolute bottom-1.5 right-1.5 h-3.5 w-3.5 rounded-full border border-[#26231f] bg-[#f8f1e3] p-0.5" />}
    </div>
    {onRemove && <button
      type="button"
      aria-label={`移除${label || block.label}`}
      onClick={(event) => { event.stopPropagation(); onRemove(); }}
      className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full border border-[#26231f] bg-[#f8f1e3]"
    ><X className="h-3 w-3" strokeWidth={2.5} /></button>}
  </article>;
}

function AbilityCardDialog({ block, onClose, onAdd }: { block: AbilityBlock; onClose: () => void; onAdd: () => void }) {
  const [flipped, setFlipped] = useState(false);
  const definition = CAPABILITY_DEFINITIONS[block.capability];
  const runtimeSignals = [
    { key: '响应', value: block.stats.instant >= 4 ? '实时' : '队列', score: block.stats.instant },
    { key: '隐私', value: block.stats.privacy >= 4 ? '本机' : '受控授权', score: block.stats.privacy },
    { key: '证据', value: block.stats.evidence >= 4 ? '可追溯' : '基础', score: block.stats.evidence },
    { key: '风险', value: block.stats.risk <= 2 ? '低' : '需防护', score: block.stats.risk },
  ];
  return <div className="absolute inset-0 z-[70] overflow-y-auto bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={`${block.label}卡牌详情`}>
    <div className="mx-auto mt-2 flex h-[560px] w-full max-w-[342px] flex-col overflow-hidden rounded-[28px] border-[3px] border-[#26231f] bg-[#f8f1e3]">
      <div className="flex shrink-0 items-center justify-between border-b-2 border-[#26231f] px-3 py-2" style={{ background: block.color }}>
        <span className="font-pixel text-[7px]">模块 {block.number}</span>
        <span className="rounded-full border-2 border-[#26231f] bg-[#f8f1e3] px-3 py-1 text-[8px] font-black">{block.family}</span>
        <button type="button" onClick={onClose} aria-label="关闭卡牌" className="grid h-7 w-7 place-items-center rounded-full border-2 border-[#26231f] bg-[#f8f1e3]"><X className="h-4 w-4" /></button>
      </div>

      {!flipped ? <div className="flex min-h-0 flex-1 flex-col p-3">
        <AbilityArtwork block={block} className="h-[350px] w-full shrink-0 rounded-[3px] border-2 border-[#26231f]" />
        <p className="mt-3 border-l-[3px] border-[#26231f] pl-3 text-[9px] leading-relaxed text-black/60">{block.blurb}</p>
        <div className="mt-auto grid grid-cols-2 gap-2 pt-3">
            <button type="button" onClick={() => setFlipped(true)} className="flex items-center justify-center gap-1.5 rounded-full border-2 border-[#26231f] bg-[#f8f1e3] px-3 py-2.5 text-[9px] font-black"><RotateCcw className="h-3.5 w-3.5" />翻到背面</button>
            <button type="button" onClick={onAdd} className="flex items-center justify-center gap-1.5 rounded-full border-2 border-[#26231f] bg-[#26231f] px-3 py-2.5 text-[9px] font-black text-[#f8f1e3]"><Plus className="h-3.5 w-3.5" />放入组合</button>
        </div>
      </div> : <div className="flex min-h-0 flex-1 flex-col p-4">
        <section className="rounded-[18px] border-2 border-[#26231f] bg-[#191a17] p-3 text-[#f8f1e3]">
          <div className="flex items-center justify-between gap-2"><small className="font-pixel text-[5px] text-[#7CFF6B]">能力契约 · CONTRACT</small><span className="rounded-full border border-[#7CFF6B] px-2 py-0.5 font-pixel text-[4px] text-[#7CFF6B]">就绪</span></div>
          <h2 className="mt-1.5 text-[19px] font-black">{block.label}</h2>
          <code className="mt-1 block truncate font-mono text-[8px] text-white/55">capability://{block.capability}</code>
        </section>

        <section className="mt-3 overflow-hidden rounded-[18px] border-2 border-[#26231f] bg-white/55">
          <div className="flex items-center justify-between border-b border-[#26231f] bg-[#dfd8ca] px-3 py-2"><b className="font-pixel text-[5px]">运行时接口 · RUNTIME</b><span className="font-mono text-[7px] text-black/45">{definition.version}</span></div>
          <dl className="grid grid-cols-[72px_1fr] gap-x-2 gap-y-1.5 p-3 font-mono text-[8px]">
            <dt className="text-black/40">阶段</dt><dd>{STAGE_LABEL[definition.stage]} / {definition.stage}</dd>
            <dt className="text-black/40">执行方</dt><dd className="truncate">{definition.execution} / {block.provider}</dd>
            <dt className="text-black/40">绑定</dt><dd className="truncate">{definition.runtime_binding}</dd>
            <dt className="text-black/40">输入</dt><dd className="truncate text-[#36697f]">{block.input}</dd>
            <dt className="text-black/40">输出</dt><dd className="truncate text-[#7b5630]">{block.output}</dd>
          </dl>
        </section>

        <section className="mt-3 grid grid-cols-2 gap-2">
          {runtimeSignals.map((signal) => <div key={signal.key} className="rounded-[12px] border-2 border-[#26231f] bg-white/55 px-2.5 py-2">
            <span className="flex items-center justify-between font-pixel text-[4px] text-black/40"><span>{signal.key}</span><span>{signal.score}/5</span></span>
            <b className="mt-1 block font-mono text-[8px]">{signal.value}</b>
          </div>)}
        </section>

        <section className="mt-3 rounded-[14px] border-2 border-[#26231f] bg-white/55 px-3 py-2">
          <small className="font-pixel text-[4px] text-black/40">权限范围 · PERMISSIONS</small>
          <code className="mt-1 block truncate font-mono text-[7px]">{definition.permissions.length ? `[${definition.permissions.map((permission) => `\"${permission}\"`).join(', ')}]` : '[] // 无额外权限'}</code>
        </section>
        <button type="button" onClick={() => setFlipped(false)} className="mt-auto flex w-full items-center justify-center gap-2 rounded-full border-2 border-[#26231f] bg-[#26231f] px-3 py-3 text-[9px] font-black text-[#f8f1e3]"><RotateCcw className="h-4 w-4" />翻回正面</button>
      </div>}
    </div>
  </div>;
}

export default function SkillCanvasTab({ skillId, onSaved }: Props) {
  const sequenceRef = useRef(100);
  const deckScrollRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Stage>('sketch');
  const [draft, setDraft] = useState<SkillCanvasDraft>(() => getCanvasSkill(skillId || '')?.draft || emptyDraft());
  const [activeFamily, setActiveFamily] = useState<'全部' | CardFamily>('全部');
  const [selectedCapability, setSelectedCapability] = useState<SkillBlockCapability | null>(null);
  const [dragSource, setDragSource] = useState<DragSource | null>(null);
  const [compiled, setCompiled] = useState<CompiledSkillGraph | null>(null);
  const [trace, setTrace] = useState<SkillRunTrace | null>(null);
  const [running, setRunning] = useState(false);
  const [runtimeIssues, setRuntimeIssues] = useState<RuntimeNotice[]>([]);
  const [saved, setSaved] = useState(false);
  const [deckEdges, setDeckEdges] = useState({ left: true, right: false });
  const [comboExpanded, setComboExpanded] = useState(false);
  const runAbortRef = useRef<AbortController | null>(null);

  const updateDeckEdges = () => {
    const deck = deckScrollRef.current;
    if (!deck) return;
    setDeckEdges({
      left: deck.scrollLeft <= 2,
      right: deck.scrollLeft + deck.clientWidth >= deck.scrollWidth - 2,
    });
  };
  const scrollDeck = (direction: -1 | 1) => {
    const deck = deckScrollRef.current;
    if (!deck) return;
    deck.scrollBy({ left: direction * Math.max(220, deck.clientWidth * 0.72), behavior: 'smooth' });
  };

  useEffect(() => {
    if (!skillId) return;
    const record = getCanvasSkill(skillId);
    if (!record) return;
    setDraft(record.draft); setCompiled(record.graph); setTrace(record.latest_run || null);
    setStage('structure'); setSaved(true);
  }, [skillId]);

  useEffect(() => {
    return () => runAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(updateDeckEdges);
    window.addEventListener('resize', updateDeckEdges);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener('resize', updateDeckEdges); };
  }, [activeFamily]);

  const compileResult = useMemo(() => compileSkillDraft(draft), [draft]);
  const filteredBlocks = activeFamily === '全部' ? BLOCKS : BLOCKS.filter((block) => block.family === activeFamily);
  const selectedBlock = selectedCapability ? blockDefinition(selectedCapability) : null;
  const recommendedAvatar = useMemo(() => recommendSkillAvatar(draft.nodes), [draft.nodes]);
  const selectedAvatar = getSkillAvatar(draft.avatar_id) || recommendedAvatar;
  const compactRows = Math.max(1, Math.ceil((draft.nodes.length + 1) / 4));
  const expandedRows = Math.max(2, Math.ceil(draft.nodes.length / 4) + 1);
  const slotCount = (comboExpanded ? expandedRows : compactRows) * 4;
  const goalReady = !!draft.title.trim() && !!draft.prompt.trim();
  const buildChecks = [
    { label: '目标已定义', ok: goalReady },
    { label: '包含启动条件', ok: draft.nodes.some((node) => CAPABILITY_DEFINITIONS[node.capability].stage === 'trigger') },
    { label: '包含动作或状态输出', ok: draft.nodes.some((node) => ['act', 'remember'].includes(CAPABILITY_DEFINITIONS[node.capability].stage)) },
  ];
  const updateDraft = (next: SkillCanvasDraft) => {
    setDraft({ ...next, updated_at: new Date().toISOString() }); setSaved(false); setCompiled(null); setTrace(null); setRuntimeIssues([]);
  };
  const addBlock = (capability: SkillBlockCapability, slotIndex = draft.nodes.length) => {
    sequenceRef.current += 1;
    const nextNodes = [...draft.nodes];
    nextNodes.splice(Math.min(slotIndex, nextNodes.length), 0, makeNode(capability, draft.nodes.length + sequenceRef.current));
    updateDraft({ ...draft, nodes: nextNodes });
  };
  const loadExecutableTemplate = () => {
    const capabilities: SkillBlockCapability[] = ['trigger.manual', 'sensor.location', 'model.gemma', 'action.voice', 'state.skill_completed'];
    updateDraft({
      ...draft,
      title: draft.title || '城市观察伙伴',
      prompt: draft.prompt || '读取我的当前位置，给出一条安全、简短的城市观察建议，语音播报后保存完成证据。',
      nodes: capabilities.map((capability, index) => makeNode(capability, sequenceRef.current + index)),
      edges: [],
    });
    sequenceRef.current += capabilities.length;
  };
  const removeNode = (id: string) => updateDraft({ ...draft, nodes: draft.nodes.filter((node) => node.id !== id), edges: draft.edges.filter((edge) => edge.from !== id && edge.to !== id) });
  const moveNodeToSlot = (nodeId: string, slotIndex: number) => {
    const sourceIndex = draft.nodes.findIndex((node) => node.id === nodeId);
    if (sourceIndex < 0) return;
    const nextNodes = [...draft.nodes];
    const [node] = nextNodes.splice(sourceIndex, 1);
    nextNodes.splice(Math.min(slotIndex, nextNodes.length), 0, node);
    updateDraft({ ...draft, nodes: nextNodes });
  };
  const beginDrag = (event: ReactDragEvent<HTMLElement>, source: DragSource) => {
    setDragSource(source);
    event.dataTransfer.effectAllowed = source.kind === 'library' ? 'copy' : 'move';
    event.dataTransfer.setData('text/plain', source.kind === 'library' ? source.capability : source.nodeId);
  };
  const dropIntoSlot = (event: ReactDragEvent<HTMLDivElement>, slotIndex: number) => {
    event.preventDefault();
    if (!dragSource) return;
    if (dragSource.kind === 'library') addBlock(dragSource.capability, slotIndex);
    else moveNodeToSlot(dragSource.nodeId, slotIndex);
    setDragSource(null);
  };
  const showStructure = () => {
    setDraft({
      ...compileResult.structured,
      avatar_id: compileResult.structured.avatar_id || recommendedAvatar.id,
      avatar_name: compileResult.structured.avatar_name ?? selectedAvatar.name,
      avatar_role: compileResult.structured.avatar_role ?? selectedAvatar.role,
    });
    setStage('structure');
  };
  const startRun = async () => {
    const result = compileSkillDraft(draft); setDraft(result.structured);
    if (!result.ok || !result.graph) return;
    setRuntimeIssues([]);
    const issues = await preflightBrowserSkillRuntime(result.graph);
    if (issues.some((issue) => issue.severity === 'blocking')) {
      setRuntimeIssues(issues.map((issue, index) => ({ key: `${issue.code}-${issue.node_id || index}`, message: issue.message, action: issue.suggested_action })));
      return;
    }
    await persistCompiledGraph(result.graph);
    const controller = new AbortController();
    runAbortRef.current?.abort();
    runAbortRef.current = controller;
    setCompiled(result.graph); setTrace(null); setSaved(false); setStage('run'); setRunning(true);
    try {
      const nextTrace = await executeStoredSkillGraph(
        result.graph.graph_id,
        result.graph.graph_hash,
        createBrowserSkillRuntimeDependencies({ signal: controller.signal, onTrace: setTrace }),
      );
      setTrace(nextTrace);
    } catch (error) {
      setRuntimeIssues([{
        key: error instanceof SkillRuntimeError ? error.code : 'runtime-failed',
        message: error instanceof Error ? error.message : '技能运行失败',
        ...(error instanceof SkillRuntimeError ? { action: error.suggestedAction } : {}),
      }]);
    } finally {
      setRunning(false);
    }
  };
  const save = () => {
    if (!compiled || !trace || trace.status !== 'completed') return;
    const avatarId = draft.avatar_id || selectedAvatar.id;
    const avatarName = draft.avatar_name ?? selectedAvatar.name;
    const avatarRole = draft.avatar_role ?? selectedAvatar.role;
    const draftWithAvatar = { ...draft, avatar_id: avatarId, avatar_name: avatarName, avatar_role: avatarRole };
    saveCanvasSkill(compiled, draftWithAvatar, trace);
    setDraft(draftWithAvatar); setSaved(true); onSaved?.();
  };

  return <div className="relative flex h-full flex-col overflow-hidden bg-[#efece4]">
    <div className="min-h-0 flex-1 overflow-y-auto">
      {stage === 'sketch' && <>
        <section className="border-b-2 border-black bg-[#fff9e8] px-4 py-4">
          <div className="flex items-end justify-between gap-3"><span><b className="block font-pixel text-[7px]">01 · 定义目标</b><small className="mt-1 block text-[7px] text-black/45">先定义结果、场景与安全边界</small></span><span className={`rounded-full border-2 border-black px-2 py-1 font-pixel text-[5px] ${goalReady ? 'bg-[#a8c99c]' : 'bg-white'}`}>{goalReady ? '已就绪' : '必填'}</span></div>
          <label className="mt-3 block text-[8px] font-black" htmlFor="skill-goal-title">技能名称</label>
          <input id="skill-goal-title" aria-label="Skill 名称" value={draft.title} maxLength={28} onChange={(event) => updateDraft({ ...draft, title: event.target.value })} className="mt-1 w-full rounded-[12px] border-2 border-black bg-white px-3 py-2.5 text-[16px] font-black outline-none placeholder:text-black/25" placeholder="例如：10 分钟城市观察跑" />
          <label className="mt-3 block text-[8px] font-black" htmlFor="skill-goal-description">目标定义</label>
          <textarea id="skill-goal-description" aria-label="目标定义" value={draft.prompt} maxLength={160} onChange={(event) => updateDraft({ ...draft, prompt: event.target.value })} className="mt-1 min-h-[74px] w-full resize-none rounded-[12px] border-2 border-black bg-white px-3 py-2.5 text-[10px] leading-relaxed outline-none placeholder:text-black/30" placeholder="写清期望结果、使用场景和必须遵守的边界。例：读取今天的恢复状态，完成 10 分钟城市跑；出现疼痛立即停止，并保存带 Evidence 的总结。" />
        </section>

        <section className="border-b-2 border-black bg-[#e8e2d5] px-3 py-3">
          <div className="flex items-end justify-between gap-3">
            <span><b className="block font-pixel text-[7px]">02 · 能力模块</b><small className="mt-1 block text-[7px] text-black/45">按工程能力分类筛选；拖动模块进入组合区</small></span>
            <span className="rounded-full border-2 border-black bg-[#f8f1e3] px-2 py-1 font-pixel text-[5px]">{BLOCKS.length} 个模块</span>
          </div>
          {draft.nodes.length === 0 && <button type="button" onClick={loadExecutableTemplate} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-[10px] border-2 border-black bg-[#ffd34e] px-3 py-2 text-[8px] font-black"><WandSparkles className="h-4 w-4" />装入“手动 → 位置 → Gemma → 语音 → 证据”真链模板</button>}
          <div className="-mx-3 mt-2 flex gap-1.5 overflow-x-auto px-3 pb-1">{FAMILY_FILTERS.map((family) => <button key={family} type="button" onClick={() => setActiveFamily(family)} className={`shrink-0 rounded-full border-2 border-black px-3 py-1.5 text-[8px] font-black ${activeFamily === family ? 'bg-[#26231f] text-[#f8f1e3]' : 'bg-[#f8f1e3]'}`}>{family}</button>)}</div>
          <div className="relative -mx-3 mt-2">
            <button type="button" aria-label="向左滑动能力卡牌" disabled={deckEdges.left} onClick={() => scrollDeck(-1)} className="absolute left-1 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border-2 border-black bg-[#f8f1e3] disabled:opacity-20"><ChevronLeft className="h-5 w-5" strokeWidth={3} /></button>
            <div ref={deckScrollRef} onScroll={updateDeckEdges} className="flex gap-2.5 overflow-x-auto px-11 pb-2">{filteredBlocks.map((block) => <MiniAbilityCard
              key={block.capability}
              block={block}
              onOpen={() => setSelectedCapability(block.capability)}
              onDragStart={(event) => beginDrag(event, { kind: 'library', capability: block.capability })}
            />)}</div>
            <button type="button" aria-label="向右滑动能力卡牌" disabled={deckEdges.right} onClick={() => scrollDeck(1)} className="absolute right-1 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border-2 border-black bg-[#f8f1e3] disabled:opacity-20"><ChevronRight className="h-5 w-5" strokeWidth={3} /></button>
          </div>
        </section>

        <section className="px-3 pb-4 pt-3">
          <div className="mb-2 flex items-end justify-between gap-3">
            <span><b className="block font-pixel text-[7px]">03 · 技能组合</b><small className="mt-1 block text-[7px] text-black/45">从空白技能图开始；拖入、移除或调整模块顺序</small></span>
            <span className="flex shrink-0 items-center gap-1.5">
              <span className="rounded-full border border-black bg-white px-2 py-1 font-pixel text-[5px]">{draft.nodes.length} 个模块</span>
              <button type="button" aria-expanded={comboExpanded} onClick={() => setComboExpanded((value) => !value)} className="flex items-center gap-1 rounded-full border-2 border-black bg-[#ffd34e] px-2 py-1 text-[6px] font-black">{comboExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}{comboExpanded ? '收起空行' : '展开画布'}</button>
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2 rounded-[18px] border-2 border-black bg-[#d6d0c3] p-2" style={{ backgroundImage: 'radial-gradient(circle, rgba(0,0,0,.11) 1px, transparent 1px)', backgroundSize: '15px 15px' }}>
            {Array.from({ length: slotCount }, (_, index) => {
              const node = draft.nodes[index];
              return <div
                key={node?.id || `empty-${index}`}
                role={node ? undefined : 'button'}
                aria-label={node ? undefined : `空卡槽 ${index + 1}`}
                onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = dragSource?.kind === 'library' ? 'copy' : 'move'; }}
                onDrop={(event) => dropIntoSlot(event, index)}
                className={`min-h-[128px] rounded-[14px] ${node ? '' : 'grid place-items-center border-2 border-dashed border-black/45 bg-[#f8f1e3]/45'}`}
              >
                {node ? <MiniAbilityCard
                  block={blockDefinition(node.capability)}
                  label={node.label}
                  placed
                  onOpen={() => setSelectedCapability(node.capability)}
                  onRemove={() => removeNode(node.id)}
                  onDragStart={(event) => beginDrag(event, { kind: 'slot', nodeId: node.id })}
                /> : <span className="pointer-events-none text-center text-black/35"><Plus className="mx-auto h-5 w-5" /><small className="mt-1 block font-pixel text-[5px] leading-tight">放入<br />模块</small></span>}
              </div>;
            })}
          </div>
          <div className="mt-3 rounded-[14px] border-2 border-black bg-[#f8f1e3] p-2.5">
            <div className="flex items-center justify-between"><span><b className="block text-[9px]">技能图构建检查</b><small className="mt-0.5 block text-[7px] text-black/45">结构化前先满足最小可执行合同</small></span><Sparkles className="h-4 w-4" /></div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">{buildChecks.map((check) => <span key={check.label} className={`flex min-h-[34px] items-center justify-center rounded-[9px] border border-black px-1 text-center text-[6px] font-black ${check.ok ? 'bg-[#a8c99c]' : 'bg-white text-black/35'}`}>{check.ok ? '✓ ' : '○ '}{check.label}</span>)}</div>
          </div>
          {compileResult.repairs.length > 0 && <div role="status" className="mt-2 rounded-[14px] border-2 border-[#2f6d44] bg-[#e9f7e9] p-2.5">
            <b className="text-[9px] text-[#245335]">Frost 已安全自动修复</b>
            {compileResult.repairs.map((repair, index) => <p key={`${repair.code}-${index}`} className="mt-1 text-[7px] leading-relaxed text-[#245335]">· {repair.message}</p>)}
            <small className="mt-1.5 block text-[6px] leading-relaxed text-[#245335]/70">只修复 ID、参数范围和连线；不会自动增加权限或副作用。</small>
          </div>}
          {compileResult.issues.length > 0 && <div role="alert" className="mt-2 rounded-[14px] border-2 border-[#b3261e] bg-[#fff0ed] p-2.5">
            <b className="text-[9px] text-[#8b1c16]">编译已阻断 · 需要你确认</b>
            {compileResult.issues.map((issue, index) => <div key={`${issue.code}-${issue.node_id || index}`} className="mt-2 border-t border-[#b3261e]/20 pt-2 first:mt-1 first:border-0 first:pt-0">
              <p className="text-[7px] font-black leading-relaxed text-[#8b1c16]">· {issue.message}</p>
              <p className="mt-0.5 text-[6px] leading-relaxed text-[#8b1c16]/70">建议：{issue.suggested_action}</p>
              {issue.code === 'missing_trigger' && <button type="button" onClick={() => addBlock('trigger.manual', 0)} className="mt-1.5 rounded-full border-2 border-black bg-[#ffd34e] px-2.5 py-1 text-[7px] font-black">添加手动启动</button>}
              {issue.code === 'missing_outcome' && <div className="mt-1.5 flex flex-wrap gap-1.5"><button type="button" onClick={() => addBlock('action.voice')} className="rounded-full border-2 border-black bg-white px-2.5 py-1 text-[7px] font-black">添加语音通知</button><button type="button" onClick={() => addBlock('state.skill_completed')} className="rounded-full border-2 border-black bg-[#ffd34e] px-2.5 py-1 text-[7px] font-black">添加完成与证据</button></div>}
            </div>)}
          </div>}
        </section>

        <section className="border-t-2 border-black bg-[#fff9e8] px-3 py-3">
          <div className="flex items-end justify-between gap-3">
            <span><b className="block font-pixel text-[7px]">04 · 选择技能形象</b><small className="mt-1 block text-[7px] text-black/45">动物头像属于完整 Skill，不再占用能力模块</small></span>
            <span className="rounded-full border-2 border-black bg-[#ffd34e] px-2 py-1 font-pixel text-[5px]">最后一步</span>
          </div>

          <div className="mt-3 grid grid-cols-[72px_1fr] items-center gap-3 rounded-[16px] border-2 border-black bg-white p-2.5">
            <span className="grid h-[68px] w-[68px] place-items-center overflow-hidden rounded-full border-2 border-black" style={{ background: selectedAvatar.accent }}>
              <img src={selectedAvatar.assetUrl} alt="" className="h-[92%] w-[92%] object-contain" draggable={false} />
            </span>
            <div className="min-w-0">
              <label className="block font-pixel text-[4px] text-black/40" htmlFor="skill-avatar-title">技能名称</label>
              <input id="skill-avatar-title" aria-label="编辑技能名称" value={draft.title} maxLength={28} onChange={(event) => updateDraft({ ...draft, title: event.target.value })} className="mt-0.5 w-full border-b-2 border-black bg-transparent px-0 py-1 text-[13px] font-black outline-none placeholder:text-black/25" placeholder="未命名技能" />
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <label className="min-w-0 text-[5px] font-bold text-black/40" htmlFor="skill-avatar-name">形象昵称<input id="skill-avatar-name" aria-label="编辑技能形象昵称" value={draft.avatar_name ?? selectedAvatar.name} maxLength={18} onChange={(event) => updateDraft({ ...draft, avatar_id: selectedAvatar.id, avatar_name: event.target.value })} className="mt-0.5 w-full border-b border-black bg-transparent py-0.5 text-[8px] font-black text-black outline-none" /></label>
                <label className="min-w-0 text-[5px] font-bold text-black/40" htmlFor="skill-avatar-role">形象介绍<input id="skill-avatar-role" aria-label="编辑技能形象介绍" value={draft.avatar_role ?? selectedAvatar.role} maxLength={32} onChange={(event) => updateDraft({ ...draft, avatar_id: selectedAvatar.id, avatar_role: event.target.value })} className="mt-0.5 w-full border-b border-black bg-transparent py-0.5 text-[7px] text-black outline-none" /></label>
              </div>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-4 gap-2">
            {SKILL_AVATARS.map((avatar) => {
              const active = selectedAvatar.id === avatar.id;
              const recommended = recommendedAvatar.id === avatar.id;
              return <button key={avatar.id} type="button" aria-pressed={active} aria-label={`选择${avatar.name}作为技能形象`} onClick={() => updateDraft({ ...draft, avatar_id: avatar.id, avatar_name: avatar.name, avatar_role: avatar.role })} className={`relative min-w-0 rounded-[12px] border-2 p-1.5 text-center ${active ? 'border-black bg-[#ffd34e]' : 'border-black/25 bg-white'}`}>
                {recommended && <span className="absolute right-1 top-1 z-10 rounded-full border border-black bg-[#00ff88] px-1 py-0.5 font-pixel text-[4px]">推荐</span>}
                <span className="mx-auto grid h-12 w-12 max-w-full place-items-center overflow-hidden rounded-full" style={{ background: `${avatar.accent}66` }}><img src={avatar.assetUrl} alt="" className="h-[94%] w-[94%] object-contain" loading="lazy" draggable={false} /></span>
                <small className="mt-1 block truncate text-[6px] font-black">{avatar.name}</small>
              </button>;
            })}
          </div>
        </section>
      </>}

      {stage === 'structure' && <section className="px-3 py-3">
        <div className="overflow-hidden border-[3px] border-black bg-white">
          <div className="grid grid-cols-[1fr_auto] gap-3 border-b-[3px] border-black bg-[#00ff88] p-3"><span><small className="font-pixel text-[6px]">FROST 已完成结构化</small><h2 className="mt-1 text-[20px] font-black">现在，顺序清楚了</h2><p className="mt-1 text-[8px] leading-relaxed text-black/55">{draft.avatar_name ?? selectedAvatar.name} 已成为这个 Skill 的形象；能力积木仍只表达功能。</p></span><span className="grid h-12 w-12 place-items-center overflow-hidden rounded-full border-2 border-black bg-white"><img src={selectedAvatar.assetUrl} alt={`${draft.avatar_name ?? selectedAvatar.name}技能形象`} className="h-[94%] w-[94%] object-contain" /></span></div>
          <div className="bg-[#161a19] p-3">{compileResult.structured.nodes.map((node, index) => { const block = blockDefinition(node.capability); const Icon = block.icon; return <div key={node.id} className="relative mb-3 grid grid-cols-[36px_1fr_auto] items-center gap-2.5 border-2 border-black bg-white p-2.5 last:mb-0">{index < compileResult.structured.nodes.length - 1 && <span className="absolute left-[26px] top-[54px] h-[18px] border-l-2 border-dashed border-[#00ff88]" />}<span className="grid h-9 w-9 place-items-center rounded-full border-2 border-black" style={{ background: block.color }}><Icon className="h-4 w-4" /></span><span><small className="font-pixel text-[5px] text-black/40">{String(index + 1).padStart(2, '0')} · {block.family}</small><b className="mt-1 block text-[10px]">{node.label}</b><small className="mt-0.5 block text-[7px] text-black/45">{node.detail}</small></span><ArrowRight className="h-4 w-4 text-black/25" /></div>; })}</div>
        </div>
        {compileResult.issues.length > 0 && <div role="alert" className="mt-3 border-2 border-[#b3261e] bg-[#fff0ed] p-2.5"><b className="text-[10px] text-[#8b1c16]">还差一点</b>{compileResult.issues.map((issue) => <p key={`${issue.code}-${issue.node_id || ''}`} className="mt-1 text-[8px] text-[#8b1c16]">· {issue.message}</p>)}</div>}
        <div className="mt-3 border-2 border-black bg-[#fff9e8] p-2.5"><div className="flex items-center justify-between"><span><b className="block font-pixel text-[7px]">权限边界</b><small className="mt-1 block text-[7px] text-black/45">运行到对应步骤时才请求</small></span><ShieldCheck className="h-5 w-5" /></div><div className="mt-2 flex flex-wrap gap-1.5">{compileResult.graph?.permissions.map((permission) => <span key={permission} className="border border-black bg-white px-2 py-1 text-[7px] font-bold">{PERMISSION_LABEL[permission] || permission}</span>) || <span className="text-[7px] text-black/40">修复上方问题后生成权限清单</span>}</div></div>
        {compileResult.graph && <div className="mt-3 border-2 border-black bg-[#191a17] p-2.5 text-[#f8f1e3]"><small className="font-pixel text-[5px] text-[#7CFF6B]">不可变执行物 · IMMUTABLE GRAPH</small><code className="mt-1.5 block break-all font-mono text-[7px] text-white/70">{compileResult.graph.graph_id}<br />{compileResult.graph.graph_hash}</code></div>}
        {runtimeIssues.length > 0 && <div role="alert" className="mt-3 border-2 border-[#b3261e] bg-[#fff0ed] p-2.5"><b className="text-[9px] text-[#8b1c16]">真实运行前还差这些</b>{runtimeIssues.map((issue) => <div key={issue.key} className="mt-1.5 text-[7px] leading-relaxed text-[#8b1c16]"><p>· {issue.message}</p>{issue.action && <p className="pl-2 text-[#8b1c16]/70">建议：{issue.action}</p>}</div>)}</div>}
        <p className="mt-3 px-1 text-[8px] leading-relaxed text-black/55">下一步会读取这份 Graph 的精确 Hash，按节点请求真实权限和 Provider。缺能力时会停止，不会用 preview 或伪数据冒充成功。</p>
      </section>}

      {stage === 'run' && <section className="px-3 py-3">
        <div className={`mb-3 border-[3px] border-black p-3 ${trace?.status === 'completed' ? 'bg-[#00ff88]' : trace && ['failed', 'safe_stopped', 'waiting_permission', 'cancelled'].includes(trace.status) ? 'bg-[#fff0ed]' : 'bg-[#fff0b5]'}`}><div className="flex items-start justify-between gap-3"><span><small className="font-pixel text-[6px]">SKILL TASKMASTER · 真实运行</small><h2 className="mt-1 text-[20px] font-black">{trace?.status === 'completed' ? '整条链路已跑通' : trace && trace.status !== 'running' ? '运行已停止' : '正在执行这张技能图'}</h2><p className="mt-1 text-[8px] leading-relaxed text-black/55">{trace?.note || '正在从 IndexedDB 重读 Graph 并校验 Hash…'}</p></span><span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-black ${trace?.status === 'completed' ? 'bg-white' : 'bg-[#ffd34e]'}`}>{trace?.status === 'completed' ? <Check className="h-6 w-6" strokeWidth={3} /> : running ? <Footprints className="h-6 w-6 animate-pulse" /> : <X className="h-6 w-6" />}</span></div></div>
        {trace ? <RunStatus trace={trace} /> : <div className="grid min-h-[180px] place-items-center border-2 border-dashed border-black/30 bg-white/50 text-center"><span><Footprints className="mx-auto h-7 w-7 animate-pulse" /><small className="mt-2 block font-pixel text-[6px]">加载不可变 GRAPH</small></span></div>}
        {runtimeIssues.length > 0 && <div role="alert" className="mt-3 border-2 border-[#b3261e] bg-[#fff0ed] p-2.5">{runtimeIssues.map((issue) => <div key={issue.key} className="text-[8px] text-[#8b1c16]"><p>· {issue.message}</p>{issue.action && <p className="pl-2 text-[7px] text-[#8b1c16]/70">建议：{issue.action}</p>}</div>)}</div>}
        {trace?.status === 'completed' && <div className="mt-3 border-[3px] border-black bg-[#00ff88] p-3"><small className="font-pixel text-[6px]">HASH 一致 · {compiled?.nodes.length || 0} 个真实步骤 · {compiled?.permissions.length || 0} 项权限</small><h3 className="mt-1.5 text-[17px] font-black">{saved ? '已经装进我的技能' : '保存成你的技能'}</h3><p className="mt-1 text-[8px] leading-relaxed text-black/55">{saved ? '以后可以从“我的技能”打开、修改和再次运行。' : 'Graph、Run Trace 与 Evidence 已在本机按同一 Hash 存档；云端只收到 skill_completed 事实。'}</p><button type="button" disabled={saved} onClick={save} className="mt-3 flex w-full items-center justify-center gap-2 border-2 border-black bg-white px-3 py-3 font-pixel text-[7px] disabled:bg-white/60 disabled:text-black/45">{saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}{saved ? '已保存到我的技能' : '保存到我的技能'}</button></div>}
      </section>}
    </div>

    <div className="shrink-0 border-t-[3px] border-black bg-white p-2.5">
      {stage === 'sketch' && <button type="button" disabled={!goalReady || !compileResult.ok} onClick={showStructure} className="flex w-full items-center justify-center gap-2 border-2 border-black bg-black px-3 py-3 font-pixel text-[7px] text-[#7CFF6B] disabled:opacity-30"><WandSparkles className="h-4 w-4" />编译为技能图 <ArrowRight className="h-4 w-4" /></button>}
      {stage === 'structure' && <div className="grid grid-cols-[92px_1fr] gap-2"><button type="button" onClick={() => setStage('sketch')} className="flex items-center justify-center gap-1 border-2 border-black bg-white px-2 py-3 font-pixel text-[6px]"><ArrowLeft className="h-3.5 w-3.5" />再摆摆</button><button type="button" disabled={!compileResult.ok || running} onClick={() => void startRun()} className="flex items-center justify-center gap-2 border-2 border-black bg-[#00ff88] px-2 py-3 font-pixel text-[7px] disabled:bg-black/20"><Play className="h-4 w-4" fill="currentColor" />真实运行这张技能图</button></div>}
      {stage === 'run' && <button type="button" onClick={() => { runAbortRef.current?.abort(); setRunning(false); setStage('structure'); }} className="flex w-full items-center justify-center gap-2 border-2 border-black bg-white px-3 py-3 font-pixel text-[7px]"><ArrowLeft className="h-4 w-4" />{running ? '取消并返回结构' : '返回检查结构'}</button>}
    </div>
    {selectedBlock && <AbilityCardDialog
      key={selectedBlock.capability}
      block={selectedBlock}
      onClose={() => setSelectedCapability(null)}
      onAdd={() => { addBlock(selectedBlock.capability); setSelectedCapability(null); }}
    />}
  </div>;
}
