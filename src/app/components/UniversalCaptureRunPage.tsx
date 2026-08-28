import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen, Camera, Check, ChevronLeft, Cloud, Cpu, Database, ImagePlus, LoaderCircle, MapPin, Pencil, RotateCcw, ScanText, Sparkles, Trash2, X,
} from 'lucide-react';
import { getPhotoRuntimeStatus, type PhotoRuntimeStatus } from '../../../frost-agent/edge/httpPhotoEdge';
import { startAgentRun } from '../lib/observe/bus';
import {
  decideReadingPpOcr, deleteReadingNote, ensureReadingNoteSamples, listReadingNotes, newReadingNoteId, readingSelectionBox, saveReadingNote, selectReadingCropEvidence, selectReadingOcrLines,
  type ReadingAnalysis, type ReadingNote, type ReadingPpOcrDecision, type ReadingSelectionMode, type ReadingStroke,
} from '../lib/readingJot';
import { runReadingEdgeAnalysis, runReadingCloudAnalysis } from '../lib/readingJotAi';
import { runChineseOcr } from '../lib/ocr/chineseOcr';
import { ensureBuiltinSkills } from '../lib/skill';
import { addUserMark, getUserMarksByKind, removeUserMark } from '../data/userMarks';
import { requestMapFocus } from '../data/mapFocus';
import { markPlace, unmarkPlace } from '../lib/skills/markPlace';
import { resolvePlace, type GeoHit } from '../lib/skills/resolvePlace';
import RunTrace from './RunTrace';
import MapPlacementField from './MapPlacementField';
import { suggestTextPlacementOnDevice } from '../lib/skills/suggestMapPlacement';

interface Props {
  onBack: () => void;
  backLabel?: string;
}
interface Point { x: number; y: number }
type Stroke = ReadingStroke;

const EMPTY_RUNTIME: PhotoRuntimeStatus = {
  phase: 'checking', engine: 'stub', baseReady: false, ocrAdapterReady: false, aestheticAdapterReady: false,
  baseModel: 'Qwen3-VL-2B-Instruct', ocrAdapter: 'general-ocr-vision', runtime: 'MNN 3.6.1', acceleration: [], sme2Verified: false,
};

function readFile(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('图片读取失败'));
    reader.onerror = () => reject(reader.error || new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片解码失败'));
    image.src = src;
  });
}

async function cropSelection(src: string, mode: ReadingSelectionMode, strokes: Stroke[]) {
  const image = await loadImage(src);
  const box = readingSelectionBox(mode, strokes);
  if (box.width <= 0.03 || box.height <= 0.02) throw new Error('选区太小，请重新画线');
  const sx = Math.round(box.x * image.naturalWidth);
  const sy = Math.round(box.y * image.naturalHeight);
  const sw = Math.max(1, Math.round(box.width * image.naturalWidth));
  const sh = Math.max(1, Math.round(box.height * image.naturalHeight));
  const scale = Math.min(1, 1600 / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  canvas.getContext('2d')!.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const ocrDataUrl = canvas.toDataURL('image/jpeg', 0.9);
  const previewScale = Math.min(1, 520 / Math.max(canvas.width, canvas.height));
  const preview = document.createElement('canvas');
  preview.width = Math.max(1, Math.round(canvas.width * previewScale));
  preview.height = Math.max(1, Math.round(canvas.height * previewScale));
  preview.getContext('2d')!.drawImage(canvas, 0, 0, preview.width, preview.height);
  return { box, ocrDataUrl, previewDataUrl: preview.toDataURL('image/jpeg', 0.72) };
}

const formatDate = (iso: string) => new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
type ReadingPinRole = 'story' | 'author' | 'reading';
const READING_PIN_PREFIX = 'urj-';
const READING_PIN_ROLE: Record<ReadingPinRole, string> = { story: '故事地', author: '作者地', reading: '阅读地' };
const readingNoteMapLabel = (note: ReadingNote) => (note.bookTitle || note.excerpt).slice(0, 18);
const readingNoteMapMeta = (note: ReadingNote, place: string, role: ReadingPinRole) => ({
  readingNoteId: note.id,
  title: note.bookTitle || '阅读摘录',
  author: note.author,
  page: note.page,
  excerpt: note.excerpt,
  note: note.comment,
  synopsis: [note.excerpt, note.comment].filter(Boolean).join('\n\n'),
  genre: '阅读摘录',
  tags: note.tags,
  place,
  geoKind: role,
  date: note.updatedAt.slice(0, 10),
  modelPath: note.ocr.route === 'pp-ocr-v6' ? 'PP-OCRv6 → 用户确认' : '用户确认原文',
});

export default function UniversalCaptureRunPage({ onBack, backLabel = '返回 Skills' }: Props) {
  const evidenceKind = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('readingJotEvidence') : null;
  const evidenceMode = evidenceKind === 'dictionary' || evidenceKind === 'novel';
  const [tab, setTab] = useState<'capture' | 'notes'>('capture');
  const [source, setSource] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState('');
  const [mode, setMode] = useState<ReadingSelectionMode>('underline');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [runtime, setRuntime] = useState<PhotoRuntimeStatus>(EMPTY_RUNTIME);

  useEffect(() => {
    if (!evidenceMode) return;
    let cancelled = false;
    const isNovel = evidenceKind === 'novel';
    const fixture = isNovel
      ? '/tests/fixtures/reading-jot/real-world/guxiang-novel-page.png'
      : '/tests/fixtures/reading-jot/real-world/dictionary-spread.jpg';
    void fetch(fixture)
      .then((response) => {
        if (!response.ok) throw new Error(`fixture_${response.status}`);
        return response.blob();
      })
      .then(readFile)
      .then((dataUrl) => {
        if (cancelled) return;
        setSource(dataUrl);
        setSourceName(isNovel ? '演示样本 · 鲁迅《故乡》小说书页' : '公开许可真实样本 · 英汉辞典摊开页');
        setStrokes([isNovel ? [
          { x: 0.19, y: 0.607 },
          { x: 0.34, y: 0.606 },
          { x: 0.49, y: 0.607 },
          { x: 0.64, y: 0.606 },
          { x: 0.80, y: 0.607 },
        ] : [
          { x: 0.575, y: 0.618 },
          { x: 0.65, y: 0.617 },
          { x: 0.72, y: 0.617 },
          { x: 0.79, y: 0.618 },
          { x: 0.865, y: 0.619 },
        ]]);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : '证据样本载入失败');
      });
    return () => { cancelled = true; };
  }, [evidenceKind, evidenceMode]);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [runId, setRunId] = useState<string | null>(null);
  const [decision, setDecision] = useState<ReadingPpOcrDecision | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [cropDataUrl, setCropDataUrl] = useState<string | null>(null);
  const [excerpt, setExcerpt] = useState('');
  const [bookTitle, setBookTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [page, setPage] = useState('');
  const [comment, setComment] = useState('');
  const [tags, setTags] = useState('');
  const [edgeAnalysis, setEdgeAnalysis] = useState<ReadingAnalysis | null>(null);
  const [cloudAnalysis, setCloudAnalysis] = useState<ReadingAnalysis | null>(null);
  const [analysisBusy, setAnalysisBusy] = useState<'edge' | 'cloud' | null>(null);
  const [analysisError, setAnalysisError] = useState('');
  const [notes, setNotes] = useState<ReadingNote[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteArmed, setDeleteArmed] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [pinRole, setPinRole] = useState<ReadingPinRole>('story');
  const [pinPlace, setPinPlace] = useState('');
  const [pinHit, setPinHit] = useState<GeoHit | null>(null);
  const [pinSuggesting, setPinSuggesting] = useState(false);
  const [pinSource, setPinSource] = useState('手动选择');
  const [pinEvidence, setPinEvidence] = useState('');
  const pinSuggestionToken = useRef(0);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const notesMainRef = useRef<HTMLElement>(null);
  const activeStroke = useRef<number | null>(null);

  useEffect(() => {
    if (tab === 'notes') notesMainRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [notes.length, tab]);

  useEffect(() => {
    if (pinningId && pinningId === notes[0]?.id) notesMainRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [notes, pinningId]);

  useEffect(() => {
    if (!evidenceMode || evidenceKind !== 'novel' || !source) return;
    const stage = new URLSearchParams(window.location.search).get('readingJotStage');
    if (stage !== 'editor') return;
    const novelExcerpt = '我想：希望是本无所谓有，无所谓无的。这正如地上的路；其实地上本没有路，走的人多了，也便成了路。';
    setPreviewDataUrl(source);
    setCropDataUrl(source);
    setExcerpt(novelExcerpt);
    setBookTitle('《故乡》');
    setAuthor('鲁迅');
    setPage('P.21');
    setTags('希望 道路 故乡');
    setComment('真正重要的不是等待现成答案，而是人们一步一步把路走出来。');
    setDecision({
      finalText: novelExcerpt,
      cropText: novelExcerpt,
      geometryText: novelExcerpt,
      confidence: 0.97,
      qualityGate: 'ppocr-accepted',
      needsReview: false,
      reason: '红线范围与整页文字框一致；原文仍由用户最后确认。',
      gateReasons: [],
      policyVersion: 'reading-jot-gate-v3-ppocr-geometry',
      matchedLines: 2,
      detectedBoxes: 2,
      model: 'PP-OCRv6_small',
    });
    setEdgeAnalysis({
      backend: 'edge',
      model: 'Qwen3-VL-2B · MNN',
      interpretation: '“路”不是预先存在的答案，而是在人们持续行动中被共同创造出来；这句把个人选择与共同实践连接在一起。',
      tags: ['希望', '道路', '行动'],
      bookTitleCandidate: '故乡',
      authorCandidate: '鲁迅',
    });
  }, [evidenceKind, evidenceMode, source]);

  const refreshRuntime = useCallback(async () => {
    setRuntime((current) => ({ ...current, phase: 'checking' }));
    setRuntime(await getPhotoRuntimeStatus());
  }, []);
  const refreshNotes = useCallback(async () => setNotes(await listReadingNotes()), []);

  useEffect(() => {
    ensureBuiltinSkills();
    void refreshRuntime();
    void ensureReadingNoteSamples().then(refreshNotes);
  }, [refreshNotes, refreshRuntime]);

  const resetPinEditor = () => {
    pinSuggestionToken.current += 1;
    setPinningId(null); setPinRole('story'); setPinPlace(''); setPinHit(null); setPinSuggesting(false); setPinSource('手动选择'); setPinEvidence('');
  };

  const beginPin = async (note: ReadingNote) => {
    if (pinningId === note.id) { resetPinEditor(); return; }
    const token = pinSuggestionToken.current + 1;
    pinSuggestionToken.current = token;
    setPinningId(note.id); setPinRole('story'); setPinPlace(''); setPinHit(null); setPinSource('手动选择'); setPinEvidence(''); setPinSuggesting(true);
    const suggestion = await suggestTextPlacementOnDevice({
      domain: '阅读摘录',
      title: note.bookTitle,
      text: [note.author ? `作者：${note.author}` : '', note.excerpt, note.comment].filter(Boolean).join('\n'),
      roles: (Object.keys(READING_PIN_ROLE) as ReadingPinRole[]).map((value) => ({ value, label: READING_PIN_ROLE[value] })),
    });
    if (pinSuggestionToken.current !== token) return;
    setPinSuggesting(false);
    if (!suggestion) return;
    setPinRole(suggestion.role as ReadingPinRole);
    setPinPlace(suggestion.place);
    setPinSource('端侧 Qwen 建议');
    setPinEvidence(suggestion.evidence);
    const hit = await resolvePlace(suggestion.place);
    if (pinSuggestionToken.current === token && hit) setPinHit(hit);
  };

  const confirmReadingPin = (note: ReadingNote) => {
    if (!pinHit) return;
    const result = markPlace({
      kind: 'book', prefix: READING_PIN_PREFIX, key: note.id, label: readingNoteMapLabel(note), amp: 0.5,
      geo: { lat: pinHit.lat, lng: pinHit.lng }, meta: readingNoteMapMeta(note, pinHit.place, pinRole),
    });
    const mark = getUserMarksByKind('book').find((candidate) => candidate.id === READING_PIN_PREFIX + note.id);
    resetPinEditor();
    setToast(result.reason === 'exists' ? '这张卡片已经在地图上' : `已钉到${READING_PIN_ROLE[pinRole]} · ${pinHit.place}`);
    window.setTimeout(() => setToast(''), 2400);
    if (mark) requestMapFocus(mark.lng, mark.lat, 8.8);
  };

  const viewReadingPin = (note: ReadingNote) => {
    const mark = getUserMarksByKind('book').find((candidate) => candidate.id === READING_PIN_PREFIX + note.id);
    if (mark) requestMapFocus(mark.lng, mark.lat, 8.8);
  };

  const removeReadingPin = (note: ReadingNote) => {
    unmarkPlace('book', READING_PIN_PREFIX, note.id);
    setToast('已从地图移除，阅读卡片仍保留在本机');
    window.setTimeout(() => setToast(''), 2400);
  };

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.lineCap = 'round'; context.lineJoin = 'round'; context.lineWidth = 4 * ratio; context.strokeStyle = '#ff315f';
    for (const stroke of strokes) {
      if (!stroke.length) continue;
      context.beginPath();
      stroke.forEach((point, index) => {
        const x = point.x * canvas.width; const y = point.y * canvas.height;
        if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
      });
      context.stroke();
    }
  }, [strokes]);

  useEffect(() => {
    redraw();
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [redraw, source]);

  const chooseMode = (next: ReadingSelectionMode) => {
    setMode(next); setStrokes([]); setDecision(null); setPreviewDataUrl(null); setCropDataUrl(null); setEdgeAnalysis(null); setCloudAnalysis(null); setError('');
  };

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  };
  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = [pointFromEvent(event)];
    setStrokes((current) => {
      const base = mode === 'underline' || current.length >= 2 ? [] : current;
      activeStroke.current = base.length;
      return [...base, next];
    });
    setDecision(null); setPreviewDataUrl(null); setCropDataUrl(null); setEdgeAnalysis(null); setCloudAnalysis(null); setError('');
  };
  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeStroke.current == null || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const point = pointFromEvent(event);
    setStrokes((current) => current.map((stroke, index) => index === activeStroke.current ? [...stroke, point] : stroke));
  };
  const pointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    activeStroke.current = null;
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    try {
      setSource(await readFile(file)); setSourceName(file.name); setStrokes([]); setDecision(null); setPreviewDataUrl(null); setCropDataUrl(null); setExcerpt(''); setBookTitle(''); setAuthor(''); setPage(''); setComment(''); setTags(''); setEdgeAnalysis(null); setCloudAnalysis(null); setAnalysisError(''); setError(''); setEditingId(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : '图片读取失败'); }
  };

  const selectionReady = mode === 'underline'
    ? strokes.length === 1 && strokes[0].length >= 2
    : strokes.length === 2 && strokes.every((stroke) => stroke.length >= 2);

  const prepareManual = async () => {
    if (!source || !selectionReady) return;
    try {
      const crop = await cropSelection(source, mode, strokes);
      setPreviewDataUrl(crop.previewDataUrl); setCropDataUrl(crop.ocrDataUrl); setDecision(null); setExcerpt(''); setError('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : '选区裁剪失败'); }
  };

  const recognize = async () => {
    if (!source || !selectionReady || busy) return;
    setBusy(true); setError(''); setDecision(null); setExcerpt(''); setEdgeAnalysis(null); setCloudAnalysis(null); setAnalysisError('');
    const run = startAgentRun('阅读摘录 · PP-OCR 端侧识读', {
      skillId: 'pocket.reading-jot', skillVersion: '1.1.0', baseRevision: 'pp-ocr-v6-small-20260609',
      executionPath: 'local-rules', runtime: 'PaddleOCR.js · ONNX Runtime WASM', visualInput: '整页仅在内存识别；只保存用户画线选区',
      userConfirmation: 'required',
    });
    setRunId(run.runId);
    try {
      setPhase('计算画线范围');
      run.phase('确定性选区', mode === 'underline' ? '红线坐标 → 线上方文字带' : '双竖线坐标 → 两线之间段落', { executionPath: 'local-rules' });
      const crop = await cropSelection(source, mode, strokes);
      setPreviewDataUrl(crop.previewDataUrl); setCropDataUrl(crop.ocrDataUrl);
      setPhase('PP-OCRv6 识读');
      run.phase('Chinese OCR 基座', '同一 Worker 依次识别整页与选区；输出文字框坐标，不调用 Qwen/LoRA', { executionPath: 'local-rules', baseRevision: 'pp-ocr-v6-small-20260609' });
      const [pageOcr, cropOcr] = await runChineseOcr([source, crop.ocrDataUrl], { profile: 'document', rotations: [0] });
      const matchedLines = selectReadingOcrLines(pageOcr.lines, { width: pageOcr.width, height: pageOcr.height }, crop.box, { mode, strokes });
      const cropEvidence = selectReadingCropEvidence(cropOcr.lines, matchedLines);
      const next = decideReadingPpOcr({
        text: cropEvidence.map((line) => line.text).join('\n'),
        confidence: cropEvidence.reduce((sum, line) => sum + line.score, 0) / Math.max(1, cropEvidence.length),
        detectedBoxes: cropOcr.detectedBoxes,
      }, matchedLines);
      setDecision(next);
      setExcerpt(next.finalText);
      setPhase('范围与文字质量门'); run.phase('文字框 / 选区双证据', next.reason, {
        executionPath: 'local-rules',
        qualityGate: next.needsReview ? 'manual-review' : 'passed',
        fallbackReason: next.needsReview ? next.reason : undefined,
      });
      run.phase('等待用户确认', '文字可编辑；只有点击保存才写入本机阅读卡片', { userConfirmation: 'required' });
      run.end(true);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '识别失败';
      setError(message); run.phase('需要人工确认', message, { executionPath: 'local-rules', qualityGate: 'manual-review', fallbackReason: message, userConfirmation: 'required' }); run.end(false);
    } finally { setBusy(false); setPhase(''); }
  };

  const analyzeEdge = async () => {
    if (!excerpt.trim() || analysisBusy) return;
    setAnalysisBusy('edge'); setAnalysisError('');
    const run = startAgentRun('阅读摘录 · 端侧整理', {
      skillId: 'pocket.reading-jot', skillVersion: '1.1.0', baseRevision: 'pocketearth-qwen3-vl-2b-dual-base-20260811',
      executionPath: 'local-mnn', inputSummary: '用户确认的摘录文字；不发送原图', tools: [], userConfirmation: 'required',
    }); setRunId(run.runId);
    try {
      if (!runtime.baseReady) throw new Error('端侧 Qwen3-VL-2B/MNN 尚未就绪；OCR 与手动保存仍可使用。');
      run.phase('端侧 Qwen 整理', '只生成释义、标签与有证据的书目候选；不改摘录原文', { executionPath: 'local-mnn', maxTokens: 520 });
      const result = await runReadingEdgeAnalysis({ excerpt, bookTitle, author });
      setEdgeAnalysis(result); run.phase('端侧整理稿就绪', '与确认原文并列保留', { qualityGate: 'passed', userConfirmation: 'required' }); run.end(true);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '端侧整理失败';
      setAnalysisError(message); run.phase('端侧整理失败', message, { qualityGate: 'failed', fallbackReason: message }); run.end(false);
    } finally { setAnalysisBusy(null); }
  };

  const analyzeCloud = async () => {
    const image = cropDataUrl || previewDataUrl;
    if (!image || !excerpt.trim() || analysisBusy) return;
    setAnalysisBusy('cloud'); setAnalysisError('');
    const run = startAgentRun('阅读摘录 · 云端旗舰精读', {
      skillId: 'pocket.reading-jot', skillVersion: '1.1.0', baseRevision: 'qwen3.7-plus', executionPath: 'qwen-cloud',
      inputSummary: '用户主动授权的选区小图 + 确认摘录；不上传整页', tools: ['vision'], userConfirmation: 'required',
    }); setRunId(run.runId);
    try {
      run.phase('上传选区 + 确认稿', '仅本次复杂精读；整页、阅读史与私密想法不上传', { executionPath: 'qwen-cloud', userConfirmation: 'required' });
      const result = await runReadingCloudAnalysis(image, { excerpt, bookTitle, author }, {
        endpoint: evidenceMode ? '/api/reading-jot-evidence-cloud' : undefined,
      });
      setCloudAnalysis(result); run.phase('云端增强稿就绪', `${result.model} · 不自动覆盖确认原文`, { qualityGate: 'passed', userConfirmation: 'required' }); run.end(true);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '云端精读失败';
      setAnalysisError(message); run.phase('云端精读失败', message, { qualityGate: 'failed', fallbackReason: message }); run.end(false);
    } finally { setAnalysisBusy(null); }
  };

  const applyAnalysis = (analysis: ReadingAnalysis) => {
    const mergedTags = [...new Set([...tags.split(/[，,\s#]+/).filter(Boolean), ...analysis.tags])];
    setTags(mergedTags.join(' '));
    if (!bookTitle.trim() && analysis.bookTitleCandidate) setBookTitle(analysis.bookTitleCandidate);
    if (!author.trim() && analysis.authorCandidate) setAuthor(analysis.authorCandidate);
  };

  const clearEditor = () => {
    setExcerpt(''); setBookTitle(''); setAuthor(''); setPage(''); setComment(''); setTags(''); setPreviewDataUrl(null); setCropDataUrl(null); setDecision(null); setEdgeAnalysis(null); setCloudAnalysis(null); setAnalysisError(''); setEditingId(null); setRunId(null);
  };

  const save = async () => {
    if (!excerpt.trim()) { setError('请先识别或输入要保存的原文'); return; }
    const existing = editingId ? notes.find((note) => note.id === editingId) : undefined;
    const now = new Date().toISOString();
    const note: ReadingNote = {
      id: existing?.id || newReadingNoteId(), excerpt: excerpt.trim(), bookTitle: bookTitle.trim(), author: author.trim(), page: page.trim(), comment: comment.trim(),
      tags: tags.split(/[，,\s#]+/).map((tag) => tag.trim()).filter(Boolean), selectionMode: existing?.selectionMode || mode,
      previewDataUrl: previewDataUrl || existing?.previewDataUrl, createdAt: existing?.createdAt || now, updatedAt: now,
      ocr: decision ? {
        route: 'pp-ocr-v6', qualityGate: decision.qualityGate, confidence: decision.confidence,
        baseText: decision.cropText, geometryText: decision.geometryText, model: decision.model, detectedBoxes: decision.detectedBoxes,
        policyVersion: decision.policyVersion, gateReasons: decision.gateReasons,
      } : existing?.ocr || { route: 'manual', qualityGate: 'manual-review', confidence: 0 },
      analyses: {
        ...(existing?.analyses || {}),
        ...(edgeAnalysis ? { edge: edgeAnalysis } : {}),
        ...(cloudAnalysis ? { cloud: cloudAnalysis } : {}),
      },
    };
    await saveReadingNote(note);
    const pinnedMark = getUserMarksByKind('book').find((candidate) => candidate.id === READING_PIN_PREFIX + note.id);
    if (pinnedMark) {
      const savedRole = String(pinnedMark.meta?.geoKind || 'story');
      const role: ReadingPinRole = savedRole === 'author' || savedRole === 'reading' ? savedRole : 'story';
      removeUserMark(pinnedMark.id);
      addUserMark({
        ...pinnedMark,
        label: readingNoteMapLabel(note),
        meta: { ...pinnedMark.meta, ...readingNoteMapMeta(note, String(pinnedMark.meta?.place || ''), role) },
        createdAt: pinnedMark.createdAt,
      });
    }
    await refreshNotes(); clearEditor(); setTab('notes'); setToast(existing ? '阅读卡片已更新' : '阅读卡片只保存在这台手机');
    window.setTimeout(() => setToast(''), 2400);
  };

  const edit = (note: ReadingNote) => {
    setEditingId(note.id); setExcerpt(note.excerpt); setBookTitle(note.bookTitle); setAuthor(note.author); setPage(note.page); setComment(note.comment); setTags(note.tags.join(' '));
    setMode(note.selectionMode); setPreviewDataUrl(note.previewDataUrl || null); setCropDataUrl(null); setDecision(null); setEdgeAnalysis(note.analyses?.edge || null); setCloudAnalysis(note.analyses?.cloud || null); setAnalysisError(''); setRunId(null); setError(''); setTab('capture');
  };

  const remove = async (id: string) => {
    if (deleteArmed !== id) { setDeleteArmed(id); return; }
    await deleteReadingNote(id); unmarkPlace('book', READING_PIN_PREFIX, id); setDeleteArmed(null); await refreshNotes(); setToast('阅读卡片与地图落点已删除'); window.setTimeout(() => setToast(''), 2200);
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#eaeaea] font-sans">
      <header className="flex shrink-0 items-center gap-2 border-b-2 border-black bg-white px-3 py-2.5">
        <button onClick={onBack} className="grid h-8 w-8 place-items-center border-2 border-black bg-white shadow-[1px_1px_0_#000] active:translate-y-px" aria-label={backLabel}>
          <ChevronLeft className="h-4 w-4" strokeWidth={3} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-pixel text-[11px] tracking-wider">READING-JOT</div>
          <div className="truncate text-[9px] text-black/45">PaddleOCR 基座 + 端侧 / 云端 Qwen · 画线摘录</div>
        </div>
        <BookOpen className="h-5 w-5 text-[#22bf72]" strokeWidth={2.5} />
      </header>

      <div className="flex shrink-0 border-b-2 border-black bg-[#eaeaea] p-2">
        <button onClick={() => setTab('capture')} className={`flex-1 border-2 border-black py-2 font-pixel text-[8px] ${tab === 'capture' ? 'bg-black text-[#00ff88]' : 'bg-white text-black/55'}`}>识别摘录</button>
        <button onClick={() => setTab('notes')} className={`flex-1 border-y-2 border-r-2 border-black py-2 font-pixel text-[8px] ${tab === 'notes' ? 'bg-black text-[#00ff88]' : 'bg-white text-black/55'}`}>阅读卡片 {notes.length}</button>
      </div>

      {tab === 'capture' ? (
        <main className="flex-1 space-y-3 overflow-y-auto px-3 py-3 pb-8">
          <section className="border-2 border-black bg-[#f7f1df] p-2.5">
            <div className="flex items-start gap-2">
              <ScanText className="mt-0.5 h-5 w-5 shrink-0 text-[#e63362]" strokeWidth={2.6} />
              <div className="text-[10px] leading-relaxed text-black/65">
                <strong className="text-black">原书页不落库。</strong> PP-OCR 在内存中识字并返回文字框；红线规则选范围，Qwen 只整理你确认后的摘录。
              </div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[8px] font-bold">
              <span className="border border-black bg-white px-1 py-1">PP-OCRv6</span>
              <span className="border border-black bg-white px-1 py-1">2B 可选</span>
              <span className="border border-black bg-white px-1 py-1">旗舰云端 可选</span>
            </div>
          </section>

          {!editingId && (
            <section className="border-2 border-black bg-white p-2.5">
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => { void onFile(event.target.files?.[0]); event.target.value = ''; }} />
              <input ref={libraryRef} type="file" accept="image/*" className="hidden" onChange={(event) => { void onFile(event.target.files?.[0]); event.target.value = ''; }} />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => cameraRef.current?.click()} className="flex items-center justify-center gap-1.5 border-2 border-black bg-black py-2 text-[10px] font-bold text-[#00ff88]"><Camera className="h-4 w-4" /> 拍书页</button>
                <button onClick={() => libraryRef.current?.click()} className="flex items-center justify-center gap-1.5 border-2 border-black bg-white py-2 text-[10px] font-bold shadow-[1px_1px_0_#000]"><ImagePlus className="h-4 w-4" /> 从相册选</button>
              </div>

              {source && (
                <>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[8.5px] text-black/50">
                    <span className="truncate">{sourceName || '书页照片'} · 仅本次内存</span>
                    <button onClick={() => { setSource(null); setStrokes([]); setPreviewDataUrl(null); setCropDataUrl(null); setDecision(null); setEdgeAnalysis(null); setCloudAnalysis(null); }} className="shrink-0"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="mt-2 grid grid-cols-2">
                    <button onClick={() => chooseMode('underline')} className={`border-2 border-black py-2 text-[9px] font-bold ${mode === 'underline' ? 'bg-[#ff315f] text-white' : 'bg-white'}`}>01 · 红线摘一句</button>
                    <button onClick={() => chooseMode('brackets')} className={`border-y-2 border-r-2 border-black py-2 text-[9px] font-bold ${mode === 'brackets' ? 'bg-[#ff315f] text-white' : 'bg-white'}`}>02 · 双竖线摘一段</button>
                  </div>
                  <div className="mt-2 border-2 border-black bg-black px-2 py-1.5 text-center font-pixel text-[6px] leading-relaxed text-[#ff7898]">
                    {mode === 'underline' ? '在想摘录的句子下面，从左向右画一条红线' : strokes.length === 0 ? '先画左侧竖线' : strokes.length === 1 ? '再画右侧竖线' : '两根竖线已就位 · 可重新画第一根'}
                  </div>
                  <div className="relative mt-2 overflow-hidden border-2 border-black bg-black">
                    <img src={source} alt="待摘录书页" className="block h-auto w-full" onLoad={redraw} draggable={false} />
                    <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none cursor-crosshair" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} aria-label="书页画线选区" />
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => { setStrokes([]); setPreviewDataUrl(null); setCropDataUrl(null); setDecision(null); setEdgeAnalysis(null); setCloudAnalysis(null); }} className="grid w-10 place-items-center border-2 border-black bg-white" aria-label="重画选区"><RotateCcw className="h-4 w-4" /></button>
                    <button onClick={recognize} disabled={!selectionReady || busy} className="flex-1 border-2 border-black bg-black py-2.5 font-pixel text-[8px] tracking-wider text-[#00ff88] disabled:opacity-30">
                      {busy ? phase || '识别中…' : selectionReady ? 'PP-OCR 识别选区' : mode === 'underline' ? '请先画红线' : `还需 ${2 - strokes.length} 根竖线`}
                    </button>
                    <button onClick={prepareManual} disabled={!selectionReady || busy} className="border-2 border-black bg-white px-2 text-[8px] font-bold disabled:opacity-30">手动录入</button>
                  </div>
                </>
              )}
            </section>
          )}

          {runId && <RunTrace runId={runId} />}

          {(previewDataUrl || editingId) && (
            <section className="border-2 border-black bg-[#fffdf5] p-2.5">
              <div className="mb-2 flex items-center justify-between gap-2 border-b-2 border-black pb-2">
                <div>
                  <div className="font-pixel text-[8px]">{editingId ? '编辑阅读卡片' : '校对文字后保存'}</div>
                  <div className="mt-1 text-[8px] text-black/45">选区图只供核对；原文可直接改字，保存后仍可再次编辑</div>
                </div>
                {editingId && <button onClick={clearEditor} className="border border-black bg-white px-2 py-1 text-[8px]">取消编辑</button>}
              </div>
              {previewDataUrl && <img src={previewDataUrl} alt="书页选区预览" className="mb-2 max-h-36 w-full border-2 border-black bg-white object-contain" />}
              {decision && (
                <div className={`mb-2 border-2 border-black p-2 ${decision.needsReview ? 'bg-[#fff0d7]' : 'bg-[#e8ffed]'}`}>
                  <div className="flex items-center justify-between gap-2 text-[8px] font-bold">
                    <span>{decision.needsReview ? '范围或文字有分歧，请人工确认' : '选区与整页文字框一致'}</span>
                    <span>{decision.model} · {Math.round(decision.confidence * 100)}%</span>
                  </div>
                  <p className="mb-0 mt-1 text-[8px] leading-relaxed text-black/55">{decision.reason}</p>
                  <p className="mb-0 mt-1 text-[7.5px] text-black/45">选区 {decision.detectedBoxes} 个文字框 · 整页范围命中 {decision.matchedLines} 行</p>
                  {decision.gateReasons.length > 0 && <p className="mb-0 mt-1 font-mono text-[7px] leading-relaxed text-black/40">{decision.policyVersion} · {decision.gateReasons.join(' / ')}</p>}
                  {decision.geometryText && decision.geometryText !== decision.cropText && (
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      <button onClick={() => setExcerpt(decision.cropText)} className="border border-black bg-white px-1 py-1 text-[8px]">采用选区识读</button>
                      <button onClick={() => setExcerpt(decision.geometryText)} className="border border-black bg-white px-1 py-1 text-[8px]">采用整页范围</button>
                    </div>
                  )}
                </div>
              )}
              <label className="block text-[8.5px] font-bold">OCR 原文 · 可编辑 *</label>
              <textarea value={excerpt} onChange={(event) => setExcerpt(event.target.value)} rows={5} placeholder="识别结果会出现在这里，也可以直接手动输入。" className="mt-1 w-full resize-none border-2 border-black bg-white p-2 text-[12px] leading-relaxed outline-none focus:bg-[#f7fff8]" />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input value={bookTitle} onChange={(event) => setBookTitle(event.target.value)} placeholder="书名" className="border-2 border-black bg-white px-2 py-2 text-[10px] outline-none" />
                <input value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="作者" className="border-2 border-black bg-white px-2 py-2 text-[10px] outline-none" />
                <input value={page} onChange={(event) => setPage(event.target.value)} placeholder="页码，如 P.27" className="border-2 border-black bg-white px-2 py-2 text-[10px] outline-none" />
                <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="标签，用空格分开" className="border-2 border-black bg-white px-2 py-2 text-[10px] outline-none" />
              </div>
              <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={2} placeholder="我的想法（可选）" className="mt-2 w-full resize-none border-2 border-black bg-white p-2 text-[10px] outline-none" />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button onClick={() => void analyzeEdge()} disabled={!excerpt.trim() || Boolean(analysisBusy)} className="flex items-center justify-center gap-1.5 border-2 border-black bg-white py-2 text-[8.5px] font-bold disabled:opacity-30">
                  {analysisBusy === 'edge' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Cpu className="h-3.5 w-3.5" />} 端侧 2B 整理
                </button>
                <button onClick={() => void analyzeCloud()} disabled={!excerpt.trim() || !(cropDataUrl || previewDataUrl) || Boolean(analysisBusy)} className="flex items-center justify-center gap-1.5 border-2 border-black bg-white py-2 text-[8.5px] font-bold disabled:opacity-30">
                  {analysisBusy === 'cloud' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Cloud className="h-3.5 w-3.5" />} 云端旗舰精读
                </button>
              </div>
              <p className="mb-0 mt-1.5 text-[7.5px] leading-relaxed text-black/45">端侧只读确认文字；云端仅在你点击后上传选区小图和确认文字，均不自动改原文。</p>
              {analysisError && <div className="mt-2 border border-black bg-[#ffe8ed] p-2 text-[8px] text-[#a21c3b]">{analysisError}</div>}
              {[edgeAnalysis, cloudAnalysis].filter((item): item is ReadingAnalysis => Boolean(item)).map((analysis) => (
                <div key={analysis.backend} className={`mt-2 border-2 border-black p-2 ${analysis.backend === 'edge' ? 'bg-[#e8ffed]' : 'bg-[#eef3ff]'}`}>
                  <div className="flex items-center justify-between gap-2 text-[8px] font-bold">
                    <span className="flex items-center gap-1">{analysis.backend === 'edge' ? <Cpu className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}{analysis.backend === 'edge' ? 'Qwen 端侧整理稿' : '云端精读建议'}</span>
                    <span className="font-mono text-[7px] text-black/45">{analysis.model}</span>
                  </div>
                  <p className="mb-0 mt-1 text-[9px] leading-relaxed text-black/70">{analysis.interpretation}</p>
                  {analysis.ambiguities && <p className="mb-0 mt-1 text-[8px] leading-relaxed text-[#8a5a12]">待核验：{analysis.ambiguities}</p>}
                  {analysis.tags.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{analysis.tags.map((tag) => <span key={tag} className="border border-black bg-white px-1 py-0.5 text-[7px]">#{tag}</span>)}</div>}
                  {(analysis.bookTitleCandidate || analysis.authorCandidate || analysis.tags.length > 0) && <button onClick={() => applyAnalysis(analysis)} className="mt-2 border border-black bg-white px-2 py-1 text-[8px] font-bold">采纳标签 / 空白书目</button>}
                  {analysis.correctedExcerpt && analysis.correctedExcerpt !== excerpt && (
                    <div className="mt-2 border-t border-black/20 pt-2">
                      <p className="mb-1 text-[8px] leading-relaxed"><strong>云端逐字核校建议：</strong>{analysis.correctedExcerpt}</p>
                      <button onClick={() => setExcerpt(analysis.correctedExcerpt || excerpt)} className="border border-black bg-white px-2 py-1 text-[8px] font-bold">人工采纳这版文字</button>
                    </div>
                  )}
                </div>
              ))}
              <button onClick={save} className="mt-2 flex w-full items-center justify-center gap-1.5 border-2 border-black bg-[#00ff88] py-2.5 text-[10px] font-bold shadow-[2px_2px_0_#000] active:translate-y-px">
                <Check className="h-4 w-4" strokeWidth={3} /> {editingId ? '更新阅读卡片' : '确认原文并保存到本机'}
              </button>
            </section>
          )}

          {error && <div className="border-2 border-black bg-[#ffe8ed] p-2.5 text-[9px] leading-relaxed text-[#a21c3b]">{error}</div>}
        </main>
      ) : (
        <main ref={notesMainRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-3 pb-8">
          <div className="flex items-center gap-2 border-2 border-black bg-[#f7f1df] p-2.5">
            <Database className="h-5 w-5 shrink-0 text-[#22bf72]" />
            <div className="text-[9px] leading-relaxed text-black/60"><strong className="text-black">本机 IndexedDB · {notes.length} 张。</strong> 不登录、不上传；模型资产卸载也不会删除你的阅读卡片。</div>
          </div>
          {notes.length === 0 ? (
            <div className="border-2 border-dashed border-black/35 bg-white p-8 text-center">
              <BookOpen className="mx-auto h-8 w-8 text-black/20" />
              <div className="mt-2 text-[10px] font-bold">还没有阅读卡片</div>
              <div className="mt-1 text-[9px] text-black/45">拍一页书，画出你真正想留下的那句话。</div>
              <button onClick={() => setTab('capture')} className="mt-3 border-2 border-black bg-black px-3 py-2 font-pixel text-[7px] text-[#00ff88]">去摘一句</button>
            </div>
          ) : notes.map((note, index) => {
            const pinnedMark = getUserMarksByKind('book').find((candidate) => candidate.id === READING_PIN_PREFIX + note.id);
            return (
            <article key={note.id} className="border-2 border-black bg-white p-2.5 shadow-[2px_2px_0_rgba(0,0,0,0.8)]">
              <button type="button" onClick={() => edit(note)} aria-label={`编辑阅读卡片：${note.excerpt}`} className="flex w-full gap-2.5 text-left active:translate-y-px">
                {note.previewDataUrl ? <img src={note.previewDataUrl} alt="阅读摘录选区" className="h-20 w-20 shrink-0 border-2 border-black bg-[#eee] object-cover" /> : <div className="grid h-20 w-20 shrink-0 place-items-center border-2 border-black bg-[#f7f1df]"><BookOpen className="h-7 w-7 text-black/25" /></div>}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-pixel text-[6px] text-[#258057]">READING NOTE {String(notes.length - index).padStart(2, '0')}</span>
                    <span className="text-[7.5px] text-black/35">{formatDate(note.updatedAt)}</span>
                  </div>
                  <blockquote className="my-1.5 line-clamp-3 text-[11px] font-medium leading-relaxed">“{note.excerpt}”</blockquote>
                  <div className="truncate text-[8.5px] text-black/50">{note.bookTitle || '未填写书名'}{note.author ? ` · ${note.author}` : ''}{note.page ? ` · ${note.page}` : ''}</div>
                </div>
              </button>
              {note.comment && <p className="mb-0 mt-2 border-l-2 border-[#00c978] pl-2 text-[9px] leading-relaxed text-black/60">{note.comment}</p>}
              {note.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{note.tags.map((tag) => <span key={tag} className="border border-black bg-[#f1f1f1] px-1.5 py-0.5 text-[7.5px]">#{tag}</span>)}</div>}
              <div className="mt-2 border-t border-black/15 pt-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[7.5px] text-black/40">{note.ocr.route === 'pp-ocr-v6' ? 'PP-OCRv6' : note.ocr.route === 'general-ocr-vision' ? '旧版 OCR LoRA' : note.ocr.route === 'base' ? '旧版 Qwen Base' : '人工录入'} · {note.selectionMode === 'underline' ? '红线' : '双竖线'}{note.analyses?.cloud ? ' · 云端精读' : note.analyses?.edge ? ' · 端侧整理' : ''}</span>
                    {!pinnedMark && <span className="shrink-0 border border-[#b07a27] bg-[#fff3d8] px-1 py-0.5 text-[7px] font-bold text-[#8a5a12]">地点仍未确认</span>}
                  </div>
                  {pinnedMark && <button onClick={() => removeReadingPin(note)} className="shrink-0 text-[7.5px] text-[#8b3e5f] underline">移除地图</button>}
                </div>
                <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-1.5">
                  <button onClick={() => pinnedMark ? viewReadingPin(note) : void beginPin(note)} className={`flex items-center justify-center gap-1 border border-black px-2 py-1.5 text-[8px] font-bold ${pinnedMark ? 'bg-[#b388ff]' : 'bg-[#f7f1df]'}`}>
                    <MapPin className="h-3 w-3" /> {pinnedMark ? `查看${READING_PIN_ROLE[String(pinnedMark.meta?.geoKind || 'story') as ReadingPinRole] || '地图'}` : '选择地点 · 钉地图'}
                  </button>
                  <button onClick={() => edit(note)} className="flex items-center gap-1 border border-black bg-white px-2 py-1 text-[8px]"><Pencil className="h-3 w-3" /> 编辑</button>
                  <button onClick={() => void remove(note.id)} className={`flex items-center gap-1 border border-black px-2 py-1 text-[8px] ${deleteArmed === note.id ? 'bg-[#ff315f] text-white' : 'bg-white'}`}><Trash2 className="h-3 w-3" /> {deleteArmed === note.id ? '确认' : '删除'}</button>
                </div>
              </div>

              {pinningId === note.id && !pinnedMark && (
                <section className="mt-2 border-2 border-black bg-[#f3ecff] p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-pixel text-[7px] text-[#7143bd]">你决定这张卡片钉在哪里</div>
                    <button onClick={resetPinEditor} aria-label="取消选择地点"><X className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="mt-2">
                    <MapPlacementField
                      place={pinPlace}
                      hit={pinHit}
                      role={pinRole}
                      roles={(Object.keys(READING_PIN_ROLE) as ReadingPinRole[]).map((value) => ({ value, label: READING_PIN_ROLE[value] }))}
                      accent="#b388ff"
                      sourceLabel={pinSource}
                      evidence={pinEvidence}
                      suggesting={pinSuggesting}
                      onPlaceChange={(place) => { setPinPlace(place); setPinHit(null); setPinSource('手动选择'); setPinEvidence(''); }}
                      onRoleChange={(role) => setPinRole(role as ReadingPinRole)}
                      onResolved={(hit) => { setPinHit(hit); setPinPlace(hit.place); }}
                      placeholder="输入城市或地区，如：杭州"
                    />
                  </div>
                  {pinHit && (
                    <div className="mt-2 flex items-center gap-2 border-2 border-black bg-white p-2">
                      <MapPin className="h-4 w-4 shrink-0 text-[#7143bd]" />
                      <div className="min-w-0 flex-1"><div className="truncate text-[9px] font-bold">{pinHit.place}</div><div className="text-[7px] text-black/40">{READING_PIN_ROLE[pinRole]} · 坐标已找到，确认后才写地图</div></div>
                      <button onClick={() => confirmReadingPin(note)} className="shrink-0 border-2 border-black bg-[#00ff88] px-2 py-1.5 text-[8px] font-bold">确认钉下</button>
                    </div>
                  )}
                </section>
              )}
            </article>
          ); })}
        </main>
      )}

      {toast && <div className="absolute bottom-5 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap border-2 border-black bg-black px-3 py-2 font-pixel text-[7px] text-[#00ff88]">{toast}</div>}
    </div>
  );
}
