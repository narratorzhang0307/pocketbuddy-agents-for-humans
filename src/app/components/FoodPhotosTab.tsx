import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Check, Plus } from 'lucide-react';
import HealthMemoryPanel from './HealthMemoryPanel';
import { recordConfirmedMeal, type MealCandidate } from '../lib/frostHealthMemory';
import { analyzeFoodPhoto, editedMealCandidate, type PhotoSegmentation } from '../lib/photoHarness';
import PhotoHarnessMasks from './PhotoHarnessMasks';

function localInputTime() { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
async function compactPhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/') || file.size > 15 * 1024 * 1024) throw new Error('请选择 15 MB 以内的图片');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d'); if (!context) throw new Error('无法准备图片');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    // Re-encode pixels so camera EXIF/location are not sent to the cloud.
    return canvas.toDataURL('image/jpeg', 0.78);
  } finally { URL.revokeObjectURL(url); }
}
export default function FoodPhotosTab({ embedded = false }: { embedded?: boolean }) {
  const [tab, setTab] = useState<'photo' | 'memory'>('photo');
  const [image, setImage] = useState('');
  const [candidate, setCandidate] = useState<MealCandidate>();
  const [segmentation, setSegmentation] = useState<PhotoSegmentation>();
  const [portion, setPortion] = useState(1);
  const [at, setAt] = useState(localInputTime);
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [manual, setManual] = useState(false);
  const [title, setTitle] = useState(''), [low, setLow] = useState(''), [high, setHigh] = useState('');
  const file = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null);
  const id = useRef(crypto.randomUUID());
  const request = useRef<AbortController>();
  useEffect(() => () => request.current?.abort(), []);
  const reset = () => {
    request.current?.abort(); id.current = crypto.randomUUID(); setImage(''); setCandidate(undefined); setSegmentation(undefined); setPortion(1);
    setAt(localInputTime()); setNote(''); setNotice(''); setConfirmed(false); setBusy(false); setManual(false); setTitle(''); setLow(''); setHigh('');
  };
  const choose = async (selected?: File) => {
    if (!selected || busy) return;
    reset(); setBusy(true); const selectedId = id.current;
    try { const data = await compactPhoto(selected); if (id.current === selectedId) { setImage(data); setNotice('照片只在本机预览。点击同意后，才发送压缩照片到 Qwen 和阿里云 SAM 服务。Qwen 调用可能计费。'); } }
    catch (error) { setNotice(String(error)); }
    finally { if (id.current === selectedId) setBusy(false); }
  };
  const analyze = async () => {
    if (!image || busy || confirmed) return;
    const selectedId = id.current, controller = new AbortController(); request.current = controller;
    setBusy(true); setCandidate(undefined); setSegmentation(undefined); setManual(false);
    setNotice('正在执行 Qwen 定位 → SAM 像素分割 → Harness 校验。CPU 推理可能需要一两分钟；不会自动记成吃过，也不自动重试。');
    try {
      const result = await analyzeFoodPhoto(image, controller.signal);
      if (selectedId !== id.current) return;
      const value = result.meal; setSegmentation(result.segmentation);
      setCandidate(value); setTitle(value.title); setLow(String(value.calories_kcal_range[0])); setHigh(String(value.calories_kcal_range[1]));
      setNotice('识别候选已返回。请核对菜名、估算范围、实际吃过的比例与时间，再确认。');
    } catch (error) { if (!controller.signal.aborted) setNotice(String(error)); }
    finally { if (selectedId === id.current) setBusy(false); }
  };
  const confirm = async () => {
    if (busy || confirmed || (!candidate && !manual)) return;
    if (!title.trim() || !low.trim() || !high.trim() || !Number.isFinite(Number(low)) || !Number.isFinite(Number(high))
      || Number(low) < 0 || Number(high) < Number(low) || Number(high) > 8000) { setNotice('请填写真实餐食名称与有效热量估算范围；不确定时不要编造数值。'); return; }
    const value = editedMealCandidate(candidate, title, [Number(low), Number(high)]);
    setBusy(true);
    try { await recordConfirmedMeal({ id: id.current, candidate: value, portion, consumedAt: new Date(at).toISOString(), note }); setConfirmed(true); setNotice('已由 Taskmaster 确认并记入对应日期，重复点击不会新增第二餐。今天记忆和下一次建议会更新。'); }
    catch (error) { setNotice(String(error)); }
    finally { setBusy(false); }
  };
  const button = 'flex items-center justify-center gap-1 border-2 border-black bg-white p-2 text-[11px] font-bold disabled:opacity-40';
  return <div className={'h-full bg-[#eaeaea] ' + (embedded ? 'overflow-y-auto' : 'flex flex-col overflow-hidden')}>
    <input ref={file} type="file" accept="image/*" className="hidden" onChange={e => { void choose(e.target.files?.[0]); e.target.value = ''; }} />
    <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { void choose(e.target.files?.[0]); e.target.value = ''; }} />
    <header className="shrink-0 border-b-2 border-black bg-white p-4"><h1 className="font-pixel text-[18px] tracking-wider">PHOTOS</h1><p className="mt-1 text-[11px] text-black/60">看懂一餐，确认记进今天，再交给 Frost 决定</p></header>
    <div className="grid shrink-0 grid-cols-2 gap-2 border-b-2 border-black bg-black p-2">{(['photo', 'memory'] as const).map(value => <button key={value} className={'p-2 text-[12px] ' + (tab === value ? 'bg-[#7cff6b]' : 'bg-white')} onClick={() => setTab(value)}>{value === 'photo' ? '餐食识别' : '今天记忆 / 长期信息'}</button>)}</div>
    <main className={(embedded ? '' : 'min-h-0 flex-1 overflow-y-auto ') + 'space-y-3 p-3 pb-8'}>
      {tab === 'memory' ? <HealthMemoryPanel /> : <>
        <div className="grid grid-cols-2 gap-2"><button className={button} disabled={busy} onClick={() => camera.current?.click()}><Camera size={16} />拍一餐</button><button className={button} disabled={busy} onClick={() => file.current?.click()}><ImagePlus size={16} />从相册选择</button></div>
        {image ? <section className="overflow-hidden border-2 border-black bg-white"><img src={image} alt="本次选择的餐食照片" className="max-h-[300px] w-full object-contain" /><p className="p-2 text-[10px]">本机预览 · 最长边 1024 像素 · 不附带照片定位</p></section>
          : <section className="border-2 border-black bg-[#f5f0e4] p-5 text-[12px]">选择你实际吃过的一餐。没有识别结果前，不展示示例热量作为你的摄入。</section>}
        {image && <button className={button + ' w-full bg-[#7cff6b]'} disabled={busy || confirmed} onClick={() => void analyze()}>{busy ? '处理中…' : '同意识别：Qwen + SAM（Qwen 可能计费）'}</button>}
        {segmentation && <PhotoHarnessMasks key={id.current} image={image} result={segmentation} />}
        {!candidate && <button className={button + ' w-full'} disabled={busy || confirmed} onClick={() => setManual(true)}>不用照片，手动填写已吃过的餐食</button>}
        {(candidate || manual) && <section className="space-y-3 border-2 border-black bg-white p-3 text-[12px]">
          <p className="font-bold">{candidate ? 'Qwen 观察候选 · ' + candidate.model : '手动记录 · 非模型识别'}</p>
          <p className="text-black/60">{candidate?.uncertainty || '请填写你知道的估算范围；不把估算当成精确测量。'}</p>
          <label className="block">餐食名称<input className="mt-1 w-full border border-black p-2" maxLength={100} value={title} disabled={confirmed || busy} onChange={e => {
            setTitle(e.target.value);
            if (candidate && e.target.value.trim() !== candidate.title.trim()) { setLow(''); setHigh(''); setNotice('餐名已修改：请重新填写热量范围，原菜品和营养估算不会沿用。'); }
          }} /></label>
          <div className="grid grid-cols-2 gap-2"><label>整餐估算下限 kcal<input aria-label="热量下限" className="mt-1 w-full border border-black p-2" type="number" min="0" max="8000" value={low} disabled={confirmed || busy} onChange={e => setLow(e.target.value)} /></label>
            <label>整餐估算上限 kcal<input aria-label="热量上限" className="mt-1 w-full border border-black p-2" type="number" min="0" max="8000" value={high} disabled={confirmed || busy} onChange={e => setHigh(e.target.value)} /></label></div>
          <label className="block">实际吃了多少<select className="ml-2 border border-black p-2" value={portion} disabled={confirmed || busy} onChange={e => setPortion(Number(e.target.value))}><option value={1}>全部</option><option value={0.75}>约 3/4</option><option value={0.5}>一半</option><option value={0.25}>约 1/4</option></select></label>
          <label className="block">实际食用时间（本地）<input className="mt-1 w-full border border-black p-2" type="datetime-local" value={at} disabled={confirmed || busy} onChange={e => setAt(e.target.value)} /></label>
          <label className="block">补充说明<input className="mt-1 w-full border border-black p-2" maxLength={300} value={note} placeholder="例如未吃酱汁；无法准确估计的地方" disabled={confirmed || busy} onChange={e => setNote(e.target.value)} /></label>
          <button className={button + ' w-full bg-[#7cff6b]'} disabled={busy || confirmed} onClick={() => void confirm()}>{confirmed ? <><Check size={16} />已记入健康记忆</> : <><Plus size={16} />确认实际吃过，记入对应日期</>}</button>
        </section>}
        {notice && <p role="status" className="border-l-4 border-black bg-white p-3 text-[12px]">{notice}</p>}
        {confirmed && <button className={button + ' w-full'} onClick={reset}>记录下一餐</button>}
        <button className={button + ' w-full'} onClick={() => setTab('memory')}>查看今天记忆，让 Frost 综合分析</button>
        <p className="text-[10px] text-black/55">原始照片与分割掩膜不写入记忆；只有你确认过的结构化餐食进入本机账本。Qwen 或 SAM 不可用时明确失败，不使用示例数据或矩形代替分割。</p>
      </>}
    </main>
  </div>;
}
