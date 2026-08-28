// 杭州赏花地图 .skill · 浏览页（全屏 overlay，ShellPortal 钉进手机壳；形制对齐 ExhibitionBrowser）
// 布局：❀ 此刻在花（盛放置顶）→ 四季花册（秋桂/冬梅/夏荷/春芳，各册可关灯）
// 入口：📷 花讯截图导入（小红书刷到好花讯直接丢进来：端侧识图→别名表锚定坐标→确认上图，
//       坐标只到城市级会如实说，上图后可拖动校正）；端侧模型未就绪 → 粘贴文字/手动录入兜底。
// 页脚：花历（四季窗口 + 主打诗引）· 导出 .skill · 卸载
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import ShellPortal from './ShellPortal';
import {
  flowerSummary, hideFlowerSpot, hiddenFlowerCount, isVolumeOn, listFlowerSpots, listFlowerVolumes,
  addImportedFlowerSpot, getFlowerVolume, removeImportedFlowerSpot, setFlowerBrowserOpen,
  setFlowerSkillLoaded, subscribeFlowerSkill, toggleVolume, unhideAllFlowerSpots,
  exportFlowerSkill, type FlowerSpotView,
} from '../lib/skills/hangzhou-flowers/store';
import {
  draftToSpot, extractFlowerShot, extractFlowerText, resolveFlowerGeo,
  type FlowerGeoHit, type FlowerShotDraft,
} from '../lib/skills/hangzhou-flowers/importShot';
import { HANGZHOU_FLOWER_SKILL } from '../lib/skills/hangzhou-flowers/catalog';
import {
  BLOOM_LABEL, bloomStatus, CROWD_LABEL, MASS_LABEL, windowLabel,
} from '../lib/skills/hangzhou-flowers/types';

const YAHEI = "'Microsoft YaHei','微软雅黑','PingFang SC','Heiti SC',sans-serif";
const SKILL = HANGZHOU_FLOWER_SKILL;

export default function FlowerBrowser({ onFocus }: { onFocus: (v: FlowerSpotView) => void }) {
  const [, bump] = useState(0);
  useEffect(() => subscribeFlowerSkill(() => bump((v) => v + 1)), []);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);
  const [draft, setDraft] = useState<FlowerShotDraft | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [confirmingUnload, setConfirmingUnload] = useState(false);
  useEffect(() => {
    if (!confirmingUnload) return;
    const id = window.setTimeout(() => setConfirmingUnload(false), 3000);
    return () => window.clearTimeout(id);
  }, [confirmingUnload]);

  const all = listFlowerSpots();
  const now = all
    .filter((v) => v.status === 'peak' || v.status === 'blooming')
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'peak' ? -1 : 1));
  const nowIds = new Set(now.map((v) => v.spot.id));

  const onPickFile = async (f: File | undefined) => {
    if (!f) return;
    setImporting(true);
    setDraft(null);
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = () => rej(new Error('读图失败'));
        r.readAsDataURL(f);
      });
      setDraft(await extractFlowerShot(dataUrl));
    } finally {
      setImporting(false);
    }
  };

  const confirmDraft = (spotView: FlowerSpotView) => {
    setDraft(null);
    setPasteOpen(false);
    onFocus(spotView);
  };

  return (
    <ShellPortal>
      <div className="absolute inset-0 z-[170] bg-[#f5efdf] flex flex-col">
        {/* 顶栏 */}
        <div className="flex items-center justify-between px-3 py-2 border-b-2 border-black bg-black shrink-0">
          <span className="font-pixel text-[9px] tracking-wider text-[#ffb928]">
            ❀ 杭州赏花地图 · {flowerSummary()}
          </span>
          <button onClick={() => setFlowerBrowserOpen(false)} aria-label="关闭赏花浏览"
            className="w-7 h-7 border-2 border-[#f5efdf]/60 text-[#f5efdf] flex items-center justify-center active:translate-y-px">
            <X className="w-3.5 h-3.5" strokeWidth={3} />
          </button>
        </div>
        {/* 副栏：四季册灯 + 截图导入 */}
        <div className="px-3 py-1.5 border-b-2 border-black bg-[#EAEAEA] shrink-0 flex items-center gap-1.5">
          {listFlowerVolumes().map((v) => {
            const on = isVolumeOn(v.id);
            const st = bloomStatus(v);
            return (
              <button key={v.id} onClick={() => toggleVolume(v.id)} aria-pressed={on}
                className={`flex items-center gap-1 border-2 border-black px-1.5 py-1 active:translate-y-px ${on ? 'bg-white' : 'bg-white/40 opacity-45'}`}>
                <span className="w-2.5 h-2.5 border border-black" style={{ background: on ? v.color : '#fff' }} />
                <span className="text-[9px] font-bold leading-none" style={{ fontFamily: YAHEI }}>{v.flower[0]}</span>
                {(st === 'peak' || st === 'blooming') && on && (
                  <span className="w-1.5 h-1.5 animate-pulse" style={{ background: v.color }} />
                )}
              </button>
            );
          })}
          <button onClick={() => fileRef.current?.click()}
            className="ml-auto shrink-0 font-pixel text-[7px] uppercase tracking-wider border-2 border-black bg-[#ffb928] text-black px-2 py-1.5 shadow-[2px_2px_0_#000] active:translate-y-px">
            📷 截图导入
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { void onPickFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-4">
          {/* 导入中 / 草稿确认卡 / 粘贴文字兜底 */}
          {importing && (
            <div className="border-2 border-black bg-white p-3 shadow-[2px_2px_0_#000] flex items-center gap-2">
              <div className="w-3 h-3 bg-[#ffb928] border border-black animate-pulse" />
              <span className="text-[10.5px]" style={{ fontFamily: YAHEI }}>端侧识图中——原图不出手机…</span>
            </div>
          )}
          {draft && <DraftCard draft={draft} onCancel={() => setDraft(null)} onConfirm={confirmDraft} />}
          {pasteOpen && !draft && (
            <PasteForm onCancel={() => setPasteOpen(false)} onDone={setDraft} />
          )}
          {!draft && !pasteOpen && !importing && (
            <button onClick={() => setPasteOpen(true)}
              className="w-full text-left text-[9px] text-black/40 underline underline-offset-2" style={{ fontFamily: YAHEI }}>
              端侧模型没就绪？粘贴花讯文字，或手动录一条 ▸
            </button>
          )}

          {/* ❀ 此刻在花 */}
          {now.length > 0 && (
            <section>
              <div className="font-pixel text-[8px] tracking-widest text-[#8a5a00] mb-1.5">❀ IN BLOOM · 此刻在花 · 花期不等人</div>
              <div className="space-y-2">
                {now.map((v) => <Row key={v.spot.id} v={v} lit onFocus={onFocus} />)}
              </div>
            </section>
          )}

          {/* 四季花册（在花的已上提，各册列余下点位） */}
          {listFlowerVolumes().map((vol) => {
            const spots = all.filter((x) => x.spot.volumeId === vol.id && !nowIds.has(x.spot.id));
            if (spots.length === 0 || !isVolumeOn(vol.id)) return null;
            const st = bloomStatus(vol);
            return (
              <section key={vol.id}>
                <div className="font-pixel text-[8px] tracking-widest text-black/65 mb-1.5 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 border border-black inline-block" style={{ background: vol.color }} />
                  {vol.season}卷 · {vol.flower} · {st === 'coming' ? '将开' : windowLabel(vol.window)}
                </div>
                <div className="text-[9px] text-black/50 mb-1.5 leading-snug" style={{ fontFamily: YAHEI }}>{vol.blurb}</div>
                <div className="space-y-2">
                  {spots.map((v) => <Row key={v.spot.id} v={v} onFocus={onFocus} />)}
                </div>
              </section>
            );
          })}

          {/* 花历 + 包操作 */}
          <section className="border-t-2 border-black/20 pt-3 pb-6 space-y-2">
            <button onClick={() => setCalendarOpen((v) => !v)} aria-expanded={calendarOpen}
              className="font-pixel text-[8px] tracking-widest text-black/65 active:translate-y-px">
              {calendarOpen ? '▾' : '▸'} CALENDAR · 四季花历
            </button>
            {calendarOpen && (
              <div className="border-2 border-black bg-white p-2.5 text-[10px] leading-relaxed space-y-2" style={{ fontFamily: YAHEI }}>
                {listFlowerVolumes().map((v) => (
                  <div key={v.id} className="flex gap-2">
                    <span className="shrink-0 w-4 h-4 border border-black flex items-center justify-center text-[9px] font-bold mt-0.5"
                      style={{ background: v.color }}>{v.season}</span>
                    <div className="min-w-0">
                      <div className="font-bold">{v.flower} · {windowLabel(v.window)}{v.peak ? `（盛花 ${windowLabel(v.peak)}）` : ''}</div>
                      {v.quote && <div className="text-black/55 italic">「{v.quote}」——{v.source}</div>}
                    </div>
                  </div>
                ))}
                <div className="pt-1 border-t border-black/15 text-black/60">
                  花期为常年区间，逐年随天气浮动；标「估算」的坐标可在地图上长按花标校正。更新于 {SKILL.updatedAt}。
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={downloadSkillFile}
                className="font-pixel text-[7px] uppercase tracking-wider border-2 border-black bg-white px-2 py-1.5 shadow-[2px_2px_0_#000] active:translate-y-px">
                ⤓ 导出 .skill
              </button>
              {hiddenFlowerCount() > 0 && (
                <button onClick={unhideAllFlowerSpots}
                  className="font-pixel text-[7px] uppercase tracking-wider border-2 border-black bg-white px-2 py-1.5 shadow-[2px_2px_0_#000] active:translate-y-px">
                  恢复 {hiddenFlowerCount()} 个已隐藏
                </button>
              )}
              <button
                onClick={() => {
                  if (!confirmingUnload) { setConfirmingUnload(true); return; }
                  setConfirmingUnload(false);
                  setFlowerBrowserOpen(false);
                  setFlowerSkillLoaded(false);
                }}
                className={`ml-auto font-pixel text-[7px] uppercase tracking-wider border-2 border-black px-2 py-1.5 shadow-[2px_2px_0_#000] active:translate-y-px ${
                  confirmingUnload ? 'bg-[#d23b3b] text-white' : 'bg-black text-[#7CFF6B]'
                }`}>
                {confirmingUnload ? '确认卸载？' : '卸载 skill'}
              </button>
            </div>
          </section>
        </div>
      </div>
    </ShellPortal>
  );
}

function downloadSkillFile() {
  const url = URL.createObjectURL(new Blob([exportFlowerSkill()], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${SKILL.name}.skill`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// —— 一行花讯 ——
function Row({ v, lit, onFocus }: { v: FlowerSpotView; lit?: boolean; onFocus: (v: FlowerSpotView) => void }) {
  const { spot, volume, status } = v;
  return (
    <div className={`border-2 bg-white p-2.5 shadow-[2px_2px_0_rgba(0,0,0,0.85)] ${lit ? '' : 'border-black'}`}
      style={lit ? { borderColor: volume.color } : undefined}>
      <div className="flex items-start gap-2">
        <span className="shrink-0 w-6 h-6 border-2 border-black flex items-center justify-center text-[11px] font-bold mt-0.5"
          style={{ background: lit ? volume.color : '#fff', color: lit ? '#000' : volume.color, fontFamily: YAHEI }}>
          {volume.flower[0]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-bold leading-snug">
            {spot.name}
            {spot.area && <span className="text-[9.5px] text-black/45 font-normal"> · {spot.area}</span>}
          </div>
          <div className="text-[9.5px] text-black/55 mt-0.5" style={{ fontFamily: YAHEI }}>
            {BLOOM_LABEL[status]} · 花期 {windowLabel(spot.window ?? volume.window)} · {MASS_LABEL[spot.mass]} · {CROWD_LABEL[spot.crowd]}
          </div>
        </div>
        {status === 'peak' && (
          <span className="shrink-0 font-pixel text-[7px] border border-black text-black px-1.5 py-1" style={{ background: volume.color }}>
            盛放
          </span>
        )}
      </div>
      <div className="mt-1 text-[10px] text-black/70 leading-snug line-clamp-2" style={{ fontFamily: YAHEI }}>{spot.note}</div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="text-[8.5px] text-black/40" style={{ fontFamily: YAHEI }}>
          {spot.origin === 'screenshot' ? (spot.sourceNote ?? '导入') : '精编'}
          {spot.confidence === 'low' ? ' · 坐标估算' : ''}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {spot.origin === 'screenshot' ? (
            <button onClick={() => removeImportedFlowerSpot(spot.id)}
              className="font-pixel text-[6px] border border-black bg-white text-[#c0392b] px-1.5 py-1 active:translate-y-px">移除</button>
          ) : (
            <button onClick={() => hideFlowerSpot(spot.id)}
              className="font-pixel text-[6px] border border-black bg-white text-black/50 px-1.5 py-1 active:translate-y-px">隐藏</button>
          )}
          <button onClick={() => onFocus(v)}
            className="font-pixel text-[6px] border border-black bg-black text-[#00ff88] px-1.5 py-1 active:translate-y-px">
            去地图 ↗
          </button>
        </div>
      </div>
    </div>
  );
}

// —— 截图/文字导入草稿确认卡（suggest-then-confirm：不确认不落图）——
function DraftCard({ draft, onConfirm, onCancel }: {
  draft: FlowerShotDraft;
  onConfirm: (v: FlowerSpotView) => void;
  onCancel: () => void;
}) {
  const [place, setPlace] = useState(draft.place);
  const [flower, setFlower] = useState(draft.flower);
  const [volumeId, setVolumeId] = useState(draft.volumeId ?? 'spring');
  const [geo, setGeo] = useState<FlowerGeoHit | null>(null);
  const [busy, setBusy] = useState(false);
  const inputCls = 'w-full border-2 border-black bg-white px-2 py-1.5 text-[11px] focus:outline-none';

  if (!draft.visionOk && !draft.place && !draft.flower && !draft.raw) {
    return (
      <div className="border-2 border-black bg-white p-3 shadow-[2px_2px_0_#000] space-y-2">
        <div className="text-[10.5px]" style={{ fontFamily: YAHEI }}>
          端侧视觉模型还没就绪，这张截图读不出来（原图不会上云）。可以稍后再试，或粘贴文字录入。
        </div>
        <button onClick={onCancel}
          className="font-pixel text-[7px] border-2 border-black bg-white px-2 py-1.5 shadow-[2px_2px_0_#000] active:translate-y-px">知道了</button>
      </div>
    );
  }

  const confirm = () => {
    if (busy) return;
    setBusy(true);
    void resolveFlowerGeo(place, draft.area).then((hit) => {
      setGeo(hit);
      const spot = draftToSpot({ ...draft, place, flower }, hit, volumeId, '花讯截图导入');
      addImportedFlowerSpot(spot);
      const volume = getFlowerVolume(volumeId)!;
      setBusy(false);
      onConfirm({ spot, volume, status: bloomStatus(volume, spot.window) });
    });
  };

  return (
    <div className="border-2 border-black bg-white p-3 shadow-[3px_3px_0_#000] space-y-2">
      <div className="font-pixel text-[8px] tracking-widest text-black/65">📷 识别结果 · 确认后上图</div>
      <div className="grid grid-cols-2 gap-1.5">
        <input className={inputCls} placeholder="花名（如 桂花）" value={flower} onChange={(e) => setFlower(e.target.value)} style={{ fontFamily: YAHEI }} />
        <input className={inputCls} placeholder="地点名（用于锚定坐标）*" value={place} onChange={(e) => setPlace(e.target.value)} style={{ fontFamily: YAHEI }} />
      </div>
      {(draft.time || draft.highlight) && (
        <div className="text-[9.5px] text-black/60 leading-snug" style={{ fontFamily: YAHEI }}>
          {draft.highlight}{draft.time ? ` · 花期 ${draft.time}` : ''}
        </div>
      )}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[9px] text-black/45" style={{ fontFamily: YAHEI }}>入册：</span>
        {listFlowerVolumes().map((v) => (
          <button key={v.id} onClick={() => setVolumeId(v.id)} aria-pressed={volumeId === v.id}
            className={`font-pixel text-[7px] border-2 border-black px-2 py-1 active:translate-y-px ${volumeId === v.id ? '' : 'opacity-40'}`}
            style={{ background: v.color }}>
            {v.flower[0]}
          </button>
        ))}
        <span className="text-[8.5px] text-black/40" style={{ fontFamily: YAHEI }}>{getFlowerVolume(volumeId)?.flower}</span>
      </div>
      {geo && (
        <div className="text-[9px] text-black/50" style={{ fontFamily: YAHEI }}>
          {geo.how === 'catalog' && '坐标已按内置赏花点校正 ✓'}
          {geo.how === 'geocode' && '坐标来自地理编码（城市级）——上图后可拖动校正'}
          {geo.how === 'fallback' && '未解析出坐标，先落西湖——上图后可拖动校正'}
        </div>
      )}
      <div className="flex items-center gap-2 pt-1">
        <button onClick={confirm} disabled={!place.trim() || busy}
          className="font-pixel text-[7px] uppercase tracking-wider border-2 border-black bg-[#00ff88] text-black px-2.5 py-1.5 shadow-[2px_2px_0_#000] active:translate-y-px disabled:opacity-40">
          {busy ? '锚定坐标…' : '✓ 上图'}
        </button>
        <button onClick={onCancel}
          className="font-pixel text-[7px] uppercase tracking-wider border-2 border-black bg-white px-2.5 py-1.5 shadow-[2px_2px_0_#000] active:translate-y-px">
          放弃
        </button>
      </div>
    </div>
  );
}

// —— 粘贴文字兜底（端侧视觉未就绪时；也可当手动录入用）——
function PasteForm({ onDone, onCancel }: { onDone: (d: FlowerShotDraft) => void; onCancel: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="border-2 border-black bg-white p-3 shadow-[2px_2px_0_#000] space-y-2">
      <div className="font-pixel text-[8px] tracking-widest text-black/65">✎ 粘贴花讯文字</div>
      <textarea
        className="w-full border-2 border-black bg-white px-2 py-1.5 text-[11px] h-20 resize-none focus:outline-none"
        placeholder="如：太子湾郁金香进入最佳观赏期，望山坪最集中，预计持续到4月中旬…"
        value={text} onChange={(e) => setText(e.target.value)} style={{ fontFamily: YAHEI }} />
      <div className="flex items-center gap-2">
        <button disabled={!text.trim() || busy}
          onClick={() => {
            setBusy(true);
            void extractFlowerText(text).then((d) => { setBusy(false); onDone(d); });
          }}
          className="font-pixel text-[7px] border-2 border-black bg-[#00ff88] text-black px-2.5 py-1.5 shadow-[2px_2px_0_#000] active:translate-y-px disabled:opacity-40">
          {busy ? '读取中…' : '下一步 ▶'}
        </button>
        <button onClick={onCancel}
          className="font-pixel text-[7px] border-2 border-black bg-white px-2.5 py-1.5 shadow-[2px_2px_0_#000] active:translate-y-px">取消</button>
      </div>
    </div>
  );
}
