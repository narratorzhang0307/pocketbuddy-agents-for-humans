import { useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { edgeSafe } from '../../../frost-agent/edge/contract';
import { runEdgeChatEvidence } from '../../../frost-agent/edge/httpEdge';
import { assembleMemory } from '../lib/memoryRouter';
import { HUMAN_VOICE, cleanVoice } from '../../../frost-agent/harness/persona';
import { streamText } from '../../../frost-agent/sync/stream';
import { streamComplete } from '../lib/streamComplete';
import AgentLuIcon from './AgentLuIcon';
import UserZhaIcon from './UserZhaIcon';

// 通用「对话层」：各 Skill（读书 / 观影 / 城市播客）共用的对话框。
// 默认由 Qwen/MNN 端侧完成分类与回答；只有用户明确切到「云端增强」才上传文字上下文。
// 数据接地：每次发送把用户该领域的记录(context)注入 system，让回答基于「你的书/你的观影/你的城市」。

export interface AgentChatConfig {
  accent: string;
  persona: string;            // system 人设
  context: () => string;      // 用户数据摘要（每次发送时取最新）
  placeholder: string;
  suggestions: string[];
  intentLabels?: string[];    // 端侧意图分类标签（可选）
  // 「这部作品用户接触过吗」查询（命中已看/已读全集则返回标注词如「看过」，否则 null）。
  // 用于推荐去重：扫云脑回复里的《作品名》，把用户已看过的当场标出来（确定性兜底，不靠云脑自觉）。
  checkSeen?: (title: string) => string | null;
}

type ChatBackend = 'edge' | 'cloud';
interface ExecutionEvidence { backend: string; model?: string; elapsedMs?: number }
interface Turn { role: 'user' | 'agent'; text: string; intent?: string; error?: boolean; execution?: ExecutionEvidence }

// 用户是否在要「没接触过的新东西」（→ 走源头过滤路径，别事后红标注补救）。
// 明确要「经典/名著」则不算（那种就是想聊已知作品，红标注可出现）。
function wantsNew(text: string): boolean {
  if (/经典|名著|影史|公认|必看|史上最|神作|最好的(电影|书|片)|豆瓣(高分|top)|classic|masterpiece|greatest|best ever|must[- ]watch|must[- ]read|acclaimed|top rated/i.test(text)) return false;
  return /推荐|推.{0,3}[部本张首个]|没看过|没读过|没听过|周末|换一?批|换个|还有(什么|没|别的)|再来[一几]?|新片|新书|冷门|小众|有没有.{0,6}(推|没)|recommend|suggest|something new|haven't (seen|read|heard)|never (seen|read|heard)|another|more like|weekend|obscure|niche|underrated/i.test(text);
}
// 从云脑文本里抠出第一个 JSON 对象（容忍 ```json 包裹）
function extractJSON(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : text;
  const s = body.indexOf('{'); const e = body.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(body.slice(s, e + 1)) as Record<string, unknown>; } catch { return null; }
}

export default function AgentChat({ config }: { config: AgentChatConfig }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [backend, setBackend] = useState<ChatBackend>('edge');
  const endRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const lastAskRef = useRef('');
  const streamRef = useRef<{ cancel: () => void; done: Promise<void> } | null>(null);
  useEffect(() => () => { mountedRef.current = false; streamRef.current?.cancel(); }, []);   // 卸载时取消在飞的逐字流，清掉 streamText 内部 interval（否则它会对死组件空跑约 90 次）
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns.length, busy]);

  // 严格按当前选择调用模型。端侧失败时不静默切云，避免把云端结果冒充本机结果。
  const modelJSON = async (system: string, prompt: string): Promise<{ value: Record<string, unknown> | null; execution?: ExecutionEvidence }> => {
    if (backend === 'edge') {
      const response = await runEdgeChatEvidence(prompt, { system, json: true, maxTokens: 420 });
      const text = typeof response.text === 'string' ? response.text.trim() : '';
      return {
        value: response.backend !== 'stub' ? extractJSON(text) : null,
        execution: response.backend !== 'stub'
          ? { backend: response.backend, model: response.model || response.stats?.model, elapsedMs: response.stats?.elapsedMs }
          : undefined,
      };
    }
    try {
      const r = await fetch('/api/frost-llm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ system, prompt, json: true }) });
      if (!r.ok) return { value: null };
      const d = await r.json();
      return { value: extractJSON(typeof d?.text === 'string' ? d.text : ''), execution: { backend: 'qwen-cloud' } };
    } catch { return { value: null }; }
  };

  // 「推荐没看过的」源头过滤：云脑出候选 → 本地 checkSeen 硬过滤已看 → 不够回炉（最多 3 轮）
  // → 只返回「真没看过」的推荐文案；一个都找不到（库太全/失败）返回 null，调用方回退普通对话。
  const buildNewRecs = async (text: string, history: string): Promise<{ text: string; execution?: ExecutionEvidence } | null> => {
    const checkSeen = config.checkSeen;
    if (!checkSeen) return null;
    const memory = assembleMemory();
    const baseSys = `${config.persona}\n\n${memory ? memory + '\n\n' : ''}[User data]\n${config.context()}\n\nThe user wants you to recommend things they have NOT encountered. Using their taste profile, list 10 candidates that match that taste, favouring obscure / niche / recent work. Reply in English. Output JSON only: {"items":[{"title":"work title (no brackets)","why":"one line on why it suits them, ≤ 12 words"}]}, with no explanation.`;
    const pool: { title: string; why: string }[] = [];
    const seen: string[] = [];
    let execution: ExecutionEvidence | undefined;
    for (let round = 0; round < 3 && pool.length < 3; round++) {
      const avoid = seen.length ? `\nThey have already encountered these, so never bring them up again, and do not recommend their famous lookalikes either: ${seen.join(', ')}. Go more obscure.` : '';
      const result = await modelJSON(baseSys + avoid, `${history ? history + '\n' : ''}User: ${text}`);
      const obj = result.value;
      execution = result.execution || execution;
      const items = (obj?.items as { title?: string; why?: string }[] | undefined) || [];
      if (!items.length) break;
      for (const it of items) {
        const title = String(it?.title || '').replace(/《|》/g, '').trim();
        if (!title) continue;
        if (checkSeen(title)) { const m = `《${title}》`; if (!seen.includes(m)) seen.push(m); }
        else if (!pool.some((p) => p.title === title)) pool.push({ title, why: String(it?.why || '').trim() });
      }
    }
    if (!pool.length) return null;
    return { text: "Picked a few you probably haven't come across:\n" + pool.slice(0, 3).map((p) => `《${p.title}》${p.why}`).join('\n'), execution };
  };

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || busy) return;
    setInput('');
    lastAskRef.current = text;   // 供「重试」回放
    const history = turns.slice(-6).map((t) => `${t.role === 'user' ? 'User' : 'Me'}: ${t.text}`).join('\n');
    setTurns((t) => [...t, { role: 'user', text }]);
    setBusy(true);
    try {
      // 端侧意图分类（端侧「挑」），失败/空则跳过
      let intent = '';
      if (config.intentLabels?.length) {
        intent = await edgeSafe.classify(text, config.intentLabels);  // 契约入口：带兜底+健康追踪，失败返回''
      }

      let reply = '';
      let failed = false;
      let execution: ExecutionEvidence | undefined;
      let streamedLive = false;   // 真 SSE 已在气泡里逐 token 填完 → 不再走打字机
      let bubblePushed = false;   // 气泡是否已放（brain 路径会放空气泡；buildNewRecs 专路不放）
      const setLast = (patch: Partial<Pick<Turn, 'text' | 'error' | 'execution'>>) =>
        setTurns((t) => { const n = [...t]; const li = n.length - 1; if (n[li]?.role === 'agent') n[li] = { ...n[li], ...patch }; return n; });
      // 「推荐没看过的」专路：源头先把已看的候选过滤掉，从根上避免推已看（不靠事后红标注补救）。
      if (config.checkSeen && wantsNew(text)) {
        try {
          const recommendation = await buildNewRecs(text, history);
          reply = recommendation?.text || '';
          execution = recommendation?.execution;
        } catch { reply = ''; }
      }
      // 普通对话（含「推经典」场景、讨论、找片）：端侧直接走 MNN；云端仅在用户主动切换后使用。
      if (!reply) {
        const memory = assembleMemory();   // 长期记忆经记忆中枢统一装配后注入云脑 system
        const system = `${config.persona}\n\n${memory ? memory + '\n\n' : ''}[User data]\n${config.context()}\n\n${HUMAN_VOICE}\n\nRequirements: reply in English, grounded in the user's taste profile, like a friend who really knows the field: specific and opinionated, no more than 120 words. [If the user asks for a recommendation] only recommend obscure, niche or recent work they have most likely NOT seen / read / heard, and deliberately avoid famous mainstream classics (they have almost certainly encountered those already); for each one say why it suits their taste; never recommend something they have probably already encountered.`;
        const prompt = `${history ? history + '\n' : ''}User: ${text}`;
        if (backend === 'edge') {
          try {
            const response = await runEdgeChatEvidence(prompt, { system, maxTokens: 360 });
            reply = cleanVoice(typeof response.text === 'string' ? response.text : '');
            failed = response.backend === 'stub' || !reply;
            if (!failed) execution = { backend: response.backend, model: response.model || response.stats?.model, elapsedMs: response.stats?.elapsedMs };
          } catch { failed = true; }
          if (!reply) reply = 'On-device Qwen returned nothing usable this time. Check that Qwen Base / MNN is ready, then retry. Your text is never uploaded to the cloud automatically.';
        } else {
          if (!mountedRef.current) return;
          setTurns((t) => [...t, { role: 'agent', text: '', intent: intent || undefined }]); bubblePushed = true;
          try {
            const full = await streamComplete(prompt, { system, onToken: (_tok, soFar) => { if (mountedRef.current) setLast({ text: soFar }); } });
            reply = cleanVoice(full) || "Nothing came back on my side. Try phrasing it another way.";
            execution = { backend: 'qwen-cloud' };
            if (mountedRef.current) setLast({ text: reply, execution });
            streamedLive = true;
          } catch {
            try {
              const r = await fetch('/api/frost-llm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, system }) });
              if (r.ok) { const d = await r.json(); reply = cleanVoice(typeof d?.text === 'string' ? d.text : ''); execution = { backend: 'qwen-cloud' }; } else failed = true;
            } catch { failed = true; }
            if (!reply) reply = failed ? 'Cloud boost is unavailable right now. Switch back to On-device to keep using it offline.' : "Nothing came back on my side. Try phrasing it another way.";
          }
        }
      }
      if (!mountedRef.current) return;        // 期间卸载 → 不再 setState
      if (streamedLive) return;               // 真流式已填完，结束
      // buildNewRecs 专路 / 流式回落：仍用打字机逐字填（专路无气泡则补放、回落气泡已在）
      if (!bubblePushed) {
        setTurns((t) => [...t, { role: 'agent', text: '', intent: intent || undefined, error: failed, execution }]);
      } else { setLast({ error: failed, execution }); }
      let acc = '';
      const handle = streamText(reply, (e) => {
        if (!mountedRef.current) return;     // 卸载后停止填充，避免对已卸载组件 setState
        if (e.phase === 'delta' && e.delta) { acc += e.delta; const cur = acc; setLast({ text: cur }); }
        else if (e.phase === 'end') { setLast({ text: reply }); }
      });
      streamRef.current = handle;
      try { await handle.done; } finally { streamRef.current = null; }
    } finally {
      if (mountedRef.current) setBusy(false);   // try/finally：任何抛错也不把对话框永久锁死
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#EAEAEA] min-h-0">
      <div className="shrink-0 flex items-center justify-between border-b-2 border-black bg-white px-3 py-2">
        <div>
          <div className="font-pixel text-[7px] tracking-widest">QWEN RUNS ON</div>
          <div className="mt-0.5 text-[9px] text-black/45">On-device uploads no text; cloud is yours to switch on</div>
        </div>
        <div className="flex border-2 border-black bg-[#EAEAEA] p-0.5">
          <button type="button" disabled={busy} onClick={() => setBackend('edge')} className={`px-2 py-1 text-[10px] font-bold ${backend === 'edge' ? 'bg-black text-[#7CFF6B]' : 'text-black/45'}`}>On-device</button>
          <button type="button" disabled={busy} onClick={() => setBackend('cloud')} className={`px-2 py-1 text-[10px] font-bold ${backend === 'cloud' ? 'bg-black text-[#7CFF6B]' : 'text-black/45'}`}>Cloud boost</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3 min-h-0">
        {turns.length === 0 && (
          <div className="text-[11px] text-black/50 leading-relaxed bg-white border-2 border-black p-3 shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
            Try asking:
            <div className="flex flex-wrap gap-1.5 mt-2">
              {config.suggestions.map((s) => (
                <button key={s} onClick={() => ask(s)} className="text-[11px] px-2 py-0.5 border-2 border-black bg-[#EAEAEA] hover:bg-black/5 active:translate-y-px">{s}</button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) => t.role === 'user' ? (
          <div key={i} className="self-end flex flex-row-reverse items-start gap-2 max-w-[88%]">
            <div className="shrink-0 mt-0.5"><UserZhaIcon size={26} ring="#111" /></div>
            <div className="text-white border-2 border-black px-3 py-2 text-[12px] leading-relaxed shadow-[2px_2px_0_rgba(0,0,0,0.85)]" style={{ background: '#111' }}>{t.text}</div>
          </div>
        ) : (
          <div key={i} className="flex items-start gap-2 max-w-[94%]">
            <div className="shrink-0 mt-0.5"><AgentLuIcon size={26} /></div>
            <div className="flex flex-col gap-1 min-w-0">
              <div className="font-pixel text-[7px] tracking-[0.2em] flex items-center gap-1.5" style={{ color: t.error ? '#d23b3b' : config.accent }}>
                {t.error ? '✕ CONNECTION FAILED' : 'AGENT'}
                {t.intent && !t.error && <span className="not-italic" style={{ color: config.accent }}>· on-device intent: {t.intent}</span>}
              </div>
              {t.execution && !t.error && <div className="text-[9px] text-black/45">{t.execution.backend === 'mnn' ? 'MNN on-device' : t.execution.backend === 'qwen-cloud' ? 'Qwen Cloud boost' : t.execution.backend}{t.execution.model ? ` · ${t.execution.model}` : ''}{typeof t.execution.elapsedMs === 'number' ? ` · ${(t.execution.elapsedMs / 1000).toFixed(1)}s` : ''}</div>}
              <div className={`bg-white border-2 px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap shadow-[2px_2px_0_rgba(0,0,0,0.85)] ${t.error ? 'border-[#d23b3b]' : 'border-black'}`}>{t.text}</div>
              {config.checkSeen && !t.error && (() => {
                // 确定性去重：扫回复里的《作品名》，把命中已看/已读全集的当场标红（不靠云脑自觉）
                const titles = [...new Set(t.text.match(/《[^》]+》/g) || [])];
                const seen = titles.map((m) => { const lb = config.checkSeen!(m.slice(1, -1)); return lb ? `${m} (${lb})` : null; }).filter(Boolean) as string[];
                if (!seen.length) return null;
                return <div className="text-[10px] text-[#d23b3b] leading-snug">⚠ You have already met these: {seen.join(', ')} — say the word and I will swap in ones you have not.</div>;
              })()}
              {t.error && !busy && (
                <button onClick={() => ask(lastAskRef.current)} className="self-start font-pixel text-[7px] border border-black px-2 py-0.5 bg-white text-[#d23b3b] active:translate-y-px">Retry</button>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="font-pixel text-[8px] text-black/45 tracking-widest animate-pulse">⋯ {backend === 'edge' ? 'QWEN / MNN ON-DEVICE' : 'QWEN CLOUD BOOST'} ⋯</div>}
        <div ref={endRef} />
      </div>

      <div className="px-3 py-3 border-t-2 border-black bg-white shrink-0">
        <form className="flex gap-2 items-center" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
          <input
            type="text" value={input} onChange={(e) => setInput(e.target.value)} disabled={busy}
            placeholder={config.placeholder}
            className="flex-1 h-10 border-2 border-black bg-[#EAEAEA] text-[12px] px-3 outline-none focus:bg-white transition-colors min-w-0 disabled:opacity-50"
          />
          <button type="submit" disabled={busy || !input.trim()} className="w-10 h-10 border-2 border-black flex items-center justify-center active:translate-y-px shrink-0 disabled:opacity-30 text-black" style={{ background: config.accent }}>
            <ArrowUp className="w-4 h-4" strokeWidth={3} />
          </button>
        </form>
      </div>
    </div>
  );
}
