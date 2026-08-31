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
import { isNativeMnnPlatform } from '../../../frost-agent/edge/capacitorMnnEdge';
import { runEdgeChatEvidence } from '../../../frost-agent/edge/httpEdge';
import { CORE_SKILL_TARGETS } from '../data/coreSkills';
import { listCanvasSkills, subscribeCanvasSkills } from '../../../frost-agent/skill-canvas';
import { FROST_AVATAR } from '../lib/skill/avatars';
import SkillCanvasPage from './SkillCanvasPage';
import FitnessAgentEntry from './FitnessAgentEntry';

const MusicAgentsTab = lazy(() => import('./MusicAgentsTab'));
const PocketBuddyForge = lazy(() => import('./PocketBuddyForge'));

interface Props {
  initialMode?: 'worlds' | 'skills' | 'myagent' | 'canvas';
  externalSkillTarget?: string | null;
  externalSkillBackLabel?: string;
  onExternalSkillTargetHandled?: () => void;
  onReturnFromExternalSkill?: () => void;
}

type WorldDraft = PlazaWorldDraft;

const WORLD_TONES = [
  { id: 'night', name: 'Recovery Blue', english: 'RECOVERY SIGNAL', paper: '#e8f0f2', accent: '#4f83a5', copy: 'For sleep, HRV and training recovery.' },
  { id: 'paper', name: 'Nutrition Cream', english: 'NUTRITION NOTES', paper: '#f5ead8', accent: '#b77937', copy: 'For food, nutrition and health material.' },
  { id: 'field', name: 'Training Green', english: 'TRAINING FIELD', paper: '#edf2df', accent: '#5f8b68', copy: 'For running, strength and posture training.' },
] as const;

const WORLD_AGENT_IDS = ['pet-caramel-dachshund', 'puff', 'pip', 'mossback'] as const;
const WORLD_AGENT_OPTIONS = WORLD_AGENT_IDS.flatMap((id) => {
  const blueprint = getAgentWorldPocketBuddyBlueprint(id);
  if (!blueprint) return [];
  return [{
    ...blueprint,
    assetUrl: id === 'pet-caramel-dachshund'
      ? FROST_AVATAR.src
      : blueprint.assetUrl,
  }];
});

const DEFAULT_WORLD_DRAFT: WorldDraft = {
  name: 'My Agent World',
  toneId: WORLD_TONES[0].id,
  agentId: WORLD_AGENT_IDS[0],
  publishedSkillId: PLAZA_SKILL_IDS[0],
};

function loadWorldDraft(): WorldDraft {
  return readPlazaWorldDraft(DEFAULT_WORLD_DRAFT, WORLD_TONES.map((tone) => tone.id), WORLD_AGENT_IDS, PLAZA_SKILL_IDS);
}

type NetworkMode = 'worlds' | 'skills' | 'myagent' | 'canvas';

function NetworkHeader({ active, canvasSkillCount, onChange, onOpenFitness }: { active: NetworkMode; canvasSkillCount: number; onChange: (value: NetworkMode) => void; onOpenFitness: () => void }) {
  const title = active === 'skills' ? 'MY SKILLS' : active === 'canvas' ? 'SKILL CANVAS' : active === 'myagent' ? 'MY AGENT' : 'AGENT WORLD';
  const subtitle = active === 'skills'
    ? `${CORE_SKILL_TARGETS.length} core abilities · more Skills and tools below`
    : active === 'canvas'
      ? 'Set a goal, combine ability blocks, pick a skill avatar'
    : active === 'myagent'
      ? 'Build a Pocket Buddy from a photo · look, personality and memory save only after you confirm'
      : 'Skill plaza · browse fitness, nature and health abilities';
  return (
    <>
      <div className="flex h-[30px] shrink-0 items-center justify-center border-b-2 border-black bg-[#EAEAEA] px-4">
        <div className="font-pixel text-[9px] uppercase leading-none tracking-[0.14em]">POCKET BUDDY · AGENT NETWORK</div>
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
          {active === 'skills' && <span className="shrink-0 border-2 border-black bg-[#E8F8EF] px-2 py-1.5 font-pixel text-[7px] tracking-wider text-[#087C49]">{CORE_SKILL_TARGETS.length} CORE{canvasSkillCount > 0 ? ` + ${canvasSkillCount} MINE` : ''}</span>}
        </div>
      </div>
      <div className="shrink-0 border-b-2 border-black bg-black px-3 py-2">
        <div className="grid grid-cols-3 gap-1.5">
          <button type="button" aria-pressed={active === 'skills'} onClick={() => onChange('skills')} className={`whitespace-nowrap border px-2 py-1.5 font-pixel text-[7px] ${active === 'skills' ? 'border-[#00ff88] bg-[#00ff88] text-black' : 'border-white/50 text-white/70'}`}>MY SKILLS</button>
          <button type="button" aria-pressed={active === 'canvas'} onClick={() => onChange('canvas')} className={`whitespace-nowrap border px-2 py-1.5 font-pixel text-[7px] ${active === 'canvas' ? 'border-[#ffd34e] bg-[#ffd34e] text-black' : 'border-white/50 text-white/70'}`}>SKILL CANVAS</button>
          <button type="button" aria-pressed={active === 'worlds'} onClick={() => onChange('worlds')} className={`whitespace-nowrap border px-2 py-1.5 font-pixel text-[7px] ${active === 'worlds' ? 'border-[#00ff88] bg-[#00ff88] text-black' : 'border-white/50 text-white/70'}`}>AGENT WORLD</button>
        </div>
      </div>
      <div className="shrink-0 border-b-2 border-black p-3"><FitnessAgentEntry onOpen={onOpenFitness} /></div>
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
    <button type="button" aria-label={world.launchUrl ? `Enter ${world.name}` : `Enter ${world.name}, view ${world.skillIds.length} Skills`} onClick={onOpen} className="w-full overflow-hidden border-2 border-black text-left active:translate-y-px" style={{ background: world.paper }}>
      {world.coreSkill && <span className="flex items-center justify-between gap-2 border-b-2 border-black bg-[#00ff88] px-2.5 py-2 text-black"><span className="flex items-center gap-1.5 font-pixel text-[8px]"><Sparkles className="h-3.5 w-3.5" strokeWidth={3} />CORE SKILL</span><span className="text-[8px] font-black tracking-wide">NATIVE POCKET BUDDY UI</span></span>}
      <div className="grid min-h-[142px] grid-cols-[106px_1fr] border-b-2 border-black" style={{ backgroundImage: `radial-gradient(circle at 18% 18%, ${world.accent}22 0 2px, transparent 2.5px)`, backgroundSize: '15px 15px' }}>
        <span className="relative grid place-items-center border-r-2 border-black bg-white/45">
          <span className="absolute left-1.5 top-1.5 font-pixel text-[5px] text-black/45">PUBLISHER</span>
          <span className="grid h-[84px] w-[84px] place-items-center overflow-hidden rounded-full border-[3px] border-black bg-[#fffaf0]"><img src={leadPublisher.avatar} alt={`${leadPublisher.name}, Skill publisher for ${world.name}`} className="h-[96%] w-[96%] object-contain" /></span>
        </span>
        <span className="flex min-w-0 flex-col p-2.5">
          <span className="flex items-center justify-between gap-2"><span className="border border-black bg-white px-1.5 py-1 font-pixel text-[5px]">{world.english}</span><span className="font-pixel text-[5px]" style={{ color: world.accent }}>{world.coordinate}</span></span>
          <span className="mt-2 block font-pixel text-[12px] leading-tight">{world.name}</span>
          <span className="mt-1 block text-[9px] font-bold" style={{ color: world.accent }}>{leadPublisher.name} · {leadPublisher.role}</span>
          <span className="mt-1.5 block text-[9px] leading-snug text-black/60">{world.temperament}</span>
          <span className="mt-auto flex items-end justify-between pt-2"><span className="text-[8px] text-black/45">{world.entryTarget ? 'Frost Skill · native chat entry' : world.coreSkill ? 'Core Skill · fused into the Pocket Buddy UI' : world.launchUrl ? 'Standalone app · tap to open' : `${world.owner} sample release · ${world.skillIds.length} Skills`}</span><ChevronRight className="h-4 w-4" /></span>
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 bg-white/55 px-2.5 py-2">
        <span className="text-[8px] font-medium text-black/50">NPC · {world.residents[0]?.name}</span>
        {world.launchUrl
          ? <span className="border border-black bg-white px-2 py-1 font-pixel text-[5px]" style={{ color: world.accent }}>{world.coreSkill ? 'OPEN CORE SKILL' : 'OPEN EXPERIENCE'}</span>
          : <span className="flex items-center gap-2"><PublisherStack skillIds={world.skillIds} /><span className="font-pixel text-[5px] text-black/45">{equipped}/{world.skillIds.length} Private library</span></span>}
      </div>
    </button>
  );
}

function WorldsHome({ onSelect, onOpenSkill, onOpenAll }: { onSelect: (world: PlazaWorld) => void; onOpenSkill: (target: string) => void; onOpenAll: () => void }) {
  return (
    <div className="flex-1 overflow-y-auto bg-[#EAEAEA] px-3 py-3">
      <div className="mb-3"><SkillPublishingDeclaration /></div>

      <div className="mb-2 flex items-end justify-between gap-2 border-t-2 border-black pt-3">
        <span><b className="block font-pixel text-[8px]">GLOBAL DEMO WORLDS</b><small className="mt-0.5 block text-[8px] text-black/45">Global sample characters · shows the discovery and protocol-check flow</small></span>
        <span className="border border-black bg-[#f7f1df] px-1.5 py-1 font-pixel text-[5px]">Not live</span>
      </div>
      <div className="space-y-2.5">
        {PLAZA_WORLDS.map((world) => <WorldCard key={world.id} world={world} onOpen={() => { if (world.entryTarget) onOpenSkill(world.entryTarget); else if (world.launchUrl) window.location.assign(world.launchUrl); else onSelect(world); }} />)}
      </div>

      <button type="button" onClick={onOpenAll} className="mt-3 flex w-full items-center justify-center gap-2 border-2 border-black bg-[#00ff88] px-3 py-3 font-pixel text-[7px] active:translate-y-px"><Sparkles className="h-4 w-4" />View all releases <ChevronRight className="h-4 w-4" /></button>
      <p className="py-3 text-center text-[8px] leading-relaxed text-black/35">Sample worlds come from the author's own Agent World project · Skills only ever install into your on-device Private library</p>
    </div>
  );
}

function WorldDetail({ world, onBack, onOpenSkill, onOpenAll }: { world: PlazaWorld; onBack: () => void; onOpenSkill: (skillId: string) => void; onOpenAll: () => void }) {
  const manifests = useMemo(() => world.skillIds.map((id) => BUILTIN_SKILLS.find((item) => item.identity.id === id)).filter((item): item is NonNullable<typeof item> => !!item), [world]);
  const leadPublisher = skillPublisherForManifest(world.skillIds[0]);
  return (
    <div className="flex-1 overflow-y-auto bg-[#EAEAEA]">
      <div className="relative border-b-2 border-black" style={{ background: world.paper, backgroundImage: `radial-gradient(circle at 18% 18%, ${world.accent}25 0 2px, transparent 2.5px)`, backgroundSize: '16px 16px' }}>
        <button type="button" aria-label="Back to Agent World" onClick={onBack} className="absolute left-3 top-3 z-10 grid h-9 w-9 place-items-center border-2 border-black bg-white"><ChevronLeft className="h-4 w-4" strokeWidth={3} /></button>
        <div className="grid h-[178px] place-items-center pt-8"><span className="grid h-[112px] w-[112px] place-items-center overflow-hidden rounded-full border-[3px] border-black bg-[#fffaf0]"><img src={leadPublisher.avatar} alt={`${leadPublisher.name} publisher avatar`} className="h-[97%] w-[97%] object-contain" /></span></div>
        <div className="border-t-2 border-black bg-white/85 p-3">
          <div className="flex items-start justify-between gap-3"><div><span className="font-pixel text-[13px]">{world.name}</span><p className="mt-1 text-[9px] font-bold" style={{ color: world.accent }}>{leadPublisher.name} · {leadPublisher.role} · {world.owner} sample release</p></div><PublisherStack skillIds={world.skillIds} /></div>
          <p className="mt-2 text-[10px] leading-relaxed text-black/60">{world.climate}. {world.temperament}.</p>
        </div>
      </div>
      <div className="space-y-3 px-3 py-3">
        <section className="border-2 border-black bg-white">
          <div className="border-b-2 border-black px-2.5 py-2 font-pixel text-[8px]">WORLD MEMORY / LANDMARKS</div>
          {world.landmarks.map((landmark, index) => <div key={landmark.name} className="grid grid-cols-[26px_1fr_auto] items-center gap-2 border-b border-black/20 px-2.5 py-2 last:border-b-0"><span className="font-pixel text-[6px] text-black/35">{String(index + 1).padStart(2, '0')}</span><span className="text-[10px] font-bold">{landmark.name}</span><span className="text-[8px] text-black/40">{landmark.source}</span></div>)}
        </section>
        <section className="border-2 border-black bg-[#f7f1df] p-2.5">
          <div className="flex items-center gap-2"><PawPrint className="h-4 w-4" style={{ color: world.accent }} /><b className="text-[11px]">{world.residents[0]?.name}</b></div>
          <p className="mt-1.5 text-[9px] text-black/55">{world.residents[0]?.personality}</p>
        </section>
        <section className="border-2 border-black bg-white">
          <div className="flex items-center justify-between border-b-2 border-black px-2.5 py-2"><b className="font-pixel text-[8px]">PUBLISHED SKILLS</b><span className="font-pixel text-[7px]">{manifests.length}</span></div>
          {manifests.map((manifest) => { const publisher = skillPublisherForManifest(manifest.identity.id); const equipped = !!getEquippedSkill(manifest.identity.id); return <button key={manifest.identity.id} type="button" onClick={() => onOpenSkill(manifest.identity.id)} className="grid w-full grid-cols-[38px_1fr_auto] items-center gap-2 border-b border-black/20 p-2 text-left last:border-b-0 active:bg-[#00ff88]/10"><span className="h-9 w-9 overflow-hidden rounded-full border-2 border-black bg-[#f5efdf]"><img src={publisher.avatar} alt="" className="h-full w-full object-contain" /></span><span className="min-w-0"><b className="block truncate text-[10px]">{manifest.identity.name}</b><small className="mt-0.5 block truncate text-[8px] text-black/45">{manifest.kind.toUpperCase()} · by {publisher.name}</small></span><span className={`border border-black px-1.5 py-1 font-pixel text-[5px] ${equipped ? 'bg-[#dff5e9] text-[#18784b]' : 'bg-[#fff3cd] text-[#8a5a00]'}`}>{equipped ? 'Private library' : 'View'}</span></button>; })}
        </section>
        <button type="button" onClick={onOpenAll} className="flex w-full items-center justify-center gap-2 border-2 border-black bg-black px-3 py-3 font-pixel text-[7px] text-[#7CFF6B]"><PackageCheck className="h-4 w-4" />View every Skill in this world</button>
        <div className="flex items-center justify-center gap-1.5 pb-2 text-[8px] text-black/35"><ShieldCheck className="h-3.5 w-3.5" />Check the declaration, permissions, Qwen/MNN base and asset hashes before installing</div>
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
      if (isNativeMnnPlatform()) {
        const response = await runEdgeChatEvidence(createWorldSuggestionPrompt(description, WORLD_TONES, agentOptions, skillOptions), {
          system: 'You are Frost’s on-device world orchestrator. Choose only from the whitelists the user gives you, and output strict JSON.',
          json: true,
          maxTokens: 128,
        });
        const parsed = response.backend === 'mnn'
          ? parseWorldSuggestion(response.text || '', fallback, WORLD_TONES.map((item) => item.id), WORLD_AGENT_IDS, PLAZA_SKILL_IDS)
          : null;
        if (parsed) {
          onChange({ ...draft, ...parsed });
          setSuggestionNote('Qwen3-VL-2B · MNN on-device suggestion filled in; not saved or published yet.');
          return;
        }
      }
      onChange({ ...draft, ...suggestWorldLocally(description, fallback, PLAZA_SKILL_IDS) });
      setSuggestionNote(isNativeMnnPlatform()
        ? 'MNN returned no valid JSON this round, so this fell back to local rule-based suggestions. Nothing was sent to the cloud.'
        : 'The web preview uses local rule-based suggestions; it does not pretend to be Qwen/MNN.');
    } catch {
      onChange({ ...draft, ...suggestWorldLocally(description, fallback, PLAZA_SKILL_IDS) });
      setSuggestionNote('The MNN call failed this round, so this fell back to local rule-based suggestions. Nothing was sent to the cloud.');
    } finally {
      setSuggesting(false);
    }
  };
  return (
    <div className="flex-1 overflow-y-auto bg-[#EAEAEA] px-3 py-3">
      <div className="mb-3 flex items-center gap-2"><button type="button" aria-label="Back to My Agent" onClick={onBack} className="grid h-9 w-9 place-items-center border-2 border-black bg-white"><ChevronLeft className="h-4 w-4" strokeWidth={3} /></button><span><b className="block font-pixel text-[10px]">CREATE YOUR AGENT WORLD</b><small className="text-[8px] text-black/45">On-device draft · not published</small></span></div>

      <section className="mb-3 border-2 border-black bg-[#f7f1df] p-2.5">
        <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center border-2 border-black bg-[#00ff88]"><Cpu className="h-4 w-4" /></span><span><b className="block font-pixel text-[7px]">00 · LET FROST ORCHESTRATE</b><small className="mt-0.5 block text-[8px] text-black/50">One line picks the tone, resident sub-Agent and research Skill</small></span></div>
        <textarea value={idea} maxLength={120} onChange={(event) => { setIdea(event.target.value.slice(0, 120)); setSuggestionNote(''); }} className="mt-2 min-h-[64px] w-full resize-none border-2 border-black bg-white px-2.5 py-2 text-[10px] leading-relaxed outline-none" placeholder="e.g. a world that collects late-night city sounds and keeps them only on this phone" />
        <button type="button" disabled={!idea.trim() || suggesting} onClick={() => void suggest()} className="mt-2 flex w-full items-center justify-center gap-2 border-2 border-black bg-black px-2 py-2.5 font-pixel text-[7px] text-[#7CFF6B] disabled:opacity-35">{suggesting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{suggesting ? 'ORCHESTRATING' : isNativeMnnPlatform() ? 'QWEN + MNN ON-DEVICE' : 'LOCAL RULE PREVIEW'}</button>
        <p className="mt-1.5 text-[7.5px] leading-relaxed text-black/45">{isNativeMnnPlatform() ? 'Only marked as a model suggestion when the native bridge reports MNN; on failure it falls back to local rules.' : 'Installed on Android this runs on Qwen3-VL-2B + MNN; the web build does not pose as the on-device model.'}</p>
        {suggestionNote && <div role="status" className="mt-2 border border-black bg-white px-2 py-1.5 text-[8px] leading-relaxed text-[#18784b]">{suggestionNote}</div>}
      </section>

      <section className="mb-3 border-2 border-black bg-white p-2.5">
        <div className="mb-2 font-pixel text-[7px]">01 · PICK A RESIDENT SUB-AGENT</div>
        <div className="grid grid-cols-4 gap-2">{WORLD_AGENT_OPTIONS.map((item) => { const active = draft.agentId === item.id; return <button key={item.id} type="button" aria-pressed={active} aria-label={`Pick ${item.name} as the resident sub-Agent`} onClick={() => onChange({ ...draft, agentId: item.id })} className="min-w-0 text-center"><span className={`mx-auto grid h-[56px] w-[56px] max-w-full place-items-center overflow-hidden rounded-full border-2 bg-[#fffaf0] ${active ? 'border-black shadow-[2px_2px_0_#000]' : 'border-black/25'}`}><img src={item.assetUrl} alt="" className="h-[96%] w-[96%] object-contain" /></span><small className="mt-1 block truncate text-[7px] font-bold">{item.name}</small></button>; })}</div>
      </section>

      <section className="mb-3 border-2 border-black bg-white p-2.5">
        <div className="mb-2 font-pixel text-[7px]">02 · NAME YOUR WORLD</div>
        <label className="block text-[8px] font-bold" htmlFor="local-world-name">WORLD NAME</label>
        <input id="local-world-name" value={draft.name} maxLength={18} onChange={(event) => onChange({ ...draft, name: event.target.value.slice(0, 18) })} className="mt-2 w-full border-2 border-black bg-[#f7f1df] px-2.5 py-2 text-[12px] font-bold outline-none focus:bg-white" placeholder="Name your world" />
        <div className="mt-1 text-right font-pixel text-[5px] text-black/35">{draft.name.length}/18</div>
      </section>

      <section className="mb-3 border-2 border-black bg-white p-2.5">
        <div className="mb-2 font-pixel text-[7px]">03 · PICK A RESEARCH SKILL</div>
        <div className="grid grid-cols-2 gap-1.5">{PLAZA_SKILL_IDS.map((id) => { const item = BUILTIN_SKILLS.find((skill) => skill.identity.id === id); if (!item) return null; const active = draft.publishedSkillId === id; return <button key={id} type="button" aria-pressed={active} onClick={() => onChange({ ...draft, publishedSkillId: id })} className={`border-2 px-2 py-2 text-left ${active ? 'border-black bg-[#00ff88]' : 'border-black/25 bg-white'}`}><b className="block truncate text-[8px]">{item.identity.name}</b><small className="mt-0.5 block font-pixel text-[5px] text-black/45">{item.kind.toUpperCase()}</small></button>; })}</div>
      </section>

      <section className="mb-3 overflow-hidden border-2 border-black" style={{ background: tone.paper, backgroundImage: `radial-gradient(circle at 18% 18%, ${tone.accent}25 0 2px, transparent 2.5px)`, backgroundSize: '16px 16px' }}>
        <div className="border-b-2 border-black bg-black px-2.5 py-2 font-pixel text-[6px] text-[#7CFF6B]">LOCAL WORLD PREVIEW</div>
        <div className="grid grid-cols-[112px_1fr] items-center p-3">
          <span className="grid h-[96px] w-[96px] place-items-center overflow-hidden rounded-full border-[3px] border-black bg-[#fffaf0]"><img src={agent.assetUrl} alt={agent.name} className="h-[97%] w-[97%] object-contain" /></span>
          <span><span className="font-pixel text-[8px]" style={{ color: tone.accent }}>{tone.english}</span><b className="mt-2 block break-words text-[15px]">{draft.name.trim() || DEFAULT_WORLD_DRAFT.name}</b><span className="mt-1 block text-[9px] font-bold" style={{ color: tone.accent }}>{agent.name} · {agent.role}</span><span className="mt-2 block text-[8px] text-black/55">Ready to research: {manifest?.identity.name ?? 'none selected'}</span></span>
        </div>
      </section>

      <div className={`grid gap-2 ${draft.savedAt ? 'grid-cols-[1fr_auto]' : 'grid-cols-1'}`}>
        <button type="button" onClick={onSave} disabled={!draft.name.trim()} className={`flex w-full items-center justify-center gap-2 border-2 border-black px-3 py-3 font-pixel text-[7px] disabled:bg-black/20 ${saved ? 'bg-[#dff5e9] text-[#18784b]' : 'bg-[#00ff88]'}`}>{saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}{saved ? 'Saved to on-device draft' : 'Save on-device world draft'}</button>
        {draft.savedAt && <button type="button" onClick={() => { if (deleteArmed) onDelete(); else setDeleteArmed(true); }} aria-label={deleteArmed ? 'Tap again to confirm deleting the on-device world draft' : 'Delete on-device world draft'} className={`grid min-w-12 place-items-center border-2 border-black px-2 font-bold text-[#b3261e] ${deleteArmed ? 'bg-[#fff0ed] text-[8px]' : 'bg-white'}`}>{deleteArmed ? 'Confirm' : <Trash2 className="h-4 w-4" />}</button>}
      </div>
      {deleteArmed && <button type="button" onClick={() => setDeleteArmed(false)} className="mt-2 w-full text-center text-[8px] text-black/45 underline">Cancel delete</button>}
      {saveError && <div role="alert" className="mt-2 border-2 border-[#b3261e] bg-[#fff0ed] px-2.5 py-2 text-[8px] leading-relaxed text-[#8b1c16]">{saveError}. Your edits are kept — check storage permissions and retry.</div>}
      <p className="py-3 text-center text-[8px] leading-relaxed text-black/35">The draft stores only the tone, sub-Agent and Skill ID; no photos, location or personal data are uploaded.</p>
    </div>
  );
}

export default function PlazaTab({ initialMode = 'worlds', externalSkillTarget, externalSkillBackLabel, onExternalSkillTargetHandled, onReturnFromExternalSkill }: Props) {
  const [mode, setMode] = useState<NetworkMode | 'marketplace'>(initialMode);
  const [selectedWorld, setSelectedWorld] = useState<PlazaWorld | null>(null);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [requestedSkillTarget, setRequestedSkillTarget] = useState<string | null>(null);
  const [skillOpenOrigin, setSkillOpenOrigin] = useState<NetworkMode | 'plaza' | 'external' | null>(null);
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
  const skillBackLabel = skillOpenOrigin === 'myagent' ? 'Back to My Agent' : skillOpenOrigin === 'skills' ? 'Back to Skills' : skillOpenOrigin === 'canvas' ? 'Back to Skill Canvas' : 'Back to Plaza';
  const returnFromSkill = () => {
    if (skillOpenOrigin === 'external') onReturnFromExternalSkill?.();
    else if (skillOpenOrigin === 'skills' || skillOpenOrigin === 'canvas') setMode(skillOpenOrigin);
    else setMode(skillOpenOrigin === 'myagent' ? 'myagent' : 'worlds');
    setSkillOpenOrigin(null);
  };

  if (mode === 'marketplace') {
    return <AgentPlazaPage onBack={() => { setSelectedSkillId(null); setMode('worlds'); }} onRun={(target) => { setSkillOpenOrigin('plaza'); setRequestedSkillTarget(target); setMode('skills'); }} manifestIds={selectedSkillId ? [selectedSkillId] : (selectedWorld?.skillIds ?? PLAZA_SKILL_IDS)} title={selectedSkill ? selectedSkill.identity.name.toUpperCase() : (selectedWorld ? `${selectedWorld.english} · SKILLS` : 'GLOBAL SKILLS PLAZA')} subtitle={selectedSkill ? 'Check the declaration; it loads into your Skills once it passes' : (selectedWorld ? `${selectedWorld.owner}'s world release · load into your Skills` : 'Global Agent releases · one tap loads them into your Skills')} networkLabel={PLAZA_NETWORK_LABEL} />;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#EAEAEA] font-sans">
      {!skillRunning && <NetworkHeader active={mode} canvasSkillCount={canvasSkillCount} onOpenFitness={() => { setSkillOpenOrigin(mode); setRequestedSkillTarget('frost'); setMode('skills'); }} onChange={(value) => { setSelectedWorld(null); setSelectedSkillId(null); setRequestedSkillTarget(null); setSkillOpenOrigin(null); setBuildingWorld(false); setCanvasSkillId(null); setMode(value); }} />}
      {mode === 'skills'
        ? <div className="min-h-0 flex-1 overflow-hidden"><Suspense fallback={<div className="grid h-full place-items-center bg-[#EAEAEA] font-pixel text-[8px]">LOADING SKILLS...</div>}><MusicAgentsTab embedded openTarget={externalSkillTarget ?? requestedSkillTarget} openTargetBackLabel={externalSkillTarget ? externalSkillBackLabel : skillBackLabel} onRunningChange={setSkillRunning} onOpenCanvasSkill={(id) => { setCanvasSkillId(id); setMode('canvas'); }} onOpenTargetHandled={() => { if (externalSkillTarget) { setSkillOpenOrigin('external'); onExternalSkillTargetHandled?.(); } else { if (!skillOpenOrigin) setSkillOpenOrigin('plaza'); setRequestedSkillTarget(null); } }} onReturnFromExternalTarget={returnFromSkill} /></Suspense></div>
        : mode === 'canvas'
        ? <div className="min-h-0 flex-1 overflow-hidden"><SkillCanvasPage skillId={canvasSkillId} /></div>
        : mode === 'myagent'
        ? buildingWorld
          ? <WorldDraftBuilder draft={editingWorldDraft} onChange={(next) => { setEditingWorldDraft(next); setDraftSaved(false); setDraftSaveError(null); }} onBack={() => { setEditingWorldDraft(worldDraft); setDraftSaveError(null); setBuildingWorld(false); }} saved={draftSaved} saveError={draftSaveError} onSave={() => { try { const saved = writePlazaWorldDraft(editingWorldDraft); setWorldDraft(saved); setEditingWorldDraft(saved); setDraftSaved(true); setDraftSaveError(null); } catch { setDraftSaved(false); setDraftSaveError('On-device draft save failed'); } }} onDelete={() => { deletePlazaWorldDraft(); setWorldDraft(DEFAULT_WORLD_DRAFT); setEditingWorldDraft(DEFAULT_WORLD_DRAFT); setDraftSaved(false); setDraftSaveError(null); setBuildingWorld(false); }} />
          : <div className="min-h-0 flex-1 overflow-hidden"><Suspense fallback={<div className="grid h-full place-items-center bg-[#EAEAEA] font-pixel text-[8px]">LOADING MY AGENT...</div>}><PocketBuddyForge worldDraftName={worldDraft.name} worldDraftSaved={!!worldDraft.savedAt} onRunSkill={(target) => { setSkillOpenOrigin('myagent'); setRequestedSkillTarget(target); setMode('skills'); }} onBuildWorld={() => { setEditingWorldDraft(worldDraft); setDraftSaved(false); setDraftSaveError(null); setBuildingWorld(true); }} /></Suspense></div>
        : selectedWorld
        ? <WorldDetail world={selectedWorld} onBack={() => setSelectedWorld(null)} onOpenSkill={(skillId) => { setSelectedSkillId(skillId); setMode('marketplace'); }} onOpenAll={() => { setSelectedSkillId(null); setMode('marketplace'); }} />
        : <WorldsHome onSelect={setSelectedWorld} onOpenSkill={(target) => { setSkillOpenOrigin('plaza'); setRequestedSkillTarget(target); setMode('skills'); }} onOpenAll={() => { setSelectedSkillId(null); setMode('marketplace'); }} />}
    </div>
  );
}
