// “我的技能”子页 —— Frost Agent 的能力控制台（Skill / harness / pipeline）
// 内容静态提炼自 frost-agent/ARCHITECTURE.md 与各 contract.md
import { lazy, Suspense, useState, useEffect, useMemo } from 'react';
import { Trash2, WandSparkles } from 'lucide-react';
import { getLearnedSkills, subscribeSkills, type LearnedSkill } from '../../../frost-agent/harness/skillForge';
import { startHeartbeat } from '../../../frost-agent/harness/heartbeat';
import {
  BUILTIN_SKILLS,
  ensureBuiltinSkills,
  getEquippedSkill,
  getInstalledSkill,
  prepareAndEquipSkill,
  subscribeSkillsRegistry,
} from '../lib/skill';
import { skillPublisherForAgent, type SkillPublisher } from '../data/skillPublishers';
import { PLAZA_WORLDS } from '../data/plazaWorlds';
import { resolveSkillRunTarget, type SkillRunTarget } from '../lib/plaza/skillRoutes';
import { cancelAbandonedHerMotionSessions } from '../lib/health/herMotionSession';
import { listCanvasSkills, removeCanvasSkill, subscribeCanvasSkills, type CanvasSkillRecord } from '../../../frost-agent/skill-taskmaster';
import { getBuiltinSkillAvatar, getSkillAvatar } from '../data/skillAvatarCatalog';

const POCKET_BUDDY_ASSET = `${import.meta.env.BASE_URL}assets/pocket-buddy/pet-materials-v1/objects-01.png`;

// Skill 运行页不属于控制台首屏；用户打开时再按需加载。
const FrostBuddyPage = lazy(() => import('./FrostBuddyPage'));
const HerMotionSkillPage = lazy(() => import('./HerMotionSkillPage'));
const LianlemaSkillPage = lazy(() => import('./LianlemaSkillPage'));
const HealthFoundationSkillPage = lazy(() => import('./HealthFoundationSkillPage'));
const RunRouteSkillPage = lazy(() => import('./RunRouteSkillPage'));
const LORA_BASE_VALIDATION_PAUSED = true;

function SkillPageLoader({ label }: { label: string }) {
  return <div className="grid h-full place-items-center bg-[#eaeaea] font-pixel text-[8px]">正在装入 {label}…</div>;
}

interface AgentItem {
  name: string;
  label?: string;
  zhLabel?: string;
  launchUrl?: string;
  publisher?: SkillPublisher;
  publisherRole?: string;
  runtimeBadge?: string;
  role: string;
  status: string;
  kind?: 'Markdown' | 'LoRA' | '混合' | '组合';
  background?: string;
}

function SkillCardAvatar({ skillName, publisher, size = 52 }: { skillName: string; publisher: SkillPublisher; size?: number }) {
  const avatar = getBuiltinSkillAvatar(skillName);
  return <span className="grid shrink-0 place-items-center overflow-hidden rounded-full border-2 border-black" style={{ width: size, height: size, background: avatar?.accent || '#f5efdf' }}><img src={avatar?.assetUrl || publisher.avatar} alt={avatar ? `${avatar.name}技能形象` : `${publisher.name}的发布者头像`} className="h-[94%] w-[94%] object-contain" loading="lazy" draggable={false} /></span>;
}

const HER_MOTION_WORLD = PLAZA_WORLDS.find((world) => world.id === 'w_hermotion')!;
const HER_MOTION_LAUNCH_URL = HER_MOTION_WORLD.launchUrl!;
const HER_MOTION_SKILL: AgentItem = {
  name: 'her-motion',
  label: HER_MOTION_WORLD.english,
  zhLabel: '女性运动',
  launchUrl: HER_MOTION_WORLD.launchUrl,
  publisher: HER_MOTION_WORLD.publisher,
  runtimeBadge: 'VISION API',
  role: `${HER_MOTION_WORLD.climate}；${HER_MOTION_WORLD.temperament}`,
  status: '已加载',
  kind: '组合',
  background: HER_MOTION_WORLD.paper,
};
const LIANLEMA_LAUNCH_URL = import.meta.env.VITE_LIANLEMA_URL || 'http://localhost:8082/';
const LIANLEMA_SKILL: AgentItem = {
  name: 'lianlema-coach',
  label: '练了吗',
  launchUrl: LIANLEMA_LAUNCH_URL,
  publisherRole: 'AI 动作教练',
  role: '实时姿势矫正、动作计数和服务端文字教练；使用便携包的摄像头与模型服务',
  status: '已加载',
  kind: '组合',
  runtimeBadge: 'POSE API · ST-GCN',
  background: '#e8f8ef',
};
const RUN_ROUTE_SKILL: AgentItem = {
  name: 'frost-run-route', label: 'RUN ROUTE', zhLabel: '跑步路线规划', publisherRole: '跑步路线员',
  role: '高德生成距离、时长或目的地路线；交给行动地图绘制规划线、真实 GPS 轨迹与偏航重算',
  status: '已封装', kind: '组合', runtimeBadge: 'AMAP · GPS', background: '#e5f6e8',
};
const WGER_SKILL: AgentItem = {
  name: 'frost-wger-planner', label: 'WGER', zhLabel: '训练计划', publisherRole: '训练计划员',
  role: '读取训练、动作与进度；由 Frost 复核当天强度，确认后记录完成结果',
  status: '待连接', kind: '组合', runtimeBadge: 'OSS · SELF HOSTED', background: '#e9f5ff',
};
const MEALIE_SKILL: AgentItem = {
  name: 'frost-mealie-kitchen', label: 'MEALIE', zhLabel: '恢复厨房', publisherRole: '恢复厨房员',
  role: '从自己的食谱与餐食计划中选择训练日或恢复日的一餐',
  status: '待连接', kind: '组合', runtimeBadge: 'OSS · SELF HOSTED', background: '#fff1df',
};
const HEALTH_FOUNDATION_SKILL_ITEMS: AgentItem[] = [
  { name: 'frost-healthsync', label: 'HEALTHSYNC', zhLabel: '健康同步', publisherRole: '健康数据员', role: 'Apple Health 受控上传、去重、睡眠/步数/HRV/跑步指标只读查询', status: '等待连接器', kind: '组合', runtimeBadge: 'HEALTH API', background: '#eef5ff' },
  { name: 'frost-motion-vision', label: 'MEDIAPIPE MOTION', zhLabel: '动作信号', publisherRole: '动作信号员', role: '姿态关键点、视频节流、置信度与连续帧确认；已接入 Her Motion', status: '已封装', kind: '组合', runtimeBadge: 'VISION API', background: '#ecfff5' },
  { name: 'frost-openfoodfacts', label: 'OPEN FOOD FACTS', zhLabel: '包装食品', publisherRole: '包装食品员', role: '条码食品、品牌、每 100g 营养值与数据完整度', status: '已封装', kind: 'Markdown', runtimeBadge: 'PUBLIC DATA', background: '#fff0e6' },
  { name: 'frost-cn-health-library', label: 'CN HEALTH LIBRARY', zhLabel: '中国健康库', publisherRole: '中国食品员', role: '中国食品库、Apple Health 字段解析和证据绑定周报模板', status: '已封装', kind: 'Markdown', runtimeBadge: 'SERVER DATA', background: '#f7f1ff' },
  { name: 'frost-outdoor-window', label: 'OUTDOOR WINDOW', zhLabel: '户外窗口', publisherRole: '户外条件员', role: '实时天气、AQI、UV 与雷暴风险；选择跑步、散步或室内训练窗口', status: '已封装', kind: '组合', runtimeBadge: 'LIVE PUBLIC DATA', background: '#e8f7ff' },
  { name: 'frost-sleep-detective', label: 'SLEEP DETECTIVE', zhLabel: '睡眠侦探', publisherRole: '睡眠观察员', role: '比较睡眠与咖啡、饮酒、晚间训练标签；明确区分相关性与因果', status: '已封装', kind: 'Markdown', runtimeBadge: 'SERVER ANALYTICS', background: '#eef0ff' },
  { name: 'frost-meal-lens', label: 'MEAL LENS', zhLabel: '饮食镜头', publisherRole: '中国饮食镜头', role: '本地照片预览、菜名确认和中国食品营养范围；确认前不写入', status: '已封装', kind: '组合', runtimeBadge: 'CONFIRM FIRST', background: '#fff5cc' },
];
const HEALTH_SKILL_ITEMS = [RUN_ROUTE_SKILL, HER_MOTION_SKILL, LIANLEMA_SKILL, WGER_SKILL, MEALIE_SKILL, ...HEALTH_FOUNDATION_SKILL_ITEMS];
const REGISTERED_SKILL_COUNT = HEALTH_SKILL_ITEMS.length;

const MANIFEST_ID_BY_AGENT: Record<string, string> = {
  'frost-run-route': 'frost.run-route',
  'her-motion': 'pocket.her-motion',
  'lianlema-coach': 'pocket.lianlema',
  'frost-healthsync': 'frost.healthsync',
  'frost-motion-vision': 'frost.mediapipe-motion',
  'frost-openfoodfacts': 'frost.openfoodfacts',
  'frost-cn-health-library': 'frost.cn-health-library',
  'frost-outdoor-window': 'frost.outdoor-window',
  'frost-sleep-detective': 'frost.sleep-detective',
  'frost-meal-lens': 'frost.meal-lens',
  'frost-wger-planner': 'frost.wger-planner',
  'frost-mealie-kitchen': 'frost.mealie-kitchen',
};
type Running = SkillRunTarget | null;

interface MySkillsTabProps {
  embedded?: boolean;
  openTarget?: string | null;
  openTargetBackLabel?: string;
  onOpenTargetHandled?: () => void;
  onReturnFromExternalTarget?: () => void;
  onRunningChange?: (running: boolean) => void;
  onOpenCanvasSkill?: (skillId: string) => void;
}

export default function MySkillsTab({ embedded = false, openTarget, openTargetBackLabel, onOpenTargetHandled, onReturnFromExternalTarget, onRunningChange, onOpenCanvasSkill }: MySkillsTabProps) {
  const [running, setRunning] = useState<Running>(null);
  const [installProgress, setInstallProgress] = useState<Record<string, number>>({});
  const [installErrors, setInstallErrors] = useState<Record<string, string>>({});
  const [registryVersion, setRegistryVersion] = useState(0);
  const [returnToExternalTarget, setReturnToExternalTarget] = useState(false);
  const [externalBackLabel, setExternalBackLabel] = useState('返回 Plaza');
  const [herMotionReturnToFrost, setHerMotionReturnToFrost] = useState(false);
  const [lianlemaReturnToFrost, setLianlemaReturnToFrost] = useState(false);
  // P2-I：已学技能（点击=路由到其目标 agent）
  const [learned, setLearned] = useState<LearnedSkill[]>(getLearnedSkills());
  const [canvasSkills, setCanvasSkills] = useState<CanvasSkillRecord[]>(listCanvasSkills());
  const [canvasDeleteArmed, setCanvasDeleteArmed] = useState<string | null>(null);
  useEffect(() => subscribeSkills(() => setLearned([...getLearnedSkills()])), []);
  useEffect(() => subscribeCanvasSkills(() => setCanvasSkills(listCanvasSkills())), []);
  useEffect(() => {
    cancelAbandonedHerMotionSessions();
    ensureBuiltinSkills();
    return subscribeSkillsRegistry(() => setRegistryVersion((value) => value + 1));
  }, []);
  // 启动 FROST heartbeat：进入控制台即定期产「主动建议」（此前 startHeartbeat 全仓零调用，建议链路静默常关）。
  // 幂等（只起一个定时器），卸载时清理。
  useEffect(() => startHeartbeat(), []);
  useEffect(() => {
    onRunningChange?.(running !== null);
    return () => onRunningChange?.(false);
  }, [onRunningChange, running]);
  const runSkill = (target: string) => {
    const resolved = resolveSkillRunTarget(target);
    if (resolved) {
      if (resolved === 'hermotion') setHerMotionReturnToFrost(running === 'frost');
      if (resolved === 'lianlema') setLianlemaReturnToFrost(running === 'frost');
      setRunning(resolved);
    }
  };
  useEffect(() => {
    if (!openTarget) return;
    setReturnToExternalTarget(true);
    setExternalBackLabel(openTargetBackLabel ?? '返回 Plaza');
    runSkill(openTarget);
    onOpenTargetHandled?.();
    // The target is a one-shot navigation handoff from Plaza into the private Skills runtime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTarget]);
  const closeRunning = () => {
    if (running === 'hermotion' && herMotionReturnToFrost) {
      setHerMotionReturnToFrost(false);
      setRunning('frost');
      return;
    }
    if (running === 'lianlema' && lianlemaReturnToFrost) {
      setLianlemaReturnToFrost(false);
      setRunning('frost');
      return;
    }
    setRunning(null);
    if (!returnToExternalTarget) return;
    setReturnToExternalTarget(false);
    onReturnFromExternalTarget?.();
  };
  const catalogSkillGroups = useMemo(() => [{
    title: 'HEALTH & FITNESS SKILLS',
    sub: '运动训练 · 姿态纠正 · 恢复 · 健康数据 · 营养',
    items: HEALTH_SKILL_ITEMS,
  }], []);
  const equippedHealthCount = useMemo(() => HEALTH_SKILL_ITEMS.filter((item) => {
    const manifestId = MANIFEST_ID_BY_AGENT[item.name];
    return manifestId ? !!getEquippedSkill(manifestId) : false;
  }).length, [registryVersion]);
  const groups = catalogSkillGroups;
  const installSkillHere = async (manifestId: string) => {
    const manifest = BUILTIN_SKILLS.find((item) => item.identity.id === manifestId);
    if (!manifest) return;
    const key = `${manifest.identity.id}@${manifest.identity.version}`;
    const installed = getInstalledSkill(key);
    if (!installed || key in installProgress || installed.status === 'downloading' || installed.status === 'verifying') return;
    setInstallErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setInstallProgress((current) => ({ ...current, [key]: 0 }));
    try {
      await prepareAndEquipSkill(key, {
        onProgress: (value) => setInstallProgress((current) => ({
          ...current,
          [key]: value.total
            ? Math.min(100, Math.round(value.downloaded / value.total * 100))
            : value.phase === 'done' ? 100 : 0,
        })),
      });
    } catch (reason) {
      setInstallErrors((current) => ({
        ...current,
        [key]: reason instanceof Error ? reason.message : String(reason),
      }));
    } finally {
      setInstallProgress((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  };

  if (running === 'frost') return <Suspense fallback={<SkillPageLoader label="FROST" />}><FrostBuddyPage onBack={closeRunning} onRun={runSkill} /></Suspense>;
  if (running === 'hermotion') return <Suspense fallback={<SkillPageLoader label="HER MOTION" />}><HerMotionSkillPage launchUrl={HER_MOTION_LAUNCH_URL} onBack={closeRunning} backLabel={herMotionReturnToFrost ? '返回 Frost' : returnToExternalTarget ? externalBackLabel : '返回 Skills'} /></Suspense>;
  if (running === 'lianlema') return <Suspense fallback={<SkillPageLoader label="练了吗" />}><LianlemaSkillPage launchUrl={LIANLEMA_LAUNCH_URL} onBack={closeRunning} backLabel={lianlemaReturnToFrost ? '返回 Frost' : returnToExternalTarget ? externalBackLabel : '返回 Skills'} /></Suspense>;
  if (running === 'runroute') return <Suspense fallback={<SkillPageLoader label="RUN ROUTE" />}><RunRouteSkillPage onBack={closeRunning} /></Suspense>;
  const foundationSkillId = running === 'healthsync' ? 'frost.healthsync'
      : running === 'openfoodfacts' ? 'frost.openfoodfacts'
          : running === 'cnhealthlibrary' ? 'frost.cn-health-library'
              : running === 'outdoorwindow' ? 'frost.outdoor-window'
                : running === 'sleepdetective' ? 'frost.sleep-detective'
                  : running === 'meallens' ? 'frost.meal-lens'
                    : running === 'wgerplanner' ? 'frost.wger-planner'
                      : running === 'mealiekitchen' ? 'frost.mealie-kitchen' : null;
  if (foundationSkillId) return <Suspense fallback={<SkillPageLoader label="HEALTH FOUNDATION" />}><HealthFoundationSkillPage skillId={foundationSkillId} onBack={closeRunning} /></Suspense>;

  return (
    <div className="h-full flex flex-col bg-[#EAEAEA] font-sans">
      {/* 顶栏状态 */}
      {!embedded && <div className="flex justify-center items-center h-[30px] px-4 border-b-2 border-black bg-[#EAEAEA] shrink-0">
        <div className="font-pixel text-[9px] uppercase tracking-[0.14em] leading-none">POCKET EARTH · AGENT NETWORK</div>
      </div>}

      {/* 标题 */}
      {!embedded && <div className="px-4 py-4 border-b-2 border-black bg-white shrink-0">
        <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
          <h1 className="min-w-0 flex-1 font-pixel text-xl uppercase tracking-wider">SKILLS</h1>
          <span className="max-w-[46%] shrink-0 border-2 border-black bg-[#E8F8EF] px-2 py-1 text-center font-pixel text-[7px] leading-relaxed tracking-wider text-[#087C49]">{REGISTERED_SKILL_COUNT} / {REGISTERED_SKILL_COUNT} · REGISTERED</span>
        </div>
        <p className="text-xs text-black/70 tracking-wide font-medium">
          私人记忆由你的 Frost 整理 · Skills 随时装备与运行
        </p>
      </div>}

      {/* agent 分组列表（可滚动） */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Frost Agent 总编排入口：理解任务后路由到已登记 Skill。 */}
        <button
          onClick={() => setRunning('frost')}
          className="grid w-full grid-cols-[52px_1fr_auto] items-center gap-2.5 border-2 border-black bg-[#fff0b5] p-2.5 text-left transition-colors hover:bg-[#ffe08a] active:translate-y-px"
        >
          <div className="grid h-[52px] w-[52px] place-items-center overflow-hidden border-2 border-black bg-[#fffaf0]">
            <span className="relative h-[20px] w-[50px] overflow-hidden">
              <img src={POCKET_BUDDY_ASSET} alt="Agent 世界焦糖腊肠犬" className="absolute left-1/2 top-1/2 h-auto w-[56px] max-w-none -translate-x-1/2 -translate-y-1/2" draggable={false} />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-pixel text-[11px] tracking-wider text-black">FITNESS AGENT</div>
            <div className="mt-0.5 text-[10.5px] leading-snug text-black/60">理解今天的饮食、训练与恢复状态，调度已装备的健康 Skills。</div>
            <div className="mt-1 font-pixel text-[6px] text-[#326B55]">SERVER ORCHESTRATED · AUDITABLE RUN</div>
          </div>
          <span className="grid min-h-11 w-[76px] shrink-0 place-items-center border-2 border-black bg-[#ffd65a] px-1 text-center font-pixel text-[6px] leading-relaxed text-black shadow-[2px_2px_0_#000]">▶ RUN</span>
        </button>

        {canvasSkills.length > 0 && (
          <section>
            <div className="mb-2 flex items-end justify-between border-b-2 border-black pb-1.5">
              <span><h2 className="font-pixel text-[10px] tracking-widest">MADE BY YOU</h2><small className="mt-1 block text-[8px] font-bold text-black/45">从技能画布编译并同步到技能服务</small></span>
              <span className="border border-black bg-[#ffd34e] px-1.5 py-1 font-pixel text-[6px]">{canvasSkills.length}</span>
            </div>
            <div className="space-y-2">
              {canvasSkills.map((record) => {
                const armed = canvasDeleteArmed === record.graph.skill_id;
                const avatar = getSkillAvatar(record.graph.avatar_id || record.draft.avatar_id);
                return <article key={record.graph.skill_id} className="grid grid-cols-[1fr_auto] overflow-hidden border-2 border-black bg-[#fff9e8] shadow-[2px_2px_0_#000]">
                  <button type="button" onClick={() => onOpenCanvasSkill?.(record.graph.skill_id)} className="grid min-w-0 grid-cols-[46px_1fr_auto] items-center gap-2.5 p-2.5 text-left active:bg-[#00ff88]/10">
                    <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-full border-2 border-black" style={{ background: avatar?.accent || '#00ff88' }}>{avatar ? <img src={avatar.assetUrl} alt="" className="h-[94%] w-[94%] object-contain" /> : <WandSparkles className="h-5 w-5" />}</span>
                    <span className="min-w-0"><b className="block truncate text-[11px]">{record.graph.title}</b><small className="mt-1 block truncate text-[8px] text-black/45">{record.graph.nodes.length} 个积木 · {record.graph.permissions.length} 项权限 · {record.latest_run ? '已有 Evidence' : '待试跑'}</small><span className="mt-1.5 inline-block border border-black bg-white px-1.5 py-0.5 font-pixel text-[5px]">{avatar?.name || 'SKILL TASKMASTER'}</span></span>
                    <span className="border-2 border-black bg-white px-2 py-2 font-pixel text-[6px]">打开</span>
                  </button>
                  <button type="button" aria-label={armed ? `确认卸载 ${record.graph.title}` : `卸载 ${record.graph.title}`} onClick={() => { if (armed) { removeCanvasSkill(record.graph.skill_id); setCanvasDeleteArmed(null); } else setCanvasDeleteArmed(record.graph.skill_id); }} className={`grid min-w-10 place-items-center border-l-2 border-black px-1 text-[7px] font-bold ${armed ? 'bg-[#fff0ed] text-[#b3261e]' : 'bg-white text-black/35'}`}>{armed ? '确认' : <Trash2 className="h-4 w-4" />}</button>
                </article>;
              })}
            </div>
          </section>
        )}

        {groups.map((g) => (
          <div key={g.title}>
            <div className="mb-2 border-b-2 border-black pb-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-pixel text-[10px] tracking-widest">{g.title}</h2>
                <span className="shrink-0 border border-black bg-white px-1.5 py-0.5 font-pixel text-[6px]">{g.items.length}</span>
              </div>
              <span className="mt-1 block text-[8.5px] font-bold tracking-wide text-black/45">{g.sub}</span>
            </div>
            <div className="space-y-2">
              {g.items.map((a) => {
                const label = a.label ?? a.name;
                const target = resolveSkillRunTarget(a.name);
                const runnable = !!target || !!a.launchUrl;
                const publisher = a.publisher ?? skillPublisherForAgent(a.name);
                const manifestId = MANIFEST_ID_BY_AGENT[a.name];
                const manifest = manifestId ? BUILTIN_SKILLS.find((item) => item.identity.id === manifestId) : undefined;
                const skillKey = manifest ? `${manifest.identity.id}@${manifest.identity.version}` : '';
                const installed = skillKey ? getInstalledSkill(skillKey) : undefined;
                const equipped = manifestId ? !!getEquippedSkill(manifestId) : true;
                const loraPaused = LORA_BASE_VALIDATION_PAUSED && a.kind === 'LoRA';
                const needsLoad = !!manifest && !equipped && !loraPaused;
                const progress = skillKey ? installProgress[skillKey] : undefined;
                const preparing = progress !== undefined || installed?.status === 'downloading' || installed?.status === 'verifying';
                const installError = skillKey ? (installErrors[skillKey] || installed?.error || '') : '';
                const openSkill = () => {
                  if (a.launchUrl) runSkill(a.name);
                  else if (target) setRunning(target);
                };
                return (
                  <article key={a.name} className="overflow-hidden border-2 border-black" style={{ background: a.background ?? '#fff' }}>
                    <div className="grid min-h-[82px] grid-cols-[minmax(0,1fr)_82px] items-stretch">
                      <button
                        type="button"
                        onClick={needsLoad && manifestId ? () => void installSkillHere(manifestId) : runnable ? openSkill : undefined}
                        className={`grid min-w-0 grid-cols-[52px_minmax(0,1fr)] items-center gap-2.5 p-2.5 text-left transition-colors ${runnable || needsLoad ? 'hover:bg-[#00ff88]/10 active:translate-y-px' : 'cursor-default'}`}
                      >
                        <SkillCardAvatar skillName={a.name} publisher={publisher} />
                        <span className="min-w-0">
                          {a.zhLabel ? <>
                            <span className="block truncate text-[12px] font-black leading-[14px] tracking-wide">{a.zhLabel}</span>
                            <span className="mt-0.5 block truncate font-pixel text-[6.5px] tracking-wider text-black/55">{label}</span>
                          </> : <span className={`block truncate tracking-wide ${/[\u3400-\u9fff]/.test(label) ? 'text-[12px] font-bold leading-[14px]' : 'font-pixel text-[9px]'}`}>{label}</span>}
                          <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5">
                            <span className="min-w-0 flex-1 truncate text-[8.5px] font-bold text-[#18784b]">{getBuiltinSkillAvatar(a.name)?.name ?? publisher.name} · {publisher.name} 发布</span>
                            {a.kind && <span className={`shrink-0 border border-black px-1 py-0.5 font-pixel text-[5px] ${a.kind === 'Markdown' ? 'bg-[#eef3df] text-[#326B55]' : a.kind === 'LoRA' ? loraPaused ? 'bg-[#d1d1d1] text-black/45' : 'bg-[#b388ff] text-black' : 'bg-black text-[#b388ff]'}`}>{a.kind}</span>}
                            <span className="shrink-0 border border-[#087c49] bg-[#e8f8ef] px-1 py-0.5 font-pixel text-[5px] text-[#087c49]">SERVER</span>
                            {a.runtimeBadge && <span className="shrink-0 border border-[#665ec7] bg-white px-1 py-0.5 font-pixel text-[5px] text-[#5148b5]">{a.runtimeBadge}</span>}
                            {manifest && <span className={`shrink-0 border px-1 py-0.5 font-pixel text-[5px] ${loraPaused ? 'border-black/35 bg-[#eeeeee] text-black/45' : equipped ? 'border-[#087c49] bg-[#e8f8ef] text-[#087c49]' : preparing ? 'border-[#9a6411] bg-[#fff3cd] text-[#7a4a00]' : installError ? 'border-[#b3261e] bg-[#fff0ed] text-[#b3261e]' : 'border-[#9a6411] bg-[#fff3cd] text-[#7a4a00]'}`}>{loraPaused ? 'BASE 可用 · LoRA 待兼容' : equipped ? '已加载' : preparing ? '加载中' : installError ? '加载失败' : '待安装'}</span>}
                          </span>
                          <span className="mt-1 block line-clamp-2 text-[10px] leading-snug text-black/55">{a.role}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={preparing || (!runnable && !needsLoad)}
                        onClick={needsLoad && manifestId ? () => void installSkillHere(manifestId) : runnable ? openSkill : undefined}
                        className={`m-2 ml-0 grid min-h-11 self-center place-items-center border-2 border-black px-1 text-center font-pixel text-[6px] leading-relaxed disabled:cursor-wait disabled:opacity-60 ${needsLoad ? 'bg-[#00ff88] text-black' : loraPaused ? 'bg-transparent text-black/45' : runnable ? 'bg-transparent text-black hover:bg-black hover:text-[#7CFF6B]' : 'bg-transparent text-black/45'}`}
                      >
                        {needsLoad ? preparing ? `加载中${progress !== undefined ? ` ${progress}%` : ''}` : installError ? '重试加载' : '加载到 Skills' : loraPaused ? '运行 Base' : runnable ? '打开 Skill' : a.status}
                      </button>
                    </div>
                    {preparing && <div className="border-t-2 border-black bg-white px-2 py-1.5"><div className="h-2 overflow-hidden border border-black bg-[#f1ead6]"><div className="h-full bg-[#00ff88] transition-[width]" style={{ width: `${progress ?? 0}%` }} /></div></div>}
                    {!preparing && needsLoad && installError && <div className="border-t-2 border-[#b3261e] bg-[#fff0ed] px-2 py-1.5 text-[8px] leading-relaxed text-[#b3261e]">{installError}</div>}
                  </article>
                );
              })}
            </div>
          </div>
        ))}

        {/* P2-I · frost 学到的快捷技能（点击=路由到目标 agent） */}
        {learned.length > 0 && (
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="font-pixel text-[11px] tracking-widest">LEARNED</h2>
              <span className="text-[9px] text-black/45">frost 学到的快捷技能</span>
            </div>
            <div className="space-y-2">
              {learned.map((s) => (
                <button key={s.id} onClick={() => runSkill(s.target)}
                  className="w-full text-left flex items-center gap-3 bg-white border-2 border-black p-2.5 transition-colors hover:bg-[#7c8cff]/10 active:translate-y-px">
                  <div className="w-3 h-3 shrink-0 bg-black flex items-center justify-center border border-black" style={{ boxShadow: '1px 1px 0px #7c8cff' }}>
                    <div className="w-1.5 h-1.5" style={{ background: '#7c8cff' }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-pixel text-[9px] tracking-wide truncate">{s.name}</div>
                    <div className="text-[11px] text-black/60 leading-tight mt-0.5 truncate">{s.desc || s.target}</div>
                  </div>
                  <span className="shrink-0 font-pixel text-[6px] uppercase tracking-wider border border-black px-1.5 py-1 bg-black text-[#7CFF6B]">▶ RUN</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="text-center text-[8px] font-pixel text-black/30 py-2 tracking-widest">
          HEALTH {equippedHealthCount}/{REGISTERED_SKILL_COUNT} 已装备 · 服务端执行并保留可审计 Evidence
        </div>
      </div>
    </div>
  );
}
