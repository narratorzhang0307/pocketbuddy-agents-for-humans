import { useState } from 'react';
import type { FrostSkillPageReporter, FrostSkillPageResult } from '../../../frost-agent/harness/skillPageResult';

/** Only a page with an actual result or an explicit blocker can return to its correlated Frost task. */
export default function FrostSkillResultButton({ report, result }: { report?: FrostSkillPageReporter; result?: FrostSkillPageResult }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  if (!report) return null;
  const send = async () => {
    if (!result || busy) return;
    setBusy(true); setMessage('');
    try { await report(result); setMessage('已交回同一 Frost 会话，记下能力使用状态；不会把查询或打开页面当成吃过、练过。'); }
    catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  };
  return <div className="mt-3 border-t border-black/20 pt-2 text-[10px]">
    <button type="button" className="border-2 border-black bg-[#dff5e9] px-3 py-2 disabled:opacity-40" disabled={!result || busy || message.startsWith('已交回')}
      onClick={() => void send()}>{busy ? '正在交回…' : '将此结果交回 Frost'}</button>
    <p className="mt-1">{message || '只交回本页的简短结果；仍需先完成页面操作，不会把打开页面当作完成。'}</p>
  </div>;
}
