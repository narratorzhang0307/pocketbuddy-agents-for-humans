import { useEffect, useRef, useState } from 'react';
import { frostBadge } from '../lib/frostBadge';

export interface BadgeVoiceDraft { text: string; inputId: string }

/** Explicit local ASR -> editable draft. This component cannot send a message or issue an approval. */
export default function FrostBadgeSpeechControls({ pcmId, recording, onDraft }: {
  pcmId?: string; recording: boolean; onDraft: (draft: BadgeVoiceDraft) => void;
}) {
  const [draft, setDraft] = useState<BadgeVoiceDraft | null>(null);
  const [recognizing, setRecognizing] = useState(false), [error, setError] = useState('');
  const ownsRecognition = useRef(false);
  useEffect(() => {
    setDraft(null); setError('');
    return () => { if (ownsRecognition.current) { ownsRecognition.current = false; void frostBadge.cancelTranscription().catch(() => {}); } };
  }, [pcmId]);
  const recognize = async () => {
    setRecognizing(true); setError(''); setDraft(null);
    ownsRecognition.current = true;
    try { setDraft(await frostBadge.transcribeRecording()); }
    catch (error) { setError(String(error)); }
    finally { ownsRecognition.current = false; setRecognizing(false); }
  };
  const button = 'border border-black/30 rounded px-2 py-1 text-xs disabled:opacity-40';
  return <div className="space-y-2 border-t border-black/20 pt-2" aria-label="吧唧语音指令">
    <b>吧唧语音 → 同一个 Frost</b>
    <p>本机中文识别，不上传录音；仅在你确认发送后，文字才进入现有 Frost 会话，并可能发送给云端模型。任务授权仍在手机确认。</p>
    <button className={button} disabled={!pcmId || recording || recognizing} onClick={() => void recognize()}>{recognizing ? '本机识别中…' : '本机转文字'}</button>
    {recognizing && <button className={`${button} ml-2`} onClick={() => void frostBadge.cancelTranscription().catch(error => setError(String(error)))}>取消识别</button>}
    {draft && draft.inputId === pcmId && <>
      <textarea aria-label="吧唧语音文字草稿" value={draft.text} rows={3} maxLength={2000}
        onChange={e => setDraft({ ...draft, text: e.target.value })}
        className="block w-full rounded border border-black/30 bg-white p-2 text-sm" />
      <button className={button} disabled={!draft.text.trim()} onClick={() => { onDraft(draft); setDraft(null); }}>填入 Frost 输入框（暂不发送）</button>
    </>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </div>;
}
