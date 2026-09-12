// Skills tab —— Frost Agent 的能力控制台（Skill / harness / pipeline）
// 内容静态提炼自 frost-agent/ARCHITECTURE.md 与各 contract.md
import { lazy, Suspense, useState, useEffect, useMemo } from 'react';
import { Trash2, WandSparkles } from 'lucide-react';
import OnDeviceBrainPanel from './OnDeviceBrainPanel';
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
import { onDeviceCoverage } from '../lib/skill/onDeviceCoverage';
import { skillPublisherForAgent, type SkillPublisher } from '../data/skillPublishers';
import { PLAZA_WORLDS } from '../data/plazaWorlds';
import { CORE_SKILL_TARGETS } from '../data/coreSkills';
import { FOUNDATION_SKILL_BY_RUN, resolveSkillRunTarget, type SkillRunTarget } from '../lib/plaza/skillRoutes';
import { cancelAbandonedHerMotionSessions } from '../lib/health/herMotionSession';
import { listCanvasSkills, removeCanvasSkill, subscribeCanvasSkills, type CanvasSkillRecord } from '../../../frost-agent/skill-canvas';
import SkillAvatar from './SkillAvatar';
import { skillAvatarForPage } from '../lib/skill/avatars';
import { getFrostCompanion } from '../lib/frostCompanion';
import FitnessAgentEntry from './FitnessAgentEntry';
import { SPORTS, sportForTarget } from '../lib/sports/pose';

// Skill 运行页不属于控制台首屏；用户打开时再按需加载。
const FrostBuddyPage = lazy(() => import('./FrostBuddyPage'));
const DeviceEvidenceLedgerPage = lazy(() => import('./DeviceEvidenceLedgerPage'));
const HerMotionSkillPage = lazy(() => import('./HerMotionSkillPage'));
const LianlemaSkillPage = lazy(() => import('./LianlemaSkillPage'));
const SportsCoachSkillPage = lazy(() => import('./SportsCoachSkillPage'));
const HospitalAgentPage = lazy(() => import('./HospitalAgentPage'));
const HealthFoundationSkillPage = lazy(() => import('./HealthFoundationSkillPage'));
const RunRouteSkillPage = lazy(() => import('./RunRouteSkillPage'));
const BirdSkillPage = lazy(() => import('./BirdSkillPage'));
const LORA_BASE_VALIDATION_PAUSED = true;

function SkillPageLoader({ label }: { label: string }) {
  return <div className="grid h-full place-items-center bg-[#eaeaea] font-pixel text-[8px]">Loading {label}…</div>;
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
  kind?: 'Markdown' | 'LoRA' | 'Hybrid' | 'Bundle';
  background?: string;
}

const HER_MOTION_WORLD = PLAZA_WORLDS.find((world) => world.id === 'w_hermotion')!;
const HER_MOTION_LAUNCH_URL = HER_MOTION_WORLD.launchUrl!;
const HER_MOTION_SKILL: AgentItem = {
  name: 'her-motion',
  label: HER_MOTION_WORLD.english,
  zhLabel: 'Women’s Movement',
  launchUrl: HER_MOTION_WORLD.launchUrl,
  publisher: HER_MOTION_WORLD.publisher,
  runtimeBadge: 'LOCAL VISION',
  role: `${HER_MOTION_WORLD.climate}; ${HER_MOTION_WORLD.temperament}`,
  status: 'Loaded',
  kind: 'Bundle',
  background: HER_MOTION_WORLD.paper,
};
const LIANLEMA_LAUNCH_URL = import.meta.env.VITE_LIANLEMA_URL || (import.meta.env.DEV
  ? 'http://localhost:8082/' : 'https://pocketbuddy.throughtheglass.art/lianlema/');
const LIANLEMA_SKILL: AgentItem = {
  name: 'lianlema-coach',
  label: 'LIANLEMA',
  launchUrl: LIANLEMA_LAUNCH_URL,
  publisherRole: 'AI movement coach',
  runtimeBadge: 'RTMO · ST-GCN',
  role: 'Real-time posture correction and rep counting; once you consent, compressed frames go to the Pocket Buddy model service and are not stored',
  status: 'Loaded',
  kind: 'Bundle',
  background: '#e8f8ef',
};
const RUN_ROUTE_SKILL: AgentItem = {
  name: 'frost-run-route', label: 'RUN ROUTE', zhLabel: 'Run Route Planning', publisherRole: 'Run route planner',
  role: 'AMap builds a route from a distance, duration or destination; the route map draws the planned line, the real GPS track and off-route recalculation',
  status: 'Packaged', kind: 'Bundle', runtimeBadge: 'AMAP · GPS', background: '#e5f6e8',
};
const WGER_SKILL: AgentItem = {
  name: 'frost-wger-planner', label: 'WGER', zhLabel: 'Training Plans', publisherRole: 'Training planner',
  role: 'Reads workouts, exercises and progress; Frost re-checks the intensity for the day and records the completion once you confirm',
  status: 'Not connected', kind: 'Bundle', runtimeBadge: 'OSS · SELF HOSTED', background: '#e9f5ff',
};
const MEALIE_SKILL: AgentItem = {
  name: 'frost-mealie-kitchen', label: 'MEALIE', zhLabel: 'Recovery Kitchen', publisherRole: 'Recovery kitchen',
  role: 'Picks a training-day or recovery-day meal from your own recipes and meal plans',
  status: 'Not connected', kind: 'Bundle', runtimeBadge: 'OSS · SELF HOSTED', background: '#fff1df',
};
const HEALTH_FOUNDATION_SKILL_ITEMS: AgentItem[] = [
  { name: 'frost-healthsync', label: 'HEALTHSYNC', zhLabel: 'Health Sync', publisherRole: 'Health data', role: 'Apple Health local import, deduplication and read-only queries for sleep, steps, HRV and running metrics', status: 'Awaiting connector', kind: 'Bundle', runtimeBadge: 'LOCAL BRIDGE', background: '#eef5ff' },
  { name: 'frost-motion-vision', label: 'MEDIAPIPE MOTION', zhLabel: 'Motion Signals', publisherRole: 'Motion signals', role: 'Pose keypoints, video throttling, confidence and multi-frame confirmation; already wired into Her Motion', status: 'Packaged', kind: 'Bundle', runtimeBadge: 'LOCAL VISION', background: '#ecfff5' },
  { name: 'frost-openfoodfacts', label: 'OPEN FOOD FACTS', zhLabel: 'Packaged Food', publisherRole: 'Packaged food', role: 'Barcode foods, brands, per-100 g nutrition values and data completeness', status: 'Packaged', kind: 'Markdown', runtimeBadge: 'PUBLIC DATA', background: '#fff0e6' },
  { name: 'frost-cn-health-library', label: 'CN HEALTH LIBRARY', zhLabel: 'CN Health Library', publisherRole: 'Chinese food', role: 'Chinese food library, Apple Health field parsing and an evidence-bound weekly report template', status: 'Packaged', kind: 'Markdown', runtimeBadge: 'LOCAL DATA', background: '#f7f1ff' },
  { name: 'frost-outdoor-window', label: 'OUTDOOR WINDOW', zhLabel: 'Outdoor Window', publisherRole: 'Outdoor conditions', role: 'Live weather, AQI, UV and thunderstorm risk; picks a window for running, walking or indoor training', status: 'Packaged', kind: 'Bundle', runtimeBadge: 'LIVE PUBLIC DATA', background: '#e8f7ff' },
  { name: 'frost-sleep-detective', label: 'SLEEP DETECTIVE', zhLabel: 'Sleep Detective', publisherRole: 'Sleep observer', role: 'Compares sleep against coffee, alcohol and evening training tags; clearly separates correlation from causation', status: 'Packaged', kind: 'Markdown', runtimeBadge: 'LOCAL TRENDS', background: '#eef0ff' },
  { name: 'frost-meal-lens', label: 'MEAL LENS', zhLabel: 'Meal Lens', publisherRole: 'Chinese meal lens', role: 'Local photo preview, dish name confirmation and Chinese food nutrition ranges; nothing is written before you confirm', status: 'Packaged', kind: 'Bundle', runtimeBadge: 'CONFIRM FIRST', background: '#fff5cc' },
];
const BIRD_SKILL: AgentItem = {
  name: 'frost-bird-listener', label: 'BIRD LISTENER', zhLabel: 'Bird ID', publisherRole: 'Nature listener',
  role: 'The physical key wakes it and a touchscreen long-press records the call; reuses the T5 self-hosted service, and the twelve bird images reach the round screen from OSS on demand',
  status: 'On-device bring-up', kind: 'Bundle', runtimeBadge: 'BLE · NATIVE · OSS', background: '#ffe3ce',
};
const SPORTS_SKILL_ITEMS: AgentItem[] = SPORTS.map(sport => ({
  name: sport.target, label: sport.englishName.toUpperCase(), zhLabel: sport.skillName,
  publisher: { name: sport.mascot, role: 'Pose coaching', avatar: sport.avatar },
  publisherRole: 'Pose coaching', runtimeBadge: 'POSE · RULES',
  role: `${sport.actions.map(action => action.name).join(' / ')} · Live pose tracking and rule-based feedback`,
  status: 'Packaged', kind: 'Bundle', background: sport.accent,
}));
const HEALTH_SKILL_ITEMS = [RUN_ROUTE_SKILL, HER_MOTION_SKILL, LIANLEMA_SKILL, WGER_SKILL, MEALIE_SKILL, ...HEALTH_FOUNDATION_SKILL_ITEMS];
const CATALOG_SKILL_ITEMS = [BIRD_SKILL, ...HEALTH_SKILL_ITEMS, ...SPORTS_SKILL_ITEMS];
const REGISTERED_SKILL_COUNT = CATALOG_SKILL_ITEMS.length;
const CORE_SKILL_ITEMS = CORE_SKILL_TARGETS.flatMap((target) => CATALOG_SKILL_ITEMS.filter((item) => item.name === target));
const MORE_SKILL_ITEMS = CATALOG_SKILL_ITEMS.filter((item) => !CORE_SKILL_TARGETS.includes(item.name) && !sportForTarget(item.name));

const MANIFEST_ID_BY_AGENT: Record<string, string> = {
  'frost-bird-listener': 'frost.bird-listener',
  'frost-run-route': 'frost.run-route',
  'her-motion': 'pocket.her-motion',
  'lianlema-coach': 'pocket.lianlema',
  ...Object.fromEntries(SPORTS.map(sport => [sport.target, sport.skillId])),
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

interface MusicAgentsTabProps {
  embedded?: boolean;
  openTarget?: string | null;
  openTargetBackLabel?: string;
  onOpenTargetHandled?: () => void;
  onReturnFromExternalTarget?: () => void;
  onRunningChange?: (running: boolean) => void;
  onOpenCanvasSkill?: (skillId: string) => void;
}

export default function MusicAgentsTab({ embedded = false, openTarget, openTargetBackLabel, onOpenTargetHandled, onReturnFromExternalTarget, onRunningChange, onOpenCanvasSkill }: MusicAgentsTabProps) {
  const [running, setRunning] = useState<Running>(null);
  const [runningEntry, setRunningEntry] = useState('frost');
  useEffect(() => {
    let active = true;
    void getFrostCompanion().then(companion => { if (active) companion.setActiveSkill(skillAvatarForPage(running, runningEntry).id); })
      .catch(error => console.warn('[SkillAvatar] companion unavailable', error));
    return () => { active = false; };
  }, [running, runningEntry]);
  const [routeError, setRouteError] = useState('');
  const [installProgress, setInstallProgress] = useState<Record<string, number>>({});
  const [installErrors, setInstallErrors] = useState<Record<string, string>>({});
  const [registryVersion, setRegistryVersion] = useState(0);
  const [returnToExternalTarget, setReturnToExternalTarget] = useState(false);
  const [externalBackLabel, setExternalBackLabel] = useState('Back to Plaza');
  const [herMotionReturnToFrost, setHerMotionReturnToFrost] = useState(false);
  const [sportsReturnToFrost, setSportsReturnToFrost] = useState(false);
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
    onRunningChange?.(running !== null || !!routeError);
    return () => onRunningChange?.(false);
  }, [onRunningChange, running, routeError]);
  const runSkill = (target: string) => {
    const resolved = resolveSkillRunTarget(target);
    if (!resolved) {
      setRouteError(`This Skill has no page entry yet: ${target}. Nothing was opened and no task was run.`);
      return;
    }
    setRouteError('');
    if (resolved) {
      setRunningEntry(target);
      if (resolved === 'hermotion') setHerMotionReturnToFrost(running === 'frost');
      if (resolved === 'sportscoach') setSportsReturnToFrost(running === 'frost');
      if (resolved === 'lianlema') setLianlemaReturnToFrost(running === 'frost');
      setRunning(resolved);
    }
  };
  useEffect(() => {
    if (!openTarget) return;
    setReturnToExternalTarget(true);
    setExternalBackLabel(openTargetBackLabel ?? 'Back to Plaza');
    runSkill(openTarget);
    onOpenTargetHandled?.();
    // The target is a one-shot navigation handoff from Plaza into the private Skills runtime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTarget]);
  const closeRunning = () => {
    if (running === 'sportscoach' && sportsReturnToFrost) {
      setSportsReturnToFrost(false); setRunning('frost'); return;
    }
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
  const equippedSkillCount = useMemo(() => CATALOG_SKILL_ITEMS.filter((item) => {
    const manifestId = MANIFEST_ID_BY_AGENT[item.name];
    return manifestId ? !!getEquippedSkill(manifestId) : false;
  }).length, [registryVersion]);
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

  const renderSkillCards = (items: AgentItem[], core = false) => (
    <div className="space-y-2">
      {items.map((a) => {
        const label = a.label ?? a.name;
        const target = resolveSkillRunTarget(a.name);
        const runnable = !!target || !!a.launchUrl;
        const publisher = a.publisher ?? skillPublisherForAgent(a.name);
        const manifestId = MANIFEST_ID_BY_AGENT[a.name];
        const manifest = manifestId ? BUILTIN_SKILLS.find((item) => item.identity.id === manifestId) : undefined;
        const edgeCoverage = manifestId ? onDeviceCoverage(manifestId) : undefined;
        const skillKey = manifest ? `${manifest.identity.id}@${manifest.identity.version}` : '';
        const installed = skillKey ? getInstalledSkill(skillKey) : undefined;
        const equipped = manifestId ? !!getEquippedSkill(manifestId) : true;
        const loraPaused = LORA_BASE_VALIDATION_PAUSED && a.kind === 'LoRA';
        const needsLoad = !!manifest && !equipped && !loraPaused;
        const progress = skillKey ? installProgress[skillKey] : undefined;
        const preparing = progress !== undefined || installed?.status === 'downloading' || installed?.status === 'verifying';
        const installError = skillKey ? (installErrors[skillKey] || installed?.error || '') : '';
        const openSkill = () => {
          if (a.launchUrl || target) runSkill(a.name);
        };
        return (
          <article key={a.name} data-skill-id={manifestId || a.name} className="overflow-hidden border-2 border-black" style={{ background: a.background ?? '#fff' }}>
            <div className="grid min-h-[82px] grid-cols-[minmax(0,1fr)_82px] items-stretch">
              <button
                type="button"
                onClick={needsLoad && manifestId ? () => void installSkillHere(manifestId) : runnable ? openSkill : undefined}
                className={`grid min-w-0 grid-cols-[52px_minmax(0,1fr)] items-center gap-2.5 p-2.5 text-left transition-colors ${runnable || needsLoad ? 'hover:bg-[#00ff88]/10 active:translate-y-px' : 'cursor-default'}`}
              >
                <SkillAvatar skillId={manifestId || a.name} className="border-2 border-black" />
                <span className="min-w-0">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={`min-w-0 truncate tracking-wide ${a.zhLabel || /[\u3400-\u9fff]/.test(label) ? 'text-[12px] font-black leading-[14px]' : 'font-pixel text-[9px]'}`}>{a.zhLabel || label}</span>
                    {core && <span className="shrink-0 rounded-full bg-[#00ff88] px-1.5 py-0.5 text-[7px] font-black leading-none text-black">CORE</span>}
                  </span>
                  {a.zhLabel && <span className="mt-0.5 block truncate font-pixel text-[6.5px] tracking-wider text-black/55">{label}</span>}
                  <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className={`min-w-0 truncate text-[8.5px] font-bold text-[#18784b] ${sportForTarget(a.name) ? 'basis-full' : 'flex-1'}`}>{publisher.name} · {a.publisherRole ?? publisher.role}</span>
                    {a.kind && <span className={`shrink-0 border border-black px-1 py-0.5 font-pixel text-[5px] ${a.kind === 'Markdown' ? 'bg-[#eef3df] text-[#326B55]' : a.kind === 'LoRA' ? loraPaused ? 'bg-[#d1d1d1] text-black/45' : 'bg-[#b388ff] text-black' : 'bg-black text-[#b388ff]'}`}>{a.kind}</span>}
                    {edgeCoverage && a.name !== 'lianlema-coach' && !sportForTarget(a.name) && <span title={edgeCoverage.proof} className="shrink-0 border border-[#087c49] bg-[#e8f8ef] px-1 py-0.5 font-pixel text-[5px] text-[#087c49]">{edgeCoverage.semanticRuntime === 'qwen3-4b-health-mnn' ? 'QWEN4B·MNN' : 'LOCAL RULES'}</span>}
                    {a.runtimeBadge && <span className="shrink-0 border border-[#665ec7] bg-white px-1 py-0.5 font-pixel text-[5px] text-[#5148b5]">{a.runtimeBadge}</span>}
                    {manifest && <span className={`shrink-0 border px-1 py-0.5 font-pixel text-[5px] ${loraPaused ? 'border-black/35 bg-[#eeeeee] text-black/45' : equipped ? 'border-[#087c49] bg-[#e8f8ef] text-[#087c49]' : preparing ? 'border-[#9a6411] bg-[#fff3cd] text-[#7a4a00]' : installError ? 'border-[#b3261e] bg-[#fff0ed] text-[#b3261e]' : 'border-[#9a6411] bg-[#fff3cd] text-[#7a4a00]'}`}>{loraPaused ? 'BASE OK · LoRA PENDING' : equipped ? 'LOADED' : preparing ? 'LOADING' : installError ? 'FAILED' : 'NOT INSTALLED'}</span>}
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
                {needsLoad ? preparing ? `Loading${progress !== undefined ? ` ${progress}%` : ''}` : installError ? 'Retry load' : 'Load into Skills' : loraPaused ? 'Run Base' : runnable ? 'Open Skill' : a.status}
              </button>
            </div>
            {preparing && <div className="border-t-2 border-black bg-white px-2 py-1.5"><div className="h-2 overflow-hidden border border-black bg-[#f1ead6]"><div className="h-full bg-[#00ff88] transition-[width]" style={{ width: `${progress ?? 0}%` }} /></div></div>}
            {!preparing && needsLoad && installError && <div className="border-t-2 border-[#b3261e] bg-[#fff0ed] px-2 py-1.5 text-[8px] leading-relaxed text-[#b3261e]">{installError}</div>}
          </article>
        );
      })}
    </div>
  );

  if (routeError) return <div className="flex h-full flex-col gap-4 bg-[#fff5cc] p-4"><h1 className="text-lg font-bold">Cannot open this Skill</h1><p role="alert">{routeError}</p><button type="button" className="border-2 border-black bg-white p-3" onClick={() => { setRouteError(''); setRunning('frost'); }}>Back to Frost</button></div>;
  if (running === 'frost') return <Suspense fallback={<SkillPageLoader label="FROST" />}><FrostBuddyPage onBack={closeRunning} onRun={runSkill} /></Suspense>;
  if (running === 'hermotion') return <Suspense fallback={<SkillPageLoader label="HER MOTION" />}><HerMotionSkillPage launchUrl={HER_MOTION_LAUNCH_URL} onBack={closeRunning} avatarSkillId={skillAvatarForPage(running, runningEntry).id} backLabel={herMotionReturnToFrost ? 'Back to Frost' : returnToExternalTarget ? externalBackLabel : 'Back to Skills'} /></Suspense>;
  if (running === 'lianlema') return <Suspense fallback={<SkillPageLoader label="LIANLEMA" />}><LianlemaSkillPage launchUrl={LIANLEMA_LAUNCH_URL} onBack={closeRunning} backLabel={lianlemaReturnToFrost ? 'Back to Frost' : returnToExternalTarget ? externalBackLabel : 'Back to Skills'} /></Suspense>;
  if (running === 'sportscoach' && sportForTarget(runningEntry)) return <Suspense fallback={<SkillPageLoader label="SPORTS COACH" />}><SportsCoachSkillPage key={runningEntry} sport={sportForTarget(runningEntry)!} onBack={closeRunning} backLabel={sportsReturnToFrost ? 'Back to Frost' : returnToExternalTarget ? externalBackLabel : 'Back to Skills'} /></Suspense>;
  if (running === 'hospital') return <Suspense fallback={<SkillPageLoader label="HEALTH CONSULTATION" />}><HospitalAgentPage onBack={closeRunning} backLabel={returnToExternalTarget ? externalBackLabel : 'Back to Agents'} /></Suspense>;
  if (running === 'runroute') return <Suspense fallback={<SkillPageLoader label="RUN ROUTE" />}><RunRouteSkillPage onBack={closeRunning} /></Suspense>;
  if (running === 'birdlistener') return <Suspense fallback={<SkillPageLoader label="BIRD ID" />}><BirdSkillPage onBack={closeRunning} /></Suspense>;
  if (running === 'deviceevidence') return <Suspense fallback={<SkillPageLoader label="DEVICE EVIDENCE LEDGER" />}><DeviceEvidenceLedgerPage onBack={closeRunning} /></Suspense>;
  const foundationSkillId = running ? FOUNDATION_SKILL_BY_RUN[running] : null;
  if (foundationSkillId) return <Suspense fallback={<SkillPageLoader label="HEALTH FOUNDATION" />}><HealthFoundationSkillPage skillId={foundationSkillId} onBack={closeRunning} /></Suspense>;

  return (
    <div className="h-full flex flex-col bg-[#EAEAEA] font-sans">
      {/* 顶栏状态 */}
      {!embedded && <div className="flex justify-center items-center h-[30px] px-4 border-b-2 border-black bg-[#EAEAEA] shrink-0">
        <div className="font-pixel text-[9px] uppercase tracking-[0.14em] leading-none">POCKET BUDDY · TASKMASTER + LOCAL</div>
      </div>}

      {/* 标题 */}
      {!embedded && <div className="px-4 py-4 border-b-2 border-black bg-white shrink-0">
        <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
          <h1 className="min-w-0 flex-1 font-pixel text-xl uppercase tracking-wider">SKILLS</h1>
          <span className="max-w-[46%] shrink-0 border-2 border-black bg-[#E8F8EF] px-2 py-1 text-center font-pixel text-[7px] leading-relaxed tracking-wider text-[#087C49]">{CORE_SKILL_ITEMS.length} CORE</span>
        </div>
        <p className="text-xs text-black/70 tracking-wide font-medium">
          Running, bird ID, women’s movement and movement training · more below
        </p>
      </div>}

      {!embedded && <div className="shrink-0 border-b-2 border-black p-3"><FitnessAgentEntry onOpen={() => runSkill('frost')} /></div>}

      {/* agent 分组列表（可滚动） */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        <section aria-label="Core abilities">
          <div className="mb-2 flex items-center justify-between gap-2 border-b-2 border-black pb-2">
            <div><h2 className="text-[15px] font-black tracking-wide">Core abilities</h2><p className="mt-1 text-[9px] text-black/55">Run routes · Bird ID · Women’s movement · AI movement training</p></div>
            <span className="shrink-0 bg-[#00ff88] px-2 py-1 font-pixel text-[7px]">{CORE_SKILL_ITEMS.length} CORE</span>
          </div>
          {renderSkillCards(CORE_SKILL_ITEMS, true)}
        </section>

        <section aria-label="Sports coaching skills" className="space-y-3 border-t-2 border-black/20 pt-4">
          <div className="flex items-end justify-between"><div><h2 className="text-[13px] font-black">Sports Coaching</h2><p className="mt-1 text-[10px] text-black/55">5 sports · 23 actions · Live pose feedback</p></div><span className="border border-black bg-[#7cff6b] px-2 py-1 text-[9px] font-bold">SPORTS</span></div>
          {renderSkillCards(SPORTS_SKILL_ITEMS)}
        </section>

        <section aria-label="More abilities" className="space-y-4 border-t-2 border-black/20 pt-4">
          <div><h2 className="text-[13px] font-black tracking-wide text-black/65">More abilities</h2><p className="mt-1 text-[9px] text-black/45">Extra Skills · Agent tools · your own on-device abilities</p></div>
          {/* 运行工具保留真实 Android MNN / SME2 控制与可导出证据。 */}
          <OnDeviceBrainPanel onOpenLedger={() => setRunning('deviceevidence')} />

          {canvasSkills.length > 0 && (
            <section>
              <div className="mb-2 flex items-end justify-between border-b-2 border-black pb-1.5">
                <span><h2 className="font-pixel text-[10px] tracking-widest">MADE BY YOU</h2><small className="mt-1 block text-[8px] font-bold text-black/45">Compiled from Skill Canvas and kept on this device</small></span>
                <span className="border border-black bg-[#ffd34e] px-1.5 py-1 font-pixel text-[6px]">{canvasSkills.length}</span>
              </div>
              <div className="space-y-2">
                {canvasSkills.map((record) => {
                  const armed = canvasDeleteArmed === record.graph.skill_id;
                  return <article key={record.graph.skill_id} className="grid grid-cols-[1fr_auto] overflow-hidden border-2 border-black bg-[#fff9e8] shadow-[2px_2px_0_#000]">
                    <button type="button" onClick={() => onOpenCanvasSkill?.(record.graph.skill_id)} className="grid min-w-0 grid-cols-[46px_1fr_auto] items-center gap-2.5 p-2.5 text-left active:bg-[#00ff88]/10">
                      <span className="grid h-11 w-11 place-items-center rounded-full border-2 border-black bg-[#00ff88]"><WandSparkles className="h-5 w-5" /></span>
                      <span className="min-w-0"><b className="block truncate text-[11px]">{record.graph.title}</b><small className="mt-1 block truncate text-[8px] text-black/45">{record.graph.nodes.length} blocks · {record.graph.permissions.length} permissions · {record.latest_run?.mode === 'execute' ? (record.latest_run.status === 'completed' ? 'Run completed' : 'Run stopped · see details') : record.latest_run ? 'Preview only' : 'Not run yet'}</small><span className="mt-1.5 inline-block border border-black bg-white px-1.5 py-0.5 font-pixel text-[5px]">SKILL TASKMASTER</span></span>
                      <span className="border-2 border-black bg-white px-2 py-2 font-pixel text-[6px]">Open</span>
                    </button>
                    <button type="button" aria-label={armed ? `Confirm removing ${record.graph.title}` : `Remove ${record.graph.title}`} onClick={() => { if (armed) { removeCanvasSkill(record.graph.skill_id); setCanvasDeleteArmed(null); } else setCanvasDeleteArmed(record.graph.skill_id); }} className={`grid min-w-10 place-items-center border-l-2 border-black px-1 text-[7px] font-bold ${armed ? 'bg-[#fff0ed] text-[#b3261e]' : 'bg-white text-black/35'}`}>{armed ? 'Confirm' : <Trash2 className="h-4 w-4" />}</button>
                  </article>;
                })}
              </div>
            </section>
          )}

          {renderSkillCards(MORE_SKILL_ITEMS)}

          {/* P2-I · frost 学到的快捷技能（点击=路由到目标 agent） */}
          {learned.length > 0 && (
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="font-pixel text-[11px] tracking-widest">LEARNED</h2>
                <span className="text-[9px] text-black/45">Shortcuts frost has learned</span>
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

        </section>

        <div className="text-center text-[8px] font-pixel text-black/30 py-2 tracking-widest">
          SKILLS {equippedSkillCount}/{REGISTERED_SKILL_COUNT} EQUIPPED · Lianlema uses server analysis after you consent; the rest follow each Skill declaration
        </div>
      </div>
    </div>
  );
}
