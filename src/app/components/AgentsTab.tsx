import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Blocks, Check, ChevronLeft, ChevronRight, Cpu, Globe2, LoaderCircle, PackageCheck, PawPrint, Save, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import AgentPlazaPage from './AgentPlazaPage';
import SkillPublishingDeclaration from './SkillPublishingDeclaration';
import { BUILTIN_SKILLS, getEquippedSkill } from '../lib/skill';
import { skillPublisherForManifest } from '../data/skillPublishers';
import { PLAZA_NETWORK_LABEL, PLAZA_SKILL_IDS, PLAZA_WORLDS, type PlazaWorld } from '../data/plazaWorlds';
import { deletePlazaWorldDraft, readPlazaWorldDraft, writePlazaWorldDraft, type PlazaWorldDraft } from '../lib/plaza/worldDraft';
import { createWorldSuggestionPrompt, parseWorldSuggestion, suggestWorldLocally, type WorldSuggestionAgent, type WorldSuggestionSkill } from '../lib/plaza/worldSuggestion';
import { getAgentWorldPocketBuddyBlueprint } from '../lib/pocket-buddy';
import { getFrostBrain } from '../../../frost-agent/harness/brain';
import { resolveSkillRunTarget } from '../lib/plaza/skillRoutes';
import { listCanvasSkills, subscribeCanvasSkills } from '../../../frost-agent/skill-taskmaster';

const MySkillsTab = lazy(() => import('./MySkillsTab'));
const PocketBuddyForge = lazy(() => import('./PocketBuddyForge'));
const SkillCanvasTab = lazy(() => import('./SkillCanvasTab'));
const VISIBLE_SKILL_COUNT = BUILTIN_SKILLS.filter((skill) => resolveSkillRunTarget(skill.entry.target)).length;

interface Props {
  initialMode?: 'worlds' | 'skills' | 'myagent' | 'canvas';
  externalSkillTarget?: string | null;
  externalSkillBackLabel?: string;
  onExternalSkillTargetHandled?: () => void;
  onReturnFromExternalSkill?: () => void;
}

type WorldDraft = PlazaWorldDraft;

const WORLD_TONES = [
  { id: 'night', name: '恢复蓝', english: 'RECOVERY SIGNAL', paper: '#e8f0f2', accent: '#4f83a5', copy: '适合睡眠、HRV 与训练恢复。' },
  { id: 'paper', name: '营养米', english: 'NUTRITION NOTES', paper: '#f5ead8', accent: '#b77937', copy: '适合食品、营养与健康资料。' },
  { id: 'field', name: '训练绿', english: 'TRAINING FIELD', paper: '#edf2df', accent: '#5f8b68', copy: '适合跑步、力量与姿态训练。' },
] as const;

const WORLD_AGENT_IDS = ['pet-caramel-dachshund', 'puff', 'pip', 'mossback'] as const;
const WORLD_AGENT_OPTIONS = WORLD_AGENT_IDS.flatMap((id) => {
  const blueprint = getAgentWorldPocketBuddyBlueprint(id);
  if (!blueprint) return [];
  return [{
    ...blueprint,
    assetUrl: id === 'pet-caramel-dachshund'
      ? '/assets/pocket-buddy/packages/holiday-christmas-dachshund/portrait-frost-no-hat-v2.png'
      : blueprint.assetUrl,
  }];
});

const DEFAULT_WORLD_DRAFT: WorldDraft = {
  name: '我的 Agent World',
  toneId: WORLD_TONES[0].id,
  agentId: WORLD_AGENT_IDS[0],
  publishedSkillId: PLAZA_SKILL_IDS[0],
};

function loadWorldDraft(): WorldDraft {
  return readPlazaWorldDraft(DEFAULT_WORLD_DRAFT, WORLD_TONES.map((tone) => tone.id), WORLD_AGENT_IDS, PLAZA_SKILL_IDS);
}

type NetworkMode = 'worlds' | 'skills' | 'myagent' | 'canvas';

function NetworkHeader({ active, canvasSkillCount, onChange }: { active: NetworkMode; canvasSkillCount: number; onChange: (value: NetworkMode) => void }) {
  const title = active === 'skills' ? '我的技能' : active === 'canvas' ? '技能画布' : active === 'myagent' ? '我的智能体' : '智能体世界';
  const subtitle = active === 'skills'
    ? '已由技能服务登记的 Skills · 随时装配与运行'
    : active === 'canvas'
      ? '定义目标、组合能力模块，再由 Skill Taskmaster 编译为真正的任务'
    : active === 'myagent'
      ? '从照片建立口袋伙伴 · 形象、人格与记忆只在确认后保存'
      : '健康 Skill 广场 · 浏览运动、恢复与营养能力';
  return (
    <>
      <div className="flex h-[30px] shrink-0 items-center justify-center border-b-2 border-black bg-[#EAEAEA] px-4">
        <div className="font-pixel text-[9px] uppercase leading-none tracking-[0.14em]">POCKET EARTH · AGENT NETWORK</div>
      </div>
      <div className="shrink-0 border-b-2 border-black bg-white px-4 py-3.5">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="font-pixel text-xl tracking-wider">{title}</h1>
            <p className="mt-1.5 truncate text-[11px] font-medium tracking-wide text-black/65">{subtitle}</p>
          </div>
          {active === 'worlds' && <span className="grid h-11 w-11 shrink-0 place-items-center border-2 border-black bg-[#00ff88]"><Globe2 className="h-6 w-6" strokeWidth={2.5} /></span>}
          {active === 'myagent' && <span className="grid h-11 w-11 shrink-0 place-items-center border-2 border-black bg-[#ffd34e]"><PawPrint className="h-6 w-6" strokeWidth={2.5} /></span>}
          {active === 'canvas' && <span className="grid h-11 w-11 shrink-0 rotate-3 place-items-center border-2 border-black bg-[#ffd34e] shadow-[2px_2px_0_#000]"><Blocks className="h-6 w-6" strokeWidth={2.5} /></span>}
          {active === 'skills' && <span className="shrink-0 border-2 border-black bg-[#E8F8EF] px-2 py-1.5 font-pixel text-[7px] tracking-wider text-[#087C49]">{VISIBLE_SKILL_COUNT} CORE{canvasSkillCount > 0 ? ` + ${canvasSkillCount} MINE` : ''}</span>}
        </div>
      </div>
      <div className="shrink-0 border-b-2 border-black bg-black px-3 py-2">
        <div className="grid grid-cols-3 gap-1.5">
          <button type="button" aria-pressed={active === 'skills'} onClick={() => onChange('skills')} className={`whitespace-nowrap border px-2 py-1.5 font-pixel text-[7px] ${active === 'skills' ? 'border-[#00ff88] bg-[#00ff88] text-black' : 'border-white/50 text-white/70'}`}>我的技能</button>
          <button type="button" aria-pressed={active === 'canvas'} onClick={() => onChange('canvas')} className={`whitespace-nowrap border px-2 py-1.5 font-pixel text-[7px] ${active === 'canvas' ? 'border-[#ffd34e] bg-[#ffd34e] text-black' : 'border-white/50 text-white/70'}`}>技能画布</button>
          <button type="button" aria-pressed={active === 'worlds'} onClick={() => onChange('worlds')} className={`whitespace-nowrap border px-2 py-1.5 font-pixel text-[7px] ${active === 'worlds' ? 'border-[#00ff88] bg-[#00ff88] text-black' : 'border-white/50 text-white/70'}`}>智能体世界</button>
        </div>
      </div>
    </>
  );
}

function PublisherStack({ skillIds }: { skillIds: string[] }) {
  return (
    <div className="flex -space-x-2">
      {skillIds.slice(0, 3).map((id) => {
        const publisher = skillPublisherForManifest(id);
        return <span key={id} className="h-7 w-7 overflow-hidden rounded-full border-2 border-black bg-[#f5efdf]"><img src={publisher.avatar} alt={publisher.name} className="h-full w-full object-contain" /></span>;
      })}
    </div>
  );
}

function WorldCard({ world, onOpen }: { world: PlazaWorld; onOpen: () => void }) {
  const equipped = world.skillIds.filter((id) => !!getEquippedSkill(id)).length;
  const leadPublisher = world.publisher ?? skillPublisherForManifest(world.skillIds[0]);
  return (
    <button type="button" aria-label={world.launchUrl ? `进入 ${world.name}` : `进入 ${world.name}，查看 ${world.skillIds.length} 个 Skill`} onClick={onOpen} className="w-full overflow-hidden border-2 border-black text-left active:translate-y-px" style={{ background: world.paper }}>
      {world.coreSkill && <span className="flex items-center justify-between gap-2 border-b-2 border-black bg-[#00ff88] px-2.5 py-2 text-black"><span className="flex items-center gap-1.5 font-pixel text-[8px]"><Sparkles className="h-3.5 w-3.5" strokeWidth={3} />核心 SKILL</span><span className="text-[8px] font-black tracking-wide">POCKET EARTH UI 原生融合</span></span>}
      <div className="grid min-h-[142px] grid-cols-[106px_1fr] border-b-2 border-black" style={{ backgroundImage: `radial-gradient(circle at 18% 18%, ${world.accent}22 0 2px, transparent 2.5px)`, backgroundSize: '15px 15px' }}>
        <span className="relative grid place-items-center border-r-2 border-black bg-white/45">
          <span className="absolute left-1.5 top-1.5 font-pixel text-[5px] text-black/45">PUBLISHER</span>
          <span className="grid h-[84px] w-[84px] place-items-center overflow-hidden rounded-full border-[3px] border-black bg-[#fffaf0]"><img src={leadPublisher.avatar} alt={`${leadPublisher.name}，${world.name}的 Skill 发布者`} className="h-[96%] w-[96%] object-contain" /></span>
        </span>
        <span className="flex min-w-0 flex-col p-2.5">
          <span className="flex items-center justify-between gap-2"><span className="border border-black bg-white px-1.5 py-1 font-pixel text-[5px]">{world.english}</span><span className="font-pixel text-[5px]" style={{ color: world.accent }}>{world.coordinate}</span></span>
          <span className="mt-2 block font-pixel text-[12px] leading-tight">{world.name}</span>
          <span className="mt-1 block text-[9px] font-bold" style={{ color: world.accent }}>{leadPublisher.name} · {leadPublisher.role}</span>
          <span className="mt-1.5 block text-[9px] leading-snug text-black/60">{world.temperament}</span>
          <span className="mt-auto flex items-end justify-between pt-2"><span className="text-[8px] text-black/45">{world.entryTarget ? 'Frost Skill · 原生会话入口' : world.coreSkill ? '核心 Skill · Pocket Buddy UI 融合入口' : world.launchUrl ? '独立应用 · 点击进入' : `${world.owner} 示例发布 · ${world.skillIds.length} 个 Skill`}</span><ChevronRight className="h-4 w-4" /></span>
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 bg-white/55 px-2.5 py-2">
        <span className="text-[8px] font-medium text-black/50">NPC · {world.residents[0]?.name}</span>
        {world.launchUrl
          ? <span className="border border-black bg-white px-2 py-1 font-pixel text-[5px]" style={{ color: world.accent }}>{world.coreSkill ? 'OPEN CORE SKILL' : 'OPEN EXPERIENCE'}</span>
          : <span className="flex items-center gap-2"><PublisherStack skillIds={world.skillIds} /><span className="font-pixel text-[5px] text-black/45">{equipped}/{world.skillIds.length} 私人库</span></span>}
      </div>
    </button>
  );
}

function WorldsHome({ onSelect, onOpenSkill, onOpenAll }: { onSelect: (world: PlazaWorld) => void; onOpenSkill: (target: string) => void; onOpenAll: () => void }) {
  return (
    <div className="flex-1 overflow-y-auto bg-[#EAEAEA] px-3 py-3">
      <div className="mb-3"><SkillPublishingDeclaration /></div>

      <div className="mb-2 flex items-end justify-between gap-2 border-t-2 border-black pt-3">
        <span><b className="block font-pixel text-[8px]">GLOBAL DEMO WORLDS</b><small className="mt-0.5 block text-[8px] text-black/45">全球角色样例 · 用来展示发现与协议校验流程</small></span>
        <span className="border border-black bg-[#f7f1df] px-1.5 py-1 font-pixel text-[5px]">非实时</span>
      </div>
      <div className="space-y-2.5">
        {PLAZA_WORLDS.map((world) => <WorldCard key={world.id} world={world} onOpen={() => { if (world.entryTarget) onOpenSkill(world.entryTarget); else if (world.launchUrl) window.location.assign(world.launchUrl); else onSelect(world); }} />)}
      </div>

      <button type="button" onClick={onOpenAll} className="mt-3 flex w-full items-center justify-center gap-2 border-2 border-black bg-[#00ff88] px-3 py-3 font-pixel text-[7px] active:translate-y-px"><Sparkles className="h-4 w-4" />查看全部发布 <ChevronRight className="h-4 w-4" /></button>
      <p className="py-3 text-center text-[8px] leading-relaxed text-black/35">示例世界来自作者自有 Agent World 项目 · Skill 最终只装入本机私人库</p>
    </div>
  );
}

function WorldDetail({ world, onBack, onOpenSkill, onOpenAll }: { world: PlazaWorld; onBack: () => void; onOpenSkill: (skillId: string) => void; onOpenAll: () => void }) {
  const manifests = useMemo(() => world.skillIds.map((id) => BUILTIN_SKILLS.find((item) => item.identity.id === id)).filter((item): item is NonNullable<typeof item> => !!item), [world]);
  const leadPublisher = skillPublisherForManifest(world.skillIds[0]);
  return (
    <div className="flex-1 overflow-y-auto bg-[#EAEAEA]">
      <div className="relative border-b-2 border-black" style={{ background: world.paper, backgroundImage: `radial-gradient(circle at 18% 18%, ${world.accent}25 0 2px, transparent 2.5px)`, backgroundSize: '16px 16px' }}>
        <button type="button" aria-label="返回 Agent World" onClick={onBack} className="absolute left-3 top-3 z-10 grid h-9 w-9 place-items-center border-2 border-black bg-white"><ChevronLeft className="h-4 w-4" strokeWidth={3} /></button>
        <div className="grid h-[178px] place-items-center pt-8"><span className="grid h-[112px] w-[112px] place-items-center overflow-hidden rounded-full border-[3px] border-black bg-[#fffaf0]"><img src={leadPublisher.avatar} alt={`${leadPublisher.name}的发布者头像`} className="h-[97%] w-[97%] object-contain" /></span></div>
        <div className="border-t-2 border-black bg-white/85 p-3">
          <div className="flex items-start justify-between gap-3"><div><span className="font-pixel text-[13px]">{world.name}</span><p className="mt-1 text-[9px] font-bold" style={{ color: world.accent }}>{leadPublisher.name} · {leadPublisher.role} · {world.owner} 示例发布</p></div><PublisherStack skillIds={world.skillIds} /></div>
          <p className="mt-2 text-[10px] leading-relaxed text-black/60">{world.climate}。{world.temperament}。</p>
        </div>
      </div>
      <div className="space-y-3 px-3 py-3">
        <section className="border-2 border-black bg-white">
          <div className="border-b-2 border-black px-2.5 py-2 font-pixel text-[8px]">WORLD MEMORY / 地标</div>
          {world.landmarks.map((landmark, index) => <div key={landmark.name} className="grid grid-cols-[26px_1fr_auto] items-center gap-2 border-b border-black/20 px-2.5 py-2 last:border-b-0"><span className="font-pixel text-[6px] text-black/35">{String(index + 1).padStart(2, '0')}</span><span className="text-[10px] font-bold">{landmark.name}</span><span className="text-[8px] text-black/40">{landmark.source}</span></div>)}
        </section>
        <section className="border-2 border-black bg-[#f7f1df] p-2.5">
          <div className="flex items-center gap-2"><PawPrint className="h-4 w-4" style={{ color: world.accent }} /><b className="text-[11px]">{world.residents[0]?.name}</b></div>
          <p className="mt-1.5 text-[9px] text-black/55">{world.residents[0]?.personality}</p>
        </section>
        <section className="border-2 border-black bg-white">
          <div className="flex items-center justify-between border-b-2 border-black px-2.5 py-2"><b className="font-pixel text-[8px]">PUBLISHED SKILLS</b><span className="font-pixel text-[7px]">{manifests.length}</span></div>
          {manifests.map((manifest) => { const publisher = skillPublisherForManifest(manifest.identity.id); const equipped = !!getEquippedSkill(manifest.identity.id); return <button key={manifest.identity.id} type="button" onClick={() => onOpenSkill(manifest.identity.id)} className="grid w-full grid-cols-[38px_1fr_auto] items-center gap-2 border-b border-black/20 p-2 text-left last:border-b-0 active:bg-[#00ff88]/10"><span className="h-9 w-9 overflow-hidden rounded-full border-2 border-black bg-[#f5efdf]"><img src={publisher.avatar} alt="" className="h-full w-full object-contain" /></span><span className="min-w-0"><b className="block truncate text-[10px]">{manifest.identity.name}</b><small className="mt-0.5 block truncate text-[8px] text-black/45">{manifest.kind.toUpperCase()} · {publisher.name} 发布</small></span><span className={`border border-black px-1.5 py-1 font-pixel text-[5px] ${equipped ? 'bg-[#dff5e9] text-[#18784b]' : 'bg-[#fff3cd] text-[#8a5a00]'}`}>{equipped ? '私人库' : '查看'}</span></button>; })}
        </section>
        <button type="button" onClick={onOpenAll} className="flex w-full items-center justify-center gap-2 border-2 border-black bg-black px-3 py-3 font-pixel text-[7px] text-[#7CFF6B]"><PackageCheck className="h-4 w-4" />查看这个世界的全部 Skills</button>
        <div className="flex items-center justify-center gap-1.5 pb-2 text-[8px] text-black/35"><ShieldCheck className="h-3.5 w-3.5" />安装前核对声明、权限、服务端 Qwen 能力与资产哈希</div>
      </div>
    </div>
  );
}

function WorldDraftBuilder({ draft, onChange, onBack, onSave, onDelete, saved, saveError }: { draft: WorldDraft; onChange: (draft: WorldDraft) => void; onBack: () => void; onSave: () => void; onDelete: () => void; saved: boolean; saveError: string | null }) {
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [idea, setIdea] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [suggestionNote, setSuggestionNote] = useState('');
  const tone = WORLD_TONES.find((item) => item.id === draft.toneId) ?? WORLD_TONES[0];
  const agent = WORLD_AGENT_OPTIONS.find((item) => item.id === draft.agentId) ?? WORLD_AGENT_OPTIONS[0];
  const manifest = BUILTIN_SKILLS.find((item) => item.identity.id === draft.publishedSkillId);
  const suggest = async () => {
    const description = idea.trim();
    if (!description || suggesting) return;
    setSuggesting(true);
    setSuggestionNote('');
    const fallback = { name: draft.name, toneId: draft.toneId, agentId: draft.agentId, publishedSkillId: draft.publishedSkillId };
    const agentOptions: WorldSuggestionAgent[] = WORLD_AGENT_OPTIONS.map((item) => ({ id: item.id, name: item.name, role: item.role }));
    const skillOptions: WorldSuggestionSkill[] = PLAZA_SKILL_IDS.flatMap((id) => {
      const item = BUILTIN_SKILLS.find((skill) => skill.identity.id === id);
      if (!item) return [];
      const publisher = skillPublisherForManifest(id);
      return [{ id, name: item.identity.name, description: item.identity.description, publisher: publisher.name, role: publisher.role }];
    });
    try {
      const response = await getFrostBrain().complete(
        createWorldSuggestionPrompt(description, WORLD_TONES, agentOptions, skillOptions),
        { json: true, task: 'agent-world-draft' },
      );
      const parsed = response
        ? parseWorldSuggestion(response, fallback, WORLD_TONES.map((item) => item.id), WORLD_AGENT_IDS, PLAZA_SKILL_IDS)
        : null;
      if (parsed) {
        onChange({ ...draft, ...parsed });
        setSuggestionNote('服务端 Qwen 建议已填入；仍需你确认后才会保存。');
        return;
      }
      onChange({ ...draft, ...suggestWorldLocally(description, fallback, PLAZA_SKILL_IDS) });
      setSuggestionNote('服务端未返回合格的白名单 JSON，已明确降级为本地规则建议。');
    } catch {
      onChange({ ...draft, ...suggestWorldLocally(description, fallback, PLAZA_SKILL_IDS) });
      setSuggestionNote('服务端本轮不可用，已明确降级为本地规则建议。');
    } finally {
      setSuggesting(false);
    }
  };
  return (
    <div className="flex-1 overflow-y-auto bg-[#EAEAEA] px-3 py-3">
      <div className="mb-3 flex items-center gap-2"><button type="button" aria-label="返回 My Agent" onClick={onBack} className="grid h-9 w-9 place-items-center border-2 border-black bg-white"><ChevronLeft className="h-4 w-4" strokeWidth={3} /></button><span><b className="block font-pixel text-[10px]">CREATE YOUR AGENT WORLD</b><small className="text-[8px] text-black/45">本机草稿 · 未发布</small></span></div>

      <section className="mb-3 border-2 border-black bg-[#f7f1df] p-2.5">
        <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center border-2 border-black bg-[#00ff88]"><Cpu className="h-4 w-4" /></span><span><b className="block font-pixel text-[7px]">00 · 让 FROST 编排</b><small className="mt-0.5 block text-[8px] text-black/50">一句话推荐气质、常驻子 Agent 与研究 Skill</small></span></div>
        <textarea value={idea} maxLength={120} onChange={(event) => { setIdea(event.target.value.slice(0, 120)); setSuggestionNote(''); }} className="mt-2 min-h-[64px] w-full resize-none border-2 border-black bg-white px-2.5 py-2 text-[10px] leading-relaxed outline-none" placeholder="例如：我想做一个收集城市深夜声音、只在手机里保存的世界" />
        <button type="button" disabled={!idea.trim() || suggesting} onClick={() => void suggest()} className="mt-2 flex w-full items-center justify-center gap-2 border-2 border-black bg-black px-2 py-2.5 font-pixel text-[7px] text-[#7CFF6B] disabled:opacity-35">{suggesting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{suggesting ? '服务端编排中' : 'QWEN 服务端建议'}</button>
        <p className="mt-1.5 text-[7.5px] leading-relaxed text-black/45">这段描述只用于本次服务端建议；返回内容必须通过本机白名单校验，草稿仍由你确认后保存。</p>
        {suggestionNote && <div role="status" className="mt-2 border border-black bg-white px-2 py-1.5 text-[8px] leading-relaxed text-[#18784b]">{suggestionNote}</div>}
      </section>

      <section className="mb-3 border-2 border-black bg-white p-2.5">
        <div className="mb-2 font-pixel text-[7px]">01 · 选择常驻子 AGENT</div>
        <div className="grid grid-cols-4 gap-2">{WORLD_AGENT_OPTIONS.map((item) => { const active = draft.agentId === item.id; return <button key={item.id} type="button" aria-pressed={active} aria-label={`选择 ${item.name} 作为常驻子 Agent`} onClick={() => onChange({ ...draft, agentId: item.id })} className="min-w-0 text-center"><span className={`mx-auto grid h-[56px] w-[56px] max-w-full place-items-center overflow-hidden rounded-full border-2 bg-[#fffaf0] ${active ? 'border-black shadow-[2px_2px_0_#000]' : 'border-black/25'}`}><img src={item.assetUrl} alt="" className="h-[96%] w-[96%] object-contain" /></span><small className="mt-1 block truncate text-[7px] font-bold">{item.name}</small></button>; })}</div>
      </section>

      <section className="mb-3 border-2 border-black bg-white p-2.5">
        <div className="mb-2 font-pixel text-[7px]">02 · 定义世界名字</div>
        <label className="block text-[8px] font-bold" htmlFor="local-world-name">WORLD NAME / 世界名</label>
        <input id="local-world-name" value={draft.name} maxLength={18} onChange={(event) => onChange({ ...draft, name: event.target.value.slice(0, 18) })} className="mt-2 w-full border-2 border-black bg-[#f7f1df] px-2.5 py-2 text-[12px] font-bold outline-none focus:bg-white" placeholder="给你的世界起个名字" />
        <div className="mt-1 text-right font-pixel text-[5px] text-black/35">{draft.name.length}/18</div>
      </section>

      <section className="mb-3 border-2 border-black bg-white p-2.5">
        <div className="mb-2 font-pixel text-[7px]">03 · 选择研究 SKILL</div>
        <div className="grid grid-cols-2 gap-1.5">{PLAZA_SKILL_IDS.map((id) => { const item = BUILTIN_SKILLS.find((skill) => skill.identity.id === id); if (!item) return null; const active = draft.publishedSkillId === id; return <button key={id} type="button" aria-pressed={active} onClick={() => onChange({ ...draft, publishedSkillId: id })} className={`border-2 px-2 py-2 text-left ${active ? 'border-black bg-[#00ff88]' : 'border-black/25 bg-white'}`}><b className="block truncate text-[8px]">{item.identity.name}</b><small className="mt-0.5 block font-pixel text-[5px] text-black/45">{item.kind.toUpperCase()}</small></button>; })}</div>
      </section>

      <section className="mb-3 overflow-hidden border-2 border-black" style={{ background: tone.paper, backgroundImage: `radial-gradient(circle at 18% 18%, ${tone.accent}25 0 2px, transparent 2.5px)`, backgroundSize: '16px 16px' }}>
        <div className="border-b-2 border-black bg-black px-2.5 py-2 font-pixel text-[6px] text-[#7CFF6B]">LOCAL WORLD PREVIEW</div>
        <div className="grid grid-cols-[112px_1fr] items-center p-3">
          <span className="grid h-[96px] w-[96px] place-items-center overflow-hidden rounded-full border-[3px] border-black bg-[#fffaf0]"><img src={agent.assetUrl} alt={agent.name} className="h-[97%] w-[97%] object-contain" /></span>
          <span><span className="font-pixel text-[8px]" style={{ color: tone.accent }}>{tone.english}</span><b className="mt-2 block break-words text-[15px]">{draft.name.trim() || DEFAULT_WORLD_DRAFT.name}</b><span className="mt-1 block text-[9px] font-bold" style={{ color: tone.accent }}>{agent.name} · {agent.role}</span><span className="mt-2 block text-[8px] text-black/55">准备研究：{manifest?.identity.name ?? '未选择'}</span></span>
        </div>
      </section>

      <div className={`grid gap-2 ${draft.savedAt ? 'grid-cols-[1fr_auto]' : 'grid-cols-1'}`}>
        <button type="button" onClick={onSave} disabled={!draft.name.trim()} className={`flex w-full items-center justify-center gap-2 border-2 border-black px-3 py-3 font-pixel text-[7px] disabled:bg-black/20 ${saved ? 'bg-[#dff5e9] text-[#18784b]' : 'bg-[#00ff88]'}`}>{saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}{saved ? '已保存到本机草稿' : '保存本机世界草稿'}</button>
        {draft.savedAt && <button type="button" onClick={() => { if (deleteArmed) onDelete(); else setDeleteArmed(true); }} aria-label={deleteArmed ? '再次点击，确认删除本机世界草稿' : '删除本机世界草稿'} className={`grid min-w-12 place-items-center border-2 border-black px-2 font-bold text-[#b3261e] ${deleteArmed ? 'bg-[#fff0ed] text-[8px]' : 'bg-white'}`}>{deleteArmed ? '确认删除' : <Trash2 className="h-4 w-4" />}</button>}
      </div>
      {deleteArmed && <button type="button" onClick={() => setDeleteArmed(false)} className="mt-2 w-full text-center text-[8px] text-black/45 underline">取消删除</button>}
      {saveError && <div role="alert" className="mt-2 border-2 border-[#b3261e] bg-[#fff0ed] px-2.5 py-2 text-[8px] leading-relaxed text-[#8b1c16]">{saveError}。当前编辑仍保留，请检查系统存储权限后重试。</div>}
      <p className="py-3 text-center text-[8px] leading-relaxed text-black/35">草稿只保存主题、子 Agent 与 Skill ID；不上传照片、位置或私人资料。</p>
    </div>
  );
}

export default function AgentsTab({ initialMode = 'worlds', externalSkillTarget, externalSkillBackLabel, onExternalSkillTargetHandled, onReturnFromExternalSkill }: Props) {
  const [mode, setMode] = useState<NetworkMode | 'marketplace'>(initialMode);
  const [selectedWorld, setSelectedWorld] = useState<PlazaWorld | null>(null);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [requestedSkillTarget, setRequestedSkillTarget] = useState<string | null>(null);
  const [skillOpenOrigin, setSkillOpenOrigin] = useState<'plaza' | 'myagent' | 'external' | null>(null);
  const [skillRunning, setSkillRunning] = useState(false);
  const [buildingWorld, setBuildingWorld] = useState(false);
  const [worldDraft, setWorldDraft] = useState<WorldDraft>(loadWorldDraft);
  const [editingWorldDraft, setEditingWorldDraft] = useState<WorldDraft>(worldDraft);
  const [draftSaved, setDraftSaved] = useState(false);
  const [draftSaveError, setDraftSaveError] = useState<string | null>(null);
  const [canvasSkillId, setCanvasSkillId] = useState<string | null>(null);
  const [canvasSkillCount, setCanvasSkillCount] = useState(() => listCanvasSkills().length);
  useEffect(() => subscribeCanvasSkills(() => setCanvasSkillCount(listCanvasSkills().length)), []);
  const selectedSkill = selectedSkillId ? BUILTIN_SKILLS.find((item) => item.identity.id === selectedSkillId) : null;

  if (mode === 'marketplace') {
    return <AgentPlazaPage onBack={() => { setSelectedSkillId(null); setMode('worlds'); }} onRun={(target) => { setSkillOpenOrigin('plaza'); setRequestedSkillTarget(target); setMode('skills'); }} manifestIds={selectedSkillId ? [selectedSkillId] : (selectedWorld?.skillIds ?? PLAZA_SKILL_IDS)} title={selectedSkill ? selectedSkill.identity.name.toUpperCase() : (selectedWorld ? `${selectedWorld.english} · SKILLS` : 'GLOBAL SKILLS PLAZA')} subtitle={selectedSkill ? '校验声明；通过后加载到你的 Skills' : (selectedWorld ? `${selectedWorld.owner} 的世界发布 · 加载到你的 Skills` : '全球 Agent 发布 · 一键加载到你的 Skills')} networkLabel={PLAZA_NETWORK_LABEL} />;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#EAEAEA] font-sans">
      {!skillRunning && <NetworkHeader active={mode} canvasSkillCount={canvasSkillCount} onChange={(value) => { setSelectedWorld(null); setSelectedSkillId(null); setRequestedSkillTarget(null); setSkillOpenOrigin(null); setBuildingWorld(false); setCanvasSkillId(null); setMode(value); }} />}
      {mode === 'skills'
        ? <div className="min-h-0 flex-1 overflow-hidden"><Suspense fallback={<div className="grid h-full place-items-center bg-[#EAEAEA] font-pixel text-[8px]">LOADING SKILLS...</div>}><MySkillsTab embedded openTarget={externalSkillTarget ?? requestedSkillTarget} openTargetBackLabel={externalSkillTarget ? externalSkillBackLabel : skillOpenOrigin === 'myagent' ? '返回 My Agent' : '返回智能体世界'} onRunningChange={setSkillRunning} onOpenCanvasSkill={(id) => { setCanvasSkillId(id); setMode('canvas'); }} onOpenTargetHandled={() => { if (externalSkillTarget) { setSkillOpenOrigin('external'); onExternalSkillTargetHandled?.(); } else { if (!skillOpenOrigin) setSkillOpenOrigin('plaza'); setRequestedSkillTarget(null); } }} onReturnFromExternalTarget={() => { if (skillOpenOrigin === 'external') onReturnFromExternalSkill?.(); else setMode(skillOpenOrigin === 'myagent' ? 'myagent' : 'worlds'); setSkillOpenOrigin(null); }} /></Suspense></div>
        : mode === 'canvas'
        ? <div className="min-h-0 flex-1 overflow-hidden"><Suspense fallback={<div className="grid h-full place-items-center bg-[#EAEAEA] font-pixel text-[8px]">LOADING CANVAS...</div>}><SkillCanvasTab key={mode} skillId={canvasSkillId} /></Suspense></div>
        : mode === 'myagent'
        ? buildingWorld
          ? <WorldDraftBuilder draft={editingWorldDraft} onChange={(next) => { setEditingWorldDraft(next); setDraftSaved(false); setDraftSaveError(null); }} onBack={() => { setEditingWorldDraft(worldDraft); setDraftSaveError(null); setBuildingWorld(false); }} saved={draftSaved} saveError={draftSaveError} onSave={() => { try { const saved = writePlazaWorldDraft(editingWorldDraft); setWorldDraft(saved); setEditingWorldDraft(saved); setDraftSaved(true); setDraftSaveError(null); } catch { setDraftSaved(false); setDraftSaveError('本机草稿保存失败'); } }} onDelete={() => { deletePlazaWorldDraft(); setWorldDraft(DEFAULT_WORLD_DRAFT); setEditingWorldDraft(DEFAULT_WORLD_DRAFT); setDraftSaved(false); setDraftSaveError(null); setBuildingWorld(false); }} />
          : <div className="min-h-0 flex-1 overflow-hidden"><Suspense fallback={<div className="grid h-full place-items-center bg-[#EAEAEA] font-pixel text-[8px]">LOADING MY AGENT...</div>}><PocketBuddyForge worldDraftName={worldDraft.name} worldDraftSaved={!!worldDraft.savedAt} onRunSkill={(target) => { setSkillOpenOrigin('myagent'); setRequestedSkillTarget(target); setMode('skills'); }} onBuildWorld={() => { setEditingWorldDraft(worldDraft); setDraftSaved(false); setDraftSaveError(null); setBuildingWorld(true); }} /></Suspense></div>
        : selectedWorld
        ? <WorldDetail world={selectedWorld} onBack={() => setSelectedWorld(null)} onOpenSkill={(skillId) => { setSelectedSkillId(skillId); setMode('marketplace'); }} onOpenAll={() => { setSelectedSkillId(null); setMode('marketplace'); }} />
        : <WorldsHome onSelect={setSelectedWorld} onOpenSkill={(target) => { setSkillOpenOrigin('plaza'); setRequestedSkillTarget(target); setMode('skills'); }} onOpenAll={() => { setSelectedSkillId(null); setMode('marketplace'); }} />}
    </div>
  );
}
