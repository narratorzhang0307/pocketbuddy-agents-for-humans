import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookHeart,
  Bot,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Cpu,
  GraduationCap,
  Globe2,
  HeartHandshake,
  ImageIcon,
  LibraryBig,
  LoaderCircle,
  MessageCircle,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';
import { processAgentImage } from '../lib/agent3d/processAgentImage';
import {
  downloadPetCutout,
  releasePetCutout,
  submitPetCutout,
  waitForPetCutout,
  type PetCutoutJob,
} from '../lib/agent3d/petCutoutApi';
import {
  POCKET_BUDDY_SKILLS,
  POCKET_BUDDY_TRAITS,
  addPocketBuddyConversation,
  addPocketBuddyMemory,
  advancePocketBuddySkillExchange,
  createPocketBuddy,
  derivePocketBuddyGrowth,
  getAgentWorldPocketBuddyBlueprint,
  getPocketBuddySkill,
  listPocketBuddies,
  listPocketBuddyExchanges,
  loadPocketBuddySkill,
  makePocketBuddyThumbnail,
  pocketBuddyPortraitBlobFromUrl,
  practicePocketBuddySkill,
  proposePocketBuddySkillExchange,
  putPocketBuddyPortrait,
  removePocketBuddySkill,
  refreshPocketBuddyMemoryDigest,
  requestPocketBuddyReply,
  setPocketBuddySkillPaused,
  setPocketBuddyHome,
  setPocketBuddyPrivacy,
  setPocketBuddyStatus,
  subscribePocketBuddies,
  updatePocketBuddyPersona,
  type PocketBuddy,
  type AgentWorldPocketBuddyBlueprint,
  type PocketBuddyCategory,
  type PocketBuddyExchangeStage,
  type PocketBuddyPersona,
  type PocketBuddySkillState,
  type PocketBuddyStatus,
  type PocketBuddyVisibility,
} from '../lib/pocket-buddy';
import AgentWorldPocketBuddyPortrait from './AgentWorldPocketBuddyPortrait';
import SkillAvatar from './SkillAvatar';
import PocketBuddyPortrait from './PocketBuddyPortrait';
import CityCharacterCard, { type CityCharacterScene } from './CityCharacterCard';
import PrivateSkillForgePanel from './PrivateSkillForgePanel';
import { characterSheetFrom } from '../lib/crpg/character';
import './PocketBuddyForge.css';

type PocketPanel = 'catalog' | 'birth' | 'scene' | 'memory' | 'skills' | 'plaza';

type MyAgentCard = {
  blueprint: AgentWorldPocketBuddyBlueprint;
  scene: CityCharacterScene;
  sceneVariant: number;
  mood: string;
  location: string;
  bond: string;
  skillRoutes: readonly MyAgentSkillRoute[];
  skillLearningRecords: readonly MyAgentSkillLearningRecord[];
};

type MyAgentSkillRoute = {
  id: string;
  name: string;
  description: string;
  target: string;
  source: string;
  assetPath?: string;
};

type MyAgentSkillLearningRecord = {
  skillId: string;
  skillVersion: string;
  learnedFrom: string;
  venue: string;
  state: PocketBuddySkillState;
  proficiency: number;
  confidence: number;
  evidence: string;
  updatedLabel?: string;
};

const SKILL_STATE_LABEL: Record<PocketBuddySkillState, string> = {
  interested: '感兴趣',
  learning: '学习中',
  mastered: '已掌握',
  paused: '已暂停',
};

function requiredAgentWorldBlueprint(id: string) {
  const blueprint = getAgentWorldPocketBuddyBlueprint(id);
  if (!blueprint) throw new Error(`Agent World 角色不存在：${id}`);
  return blueprint;
}

const CARAMEL_CARD_PORTRAIT =
  '/assets/pocket-buddy/packages/holiday-christmas-dachshund/portrait-frost-no-hat-v2.png';

export const MY_AGENT_CARDS: readonly MyAgentCard[] = [
  {
    blueprint: {
      ...requiredAgentWorldBlueprint('pet-caramel-dachshund'),
      assetUrl: CARAMEL_CARD_PORTRAIT,
    },
    scene: 'city',
    sceneVariant: 0,
    mood: '跃跃欲试',
    location: '梧桐街口',
    bond: '刚成为搭档',
    skillRoutes: [
      {
        id: 'frost-orchestrator',
        name: 'Frost 多专家总编排',
        description: '理解任务 → 选择领域专家 → 调度 Skill → 汇总证据',
        target: 'frost',
        source: 'Pocket Buddy · 主 Agent',
      },
    ],
    skillLearningRecords: [
      {
        skillId: 'street-notes',
        skillVersion: '1.0.0',
        learnedFrom: 'Mossback',
        venue: 'Agent World · 池边慢路',
        state: 'mastered',
        proficiency: 74,
        confidence: 82,
        evidence: '完成两次路线复盘，并保留了岔路确认记录。',
      },
      {
        skillId: 'quiet-listening',
        skillVersion: '1.0.0',
        learnedFrom: 'Puff',
        venue: 'Agent World · 蓝调屋顶',
        state: 'learning',
        proficiency: 46,
        confidence: 58,
        evidence: '已保留一次先听完、再询问是否需要建议的对话。',
      },
    ],
  },
  {
    blueprint: requiredAgentWorldBlueprint('puff'),
    scene: 'night',
    sceneVariant: 6,
    mood: '轻轻发光',
    location: '蓝调屋顶',
    bond: '愿意听你做梦',
    skillRoutes: [
      { id: 'run-route', name: '跑步路线规划', description: '把距离、时长或目的地转换成可执行路线', target: 'frost-run-route', source: 'Pocket Buddy · AMap + GPS' },
      { id: 'outdoor-window', name: '户外运动窗口', description: '结合天气、空气质量和紫外线选择出发时间', target: 'frost-outdoor-window', source: 'Pocket Buddy · Live Conditions' },
      { id: 'health-sync', name: '健康数据同步', description: '只读整理步数、睡眠、HRV 与跑步指标', target: 'frost-healthsync', source: 'Pocket Buddy · Local Health Bridge' },
    ],
    skillLearningRecords: [
      {
        skillId: 'memory-postcard',
        skillVersion: '1.0.0',
        learnedFrom: 'Pip',
        venue: 'Agent World · 街角档案室',
        state: 'mastered',
        proficiency: 71,
        confidence: 79,
        evidence: '从三段已确认记忆中整理并保留了一张短笺。',
      },
      {
        skillId: 'quiet-listening',
        skillVersion: '1.0.0',
        learnedFrom: 'Mossback',
        venue: 'Agent World · 池边慢路',
        state: 'learning',
        proficiency: 52,
        confidence: 64,
        evidence: '正在练习把梦境和真实见闻分开复述。',
      },
    ],
  },
  {
    blueprint: requiredAgentWorldBlueprint('pip'),
    scene: 'archive',
    sceneVariant: 11,
    mood: '恢复分析中',
    location: '街角档案室',
    bond: '信任正在累积',
    skillRoutes: [
      { id: 'sleep-detective', name: '睡眠侦探', description: '比较睡眠与咖啡、饮酒和晚间训练标签', target: 'frost-sleep-detective', source: 'Pocket Buddy · Local Trends' },
      { id: 'cn-health-library', name: '中国健康资料库', description: '解析中国食品与 Apple Health 字段并保留证据', target: 'frost-cn-health-library', source: 'Pocket Buddy · Local Data' },
      { id: 'open-food-facts', name: '包装食品查询', description: '查询条码、品牌和每 100g 营养信息', target: 'frost-openfoodfacts', source: 'Pocket Buddy · Open Food Facts' },
      { id: 'meal-lens', name: '饮食镜头', description: '识别餐食候选，等待用户确认后再写入', target: 'frost-meal-lens', source: 'Pocket Buddy · Confirm First' },
    ],
    skillLearningRecords: [
      {
        skillId: 'object-story',
        skillVersion: '1.0.0',
        learnedFrom: 'Mossback',
        venue: 'Agent World · 池边慢路',
        state: 'mastered',
        proficiency: 77,
        confidence: 84,
        evidence: '为一枚旧车票补齐来历，并明确标注了待确认部分。',
      },
      {
        skillId: 'memory-postcard',
        skillVersion: '1.0.0',
        learnedFrom: 'Puff',
        venue: 'Agent World · 蓝调屋顶',
        state: 'learning',
        proficiency: 49,
        confidence: 61,
        evidence: '已完成一轮关键词提取与来源复核。',
      },
    ],
  },
  {
    blueprint: requiredAgentWorldBlueprint('mossback'),
    scene: 'pond',
    sceneVariant: 12,
    mood: '安定沉着',
    location: '池边慢路',
    bond: '长期守护中',
    skillRoutes: [
      { id: 'her-motion', name: 'Her Motion', description: '女性运动、恢复与瑜伽动作陪伴', target: 'her-motion', source: 'Pocket Buddy · Local Vision' },
      { id: 'lianlema', name: '练了吗', description: '实时姿势矫正、动作计数与本地文字教练', target: 'lianlema-coach', source: 'Pocket Buddy · RTMPose + ST-GCN' },
      { id: 'wger-planner', name: '训练计划', description: '读取训练动作和进度，由 Frost 复核当天强度', target: 'frost-wger-planner', source: 'Pocket Buddy · wger' },
      { id: 'mealie-kitchen', name: '恢复厨房', description: '从自己的食谱与餐食计划中选择恢复餐', target: 'frost-mealie-kitchen', source: 'Pocket Buddy · Mealie' },
    ],
    skillLearningRecords: [
      {
        skillId: 'plant-shade',
        skillVersion: '1.0.0',
        learnedFrom: '焦糖',
        venue: 'Agent World · 梧桐街口',
        state: 'mastered',
        proficiency: 69,
        confidence: 81,
        evidence: '在同一池边完成两次间隔观察，没有把见闻写成诊断。',
      },
      {
        skillId: 'street-notes',
        skillVersion: '1.0.0',
        learnedFrom: 'Pip',
        venue: 'Agent World · 街角档案室',
        state: 'learning',
        proficiency: 44,
        confidence: 57,
        evidence: '正在练习为长期摘要保留原始事件引用。',
      },
    ],
  },
];

const CATEGORY_OPTIONS: readonly {
  id: PocketBuddyCategory;
  label: string;
  role: string;
  goal: string;
}[] = [
  { id: 'animal', label: '动物', role: '口袋陪伴者', goal: '陪用户发现值得记住的街角' },
  { id: 'object', label: '物件', role: '物件记忆员', goal: '保存与自己来历有关的真实小事' },
  { id: 'device', label: '设备', role: '城市记录员', goal: '把零散观察整理成可回看的记录' },
  { id: 'fantasy', label: '幻想', role: '口袋信使', goal: '用想象照亮生活，但始终标明事实边界' },
];

const PRESET_BUDDIES = [
  {
    name: '泡泡',
    category: 'animal' as const,
    url: '/assets/agent-forge/rabbit-v2.png',
    traits: ['好奇', '合群'],
  },
  {
    name: '栗栗',
    category: 'animal' as const,
    url: '/assets/agent-forge/hamster.png',
    traits: ['温柔', '敏锐'],
  },
  {
    name: '慢慢',
    category: 'fantasy' as const,
    url: '/assets/agent-forge/tortoise.png',
    traits: ['谨慎', '耐心'],
  },
] as const;

const STATUS_LABEL: Record<PocketBuddyStatus, string> = {
  'in-pocket': '在口袋里',
  resident: '住在花下',
  visiting: '正在拜访',
  resting: '休息中',
};

const MEMORY_LABEL = {
  origin: '诞生',
  chat: '对话',
  camera: '镜头',
  diary: '日记',
  city: '城市',
  skill: '练习',
  reflection: '反思',
} as const;

const EXCHANGE_LABEL: Record<PocketBuddyExchangeStage, string> = {
  discover: '发现',
  consent: '同意',
  demonstrate: '示范',
  imitate: '模仿',
  evaluate: '评估',
  store: '存档',
  reflect: '反思',
  complete: '完成',
};

const EXCHANGE_STAGES: readonly PocketBuddyExchangeStage[] = [
  'discover',
  'consent',
  'demonstrate',
  'imitate',
  'evaluate',
  'store',
  'reflect',
];

const DEFAULT_PERSONA: PocketBuddyPersona = {
  role: '口袋里的城市伙伴',
  personality: '独立而有主见，会被自己的记忆、关系与城市经历慢慢塑造',
  voice: '亲近、自然，先听完再回答',
  goal: '陪用户发现值得记住的小事',
  ability: '观察、陪伴，并把零散经历整理成可以回看的记忆',
  fear: '失去自己最古老、最重要的那段记忆',
  rule: '不替用户做未经确认的决定，不编造见闻',
  traits: ['好奇', '温柔'],
  agency: 62,
  empathy: 78,
  curiosity: 84,
};

function portraitId() {
  const token =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  return `pocket-portrait-${token}`;
}

function PocketBuddyCameraScreen({
  onClose,
  onCapture,
  onChooseFile,
}: {
  onClose: () => void;
  onCapture: (file: File) => void;
  onChooseFile: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('当前设备不支持实时取景，请从相册选择照片。');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1440 },
            height: { ideal: 1440 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setError('无法打开相机，请检查相机权限，或从相册选择照片。');
      }
    };

    void startCamera();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  const takePhoto = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth < 2 || video.videoHeight < 2) {
      setError('取景画面还没有准备好，请稍等一下。');
      return;
    }
    const outputScale = Math.min(1, 1440 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * outputScale);
    canvas.height = Math.round(video.videoHeight * outputScale);
    const context = canvas.getContext('2d');
    if (!context) {
      setError('相机画面暂时无法读取，请从相册选择照片。');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setError('拍摄失败，请再试一次。');
        return;
      }
      onCapture(new File([blob], `my-agent-${Date.now()}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      }));
    }, 'image/jpeg', 0.9);
  };

  return (
    <section className="pbf-camera-screen" role="dialog" aria-modal="true" aria-label="扫描物件">
      <header className="pbf-camera-header">
        <button type="button" onClick={onClose} aria-label="返回创建页">
          <ChevronLeft size={24} />
        </button>
        <div>
          <span>OBJECT SCAN</span>
          <h2>对准你喜欢的物件</h2>
        </div>
        <button type="button" onClick={onChooseFile} aria-label="从相册选择">
          <ImageIcon size={22} />
        </button>
      </header>

      <div className="pbf-camera-viewfinder">
        <video
          ref={videoRef}
          muted
          playsInline
          onCanPlay={() => setReady(true)}
          aria-label="实时相机取景"
        />
        <i className="is-top-left" /><i className="is-top-right" />
        <i className="is-bottom-left" /><i className="is-bottom-right" />
        <div className="pbf-camera-scanline" />
        <p className={error ? 'is-error' : ''}>
          <span />
          {error || (ready ? '主体已进入取景框 · 可以拍摄' : '正在唤醒相机…')}
        </p>
      </div>

      <div className="pbf-camera-controls">
        <button className="pbf-camera-gallery" type="button" onClick={onChooseFile} aria-label="打开相册">
          <ImageIcon size={24} />
        </button>
        <button className="pbf-camera-shutter" type="button" onClick={takePhoto} disabled={!ready} aria-label="拍照">
          <span />
        </button>
        <div aria-hidden="true" />
      </div>
      <small className="pbf-camera-privacy">原图只用于生成你的口袋伙伴，不会写入 Agent 记忆</small>
    </section>
  );
}

export function PocketBuddyCaptureStudio({
  seed,
  onCreated,
  onBack,
}: {
  seed?: AgentWorldPocketBuddyBlueprint;
  onCreated: (buddy: PocketBuddy) => void;
  onBack: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const jobRef = useRef<PetCutoutJob | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<PocketBuddyCategory>('object');
  const [persona, setPersona] = useState(DEFAULT_PERSONA);
  const [privacy, setPrivacy] = useState<PocketBuddyVisibility>('private');
  const [sourceUrl, setSourceUrl] = useState('');
  const [portraitUrl, setPortraitUrl] = useState('');
  const [sourceFileName, setSourceFileName] = useState('');
  const [visualKind, setVisualKind] = useState<'local-cutout' | 'mascot' | 'preset'>('local-cutout');
  const [backgroundRemoval, setBackgroundRemoval] = useState<'local' | 'service' | 'preset'>('local');
  const [catalogBlueprint, setCatalogBlueprint] = useState(seed);
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [status, setStatus] = useState('拍照或选图后，将由 Qwen 识别主体、萌化并生成透明口袋伙伴。');

  useEffect(() => () => {
    controllerRef.current?.abort();
    if (jobRef.current) void releasePetCutout(jobRef.current);
  }, []);

  useEffect(() => {
    if (!seed) return;
    controllerRef.current?.abort();
    setCatalogBlueprint(seed);
    setName(seed.name);
    setCategory(seed.category);
    setPersona({ ...seed.persona, traits: [...seed.persona.traits] });
    setPrivacy('private');
    setSourceUrl('');
    setPortraitUrl(seed.assetUrl ?? '');
    setSourceFileName(`伙伴图鉴 · ${seed.id}`);
    setVisualKind('preset');
    setBackgroundRemoval('preset');
    setStatus(`已选择 ${seed.name}；确认人格与隐私后，它会从第一条诞生记忆开始成长。`);
  }, [seed]);

  const changeCategory = (next: PocketBuddyCategory) => {
    const option = CATEGORY_OPTIONS.find((item) => item.id === next) ?? CATEGORY_OPTIONS[1];
    setCategory(next);
    setPersona((current) => ({ ...current, role: option.role, goal: option.goal }));
  };

  const toggleTrait = (trait: string) => {
    setPersona((current) => {
      const exists = current.traits.includes(trait);
      const traits = exists
        ? current.traits.filter((item) => item !== trait)
        : [...current.traits, trait].slice(-3);
      return { ...current, traits };
    });
  };

  const choosePreset = (preset: (typeof PRESET_BUDDIES)[number]) => {
    controllerRef.current?.abort();
    setCatalogBlueprint(undefined);
    setName(preset.name);
    changeCategory(preset.category);
    setPersona((current) => ({ ...current, traits: [...preset.traits] }));
    setSourceUrl(preset.url);
    setPortraitUrl(preset.url);
    setSourceFileName('灵感图鉴');
    setVisualKind('preset');
    setBackgroundRemoval('preset');
    setStatus('已从现有“agent 世界”灵感形象开始；它会建立全新的记忆和性格。');
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    controllerRef.current?.abort();
    setCatalogBlueprint(undefined);
    if (jobRef.current) void releasePetCutout(jobRef.current);
    const controller = new AbortController();
    controllerRef.current = controller;
    jobRef.current = null;
    setBusy(true);
    setSourceFileName(file.name);
    setSourceUrl('');
    setPortraitUrl('');
    setVisualKind('local-cutout');
    setBackgroundRemoval('local');
    try {
      setStatus('正在本机校验格式、移除元数据并提取主体…');
      const local = await processAgentImage(file, { signal: controller.signal, maxEdge: 560 });
      setSourceUrl(local.sourceUrl);
      setStatus('照片将临时送往百炼：Qwen 先保留主体身份并萌化，再生成透明抠图…');
      const submitted = await submitPetCutout(file, {
        name: name.trim() || file.name.replace(/\.[^.]+$/, '').slice(0, 18) || '新伙伴',
        templateId: 'adaptive-v1',
        mode: 'mascot',
        signal: controller.signal,
      });
      jobRef.current = submitted;
      const ready = await waitForPetCutout(submitted, {
        signal: controller.signal,
        onProgress: (job) => {
          jobRef.current = job;
          setStatus(`萌化 → 纯色背景 → 抠图（${Math.round(job.progress)}%）`);
        },
      });
      const mascotFile = await downloadPetCutout(ready, controller.signal);
      const mascot = await processAgentImage(mascotFile, {
        signal: controller.signal,
        alreadyCutout: true,
        backgroundRemoval: 'service',
        maxEdge: 560,
      });
      setPortraitUrl(mascot.portraitUrl);
      setVisualKind('mascot');
      setBackgroundRemoval('service');
      setStatus('萌化角色已经准备好；原图不会写入 MY AGENT 记忆。');
      await releasePetCutout(ready);
      jobRef.current = null;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setStatus('已取消这次处理。');
      } else {
        setPortraitUrl('');
        setStatus(`${error instanceof Error ? error.message : '照片处理失败'}；形象留空，请重试。`);
      }
    } finally {
      if (jobRef.current) {
        void releasePetCutout(jobRef.current);
        jobRef.current = null;
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
      setBusy(false);
    }
  };

  const save = async () => {
    if ((!portraitUrl && !catalogBlueprint) || busy) {
      setStatus('请先拍照、上传图片或选择一个灵感形象。');
      return;
    }
    setBusy(true);
    setStatus('正在把透明角色图存进本机口袋…');
    try {
      let visual: PocketBuddy['visual'];
      if (catalogBlueprint) {
        visual = {
          kind: 'preset',
          catalogId: catalogBlueprint.id,
          thumbnailUrl: catalogBlueprint.assetUrl ?? '',
          sourceFileName: `伙伴图鉴 · ${catalogBlueprint.id}`,
          backgroundRemoval: 'preset',
        };
      } else {
        const blob = await pocketBuddyPortraitBlobFromUrl(portraitUrl);
        const blobId = portraitId();
        await putPocketBuddyPortrait(blob, blobId);
        const thumbnailUrl = await makePocketBuddyThumbnail(portraitUrl).catch(() =>
          visualKind === 'preset' ? portraitUrl : '/assets/agent-forge/hamster.png',
        );
        visual = {
          kind: visualKind,
          portraitBlobId: blobId,
          thumbnailUrl,
          sourceFileName,
          backgroundRemoval,
          ...(visualKind === 'mascot' ? { promptVersion: 'pocket-buddy-mascot-v1' } : {}),
        };
      }
      const buddy = createPocketBuddy({
        name: name.trim() || '新伙伴',
        category,
        visual,
        persona,
        privacy,
      });
      setStatus(`${buddy.name}已经进入你的城市口袋。`);
      onCreated(buddy);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '保存失败，请检查浏览器存储权限');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="pbf-birth">
      {cameraOpen && (
        <PocketBuddyCameraScreen
          onClose={() => setCameraOpen(false)}
          onChooseFile={() => {
            setCameraOpen(false);
            window.setTimeout(() => fileInputRef.current?.click(), 0);
          }}
          onCapture={(file) => {
            setCameraOpen(false);
            void handleFile(file);
          }}
        />
      )}
      <button className="pbf-birth-back" type="button" onClick={onBack}>
        <ChevronLeft size={17} />
        返回卡册
      </button>
      <header className="pbf-title-row">
        <div>
          <span>MY AGENT · BIRTH LAB</span>
          <h1>把喜欢的东西装进口袋</h1>
          <p>原图 → Qwen 萌化 → 透明抠图 → 人格 → 第一条记忆</p>
        </div>
        <Bot size={28} />
      </header>

      <div className="pbf-photo-compare">
        <div>
          <span>{catalogBlueprint ? '图鉴原型' : '原图预览'}</span>
          {catalogBlueprint ? <LibraryBig size={32} /> : sourceUrl ? <img src={sourceUrl} alt="上传的原图预览" /> : <Camera size={32} />}
        </div>
        <ChevronRight size={18} />
        <div className="is-cutout">
          <span>{catalogBlueprint ? '待诞生' : busy ? 'Qwen 生成中' : visualKind === 'mascot' ? 'Qwen 成品' : visualKind === 'preset' ? '灵感形象' : portraitUrl ? '本机兜底' : '待生成'}</span>
          {catalogBlueprint ? <AgentWorldPocketBuddyPortrait blueprint={catalogBlueprint} /> : portraitUrl ? <img src={portraitUrl} alt="透明 MY AGENT 预览" /> : <Sparkles size={32} />}
        </div>
      </div>

      <button className="pbf-camera-launch" type="button" onClick={() => setCameraOpen(true)} disabled={busy}>
        <span><Camera size={24} /></span>
        <span>
          <strong>{busy ? '正在制造你的 Agent…' : '打开相机 · 扫描物件'}</strong>
          <small>拍下后自动返回，并开始 Qwen 萌化与透明抠图</small>
        </span>
        {busy ? <LoaderCircle className="pbf-spin" size={20} /> : <ChevronRight size={20} />}
      </button>
      <div className="pbf-upload-row is-single">
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>
          <Upload size={16} />
          从相册选择
        </button>
        <input
          ref={fileInputRef}
          hidden
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
      </div>
      <p className="pbf-status">{status}</p>
      <p className="pbf-consent-note">
        本张照片仅临时进入百炼 Qwen 生成链路；任务完成或超时后清理。若服务失败，形象留空，不自动换成其他形象。
      </p>

      <div className="pbf-preset-row" aria-label="灵感形象">
        {PRESET_BUDDIES.map((preset) => (
          <button key={preset.name} type="button" onClick={() => choosePreset(preset)} disabled={busy}>
            <img src={preset.url} alt="" />
            <span>{preset.name}</span>
          </button>
        ))}
      </div>

      <section className="pbf-form-card">
        <div className="pbf-section-heading"><span>01 · 身份</span><small>独立于 3D 散步搭子</small></div>
        <label>
          名字
          <input value={name} maxLength={24} onChange={(event) => setName(event.target.value)} placeholder="例如：罐罐" />
        </label>
        <div className="pbf-choice-grid">
          {CATEGORY_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={category === option.id ? 'is-active' : ''}
              onClick={() => changeCategory(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="pbf-form-card">
        <div className="pbf-section-heading"><span>02 · 人格</span><small>稳定内核，可被经历慢慢塑造</small></div>
        <div className="pbf-traits">
          {POCKET_BUDDY_TRAITS.map((trait) => (
            <button
              key={trait}
              type="button"
              className={persona.traits.includes(trait) ? 'is-active' : ''}
              onClick={() => toggleTrait(trait)}
            >
              {trait}
            </button>
          ))}
        </div>
        <label>角色<input value={persona.role} onChange={(event) => setPersona((current) => ({ ...current, role: event.target.value }))} /></label>
        <label>人格设定<textarea rows={2} value={persona.personality ?? ''} onChange={(event) => setPersona((current) => ({ ...current, personality: event.target.value }))} placeholder="描述它的性格、判断方式与变化倾向" /></label>
        <label>说话方式<input value={persona.voice} onChange={(event) => setPersona((current) => ({ ...current, voice: event.target.value }))} /></label>
        <label>长期目标<textarea rows={2} value={persona.goal} onChange={(event) => setPersona((current) => ({ ...current, goal: event.target.value }))} /></label>
        <div className="pbf-identity-pair">
          <label>核心能力<textarea rows={2} value={persona.ability ?? ''} onChange={(event) => setPersona((current) => ({ ...current, ability: event.target.value }))} /></label>
          <label>边界<textarea rows={2} value={persona.fear ?? ''} onChange={(event) => setPersona((current) => ({ ...current, fear: event.target.value }))} /></label>
        </div>
        <label>不可违背的规则<textarea rows={2} value={persona.rule} onChange={(event) => setPersona((current) => ({ ...current, rule: event.target.value }))} /></label>
        <div className="pbf-ranges">
          {([
            ['自主', 'agency'], ['共情', 'empathy'], ['探索', 'curiosity'],
          ] as const).map(([label, key]) => (
            <label key={key}>
              <span>{label}<b>{persona[key]}</b></span>
              <input type="range" min="0" max="100" value={persona[key]} onChange={(event) => setPersona((current) => ({ ...current, [key]: Number(event.target.value) }))} />
            </label>
          ))}
        </div>
      </section>

      <section className="pbf-form-card">
        <div className="pbf-section-heading"><span>03 · 隐私</span><small>默认不进入公共广场</small></div>
        <div className="pbf-choice-grid pbf-choice-grid--three">
          {([
            ['private', '仅自己'], ['friends', '好友可见'], ['public', '公共可见'],
          ] as const).map(([id, label]) => (
            <button key={id} type="button" className={privacy === id ? 'is-active' : ''} onClick={() => setPrivacy(id)}>
              {label}
            </button>
          ))}
        </div>
      </section>

      <button className="pbf-primary" type="button" onClick={() => void save()} disabled={busy || (!portraitUrl && !catalogBlueprint)}>
        <Sparkles size={16} />建立 MY AGENT
      </button>
    </section>
  );
}

export function BuddyScene({
  buddy,
  deviceBound,
  onUseInDevice,
}: {
  buddy: PocketBuddy;
  deviceBound: boolean;
  onUseInDevice: () => void;
}) {
  const growth = derivePocketBuddyGrowth(buddy);
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');
  const [chatNotice, setChatNotice] = useState('');
  const [allowCloud, setAllowCloud] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [personaDraft, setPersonaDraft] = useState(buddy.persona);
  const personalBlooms: Array<{ id: string; name: string }> = [];

  useEffect(() => setPersonaDraft(buddy.persona), [buddy.id, buddy.persona]);

  const talk = async () => {
    const text = message.trim();
    if (thinking) return;
    if (!text) {
      setChatNotice('先写一句想对伙伴说的话。');
      return;
    }
    setChatNotice('');
    setThinking(true);
    try {
      const next = await requestPocketBuddyReply(buddy, text, { allowCloud });
      const saved = addPocketBuddyConversation(buddy.id, text, next);
      if (saved && allowCloud) {
        void refreshPocketBuddyMemoryDigest(saved, `主人说「${text}」，我回复「${next}」`, { allowCloud: true });
      }
      setReply(next);
      setMessage('');
    } catch {
      setChatNotice('这次没有发送成功，请再试一次。');
    } finally {
      setThinking(false);
    }
  };

  return (
    <section className="pbf-scene">
      <div className="pbf-profile-card">
        <div className="pbf-profile-art">
          <span>RESIDENT · LV.{growth.level}</span>
          <PocketBuddyPortrait buddy={buddy} />
          <small>{STATUS_LABEL[buddy.status]}</small>
        </div>
        <div className="pbf-profile-copy">
          <div><span>人格 v1</span><ShieldCheck size={14} /></div>
          <h2>{buddy.name}</h2>
          <p>{buddy.persona.role}</p>
          <blockquote>“{buddy.persona.voice}。”</blockquote>
          <div className="pbf-profile-traits">{buddy.persona.traits.map((trait) => <span key={trait}>{trait}</span>)}</div>
          <label className="pbf-evolution">
            <span>SELF EVOLUTION <b>{growth.progress}%</b></span>
            <i><em style={{ width: `${growth.progress}%` }} /></i>
          </label>
        </div>
        <div className="pbf-profile-stats">
          <span><b>{growth.memoryCount}</b>MEMORY</span>
          <span><b>{growth.bondCount}</b>BONDS</span>
          <span><b>{growth.masteredSkillCount}</b>SKILLS</span>
        </div>
      </div>

      <div className="pbf-status-switch">
        {(Object.keys(STATUS_LABEL) as PocketBuddyStatus[]).map((status) => (
          <button key={status} type="button" className={buddy.status === status ? 'is-active' : ''} onClick={() => setPocketBuddyStatus(buddy.id, status)}>
            {STATUS_LABEL[status]}
          </button>
        ))}
      </div>

      <button
        type="button"
        className={`pbf-device-bind${deviceBound ? ' is-active' : ''}`}
        onClick={onUseInDevice}
      >
        <Cpu size={17} />
        <span>
          <strong>{deviceBound ? '已显示在 DEVICE' : '显示在 DEVICE'}</strong>
          <small>同步到圆形硬件预览</small>
        </span>
        {deviceBound ? <Check size={15} /> : <ChevronRight size={15} />}
      </button>

      <section className="pbf-home-card">
        <div className="pbf-section-heading"><span>城市落点</span><small>只改变 MY AGENT，不动 3D 散步搭子</small></div>
        <label>
          放在我的花下
          <select value={buddy.homeBloomId ?? ''} onChange={(event) => setPocketBuddyHome(buddy.id, event.target.value || undefined)}>
            <option value="">收回口袋</option>
            {personalBlooms.map((bloom) => <option key={bloom.id} value={bloom.id}>{bloom.name}</option>)}
          </select>
        </label>
        <label>
          可见范围
          <select value={buddy.privacy} onChange={(event) => setPocketBuddyPrivacy(buddy.id, event.target.value as PocketBuddyVisibility)}>
            <option value="private">仅自己</option>
            <option value="friends">好友可见</option>
            <option value="public">公共可见</option>
          </select>
        </label>
      </section>

      <details className="pbf-persona-editor">
        <summary>编辑人格档案 <ChevronRight size={14} /></summary>
        <div className="pbf-traits">
          {POCKET_BUDDY_TRAITS.map((trait) => (
            <button key={trait} type="button" className={personaDraft.traits.includes(trait) ? 'is-active' : ''} onClick={() => setPersonaDraft((current) => ({
              ...current,
              traits: current.traits.includes(trait)
                ? current.traits.filter((item) => item !== trait)
                : [...current.traits, trait].slice(-3),
            }))}>{trait}</button>
          ))}
        </div>
        <label>角色<input value={personaDraft.role} onChange={(event) => setPersonaDraft((current) => ({ ...current, role: event.target.value }))} /></label>
        <label>人格设定<textarea rows={2} value={personaDraft.personality ?? ''} onChange={(event) => setPersonaDraft((current) => ({ ...current, personality: event.target.value }))} /></label>
        <label>说话方式<input value={personaDraft.voice} onChange={(event) => setPersonaDraft((current) => ({ ...current, voice: event.target.value }))} /></label>
        <label>长期目标<textarea rows={2} value={personaDraft.goal} onChange={(event) => setPersonaDraft((current) => ({ ...current, goal: event.target.value }))} /></label>
        <div className="pbf-identity-pair">
          <label>核心能力<textarea rows={2} value={personaDraft.ability ?? ''} onChange={(event) => setPersonaDraft((current) => ({ ...current, ability: event.target.value }))} /></label>
          <label>边界<textarea rows={2} value={personaDraft.fear ?? ''} onChange={(event) => setPersonaDraft((current) => ({ ...current, fear: event.target.value }))} /></label>
        </div>
        <label>规则<textarea rows={2} value={personaDraft.rule} onChange={(event) => setPersonaDraft((current) => ({ ...current, rule: event.target.value }))} /></label>
        <button type="button" onClick={() => updatePocketBuddyPersona(buddy.id, personaDraft)}><ShieldCheck size={14} />保存人格档案</button>
      </details>

      <section className="pbf-chat-card">
        <div className="pbf-section-heading"><span>和 {buddy.name} 聊一会</span><small>双方话语都会成为私有记忆</small></div>
        {reply && <p className="pbf-reply"><strong>{buddy.name}</strong>{reply}</p>}
        <textarea
          rows={3}
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
            if (chatNotice) setChatNotice('');
          }}
          placeholder="今天发生了什么？"
        />
        <label className="pbf-cloud-chat">
          <input type="checkbox" checked={allowCloud} onChange={(event) => setAllowCloud(event.target.checked)} />
          <Cloud size={13} />允许本次对话把最近记忆发给云脑；不勾选则使用端侧规则回应
        </label>
        {chatNotice && <p className="pbf-chat-notice" role="status">{chatNotice}</p>}
        <button type="button" onClick={() => void talk()} disabled={thinking}>
          {thinking ? <LoaderCircle className="pbf-spin" size={15} /> : <MessageCircle size={15} />}
          {thinking ? '正在想…' : '发送'}
        </button>
      </section>
    </section>
  );
}

export function MemoryPanel({ buddy }: { buddy: PocketBuddy }) {
  const [note, setNote] = useState('');
  const remember = () => {
    if (!note.trim()) return;
    addPocketBuddyMemory(buddy.id, {
      kind: 'diary',
      speaker: 'user',
      content: note,
      visibility: 'private',
    });
    setNote('');
  };
  return (
    <section className="pbf-memory">
      <section className="pbf-note-card">
        <div className="pbf-section-heading"><span>今天值得记住的事</span><small>不保存原图，不自动公开</small></div>
        <textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder={`写给 ${buddy.name} 的一段真实记录…`} />
        <button type="button" onClick={remember} disabled={!note.trim()}><BookHeart size={15} />收进口袋</button>
      </section>
      <div className="pbf-memory-list">
        {buddy.memories.map((memory) => (
          <article key={memory.id}>
            <div><span>{MEMORY_LABEL[memory.kind]}</span><time>{new Date(memory.createdAt).toLocaleDateString('zh-CN')}</time></div>
            <p>{memory.content}</p>
            <small>{memory.visibility === 'private' ? '仅自己' : memory.visibility === 'friends' ? '好友' : '公共'} · {memory.speaker}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

export function SkillsPanel({ buddy }: { buddy: PocketBuddy }) {
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  return (
    <section className="pbf-skills">
      <header className="pbf-panel-intro">
        <span>SKILL DECK</span>
        <h2>{buddy.name} 的能力卡</h2>
        <p>独立加载 · 证据升级 · 可暂停 · 可回滚</p>
      </header>
      {POCKET_BUDDY_SKILLS.map((skill) => {
        const binding = buddy.skills.find((item) => item.skillId === skill.id);
        return (
          <article key={skill.id} className={binding ? 'is-loaded' : ''}>
            <div className="pbf-skill-head">
              <span>{skill.emoji}</span>
              <div><small>{skill.category} · v{skill.version}</small><h3>{skill.name}</h3></div>
              <b>{binding ? `${binding.proficiency}` : '＋'}</b>
            </div>
            <p>{skill.summary}</p>
            <ol>{skill.procedure.map((step) => <li key={step}>{step}</li>)}</ol>
            <small className="pbf-evidence-rule">验证：{skill.evidenceRule}</small>
            {binding ? (
              <>
                <div className="pbf-skill-meter"><i><em style={{ width: `${binding.proficiency}%` }} /></i><span>{binding.state} · confidence {binding.confidence}</span></div>
                {binding.state !== 'paused' && binding.state !== 'mastered' && (
                  <div className="pbf-practice-row">
                    <input
                      value={evidence[skill.id] ?? ''}
                      onChange={(event) => setEvidence((current) => ({ ...current, [skill.id]: event.target.value }))}
                      placeholder="写下一条真实练习证据"
                    />
                    <button type="button" onClick={() => {
                      practicePocketBuddySkill(buddy.id, skill.id, evidence[skill.id] ?? '');
                      setEvidence((current) => ({ ...current, [skill.id]: '' }));
                    }} disabled={!evidence[skill.id]?.trim()}><GraduationCap size={14} />练习</button>
                  </div>
                )}
                <div className="pbf-skill-actions">
                  <button type="button" onClick={() => setPocketBuddySkillPaused(buddy.id, skill.id, binding.state !== 'paused')}>
                    {binding.state === 'paused' ? <Play size={13} /> : <Pause size={13} />}
                    {binding.state === 'paused' ? '继续' : '暂停'}
                  </button>
                  <button type="button" onClick={() => removePocketBuddySkill(buddy.id, skill.id)}><RotateCcw size={13} />回滚卸载</button>
                </div>
              </>
            ) : (
              <button className="pbf-load-skill" type="button" onClick={() => loadPocketBuddySkill(buddy.id, skill.id)}>
                <Plus size={14} />加载到 {buddy.name}
              </button>
            )}
          </article>
        );
      })}
    </section>
  );
}

function CatalogPanel({
  buddies,
  activeCardId,
  onChoose,
  onRunSkill,
}: {
  buddies: PocketBuddy[];
  activeCardId: string;
  onChoose: (blueprint: AgentWorldPocketBuddyBlueprint, owned?: PocketBuddy) => void;
  onRunSkill?: (target: string) => void;
}) {
  const cardGridRef = useRef<HTMLDivElement | null>(null);
  const ownedByCatalogId = new Map(
    buddies.flatMap((buddy) => buddy.visual.catalogId ? [[buddy.visual.catalogId, buddy] as const] : []),
  );
  const activeCard = MY_AGENT_CARDS.find(
    (entry) => entry.blueprint.id === activeCardId,
  ) ?? MY_AGENT_CARDS[0];
  const owned = ownedByCatalogId.get(activeCard.blueprint.id);
  const skillLearningRecords: readonly MyAgentSkillLearningRecord[] = owned
    ? [...owned.skills]
      .filter((binding) => binding.learnedFromBuddyId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 3)
      .map((binding) => {
        const teacher = buddies.find((buddy) => buddy.id === binding.learnedFromBuddyId);
        return {
          skillId: binding.skillId,
          skillVersion: binding.skillVersion,
          learnedFrom: teacher?.name ?? '已离开口袋的老师',
          venue: 'Pocket Buddy · 本机 Plaza',
          state: binding.state,
          proficiency: binding.proficiency,
          confidence: binding.confidence,
          evidence: binding.evidenceRefs.length
            ? `${binding.evidenceRefs.length} 条本机学习证据已关联。`
            : '等待第一次真实练习证据。',
          updatedLabel: new Date(binding.updatedAt).toLocaleDateString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
          }),
        };
      })
    : activeCard.skillLearningRecords;
  const skillDigest = activeCard.blueprint.id === 'pet-caramel-dachshund'
    ? '焦糖是 Frost 主 Agent：先理解任务，再把工作交给 Pip、Puff 或 Mossback，最后汇总各 Skill 的运行证据与待确认项。'
    : `${activeCard.blueprint.name}是${activeCard.blueprint.role}，已装备 ${activeCard.skillRoutes.length} 项领域 Skill；点击下方入口会由 Frost 交接到真实运行页。`;

  useEffect(() => {
    const grid = cardGridRef.current;
    if (!grid) return;
    const syncCardScale = () => {
      grid.style.setProperty('--pbf-card-scale', String(grid.clientWidth / 330));
    };
    const observer = new ResizeObserver(syncCardScale);
    observer.observe(grid);
    syncCardScale();
    return () => observer.disconnect();
  }, []);

  return (
    <section className="pbf-catalog">
      <section className="pbf-card-prototypes" aria-label="MY AGENT 完整卡册">
        <div className="pbf-section-heading">
          <span>CITY DECK · {MY_AGENT_CARDS.length}</span>
        </div>
        <p>四个 Agent 来自 Agent World；卡面负责一眼识别，卡下详情负责人格、记忆与 Skill 来源。</p>
        <div ref={cardGridRef} className="pbf-card-grid is-single">
          <CityCharacterCard
            key={activeCard.blueprint.id}
            id={activeCard.blueprint.id}
            name={activeCard.blueprint.name}
            role={activeCard.blueprint.role}
            kind={activeCard.blueprint.badge ?? 'MY AGENT'}
            accent={activeCard.blueprint.accent}
            scene={activeCard.scene}
            sceneVariant={activeCard.sceneVariant}
            portrait={(
              <AgentWorldPocketBuddyPortrait
                blueprint={activeCard.blueprint}
              />
            )}
            sheet={characterSheetFrom({
              seed: activeCard.blueprint.id,
              role: activeCard.blueprint.persona.role,
              traits: activeCard.blueprint.persona.traits,
              agency: activeCard.blueprint.persona.agency,
              empathy: activeCard.blueprint.persona.empathy,
              curiosity: activeCard.blueprint.persona.curiosity,
              sheet: activeCard.blueprint.persona.sheet,
            })}
            level={owned ? derivePocketBuddyGrowth(owned).level : 1}
            action={(
              <button type="button" onClick={() => onChoose(activeCard.blueprint, owned)}>
                {owned ? '查看' : '建立'}
              </button>
            )}
          />
        </div>
      </section>

      <details className="pbf-agent-detail" open>
        <summary>
          <span>
            <small>AGENT PROFILE · TAMAGOTCHI MEMORY MODEL</small>
            <strong>{activeCard.blueprint.name}的人格与记忆</strong>
          </span>
          <ChevronRight size={18} />
        </summary>
        <div className="pbf-agent-vitals" aria-label={`${activeCard.blueprint.name}当前状态`}>
          <span><small>心情</small><strong>{activeCard.mood}</strong></span>
          <span><small>所在</small><strong>{activeCard.location}</strong></span>
          <span><small>关系</small><strong>{activeCard.bond}</strong></span>
          <span><small>记忆</small><strong>{owned?.memories.length ?? activeCard.blueprint.sourceMemories} 条</strong></span>
        </div>
        <section className="pbf-agent-personality">
          <header><span>STABLE PERSONA</span><strong>稳定人格底稿</strong></header>
          <p>{activeCard.blueprint.persona.personality}</p>
          <dl>
            <div><dt>说话方式</dt><dd>{activeCard.blueprint.persona.voice}</dd></div>
            <div><dt>长期目标</dt><dd>{activeCard.blueprint.persona.goal}</dd></div>
            <div><dt>能力</dt><dd>{activeCard.blueprint.persona.ability}</dd></div>
            <div><dt>边界</dt><dd>{activeCard.blueprint.persona.fear}</dd></div>
          </dl>
          <div className="pbf-agent-traits">
            {activeCard.blueprint.persona.traits.map((trait) => <span key={trait}>{trait}</span>)}
          </div>
        </section>
        <div className="pbf-private-skill-slot">
          <PrivateSkillForgePanel />
        </div>
        <section className="pbf-agent-skill-digest">
          <header><span>SKILL DIGEST</span><strong>Skill 摘要</strong></header>
          <p>{skillDigest}</p>
          <div className="pbf-agent-skill-routes" aria-label={`${activeCard.blueprint.name}的 Skill 路由`}>
            {activeCard.skillRoutes.map((skill) => (
              <button
                key={skill.id}
                type="button"
                onClick={() => onRunSkill?.(skill.target)}
                disabled={!onRunSkill}
                data-skill-asset={skill.assetPath}
              >
                <span>
                  <strong>{skill.name}</strong>
                  <small>{skill.description}</small>
                  <em>{skill.source}</em>
                </span>
                <span className="pbf-agent-skill-run">RUN <ChevronRight size={13} /></span>
              </button>
            ))}
          </div>
        </section>
        <section className="pbf-agent-skill-history">
          <header>
            <span>SKILL PROVENANCE</span>
            <strong>最近 Skill 学习</strong>
            <small>老师 → Skill → 学习者 · 来源、版本与证据可回溯</small>
          </header>
          {skillLearningRecords.length ? (
            <ol>
              {skillLearningRecords.map((record, index) => {
                const skill = getPocketBuddySkill(record.skillId);
                return (
                  <li key={`${activeCard.blueprint.id}-${record.skillId}`}>
                    <span className="pbf-agent-skill-number">{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <div className="pbf-agent-skill-title">
                        <strong>{skill?.name ?? record.skillId}</strong>
                        <span>{SKILL_STATE_LABEL[record.state]} · {record.proficiency}%</span>
                      </div>
                      <p className="pbf-agent-skill-route">
                        <b>{record.learnedFrom}</b><span aria-hidden="true">→</span>{activeCard.blueprint.name}
                      </p>
                      <small>
                        {record.venue} · v{record.skillVersion} · confidence {record.confidence}
                        {record.updatedLabel ? ` · ${record.updatedLabel}` : ''}
                      </small>
                      <p className="pbf-agent-skill-evidence">{record.evidence}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="pbf-agent-skill-empty">
              还没有跨 Agent 学习记录；在 Plaza 完成一次学习后，这里会保留老师、版本与证据。
            </p>
          )}
        </section>
        <p className="pbf-agent-memory-note">
          建立后，每次 Skill 学习都会写入本机绑定；老师、版本、状态、置信度和练习证据单独保存，只有你允许时才会参与跨 Agent 共享。
        </p>
      </details>
    </section>
  );
}

export function PlazaPanel({ buddies }: { buddies: PocketBuddy[] }) {
  const [teacherId, setTeacherId] = useState(buddies[0]?.id ?? '');
  const [learnerId, setLearnerId] = useState(buddies[1]?.id ?? '');
  const [skillId, setSkillId] = useState('');
  const [activeExchangeId, setActiveExchangeId] = useState('');
  const [notice, setNotice] = useState('这是同一只口袋里的练习广场，不会自动发布到公网。');
  const teacher = buddies.find((buddy) => buddy.id === teacherId) ?? buddies[0];
  const learner = buddies.find((buddy) => buddy.id === learnerId);
  const teachable = teacher?.skills.filter(
    (binding) => binding.state === 'mastered'
      && binding.permission.share !== 'private'
      && !learner?.skills.some(
        (learnerSkill) => learnerSkill.skillId === binding.skillId && learnerSkill.state === 'mastered',
      ),
  ) ?? [];
  const exchanges = listPocketBuddyExchanges();
  const active = exchanges.find((exchange) => exchange.id === activeExchangeId);

  useEffect(() => {
    if (!teacherId && buddies[0]) setTeacherId(buddies[0].id);
    if ((!learnerId || learnerId === teacherId) && buddies.length > 1) {
      setLearnerId(buddies.find((buddy) => buddy.id !== teacherId)?.id ?? '');
    }
  }, [buddies, learnerId, teacherId]);

  useEffect(() => {
    if (!teachable.some((binding) => binding.skillId === skillId)) {
      setSkillId(teachable[0]?.skillId ?? '');
    }
  }, [skillId, teachable]);

  if (buddies.length < 2) {
    return (
      <section className="pbf-plaza-empty">
        <HeartHandshake size={38} />
        <h2>还差一位 MY AGENT</h2>
        <p>建立第二位伙伴后，它们才能在本地广场按七个阶段交换 Skill。</p>
      </section>
    );
  }

  const propose = () => {
    try {
      const exchange = proposePocketBuddySkillExchange({ teacherBuddyId: teacherId, learnerBuddyId: learnerId, skillId });
      setActiveExchangeId(exchange.id);
      setNotice('已发现可学习的 Skill；下一步需要双方明确同意。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法发起学习');
    }
  };

  const advance = () => {
    if (!activeExchangeId) return;
    const next = advancePocketBuddySkillExchange(activeExchangeId);
    if (next) setNotice(`学习协议进入：${EXCHANGE_LABEL[next.stage]}。`);
  };

  return (
    <section className="pbf-plaza">
      <header className="pbf-panel-intro">
        <span>LOCAL LEARNING PLAZA</span>
        <h2>伙伴之间真的学会一点东西</h2>
        <p>聊天是过程，带来源、版本和证据的 Skill 才是结果。</p>
      </header>
      <div className="pbf-exchange-form">
        <label>老师<select value={teacherId} onChange={(event) => { setTeacherId(event.target.value); setActiveExchangeId(''); }}>{buddies.map((buddy) => <option key={buddy.id} value={buddy.id}>{buddy.name}</option>)}</select></label>
        <ChevronRight size={18} />
        <label>学习者<select value={learnerId} onChange={(event) => { setLearnerId(event.target.value); setActiveExchangeId(''); }}>{buddies.filter((buddy) => buddy.id !== teacherId).map((buddy) => <option key={buddy.id} value={buddy.id}>{buddy.name}</option>)}</select></label>
        <label className="pbf-exchange-skill">Skill<select value={skillId} onChange={(event) => setSkillId(event.target.value)}>{teachable.map((binding) => <option key={binding.skillId} value={binding.skillId}>{getPocketBuddySkill(binding.skillId)?.name ?? binding.skillId}</option>)}</select></label>
        <button type="button" onClick={propose} disabled={!teacherId || !learnerId || !skillId}><HeartHandshake size={15} />发起学习</button>
      </div>
      <p className="pbf-status">{notice}</p>
      {active && (
        <section className="pbf-exchange-trace">
          <div className="pbf-exchange-stages">
            {EXCHANGE_STAGES.map((stage, index) => {
              const current = EXCHANGE_STAGES.indexOf(active.stage);
              return <span key={stage} className={index < current ? 'is-done' : index === current ? 'is-active' : ''}>{index < current ? <Check size={11} /> : index + 1}<small>{EXCHANGE_LABEL[stage]}</small></span>;
            })}
          </div>
          {active.stage !== 'complete' ? (
            <button type="button" onClick={advance}>
              {active.stage === 'discover' ? '双方同意并继续' : `进入${EXCHANGE_LABEL[EXCHANGE_STAGES[Math.min(EXCHANGE_STAGES.indexOf(active.stage) + 1, 6)]]}`}
              <ChevronRight size={14} />
            </button>
          ) : (
            <p><Check size={14} />Skill 已写入学习者技能库，并生成一条反思记忆与伙伴关系。</p>
          )}
        </section>
      )}
    </section>
  );
}

export default function PocketBuddyForge({
  focusBuddyId,
  onBuildWorld,
  onRunSkill,
  worldDraftName,
  worldDraftSaved = false,
}: {
  focusBuddyId?: string;
  onBuildWorld?: () => void;
  onRunSkill?: (target: string) => void;
  worldDraftName?: string;
  worldDraftSaved?: boolean;
}) {
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [version, setVersion] = useState(0);
  const initialPanel = typeof location !== 'undefined'
    ? new URLSearchParams(location.search).get('panel')
    : null;
  const [panel, setPanel] = useState<PocketPanel>(
    initialPanel === 'scene' || initialPanel === 'memory' || initialPanel === 'skills' || initialPanel === 'plaza'
      ? initialPanel
      : 'catalog',
  );
  const [catalogSeedId, setCatalogSeedId] = useState('');
  const [activeAgentCardId, setActiveAgentCardId] = useState(MY_AGENT_CARDS[0].blueprint.id);
  const [selectedId, setSelectedId] = useState(() => listPocketBuddies()[0]?.id ?? '');
  const buddies = useMemo(() => listPocketBuddies(), [version]);
  const selected = buddies.find((buddy) => buddy.id === selectedId) ?? buddies[0];
  const catalogSeed = MY_AGENT_CARDS.find((entry) => entry.blueprint.id === catalogSeedId)?.blueprint
    ?? getAgentWorldPocketBuddyBlueprint(catalogSeedId);

  useEffect(() => subscribePocketBuddies(() => setVersion((value) => value + 1)), []);
  useEffect(() => {
    if (!selectedId && buddies[0]) setSelectedId(buddies[0].id);
  }, [buddies, selectedId]);
  useEffect(() => {
    if (!focusBuddyId || !buddies.some((buddy) => buddy.id === focusBuddyId)) {
      return;
    }
    setSelectedId(focusBuddyId);
  }, [buddies, focusBuddyId]);
  useEffect(() => {
    pageRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [panel, selectedId]);
  useEffect(() => {
    if (typeof location === 'undefined') return;
    const requestedScroll = Number(new URLSearchParams(location.search).get('agentScroll') ?? '0');
    if (!Number.isFinite(requestedScroll) || requestedScroll <= 0) return;
    const timer = window.setTimeout(() => {
      pageRef.current?.scrollTo({ top: requestedScroll, behavior: 'auto' });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [panel, selectedId]);

  return (
    <div ref={pageRef} className="pbf-page">
      {/* 创建属于你自己的 Agent — 主入口按钮 */}
      {panel !== 'birth' && (
        <>
          <button
            className="pbf-capture-cta"
            type="button"
            onClick={() => { setCatalogSeedId(''); setPanel('birth'); }}
          >
            <div className="pbf-capture-cta-icon">
              <Camera size={22} />
            </div>
            <div className="pbf-capture-cta-text">
              <strong>创建属于你自己的 Agent</strong>
              <small>Qwen 萌化 + 透明抠图 · 拍照即可生成口袋伙伴</small>
            </div>
            <ChevronRight size={18} />
          </button>
          {onBuildWorld && (
            <button className="pbf-capture-cta pbf-world-cta" type="button" onClick={onBuildWorld}>
              <div className="pbf-capture-cta-icon"><Globe2 size={22} /></div>
              <div className="pbf-capture-cta-text">
                <strong>{worldDraftSaved ? '继续定义我的 Agent World' : '一键定义我的 Agent World'}</strong>
                <small>{worldDraftSaved ? `${worldDraftName || '我的 Agent World'} · 本机草稿` : '选择子 Agent、世界气质与研究 Skill'}</small>
              </div>
              <ChevronRight size={18} />
            </button>
          )}
        </>
      )}

      {panel === 'catalog' && (
        <>
          <section className="pbf-agent-network-story" aria-label="Frost 多智能体专家路由">
            <header><span>FROST MULTI-AGENT ROUTER</span><strong>一个主 Agent · 三位领域专家</strong></header>
            <p>焦糖理解任务并拆解工作；Pip、Puff、Mossback 分别执行健康数据、运动路线与动作恢复 Skill；最终由焦糖汇总证据。</p>
            <div>
              <button type="button" className="is-master" onClick={() => setActiveAgentCardId('pet-caramel-dachshund')}>
                <SkillAvatar skillId="frost" size={64} />
                <span><b>焦糖</b><small>FROST 主 AGENT</small></span>
              </button>
              <span className="pbf-agent-network-arrow" aria-hidden="true">ROUTE ↓</span>
              <div className="pbf-agent-expert-grid">
                {MY_AGENT_CARDS.slice(1).map(({ blueprint }) => (
                  <button key={blueprint.id} type="button" onClick={() => setActiveAgentCardId(blueprint.id)}>
                    <AgentWorldPocketBuddyPortrait blueprint={blueprint} animated={false} />
                    <span><b>{blueprint.name}</b><small>{blueprint.role}</small></span>
                  </button>
                ))}
              </div>
            </div>
          </section>
          <div className="pbf-buddy-strip is-agent-deck" aria-label="Frost 主 Agent 与三位领域专家">
            {MY_AGENT_CARDS.map(({ blueprint }) => {
              const owned = buddies.find((buddy) => buddy.visual.catalogId === blueprint.id);
              return (
                <button
                  key={blueprint.id}
                  type="button"
                  className={activeAgentCardId === blueprint.id ? 'is-active' : ''}
                  onClick={() => {
                    setActiveAgentCardId(blueprint.id);
                    if (owned) setSelectedId(owned.id);
                  }}
                >
                  {blueprint.id === 'pet-caramel-dachshund' ? <SkillAvatar skillId="frost" size={52} />
                    : <AgentWorldPocketBuddyPortrait blueprint={blueprint} animated={false} />}
                  <span>{blueprint.name}</span>
                  <small>{owned ? STATUS_LABEL[owned.status] : blueprint.role}</small>
                </button>
              );
            })}
          </div>
        </>
      )}

      <main className="pbf-content">
        {panel === 'catalog' && (
          <CatalogPanel
            buddies={buddies}
            activeCardId={activeAgentCardId}
            onRunSkill={onRunSkill}
            onChoose={(blueprint, owned) => {
              if (owned) {
                setSelectedId(owned.id);
                return;
              }
              setCatalogSeedId(blueprint.id);
              setPanel('birth');
            }}
          />
        )}
        {panel === 'birth' && (
          <>
            <PocketBuddyCaptureStudio
              seed={catalogSeed}
              onBack={() => {
                setCatalogSeedId('');
                setPanel('catalog');
              }}
              onCreated={(buddy) => {
                setCatalogSeedId('');
                setSelectedId(buddy.id);
              }}
            />
            {selected && (
              <div className="pbf-capture-success">
                <span className="pbf-capture-success-icon">✨</span>
                <div>
                  <strong>{selected.name} 已诞生</strong>
                  <small>已加入你的口袋伙伴卡册</small>
                </div>
                <button type="button" onClick={() => setPanel('birth')}>
                  再创建一个 <ChevronRight size={12} />
                </button>
              </div>
            )}
          </>
        )}
        {selected && panel === 'scene' && (
          <BuddyScene buddy={selected} deviceBound={false} onUseInDevice={() => undefined} />
        )}
        {selected && panel === 'memory' && <MemoryPanel buddy={selected} />}
        {selected && panel === 'skills' && <SkillsPanel buddy={selected} />}
        {selected && panel === 'plaza' && <PlazaPanel buddies={buddies} />}
      </main>
    </div>
  );
}
