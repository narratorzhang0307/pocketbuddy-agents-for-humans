import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Check, Plus } from 'lucide-react';
import HealthMemoryPanel from './HealthMemoryPanel';
import { recordConfirmedMeal, type MealCandidate } from '../lib/frostHealthMemory';
import { analyzeFoodPhoto, editedMealCandidate, type PhotoSegmentation } from '../lib/photoHarness';
import PhotoHarnessMasks from './PhotoHarnessMasks';
import FoodPhotoDemo from './FoodPhotoDemo';
import { readFoodDemoVisible, saveFoodDemoVisible } from '../lib/foodPhotoDemo';

function localInputTime() { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
async function compactPhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/') || file.size > 15 * 1024 * 1024) throw new Error('Please choose an image under 15 MB');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d'); if (!context) throw new Error('Could not prepare the image');
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
  const [demoVisible, setDemoVisible] = useState(readFoodDemoVisible);
  const [demoNotice, setDemoNotice] = useState('');
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
    try { const data = await compactPhoto(selected); if (id.current === selectedId) { setImage(data); setNotice('The photo is previewed on this device only. The compressed photo is sent to Qwen and the Alibaba Cloud SAM service only after you tap to consent. Qwen calls may be billed.'); } }
    catch (error) { setNotice(String(error)); }
    finally { if (id.current === selectedId) setBusy(false); }
  };
  const analyze = async () => {
    if (!image || busy || confirmed) return;
    const selectedId = id.current, controller = new AbortController(); request.current = controller;
    setBusy(true); setCandidate(undefined); setSegmentation(undefined); setManual(false);
    setNotice('Running Qwen localisation → SAM pixel segmentation → Harness check. CPU inference can take a minute or two; nothing is logged as eaten automatically, and there is no automatic retry.');
    try {
      const result = await analyzeFoodPhoto(image, controller.signal);
      if (selectedId !== id.current) return;
      const value = result.meal; setSegmentation(result.segmentation);
      setCandidate(value); setTitle(value.title); setLow(String(value.calories_kcal_range[0])); setHigh(String(value.calories_kcal_range[1]));
      setNotice('A candidate came back. Check the dish name, the estimate range, how much you actually ate and the time before confirming.');
    } catch (error) { if (!controller.signal.aborted) setNotice(String(error)); }
    finally { if (selectedId === id.current) setBusy(false); }
  };
  const confirm = async () => {
    if (busy || confirmed || (!candidate && !manual)) return;
    if (!title.trim() || !low.trim() || !high.trim() || !Number.isFinite(Number(low)) || !Number.isFinite(Number(high))
      || Number(low) < 0 || Number(high) < Number(low) || Number(high) > 8000) { setNotice('Enter a real meal name and a valid calorie estimate range; do not invent numbers when you are unsure.'); return; }
    const value = editedMealCandidate(candidate, title, [Number(low), Number(high)]);
    setBusy(true);
    try { await recordConfirmedMeal({ id: id.current, candidate: value, portion, consumedAt: new Date(at).toISOString(), note }); setConfirmed(true); setNotice("Taskmaster confirmed it and logged it to that date; tapping again will not add a second meal. Today's memory and the next suggestion will update."); }
    catch (error) { setNotice(String(error)); }
    finally { setBusy(false); }
  };
  const button = 'flex items-center justify-center gap-1 border-2 border-black bg-white p-2 text-[11px] font-bold disabled:opacity-40';
  const photoAction = 'inline-flex min-h-11 items-center gap-2 rounded-full border-0 bg-transparent py-1 pr-2 text-[12px] font-bold transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black disabled:cursor-not-allowed disabled:opacity-40';
  const changeDemoVisibility = (visible: boolean) => {
    setDemoVisible(visible);
    const saved = saveFoodDemoVisible(visible);
    setDemoNotice(saved ? (visible ? 'Sample restored; it never writes into your real records.' : 'Sample removed; your real photos and records are untouched.') : 'Toggled for this session, but the preference could not be saved; it may go back to the default next time you open it.');
  };
  return <div className={'h-full bg-[#eaeaea] ' + (embedded ? 'overflow-y-auto' : 'flex flex-col overflow-hidden')}>
    <input ref={file} type="file" accept="image/*" className="hidden" onChange={e => { void choose(e.target.files?.[0]); e.target.value = ''; }} />
    <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { void choose(e.target.files?.[0]); e.target.value = ''; }} />
    <header className="shrink-0 border-b-2 border-black bg-white p-4"><h1 className="font-pixel text-[18px] tracking-wider">PHOTOS</h1><p className="mt-1 text-[11px] text-black/60">Read a meal, confirm it into today, then let Frost decide</p></header>
    <div className="grid shrink-0 grid-cols-2 gap-2 border-b-2 border-black bg-black p-2">{(['photo', 'memory'] as const).map(value => <button key={value} className={'p-2 text-[12px] ' + (tab === value ? 'bg-[#7cff6b]' : 'bg-white')} onClick={() => setTab(value)}>{value === 'photo' ? 'Meal check' : 'Today / Long-term'}</button>)}</div>
    <main className={(embedded ? '' : 'min-h-0 flex-1 overflow-y-auto ') + 'space-y-3 p-3 pb-8'}>
      {tab === 'memory' ? <HealthMemoryPanel /> : <>
        <div role="group" aria-label="Add a meal photo" className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 py-2">
          <button type="button" className={photoAction} disabled={busy} onClick={() => camera.current?.click()}>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-black text-[#7cff6b]"><Camera size={20} aria-hidden="true" /></span>
            Snap a meal
          </button>
          <button type="button" className={photoAction} disabled={busy} onClick={() => file.current?.click()}>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-black"><ImagePlus size={20} aria-hidden="true" /></span>
            Choose from library
          </button>
        </div>
        {image ? <section className="overflow-hidden border-2 border-black bg-white"><img src={image} alt="The meal photo you selected" className="max-h-[300px] w-full object-contain" /><p className="p-2 text-[10px]">On-device preview · long edge 1024 px · no photo location attached</p></section>
          : !manual && (demoVisible ? <FoodPhotoDemo onRemove={() => changeDemoVisibility(false)} /> : <section className="space-y-3 border-2 border-black bg-[#f5f0e4] p-5 text-[12px]"><p>Pick a meal you actually ate, check the result, then log it into today. The sample is removed and will not come back on its own.</p><button type="button" className={button + ' w-full'} onClick={() => changeDemoVisibility(true)}>Restore the sample meal preview</button></section>)}
        {demoNotice && !image && !manual && <p role="status" className="text-[10px] text-black/55">{demoNotice}</p>}
        {image && <button className={button + ' w-full bg-[#7cff6b]'} disabled={busy || confirmed} onClick={() => void analyze()}>{busy ? 'Working…' : 'Consent to recognition: Qwen + SAM (Qwen may be billed)'}</button>}
        {segmentation && <PhotoHarnessMasks key={id.current} image={image} result={segmentation} />}
        {!candidate && <button className={button + ' w-full'} disabled={busy || confirmed} onClick={() => setManual(true)}>No photo — enter a meal you ate by hand</button>}
        {(candidate || manual) && <section className="space-y-3 border-2 border-black bg-white p-3 text-[12px]">
          <p className="font-bold">{candidate ? 'Qwen candidate · ' + candidate.model : 'Manual entry · not model recognition'}</p>
          <p className="text-black/60">{candidate?.uncertainty || 'Enter the range you actually know; an estimate is not a precise measurement.'}</p>
          <label className="block">Meal name<input className="mt-1 w-full border border-black p-2" maxLength={100} value={title} disabled={confirmed || busy} onChange={e => {
            setTitle(e.target.value);
            if (candidate && e.target.value.trim() !== candidate.title.trim()) { setLow(''); setHigh(''); setNotice('Meal name changed: re-enter the calorie range. The original dish and nutrition estimate are not carried over.'); }
          }} /></label>
          <div className="grid grid-cols-2 gap-2"><label>Whole-meal low estimate kcal<input aria-label="Calorie low bound" className="mt-1 w-full border border-black p-2" type="number" min="0" max="8000" value={low} disabled={confirmed || busy} onChange={e => setLow(e.target.value)} /></label>
            <label>Whole-meal high estimate kcal<input aria-label="Calorie high bound" className="mt-1 w-full border border-black p-2" type="number" min="0" max="8000" value={high} disabled={confirmed || busy} onChange={e => setHigh(e.target.value)} /></label></div>
          <label className="block">How much you actually ate<select className="ml-2 border border-black p-2" value={portion} disabled={confirmed || busy} onChange={e => setPortion(Number(e.target.value))}><option value={1}>All</option><option value={0.75}>About 3/4</option><option value={0.5}>Half</option><option value={0.25}>About 1/4</option></select></label>
          <label className="block">Actual time eaten (local)<input className="mt-1 w-full border border-black p-2" type="datetime-local" value={at} disabled={confirmed || busy} onChange={e => setAt(e.target.value)} /></label>
          <label className="block">Notes<input className="mt-1 w-full border border-black p-2" maxLength={300} value={note} placeholder="e.g. skipped the sauce; anything you cannot estimate accurately" disabled={confirmed || busy} onChange={e => setNote(e.target.value)} /></label>
          <button className={button + ' w-full bg-[#7cff6b]'} disabled={busy || confirmed} onClick={() => void confirm()}>{confirmed ? <><Check size={16} />Logged to health memory</> : <><Plus size={16} />Confirm you ate this, log it to that date</>}</button>
        </section>}
        {notice && <p role="status" className="border-l-4 border-black bg-white p-3 text-[12px]">{notice}</p>}
        {confirmed && <button className={button + ' w-full'} onClick={reset}>Log the next meal</button>}
        <button className={button + ' w-full'} onClick={() => setTab('memory')}>Open Today's memory and let Frost analyse</button>
        <p className="text-[10px] text-black/55">Raw photos and segmentation masks are never written to memory; only the structured meals you confirm enter the on-device ledger. If Qwen or SAM is unavailable it fails openly — no sample data and no rectangles standing in for segmentation.</p>
      </>}
    </main>
  </div>;
}
