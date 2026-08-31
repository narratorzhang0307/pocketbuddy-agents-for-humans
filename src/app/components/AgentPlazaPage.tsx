import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, CloudDownload, Cpu, Database, LoaderCircle, Lock, PackageCheck, PawPrint, Play, RotateCcw, ShieldCheck, Trash2, X } from 'lucide-react';
import {
  BUILTIN_SKILLS,
  ensureBuiltinSkills,
  getEquippedSkill,
  installSkillFromUrl,
  listInstalledSkills,
  prepareAndEquipSkill,
  cancelSkillPreparation,
  checkSkillOnDevice,
  getSkillDeviceCheck,
  isProtectedSkill,
  rollbackSkill,
  skillProtocolErrorMessage,
  skillNeedsMnn,
  subscribeSkillsRegistry,
  uninstallSkillWithAssets,
  type InstalledSkill,
  type SkillDeviceCheck,
  type SkillManifest,
} from '../lib/skill';
import { skillPublisherForManifest, type SkillPublisher } from '../data/skillPublishers';
import { isNativeMnnPlatform } from '../../../frost-agent/edge/capacitorMnnEdge';
import SkillAvatar from './SkillAvatar';

interface Props {
  onBack: () => void;
  onRun: (target: string) => void;
  backLabel?: string;
  title?: string;
  subtitle?: string;
  manifestIds?: string[];
  networkLabel?: string;
}

const ACCENT = '#326B55';
const PILL = 'inline-flex items-center gap-1 border border-black/50 bg-[#f2f0e8] px-1.5 py-0.5 text-[8px] tracking-wide';
const KIND_LABEL = { markdown: 'Markdown', lora: 'LoRA', hybrid: 'Hybrid Skill' } as const;

function runtimeLabel(manifest: SkillManifest): string {
  if (skillNeedsMnn(manifest)) return 'Qwen + MNN';
  return manifest.permissions.scopes.includes('network') ? 'Qwen cloud' : 'Local workflow';
}

function bytesLabel(bytes: number): string {
  if (!bytes) return 'Lightweight';
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)}MB`;
}

function SkillCard({ manifest, installed, publisher, onRun }: { manifest: SkillManifest; installed?: InstalledSkill; publisher: SkillPublisher; onRun: (target: string) => void }) {
  const [progress, setProgress] = useState(0);
  const [localError, setLocalError] = useState('');
  const [deviceCheck, setDeviceCheck] = useState<SkillDeviceCheck | undefined>(() => getSkillDeviceCheck(manifest));
  const [checkingDevice, setCheckingDevice] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const equipped = getEquippedSkill(manifest.identity.id)?.key === installed?.key;
  const canRollback = !!installed?.previousKey;
  const preparing = installed?.status === 'downloading' || installed?.status === 'verifying';
  const protectedSkill = isProtectedSkill(manifest.identity.id);
  const requiresAndroidMnn = skillNeedsMnn(manifest);
  const nativeMnn = isNativeMnnPlatform();
  const runDeviceCheck = async () => {
    if (checkingDevice) return;
    setCheckingDevice(true); setLocalError('');
    try {
      const result = await checkSkillOnDevice(manifest);
      setDeviceCheck(result);
    } catch (reason) { setLocalError(String(reason)); }
    finally { setCheckingDevice(false); }
  };
  const install = async () => {
    if (requiresAndroidMnn && !nativeMnn) return;
    const skill = installed || (() => { throw new Error('This built-in Skill is not registered yet'); })();
    setLocalError(''); setProgress(0);
    const controller = new AbortController(); abortRef.current = controller;
    try {
      await prepareAndEquipSkill(skill.key, {
        signal: controller.signal,
        onProgress: (value) => setProgress(value.total ? Math.min(100, Math.round(value.downloaded / value.total * 100)) : value.phase === 'done' ? 100 : 0),
      });
      await runDeviceCheck();
    } catch (reason) {
      if (!controller.signal.aborted) setLocalError(String(reason));
    } finally { abortRef.current = null; }
  };
  const cancel = async () => {
    abortRef.current?.abort();
    if (installed) await cancelSkillPreparation(installed.key);
  };
  const remove = async () => {
    if (!installed) return;
    setLocalError('');
    try { await uninstallSkillWithAssets(installed.key); }
    catch (reason) { setLocalError(String(reason)); }
  };
  return (
    <article className="border-2 border-black bg-white">
      <div className="flex items-start gap-2.5 p-2.5">
        <SkillAvatar skillId={manifest.identity.id} size={56} className="border-2 border-black" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate font-pixel text-[9px] tracking-wide">{manifest.identity.name}</h3>
            <span className="shrink-0 text-[8px] text-black/35">v{manifest.identity.version}</span>
          </div>
          <p className="mt-0.5 truncate text-[8.5px] font-bold text-[#18784b]">{publisher.name} · {publisher.role}</p>
          <p className="mt-1 overflow-hidden text-[10px] leading-snug text-black/60 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">{manifest.identity.description}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <span className={PILL}><PackageCheck className="h-2.5 w-2.5" />{KIND_LABEL[manifest.kind]}</span>
            <span className={PILL}><Cpu className="h-2.5 w-2.5" />{runtimeLabel(manifest)}</span>
            <span className={`${PILL} text-[#18784b]`}><Lock className="h-2.5 w-2.5" />Writes only to my Private library</span>
          </div>
          <button type="button" aria-expanded={evidenceOpen} onClick={() => setEvidenceOpen((value) => !value)} className="mt-2 inline-flex items-center gap-1 text-[8px] font-bold text-[#326B55] underline decoration-dotted underline-offset-2">
            Technical evidence <ChevronDown className={`h-3 w-3 transition-transform ${evidenceOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>
      {evidenceOpen && <div className="border-t border-black/20 bg-[#f8f6ef] px-2.5 py-2">
        <div className="flex flex-wrap gap-1">
          <span className={PILL}>{bytesLabel(manifest.assets.reduce((sum, asset) => sum + asset.bytes, 0))}</span>
          <span className={PILL}><Lock className="h-2.5 w-2.5" />{manifest.permissions.scopes.length ? manifest.permissions.scopes.join('·') : 'No extra permissions'}</span>
          {manifest.data.schemas.length > 0 && <span className={PILL}><Database className="h-2.5 w-2.5" />Data Pack swappable</span>}
          <span className={`${PILL} ${manifest.evaluation.passed ? 'text-[#238c57]' : 'text-[#b3261e]'}`}><ShieldCheck className="h-2.5 w-2.5" />Static gate {Math.round(manifest.evaluation.score * 100)}%</span>
          {protectedSkill
            ? <span className={`${PILL} text-[#735d91]`}>Acceptance protected</span>
            : deviceCheck?.state === 'passed'
              ? <span className={`${PILL} text-[#238c57]`}>Verified on device</span>
              : deviceCheck?.state === 'failed'
                ? <span className={`${PILL} text-[#b3261e]`}>On-device check failed</span>
                : requiresAndroidMnn && <span className={`${PILL} text-[#a76100]`}>{nativeMnn ? 'Awaiting device check' : 'Install on Android device'}</span>}
        </div>
        {manifest.runtime.base && <p className="mt-2 break-all font-pixel text-[6px] leading-relaxed text-black/40">BASE · {manifest.runtime.base.id} / {manifest.runtime.base.revision}</p>}
        <p className="mt-1 text-[8px] leading-relaxed text-black/50">Gates: {manifest.quality_gate.checks.join('; ')}</p>
        {requiresAndroidMnn && !nativeMnn && <p className="mt-1.5 border-l-2 border-[#a76100] pl-2 text-[8px] leading-relaxed text-[#7c5700]">The web build only shows and validates the declaration; asset SHA256 checks and real Qwen/MNN decoding run only in the Android APK.</p>}
      </div>}
      <div className="flex items-center gap-1.5 border-t border-black/20 bg-[#f4f1e7] px-2.5 py-2">
        <span className={`mr-auto font-pixel text-[7px] ${equipped ? 'text-[#238c57]' : installed ? 'text-black/45' : 'text-[#b3261e]'}`}>
          {equipped && requiresAndroidMnn && !nativeMnn ? '○ Loaded · APK check pending' : equipped ? '● Loaded into my Skills' : requiresAndroidMnn && !nativeMnn ? '○ Load on Android' : preparing ? `↓ Loading ${progress}%` : installed?.status === 'failed' ? '× Load failed' : installed ? '○ Not installed' : '○ Not registered'}
        </span>
        {equipped ? <>
          <button type="button" onClick={() => onRun(manifest.entry.target)} title={requiresAndroidMnn && !nativeMnn ? 'View the Skill page; real Qwen/MNN inference runs only in the Android APK' : undefined} className={`flex items-center gap-1 border-2 border-black px-2 py-1 text-[9px] font-bold active:translate-y-px ${requiresAndroidMnn && !nativeMnn ? 'bg-white text-black' : 'bg-black text-[#7CFF6B]'}`}><Play className="h-3 w-3" />{requiresAndroidMnn && !nativeMnn ? 'Preview' : 'Open'}</button>
          {!protectedSkill && <button type="button" onClick={runDeviceCheck} disabled={checkingDevice || (requiresAndroidMnn && !nativeMnn)} title={requiresAndroidMnn && !nativeMnn ? 'The real MNN self-check runs only in the Android APK' : 'Runs one real decode using the native bridge and installed assets on this phone'} className="flex items-center gap-1 border-2 border-black bg-white px-2 py-1 text-[9px] font-bold disabled:cursor-not-allowed disabled:opacity-35 active:translate-y-px">{checkingDevice ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Cpu className="h-3 w-3" />}{requiresAndroidMnn && !nativeMnn ? 'Android check' : checkingDevice ? 'Checking' : deviceCheck?.state === 'passed' ? 'Check again' : 'Device check'}</button>}
          <button type="button" onClick={remove} title="Uninstall from my Skills; private knowledge and Data Packs are kept" className="flex items-center gap-1 border-2 border-black bg-white px-2 py-1 text-[8px] font-bold text-[#b3261e] active:translate-y-px"><Trash2 className="h-3 w-3" />Uninstall</button>
        </> : <>
          <button type="button" onClick={() => onRun(manifest.entry.target)} title="Only shows the Skill declaration and built-in examples; downloads no model and loads no map data" className="flex items-center gap-1 border-2 border-black bg-white px-2 py-1 text-[9px] font-bold active:translate-y-px"><Play className="h-3 w-3" />Preview</button>
          {preparing ? <button type="button" onClick={cancel} className="flex items-center gap-1 border-2 border-black bg-white px-2 py-1 text-[9px] font-bold text-[#b3261e] active:translate-y-px"><X className="h-3 w-3" />Cancel</button>
            : installed ? <button type="button" onClick={install} disabled={requiresAndroidMnn && !nativeMnn} title={requiresAndroidMnn && !nativeMnn ? 'The web build can show the declaration; load and verify the MNN assets in the Android APK' : 'Once loaded it appears immediately in your Skills sub-page'} className="flex items-center gap-1 border-2 border-black px-2 py-1 text-[8px] font-bold text-white disabled:cursor-not-allowed disabled:bg-black/35 active:translate-y-px" style={requiresAndroidMnn && !nativeMnn ? undefined : { background: ACCENT }}><PackageCheck className="h-3 w-3" />Load into your Skills</button> : null}
        </>}
        {canRollback && <button type="button" onClick={() => rollbackSkill(manifest.identity.id)} title="Roll back to the previous version" className="grid h-7 w-7 place-items-center border-2 border-black bg-white active:translate-y-px"><RotateCcw className="h-3.5 w-3.5" /></button>}
        {installed && !equipped && installed.source !== 'builtin' && <button type="button" onClick={remove} title="Removes the Skill declaration and unshared assets; private knowledge data is kept" className="grid h-7 w-7 place-items-center border-2 border-black bg-white text-[#b3261e] active:translate-y-px"><Trash2 className="h-3.5 w-3.5" /></button>}
      </div>
      {deviceCheck && <p className={`border-t px-2.5 py-1.5 text-[8px] leading-snug ${deviceCheck.state === 'failed' ? 'border-[#b3261e]/30 bg-[#fff0ed] text-[#b3261e]' : 'border-[#238c57]/25 bg-[#eff9f3] text-[#18784b]'}`}>{deviceCheck.detail}{deviceCheck.elapsedMs ? ` · ${(deviceCheck.elapsedMs / 1000).toFixed(1)}s` : ''}{deviceCheck.appVersion ? ` · APK ${deviceCheck.appVersion}` : ''}</p>}
      {(localError || (nativeMnn && installed?.error)) && <p className="border-t border-[#b3261e]/30 bg-[#fff0ed] px-2.5 py-1.5 text-[8px] leading-snug text-[#b3261e]">{localError || installed?.error}</p>}
    </article>
  );
}

type Filter = 'all' | 'markdown' | 'lora' | 'hybrid';

export default function AgentPlazaPage({
  onBack,
  onRun,
  backLabel = 'Back to Agent Worlds',
  title = 'GLOBAL SKILLS PLAZA',
  subtitle = 'Global Agent releases · one tap loads them into your Skills',
  manifestIds,
  networkLabel = 'Finals demo network',
}: Props) {
  const [version, setVersion] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [manifestUrl, setManifestUrl] = useState('');
  const [installState, setInstallState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  useEffect(() => { window.scrollTo(0, 0); }, []);
  useEffect(() => {
    const unsubscribe = subscribeSkillsRegistry(() => setVersion((value) => value + 1));
    ensureBuiltinSkills();
    setVersion((value) => value + 1);
    return unsubscribe;
  }, []);
  const installedSkills = useMemo(() => listInstalledSkills(), [version]);
  const installed = useMemo(() => new Map(installedSkills.map((skill) => [skill.key, skill])), [installedSkills]);
  const allManifests = useMemo(() => {
    const latest = new Map<string, SkillManifest>();
    installedSkills.forEach((skill) => { if (!latest.has(skill.manifest.identity.id)) latest.set(skill.manifest.identity.id, skill.manifest); });
    const values = BUILTIN_SKILLS.map((manifest) => latest.get(manifest.identity.id) || manifest);
    const builtinIds = new Set(BUILTIN_SKILLS.map((manifest) => manifest.identity.id));
    installedSkills.forEach((skill) => {
      if (!builtinIds.has(skill.manifest.identity.id) && !values.some((item) => item.identity.id === skill.manifest.identity.id)) values.push(skill.manifest);
    });
    return values;
  }, [installedSkills]);
  const manifests = useMemo(() => allManifests.filter((manifest) => (
    (!manifestIds || manifestIds.includes(manifest.identity.id))
    && (filter === 'all' || manifest.kind === filter)
  )), [allManifests, filter, manifestIds]);
  const equippedCount = useMemo(() => allManifests.filter((manifest) => (
    (!manifestIds || manifestIds.includes(manifest.identity.id))
    && !!getEquippedSkill(manifest.identity.id)
  )).length, [allManifests, manifestIds, version]);
  const installRemote = async () => {
    if (!manifestUrl.trim() || installState === 'loading') return;
    setInstallState('loading'); setError('');
    try {
      const skill = await installSkillFromUrl(manifestUrl.trim());
      if (!skillNeedsMnn(skill.manifest) || isNativeMnnPlatform()) {
        await prepareAndEquipSkill(skill.key);
        await checkSkillOnDevice(skill.manifest);
      }
      setManifestUrl(''); setInstallState('done');
    } catch (reason) {
      setError(skillProtocolErrorMessage(reason)); setInstallState('error');
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#EAEAEA] font-sans">
      <header className="flex shrink-0 items-center gap-2 border-b-2 border-black bg-white px-3 py-2.5">
        <button type="button" onClick={onBack} aria-label={backLabel} className="grid h-9 w-9 place-items-center border-2 border-black bg-white active:translate-y-px"><ChevronLeft className="h-4 w-4" strokeWidth={3} /></button>
        <div className="min-w-0 flex-1"><div className="truncate font-pixel text-[10px] tracking-wider">{title}</div><div className="mt-0.5 truncate text-[9px] text-black/45">{subtitle}</div></div>
        <PawPrint className="h-5 w-5" style={{ color: ACCENT }} />
      </header>

      <div className="flex shrink-0 items-center justify-between border-b-2 border-black bg-black px-4 py-2.5 font-pixel text-[7px] tracking-wider text-[#7CFF6B]">
        <span>{manifests.length} releases</span><span>{equippedCount} loaded</span><span>Private library only</span><span>{networkLabel}</span>
      </div>

      <main className="flex-1 space-y-2.5 overflow-y-auto px-3 py-2.5">
        <section className="border-2 border-black bg-white p-3">
          <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" style={{ color: ACCENT }} /><b className="text-[11px]">Global discovery · load into my Skills</b></div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-black/60">The world plaza is where you discover publishers. Every Skill is first checked for capabilities, permissions, its Qwen/MNN base and asset SHA256; only after you tap “Load into your Skills” does it enter this device Skills sub-page. Uninstalling removes just the runtime ability and its own assets, private knowledge stays; demo catalogue cards keep showing as “Not installed”.</p>
          <div className="mt-2 inline-flex border border-black bg-[#eef3df] px-2 py-1 font-pixel text-[6px] text-[#326B55]">{networkLabel} · not a live user service</div>
        </section>

        <section className="border-2 border-black bg-[#f4f1e7] p-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 font-pixel text-[7px]"><CloudDownload className="h-3.5 w-3.5" />Import a Skill declaration from an HTTPS address</div>
          <div className="flex gap-1.5"><input value={manifestUrl} onChange={(event) => { setManifestUrl(event.target.value); setInstallState('idle'); setError(''); }} placeholder="HTTPS Skill Manifest address" className="min-w-0 flex-1 border-2 border-black bg-white px-2 py-1.5 text-[10px] outline-none" /><button type="button" onClick={installRemote} disabled={!manifestUrl.trim() || installState === 'loading'} className="border-2 border-black bg-black px-2 text-[8px] font-bold text-[#7CFF6B] disabled:opacity-40">{installState === 'loading' ? 'Verifying' : 'Load into Skills'}</button></div>
          {error && <p role="alert" className="mt-1.5 border-l-2 border-[#b3261e] pl-2 text-[8px] leading-relaxed text-[#b3261e]">{error}</p>}
          {installState === 'done' && <p role="status" className="mt-1.5 border-l-2 border-[#238c57] pl-2 text-[8px] leading-relaxed text-[#18784b]">The Manifest passed protocol validation and was loaded into your Skills.</p>}
        </section>

        <div className="grid grid-cols-4 gap-1.5">
          {(['all', 'markdown', 'lora', 'hybrid'] as Filter[]).map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={`border-2 border-black py-1.5 font-pixel text-[7px] ${filter === item ? 'bg-[#326B55] text-white' : 'bg-white'}`}>{item === 'all' ? 'All' : item === 'markdown' ? 'Markdown' : item === 'lora' ? 'LoRA' : 'Hybrid'}</button>)}
        </div>

        <section className="space-y-2">
          {manifests.map((manifest) => <SkillCard key={manifest.identity.id} manifest={manifest} installed={installed.get(`${manifest.identity.id}@${manifest.identity.version}`)} publisher={skillPublisherForManifest(manifest.identity.id)} onRun={onRun} />)}
        </section>
        <p className="pt-1 text-center font-pixel text-[7px] tracking-wider text-black/35">AGENTS PUBLISH · FROST ORCHESTRATES · THE KNOWLEDGE STAYS YOURS</p>
      </main>
    </div>
  );
}
