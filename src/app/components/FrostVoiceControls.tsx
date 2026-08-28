import { useEffect, useState } from 'react';
import { frostBadge } from '../lib/frostBadge';
import { pcmWave } from '../lib/frostBadgeProtocol';
import { FROST_VOICE_MAX_TEXT, requestFrostVoice, type FrostVoiceAudio } from '../lib/frostVoice';

interface Props {
  reply?: string;
  connected: boolean;
  recording: boolean;
  working: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}

export default function FrostVoiceControls({ reply, connected, recording, working, run }: Props) {
  const [text, setText] = useState('你好。'), [accessCode, setAccessCode] = useState('');
  const [audio, setAudio] = useState<(FrostVoiceAudio & { text: string }) | null>(null);
  const [waveUrl, setWaveUrl] = useState(''), [generating, setGenerating] = useState(false);
  useEffect(() => {
    if (!audio) { setWaveUrl(''); return; }
    const wave = pcmWave(audio.pcm);
    const url = URL.createObjectURL(new Blob([wave.buffer as ArrayBuffer], { type: 'audio/wav' }));
    setWaveUrl(url); return () => URL.revokeObjectURL(url);
  }, [audio]);
  const count = [...text.trim()].length, cached = audio?.text === text.trim();
  const button = 'border border-black/30 rounded px-2 py-1 text-xs disabled:opacity-40';
  const generate = async () => {
    if (cached) return;
    setGenerating(true);
    try { const result = await requestFrostVoice(text, accessCode); setAudio({ ...result, text: text.trim() }); }
    finally { setGenerating(false); }
  };
  return <div className="space-y-2 border-t border-black/20 pt-2" aria-label="Frost MiniMax 语音">
    <b>Frost 语音回复 · MiniMax</b>
    <p>仅手动生成：把下面短句发给 MiniMax 合成语音，可能计费；试听和回放复用音频，不再调用 API。吧唧录音请使用上方本机转文字。</p>
    <label className="block">朗读短句（{count}/{FROST_VOICE_MAX_TEXT} 字）
      <textarea aria-label="朗读短句" value={text} disabled={working} rows={2}
        onChange={e => setText([...e.target.value].slice(0, FROST_VOICE_MAX_TEXT).join(''))}
        className="mt-1 block w-full resize-y rounded border border-black/30 bg-white p-2 text-sm" />
    </label>
    <div className="flex flex-wrap gap-2">
      <button className={button} disabled={working || !reply} onClick={() => setText([...(reply || '').trim()].slice(0, FROST_VOICE_MAX_TEXT).join(''))}>填入最近回复（最多 100 字）</button>
      <button className={button} disabled={working || !count || cached} onClick={() => void run(generate)}>{generating ? '生成中，勿重复点击…' : cached ? '这段已生成' : '生成语音（可能计费）'}</button>
    </div>
    <details>
      <summary>后端语音访问设置</summary>
      <p>本机开发无需填写；手机连接云端时需配置独立访问码。请勿粘贴 MiniMax API Key。</p>
      <input aria-label="后端语音访问码" type="password" autoComplete="off" spellCheck={false} value={accessCode}
        disabled={working} onChange={e => setAccessCode(e.target.value)} placeholder="仅本次页面内存保存"
        className="mt-1 w-full rounded border border-black/30 bg-white px-2 py-1" />
    </details>
    {audio && waveUrl && <div className="space-y-2">
      <p>已生成“{audio.text}” · {(audio.durationMs / 1000).toFixed(1)} 秒。可重复播放。</p>
      <audio controls src={waveUrl} aria-label="MiniMax 语音试听" className="h-8 max-w-full" />
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={working || !connected || recording} onClick={() => void run(() => frostBadge.playPcm(audio.pcm))}>播放到吧唧（不再计费）</button>
        <button className={button} disabled={working} onClick={() => setAudio(null)}>清除这段语音</button>
      </div>
    </div>}
  </div>;
}
