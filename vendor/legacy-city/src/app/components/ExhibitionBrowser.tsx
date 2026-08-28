// 杭州展览地图 .skill · 浏览页（全屏 overlay，ShellPortal 钉进手机壳）
// 布局：⏳ 闭幕倒计时（S/A 临期，红色置顶）→ ✦ 殿堂级 → ◆ 高水准 → ▫ 顺路/导入
// 入口：📷 截图导入（小红书/公号看到好展直接丢进来，端侧识图→规则过滤→场馆校正→确认上图）
// 页脚：收录规则（S/A/B 口径 + 不收录清单）· 导出 .skill · 卸载
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import ShellPortal from './ShellPortal';
import {
  addImportedExhibition, exportExhibitionSkill, hiddenCount, hideExhibition, listExhibitions,
  removeImportedExhibition, setExBrowserOpen, setExSkillLoaded, subscribeExhibitionSkill, unhideAll,
} from '../lib/skills/hangzhou-exhibitions/store';
import { HANGZHOU_EXHIBITION_SKILL } from '../lib/skills/hangzhou-exhibitions/catalog';
import {
  buildManualDraft, importExhibitionScreenshot, type ExImportDraft,
} from '../lib/skills/hangzhou-exhibitions/importPipeline';
import { daysLeft, exStatus, type ExTier, type ExhibitionEntry } from '../lib/skills/hangzhou-exhibitions/types';
import { TIER_COLOR, TIER_LABEL } from './ExhibitionLayer';

const YAHEI = "'Microsoft YaHei','微软雅黑','PingFang SC','Heiti SC',sans-serif";
const SKILL = HANGZHOU_EXHIBITION_SKILL;
const URGENT = SKILL.rules.urgentWithinDays;

function fmtRange(e: ExhibitionEntry): string {
  const f = (s?: string) => (s ? s.replace(/^\d{4}-/, '').replace('-', '.') : '');
  if (!e.dateStart && !e.dateEnd) return '展期待核';
  return `${f(e.dateStart)} – ${f(e.dateEnd) || '…'}`;
}

export default function ExhibitionBrowser({ onFocus }: { onFocus: (e: ExhibitionEntry) => void }) {
  const [, bump] = useState(0);
  useEffect(() => subscribeExhibitionSkill(() => bump((v) => v + 1)), []);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);
  const [draft, setDraft] = useState<ExImportDraft | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [confirmingUnload, setConfirmingUnload] = useState(false);
  useEffect(() => {
    if (!confirmingUnload) return;
    const id = window.setTimeout(() => setConfirmingUnload(false), 3000);
    return () => window.clearTimeout(id);
  }, [confirmingUnload]);

  const all = listExhibitions();
  const closing = all.filter((e) => e.tier !== 'B' && exStatus(e, URGENT) === 'closing');
  const closingIds = new Set(closing.map((e) => e.id));
  const sTier = all.filter((e) => e.tier === 'S' && !closingIds.has(e.id));
  const aTier = all.filter((e) => e.tier === 'A' && !closingIds.has(e.id));
  const rest = all.filter((e) => e.tier === 'B' && !closingIds.has(e.id));

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
      setDraft(await importExhibitionScreenshot(dataUrl));
    } finally {
      setImporting(false);
    }
  };

  return (
    <ShellPortal>
      <div className="absolute inset-0 z-[170] bg-[#f5efdf] flex flex-col">
        {/* 顶栏 */}
        <div className="flex items-center justify-between px-3 py-2 border-b-2 border-black bg-black shrink-0">
          <span className="font-pixel text-[9px] tracking-wider" style={{ color: TIER_COLOR.S }}>
            ✦ 杭州展览地图 · {all.length} 展在场
          </span>
          <button onClick={() => setExBrowserOpen(false)} aria-label="关闭展览浏览"
            className="w-7 h-7 border-2 border-[#f5efdf]/60 text-[#f5efdf] flex items-center justify-center active:translate-y-px">
            <X className="w-3.5 h-3.5" strokeWidth={3} />
          </button>
        </div>
        <div className="px-3 py-1.5 border-b-2 border-black bg-[#EAEAEA] shrink-0 flex items-center gap-2">
          <span className="text-[9px] text-black/55" style={{ fontFamily: YAHEI }}>
            精选自官方展讯 · 更新于 {SKILL.updatedAt} · 无党建注水展
          </span>
          <button onClick={() => fileRef.current?.click()}
            className="ml-auto shrink-0 font-pixel text-[7px] uppercase tracking-wider border-2 border-black bg-[#ffd23d] text-black px-2 py-1.5 shadow-[2px_2px_0_#000] active:translate-y-px">
            📷 截图导入
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { void onPickFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-4">
          {/* 导入中 / 草稿确认卡 */}
          {importing && (
            <div className="border-2 border-black bg-white p-3 shadow-[2px_2px_0_#000] flex items-center gap-2">
              <div className="w-3 h-3 bg-[#ffd23d] border border-black animate-pulse" />
              <span className="text-[10.5px]" style={{ fontFamily: YAHEI }}>端侧识图中——原图不出手机…</span>
            </div>
          )}
          {draft && (
            <DraftCard draft={draft} onCancel={() => setDraft(null)}
              onConfirm={(e) => { addImportedExhibition(e); setDraft(null); onFocus(e); }} />
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

          {/* ⏳ 闭幕倒计时 */}
          {closing.length > 0 && (
            <section>
              <div className="font-pixel text-[8px] tracking-widest text-[#c0392b] mb-1.5">⏳ CLOSING SOON · 闭幕倒计时</div>
              <div className="space-y-2">
                {closing.map((e) => <Row key={e.id} e={e} urgent onFocus={onFocus} />)}
              </div>
            </section>
          )}

          {/* ✦ 殿堂级 */}
          {sTier.length > 0 && (
            <section>
              <div className="font-pixel text-[8px] tracking-widest text-black/65 mb-1.5">✦ TIER S · 殿堂级 · 专程去</div>
              <div className="space-y-2">
                {sTier.map((e) => <Row key={e.id} e={e} onFocus={onFocus} />)}
              </div>
            </section>
          )}

          {/* ◆ 高水准 */}
          {aTier.length > 0 && (
            <section>
              <div className="font-pixel text-[8px] tracking-widest text-black/65 mb-1.5">◆ TIER A · 高水准 · 值得看</div>
              <div className="space-y-2">
                {aTier.map((e) => <Row key={e.id} e={e} onFocus={onFocus} />)}
              </div>
            </section>
          )}

          {/* ▫ 顺路 / 我导入的 */}
          {rest.length > 0 && (
            <section>
              <div className="font-pixel text-[8px] tracking-widest text-black/65 mb-1.5">▫ TIER B · 顺路看</div>
              <div className="space-y-2">
                {rest.map((e) => <Row key={e.id} e={e} onFocus={onFocus} />)}
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
                {(Object.keys(SKILL.rules.tiers) as ExTier[]).map((t) => (
                  <div key={t} className="flex gap-2">
                    <span className="shrink-0 font-pixel text-[7px] border border-black px-1 py-0.5 mt-0.5" style={{ background: TIER_COLOR[t] }}>{t}</span>
                    <span>{SKILL.rules.tiers[t]}</span>
                  </div>
                ))}
                <div className="pt-1 border-t border-black/15 text-black/60">
                  不收录：{SKILL.rules.excluded.join('；')}
                </div>
                <div className="text-black/60">
                  闭幕 ≤ {URGENT} 天的 S/A 展进入倒计时置顶提醒。
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={downloadSkillFile}
                className="font-pixel text-[7px] uppercase tracking-wider border-2 border-black bg-white px-2 py-1.5 shadow-[2px_2px_0_#000] active:translate-y-px">
                ⤓ 导出 .skill
              </button>
              {hiddenCount() > 0 && (
                <button onClick={unhideAll}
                  className="font-pixel text-[7px] uppercase tracking-wider border-2 border-black bg-white px-2 py-1.5 shadow-[2px_2px_0_#000] active:translate-y-px">
                  恢复 {hiddenCount()} 个已隐藏
                </button>
              )}
              <button
                onClick={() => {
                  if (!confirmingUnload) { setConfirmingUnload(true); return; }
                  setConfirmingUnload(false);
                  setExBrowserOpen(false);
                  setExSkillLoaded(false);
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
  const url = URL.createObjectURL(new Blob([exportExhibitionSkill()], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${SKILL.name}.skill`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// —— 一行展讯 ——
function Row({ e, urgent, onFocus }: { e: ExhibitionEntry; urgent?: boolean; onFocus: (e: ExhibitionEntry) => void }) {
  const left = daysLeft(e);
  const noGeo = !Number.isFinite(e.lng) || (e.lng === 0 && e.lat === 0);
  return (
    <div className={`border-2 bg-white p-2.5 shadow-[2px_2px_0_rgba(0,0,0,0.85)] ${urgent ? 'border-[#c0392b]' : 'border-black'}`}>
      <div className="flex items-start gap-2">
        <span className="shrink-0 font-pixel text-[8px] border-2 border-black px-1.5 py-1 mt-0.5" style={{ background: TIER_COLOR[e.tier] }}>
          {e.tier === 'S' ? '✦S' : e.tier}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-bold leading-snug">{e.title}</div>
          <div className="text-[9.5px] text-black/55 mt-0.5" style={{ fontFamily: YAHEI }}>
            {e.venueName} · {fmtRange(e)}{e.ticket ? ` · ${e.ticket}` : ''}
          </div>
        </div>
        {urgent && left !== null && (
          <span className="shrink-0 font-pixel text-[7px] border border-black bg-[#ff5a5a] text-white px-1.5 py-1">
            {left === 0 ? 'LAST' : `D-${left}`}
          </span>
        )}
      </div>
      {e.highlight && (
        <div className="mt-1 text-[10px] text-black/70 leading-snug line-clamp-2" style={{ fontFamily: YAHEI }}>{e.highlight}</div>
      )}
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="text-[8.5px] text-black/40" style={{ fontFamily: YAHEI }}>
          {e.source === 'screenshot' ? (e.sourceNote ?? '导入') : TIER_LABEL[e.tier]}
          {e.confidence !== 'high' ? ' · 待核' : ''}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {e.source === 'screenshot' ? (
            <button onClick={() => removeImportedExhibition(e.id)}
              className="font-pixel text-[6px] border border-black bg-white text-[#c0392b] px-1.5 py-1 active:translate-y-px">移除</button>
          ) : (
            <button onClick={() => hideExhibition(e.id)}
              className="font-pixel text-[6px] border border-black bg-white text-black/50 px-1.5 py-1 active:translate-y-px">隐藏</button>
          )}
          <button onClick={() => onFocus(e)} disabled={noGeo}
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
function DraftCard({ draft, onConfirm, onCancel }: {
  draft: ExImportDraft;
  onConfirm: (e: ExhibitionEntry) => void;
  onCancel: () => void;
}) {
  const [tier, setTier] = useState<ExTier>(draft.suggestedTier);
  const e = draft.entry;
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
  return (
    <div className="border-2 border-black bg-white p-3 shadow-[3px_3px_0_#000] space-y-2">
      <div className="font-pixel text-[8px] tracking-widest text-black/65">📷 识别结果 · 确认后上图</div>
      {draft.rejected && (
        <div className="border border-[#c0392b] bg-[#ff5a5a]/10 px-2 py-1 text-[9.5px] font-bold text-[#c0392b]" style={{ fontFamily: YAHEI }}>
          {draft.rejected}
        </div>
      )}
      <div className="text-[12px] font-bold">{e.title}</div>
      <div className="text-[9.5px] text-black/60" style={{ fontFamily: YAHEI }}>
        {e.venueName}
        {draft.placeVia === 'venue-table' && ' · 坐标已按场馆表校正 ✓'}
        {draft.placeVia === 'geocode' && ' · 坐标来自地理编码（可能有偏差）'}
        {noGeo && ' · 未解析出坐标——先收录，之后可在场馆表补'}
      </div>
      <div className="text-[9.5px] text-black/60" style={{ fontFamily: YAHEI }}>
        {e.dateStart || '?'} → {e.dateEnd || '?'}{e.ticket ? ` · ${e.ticket}` : ''}
      </div>
      {e.highlight && <div className="text-[10px] text-black/70" style={{ fontFamily: YAHEI }}>{e.highlight}</div>}
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] text-black/45" style={{ fontFamily: YAHEI }}>定级：</span>
        {(['S', 'A', 'B'] as ExTier[]).map((t) => (
          <button key={t} onClick={() => setTier(t)} aria-pressed={tier === t}
            className={`font-pixel text-[7px] border-2 border-black px-2 py-1 active:translate-y-px ${tier === t ? '' : 'opacity-40'}`}
            style={{ background: TIER_COLOR[t] }}>
            {t}
          </button>
        ))}
        <span className="text-[8.5px] text-black/40" style={{ fontFamily: YAHEI }}>{TIER_LABEL[tier]}</span>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button onClick={() => onConfirm({ ...e, tier, tierReason: `截图导入 · 我定为 ${TIER_LABEL[tier]}` })}
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
function ManualForm({ onDone, onCancel }: { onDone: (d: ExImportDraft) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [venue, setVenue] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const inputCls = 'w-full border-2 border-black bg-white px-2 py-1.5 text-[11px] focus:outline-none';
  return (
    <div className="border-2 border-black bg-white p-3 shadow-[2px_2px_0_#000] space-y-2">
      <div className="font-pixel text-[8px] tracking-widest text-black/65">✎ 手动录一条</div>
      <input className={inputCls} placeholder="展览名称 *" value={title} onChange={(ev) => setTitle(ev.target.value)} style={{ fontFamily: YAHEI }} />
      <input className={inputCls} placeholder="场馆（如 浙江美术馆）*" value={venue} onChange={(ev) => setVenue(ev.target.value)} style={{ fontFamily: YAHEI }} />
      <input className={inputCls} placeholder="闭幕日期（如 2026.7.26，可空）" value={dateEnd} onChange={(ev) => setDateEnd(ev.target.value)} style={{ fontFamily: YAHEI }} />
      <div className="flex items-center gap-2">
        <button disabled={!title.trim() || !venue.trim() || busy}
          onClick={() => {
            setBusy(true);
            void buildManualDraft({ title, venueName: venue, dateEnd }).then((d) => { setBusy(false); onDone(d); });
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
