// 杭州博物馆地图 .skill · 图鉴页（全屏 overlay，ShellPortal 钉进手机壳）
// 布局：⏳ 馆内特展倒计时（重磅临期，红色置顶）→ ✦ 镇馆级 → ◆ 高水准 → ▫ 顺路/导入
// 入口：📷 截图导入（小红书/公号刷到好馆或好展直接丢进来，端侧识图→规则过滤→馆表校正→确认上图；
//        命中内置馆则把特展挂到那座馆上，不重复钉点）
// 页脚：收录规则（S/A/B 口径 + 不收录清单）· 导出 .skill · 卸载
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import ShellPortal from './ShellPortal';
import {
  addImportedMuseum, attachShowToMuseum, exportMuseumSkill, hiddenMuseumCount, hideMuseum,
  listMuseums, removeImportedMuseum, setMuseumBrowserOpen, setMuseumSkillLoaded,
  subscribeMuseumSkill, unhideAllMuseums,
} from '../lib/skills/hangzhou-museums/store';
import { HANGZHOU_MUSEUM_SKILL } from '../lib/skills/hangzhou-museums/catalog';
import {
  buildManualMuseumDraft, importMuseumScreenshot, type MuseumImportDraft,
} from '../lib/skills/hangzhou-museums/importPipeline';
import {
  closedDayLabel, isClosedToday, liveShows, urgentShowDays,
  type MuseumEntry, type MuseumTier,
} from '../lib/skills/hangzhou-museums/types';
import { MTIER_COLOR, MTIER_LABEL } from './MuseumLayer';

const YAHEI = "'Microsoft YaHei','微软雅黑','PingFang SC','Heiti SC',sans-serif";
const SKILL = HANGZHOU_MUSEUM_SKILL;
const URGENT = SKILL.rules.urgentWithinDays;

export default function MuseumBrowser({ onFocus }: { onFocus: (e: MuseumEntry) => void }) {
  const [, bump] = useState(0);
  useEffect(() => subscribeMuseumSkill(() => bump((v) => v + 1)), []);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);
  const [draft, setDraft] = useState<MuseumImportDraft | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [confirmingUnload, setConfirmingUnload] = useState(false);
  useEffect(() => {
    if (!confirmingUnload) return;
    const id = window.setTimeout(() => setConfirmingUnload(false), 3000);
    return () => window.clearTimeout(id);
  }, [confirmingUnload]);

  const all = listMuseums();
  const urgent = all.filter((m) => urgentShowDays(m, URGENT) !== null);
  const urgentIds = new Set(urgent.map((m) => m.id));
  const sTier = all.filter((m) => m.tier === 'S' && !urgentIds.has(m.id));
  const aTier = all.filter((m) => m.tier === 'A' && !urgentIds.has(m.id));
  const rest = all.filter((m) => m.tier === 'B' && !urgentIds.has(m.id));

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
      setDraft(await importMuseumScreenshot(dataUrl));
    } finally {
      setImporting(false);
    }
  };

  return (
    <ShellPortal>
      <div className="absolute inset-0 z-[170] bg-[#f5efdf] flex flex-col">
        {/* 顶栏 */}
        <div className="flex items-center justify-between px-3 py-2 border-b-2 border-black bg-black shrink-0">
          <span className="font-pixel text-[9px] tracking-wider" style={{ color: '#ff8a65' }}>
            🏛 杭州博物馆地图 · {all.length} 馆收录
          </span>
          <button onClick={() => setMuseumBrowserOpen(false)} aria-label="关闭博物馆图鉴"
            className="w-7 h-7 border-2 border-[#f5efdf]/60 text-[#f5efdf] flex items-center justify-center active:translate-y-px">
            <X className="w-3.5 h-3.5" strokeWidth={3} />
          </button>
        </div>
        <div className="px-3 py-1.5 border-b-2 border-black bg-[#EAEAEA] shrink-0 flex items-center gap-2">
          <span className="text-[9px] text-black/55" style={{ fontFamily: YAHEI }}>
            只收真有货的馆 · 更新于 {SKILL.updatedAt} · 无党建挂牌馆
          </span>
          <button onClick={() => fileRef.current?.click()}
            className="ml-auto shrink-0 font-pixel text-[7px] uppercase tracking-wider border-2 border-black bg-[#e0502e] text-white px-2 py-1.5 shadow-[2px_2px_0_#000] active:translate-y-px">
            📷 截图导入
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { void onPickFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-4">
          {/* 导入中 / 草稿确认卡 */}
          {importing && (
            <div className="border-2 border-black bg-white p-3 shadow-[2px_2px_0_#000] flex items-center gap-2">
              <div className="w-3 h-3 bg-[#e0502e] border border-black animate-pulse" />
              <span className="text-[10.5px]" style={{ fontFamily: YAHEI }}>端侧识图中——原图不出手机…</span>
            </div>
          )}
          {draft && (
            <DraftCard draft={draft} onCancel={() => setDraft(null)}
              onConfirmNew={(m) => { addImportedMuseum(m); setDraft(null); onFocus(m); }}
              onAttach={(museumId, d) => {
                if (d.show) attachShowToMuseum(museumId, d.show);
                setDraft(null);
                const host = listMuseums().find((x) => x.id === museumId);
                if (host) onFocus(host);
              }} />
          )}
          {manualOpen && (
            <ManualForm onCancel={() => setManualOpen(false)}
              onDone={(d) => { setManualOpen(false); setDraft(d); }} />
          )}
          {!draft && !manualOpen && !importing && (
            <button onClick={() => setManualOpen(true)}
              className="w-full text-left text-[9px] text-black/40 underline underline-offset-2" style={{ fontFamily: YAHEI }}>
              端侧模型没就绪？手动录一条 ▸
            </button>
          )}

          {/* ⏳ 馆内特展倒计时 */}
          {urgent.length > 0 && (
            <section>
              <div className="font-pixel text-[8px] tracking-widest text-[#c0392b] mb-1.5">⏳ CLOSING SOON · 馆内特展倒计时</div>
              <div className="space-y-2">
                {urgent.map((m) => <Row key={m.id} m={m} urgent onFocus={onFocus} />)}
              </div>
            </section>
          )}

          {/* ✦ 镇馆级 */}
          {sTier.length > 0 && (
            <section>
              <div className="font-pixel text-[8px] tracking-widest text-black/65 mb-1.5">✦ TIER S · 镇馆级 · 来杭必去</div>
              <div className="space-y-2">
                {sTier.map((m) => <Row key={m.id} m={m} onFocus={onFocus} />)}
              </div>
            </section>
          )}

          {/* ◆ 高水准 */}
          {aTier.length > 0 && (
            <section>
              <div className="font-pixel text-[8px] tracking-widest text-black/65 mb-1.5">◆ TIER A · 高水准 · 值得专程</div>
              <div className="space-y-2">
                {aTier.map((m) => <Row key={m.id} m={m} onFocus={onFocus} />)}
              </div>
            </section>
          )}

          {/* ▫ 顺路 / 我导入的 */}
          {rest.length > 0 && (
            <section>
              <div className="font-pixel text-[8px] tracking-widest text-black/65 mb-1.5">▫ TIER B · 顺路看</div>
              <div className="space-y-2">
                {rest.map((m) => <Row key={m.id} m={m} onFocus={onFocus} />)}
              </div>
            </section>
          )}

          {/* 规则 + 包操作 */}
          <section className="border-t-2 border-black/20 pt-3 pb-6 space-y-2">
            <button onClick={() => setRulesOpen((v) => !v)} aria-expanded={rulesOpen}
              className="font-pixel text-[8px] tracking-widest text-black/65 active:translate-y-px">
              {rulesOpen ? '▾' : '▸'} RULES · 收录规则
            </button>
            {rulesOpen && (
              <div className="border-2 border-black bg-white p-2.5 text-[10px] leading-relaxed space-y-1.5" style={{ fontFamily: YAHEI }}>
                {(Object.keys(SKILL.rules.tiers) as MuseumTier[]).map((t) => (
                  <div key={t} className="flex gap-2">
                    <span className="shrink-0 font-pixel text-[7px] border border-black px-1 py-0.5 mt-0.5"
                      style={{ background: MTIER_COLOR[t], color: t === 'S' ? '#fff' : '#000' }}>{t}</span>
                    <span>{SKILL.rules.tiers[t]}</span>
                  </div>
                ))}
                <div className="pt-1 border-t border-black/15 text-black/60">
                  不收录：{SKILL.rules.excluded.join('；')}
                </div>
                <div className="text-black/60">
                  馆内重磅特展闭幕 ≤ {URGENT} 天 → 倒计时置顶；闭馆日当天标记挂「休」。
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={downloadSkillFile}
                className="font-pixel text-[7px] uppercase tracking-wider border-2 border-black bg-white px-2 py-1.5 shadow-[2px_2px_0_#000] active:translate-y-px">
                ⤓ 导出 .skill
              </button>
              {hiddenMuseumCount() > 0 && (
                <button onClick={unhideAllMuseums}
                  className="font-pixel text-[7px] uppercase tracking-wider border-2 border-black bg-white px-2 py-1.5 shadow-[2px_2px_0_#000] active:translate-y-px">
                  恢复 {hiddenMuseumCount()} 个已隐藏
                </button>
              )}
              <button
                onClick={() => {
                  if (!confirmingUnload) { setConfirmingUnload(true); return; }
                  setConfirmingUnload(false);
                  setMuseumBrowserOpen(false);
                  setMuseumSkillLoaded(false);
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
  const url = URL.createObjectURL(new Blob([exportMuseumSkill()], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${SKILL.name}.skill`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// —— 一行馆 ——
function Row({ m, urgent, onFocus }: { m: MuseumEntry; urgent?: boolean; onFocus: (e: MuseumEntry) => void }) {
  const noGeo = !Number.isFinite(m.lng) || (m.lng === 0 && m.lat === 0);
  const shows = liveShows(m);
  const urgentLeft = urgentShowDays(m, URGENT);
  return (
    <div className={`border-2 bg-white p-2.5 shadow-[2px_2px_0_rgba(0,0,0,0.85)] ${urgent ? 'border-[#c0392b]' : 'border-black'}`}>
      <div className="flex items-start gap-2">
        <span className="shrink-0 font-pixel text-[8px] border-2 border-black px-1.5 py-1 mt-0.5"
          style={{ background: MTIER_COLOR[m.tier], color: m.tier === 'S' ? '#fff' : '#000' }}>
          {m.tier === 'S' ? '✦S' : m.tier}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-bold leading-snug">
            {m.name}
            {isClosedToday(m) && (
              <span className="ml-1.5 align-middle border border-black bg-[#EAEAEA] px-1 text-[8px] font-bold" style={{ fontFamily: YAHEI }}>休</span>
            )}
          </div>
          <div className="text-[9.5px] text-black/55 mt-0.5" style={{ fontFamily: YAHEI }}>
            {[m.area, m.ticket, closedDayLabel(m)].filter(Boolean).join(' · ') || '信息待核'}
          </div>
        </div>
        {urgent && urgentLeft !== null && (
          <span className="shrink-0 font-pixel text-[7px] border border-black bg-[#ff5a5a] text-white px-1.5 py-1">
            {urgentLeft === 0 ? 'LAST' : `D-${urgentLeft}`}
          </span>
        )}
      </div>
      {m.blurb && (
        <div className="mt-1 text-[10px] text-black/70 leading-snug line-clamp-2" style={{ fontFamily: YAHEI }}>{m.blurb}</div>
      )}
      {(m.treasures?.length ?? 0) > 0 && (
        <div className="mt-1 text-[9px] text-black/55 truncate" style={{ fontFamily: YAHEI }}>
          宝 {m.treasures!.join(' · ')}
        </div>
      )}
      {shows.length > 0 && (
        <div className="mt-1 text-[9px] text-black/55 truncate" style={{ fontFamily: YAHEI }}>
          在展 {shows.map((s) => s.title).join(' · ')}
        </div>
      )}
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="text-[8.5px] text-black/40" style={{ fontFamily: YAHEI }}>
          {m.source === 'screenshot' ? (m.sourceNote ?? '导入') : MTIER_LABEL[m.tier]}
          {m.confidence !== 'high' ? ' · 待核' : ''}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {m.source === 'screenshot' ? (
            <button onClick={() => removeImportedMuseum(m.id)}
              className="font-pixel text-[6px] border border-black bg-white text-[#c0392b] px-1.5 py-1 active:translate-y-px">移除</button>
          ) : (
            <button onClick={() => hideMuseum(m.id)}
              className="font-pixel text-[6px] border border-black bg-white text-black/50 px-1.5 py-1 active:translate-y-px">隐藏</button>
          )}
          <button onClick={() => onFocus(m)} disabled={noGeo}
            className={`font-pixel text-[6px] border border-black px-1.5 py-1 active:translate-y-px ${
              noGeo ? 'bg-white text-black/30' : 'bg-black text-[#00ff88]'
            }`}>
            {noGeo ? '无坐标' : '去地图 ↗'}
          </button>
        </div>
      </div>
    </div>
  );
}

// —— 截图导入草稿确认卡（suggest-then-confirm：不确认不落图）——
// 两种归宿：命中内置馆 → 「挂到那座馆」；新馆 → 定级后上图。
function DraftCard({ draft, onConfirmNew, onAttach, onCancel }: {
  draft: MuseumImportDraft;
  onConfirmNew: (m: MuseumEntry) => void;
  onAttach: (museumId: string, d: MuseumImportDraft) => void;
  onCancel: () => void;
}) {
  const [tier, setTier] = useState<MuseumTier>(draft.suggestedTier);
  const m = draft.entry;
  const noGeo = draft.placeVia === 'none';
  if (!draft.visionOk) {
    return (
      <div className="border-2 border-black bg-white p-3 shadow-[2px_2px_0_#000] space-y-2">
        <div className="text-[10.5px]" style={{ fontFamily: YAHEI }}>
          端侧视觉模型还没就绪，这张截图读不出来（原图不会上云）。可以稍后再试，或手动录入。
        </div>
        <button onClick={onCancel}
          className="font-pixel text-[7px] border-2 border-black bg-white px-2 py-1.5 shadow-[2px_2px_0_#000] active:translate-y-px">知道了</button>
      </div>
    );
  }

  // 命中内置馆：不重复钉点，建议把特展挂上去（信息归位）
  if (draft.matchedMuseumId) {
    return (
      <div className="border-2 border-black bg-white p-3 shadow-[3px_3px_0_#000] space-y-2">
        <div className="font-pixel text-[8px] tracking-widest text-black/65">📷 识别结果 · 这座馆已在图上</div>
        <div className="text-[12px] font-bold">{draft.matchedMuseumName}</div>
        {draft.show ? (
          <div className="text-[10px] text-black/70" style={{ fontFamily: YAHEI }}>
            截图里的特展「{draft.show.title}」{draft.show.dateEnd ? `（至 ${draft.show.dateEnd}）` : ''}可以挂到这座馆上。
          </div>
        ) : (
          <div className="text-[10px] text-black/70" style={{ fontFamily: YAHEI }}>
            没读出新特展信息——馆已收录，无需重复添加。
          </div>
        )}
        {draft.rejected && (
          <div className="border border-[#c0392b] bg-[#ff5a5a]/10 px-2 py-1 text-[9.5px] font-bold text-[#c0392b]" style={{ fontFamily: YAHEI }}>
            {draft.rejected}
          </div>
        )}
        <div className="flex items-center gap-2 pt-1">
          {draft.show && (
            <button onClick={() => onAttach(draft.matchedMuseumId!, draft)}
              className="font-pixel text-[7px] uppercase tracking-wider border-2 border-black bg-[#00ff88] text-black px-2.5 py-1.5 shadow-[2px_2px_0_#000] active:translate-y-px">
              ✓ 挂到馆上
            </button>
          )}
          <button onClick={onCancel}
            className="font-pixel text-[7px] uppercase tracking-wider border-2 border-black bg-white px-2.5 py-1.5 shadow-[2px_2px_0_#000] active:translate-y-px">
            {draft.show ? '放弃' : '知道了'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-2 border-black bg-white p-3 shadow-[3px_3px_0_#000] space-y-2">
      <div className="font-pixel text-[8px] tracking-widest text-black/65">📷 识别结果 · 确认后上图</div>
      {draft.rejected && (
        <div className="border border-[#c0392b] bg-[#ff5a5a]/10 px-2 py-1 text-[9.5px] font-bold text-[#c0392b]" style={{ fontFamily: YAHEI }}>
          {draft.rejected}
        </div>
      )}
      <div className="text-[12px] font-bold">{m.name}</div>
      <div className="text-[9.5px] text-black/60" style={{ fontFamily: YAHEI }}>
        {draft.placeVia === 'museum-table' && '坐标已按馆表校正 ✓'}
        {draft.placeVia === 'geocode' && '坐标来自地理编码（可能有偏差）'}
        {noGeo && '未解析出坐标——先收录，之后可在馆表补'}
      </div>
      {m.blurb && <div className="text-[10px] text-black/70" style={{ fontFamily: YAHEI }}>{m.blurb}</div>}
      {(m.treasures?.length ?? 0) > 0 && (
        <div className="text-[9.5px] text-black/60" style={{ fontFamily: YAHEI }}>宝 {m.treasures!.join(' · ')}</div>
      )}
      {draft.show && (
        <div className="text-[9.5px] text-black/60" style={{ fontFamily: YAHEI }}>
          在展：{draft.show.title}{draft.show.dateEnd ? `（至 ${draft.show.dateEnd}）` : ''}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] text-black/45" style={{ fontFamily: YAHEI }}>定级：</span>
        {(['S', 'A', 'B'] as MuseumTier[]).map((t) => (
          <button key={t} onClick={() => setTier(t)} aria-pressed={tier === t}
            className={`font-pixel text-[7px] border-2 border-black px-2 py-1 active:translate-y-px ${tier === t ? '' : 'opacity-40'}`}
            style={{ background: MTIER_COLOR[t], color: t === 'S' ? '#fff' : '#000' }}>
            {t}
          </button>
        ))}
        <span className="text-[8.5px] text-black/40" style={{ fontFamily: YAHEI }}>{MTIER_LABEL[tier]}</span>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button onClick={() => onConfirmNew({ ...m, tier, tierReason: `截图导入 · 我定为 ${MTIER_LABEL[tier]}` })}
          className="font-pixel text-[7px] uppercase tracking-wider border-2 border-black bg-[#00ff88] text-black px-2.5 py-1.5 shadow-[2px_2px_0_#000] active:translate-y-px">
          ✓ 上图
        </button>
        <button onClick={onCancel}
          className="font-pixel text-[7px] uppercase tracking-wider border-2 border-black bg-white px-2.5 py-1.5 shadow-[2px_2px_0_#000] active:translate-y-px">
          放弃
        </button>
      </div>
    </div>
  );
}

// —— 手动录入（端侧模型未就绪的兜底） ——
function ManualForm({ onDone, onCancel }: { onDone: (d: MuseumImportDraft) => void; onCancel: () => void }) {
  const [museum, setMuseum] = useState('');
  const [show, setShow] = useState('');
  const [showEnd, setShowEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const inputCls = 'w-full border-2 border-black bg-white px-2 py-1.5 text-[11px] focus:outline-none';
  return (
    <div className="border-2 border-black bg-white p-3 shadow-[2px_2px_0_#000] space-y-2">
      <div className="font-pixel text-[8px] tracking-widest text-black/65">✎ 手动录一条</div>
      <input className={inputCls} placeholder="博物馆/美术馆名 *" value={museum} onChange={(ev) => setMuseum(ev.target.value)} style={{ fontFamily: YAHEI }} />
      <input className={inputCls} placeholder="在展特展（可空）" value={show} onChange={(ev) => setShow(ev.target.value)} style={{ fontFamily: YAHEI }} />
      <input className={inputCls} placeholder="特展闭幕日期（如 2026.10.8，可空）" value={showEnd} onChange={(ev) => setShowEnd(ev.target.value)} style={{ fontFamily: YAHEI }} />
      <div className="flex items-center gap-2">
        <button disabled={!museum.trim() || busy}
          onClick={() => {
            setBusy(true);
            void buildManualMuseumDraft({ museum, show, showEnd }).then((d) => { setBusy(false); onDone(d); });
          }}
          className="font-pixel text-[7px] border-2 border-black bg-[#00ff88] text-black px-2.5 py-1.5 shadow-[2px_2px_0_#000] active:translate-y-px disabled:opacity-40">
          {busy ? '校正坐标…' : '下一步 ▶'}
        </button>
        <button onClick={onCancel}
          className="font-pixel text-[7px] border-2 border-black bg-white px-2.5 py-1.5 shadow-[2px_2px_0_#000] active:translate-y-px">取消</button>
      </div>
    </div>
  );
}
