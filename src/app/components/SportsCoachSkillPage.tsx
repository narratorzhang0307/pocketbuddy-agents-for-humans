import { useEffect, useRef, useState } from 'react';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import { Activity, Camera, ChevronLeft, Square } from 'lucide-react';
import SkillAvatar from './SkillAvatar';
import { hasSportsCameraAccess, rememberSportsCameraAccess, readSportsCameraAutoStart, saveSportsCameraAutoStart } from '../lib/sports/cameraPreference';
import { acceptTaskHandoff, peekTaskHandoff } from '../../../frost-agent/harness/taskHandoff';
import { reportFrostSkillPageResult } from '../lib/frostAgentRuntime';
import { actionForRequest, drawSkeleton, PoseWindow, toCoco17, type Sport, type SportsAssessment } from '../lib/sports/pose';

interface Props { sport: Sport; onBack: () => void; backLabel?: string }

export default function SportsCoachSkillPage({ sport, onBack, backLabel = 'Back to Skills' }: Props) {
  const autoStartOnOpen = useRef(hasSportsCameraAccess() && readSportsCameraAutoStart() === true);
  const [autoStartEnabled, setAutoStartEnabled] = useState(() => readSportsCameraAutoStart() ?? true);
  const autoStartPreference = useRef(autoStartEnabled);
  const [handoff] = useState(() => peekTaskHandoff(sport.target));
  const [action, setAction] = useState(() => actionForRequest(sport, handoff?.userText || handoff?.objective || ''));
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [phase, setPhase] = useState<'idle' | 'starting' | 'running'>('idle');
  const [status, setStatus] = useState('Choose an action, then turn on the camera.');
  const [error, setError] = useState('');
  const [result, setResult] = useState<SportsAssessment | null>(null);
  const [aspect, setAspect] = useState(4 / 3);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef(0);
  const generation = useRef(0);
  const requestRef = useRef<AbortController | null>(null);
  const windowRef = useRef(new PoseWindow());
  const feedbackRef = useRef<SportsAssessment | null>(null);

  function release() {
    generation.current++;
    cancelAnimationFrame(rafRef.current);
    requestRef.current?.abort(); requestRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null;
    detectorRef.current?.close(); detectorRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    windowRef.current.reset(); feedbackRef.current = null;
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }

  function stop(message = 'Observation ended. The camera is off.') {
    release(); setPhase('idle'); setResult(null); setStatus(message);
  }

  useEffect(() => {
    if (handoff) void acceptTaskHandoff(sport.target).catch(() => setError('Could not receive the Frost task. Reopen this coach from Frost to try again.'));
  }, [handoff, sport.target]);

  async function sendFeedback() {
    if (!handoff?.agentSessionId || !result?.valid || sendingFeedback || feedbackSent) return;
    setSendingFeedback(true); setFeedbackMessage('');
    try {
      await reportFrostSkillPageResult(handoff, {
        status: 'completed',
        summary: `${sport.skillName}: observed ${result.cls_name} using the user-selected action. Rule-based score ${Math.round(result.score!)}/100. ${result.correction} This completes a pose observation, not a workout or repetition total.`,
      });
      setFeedbackSent(true);
      setFeedbackMessage('Feedback sent to your Frost conversation. No workout completion was recorded.');
    } catch { setFeedbackMessage('Could not send feedback to Frost. Please try again.'); }
    finally { setSendingFeedback(false); }
  }

  useEffect(() => {
    const hide = () => { if (document.hidden) stop('The page is in the background. The camera is off.'); };
    const pagehide = () => release();
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', pagehide);
    return () => {
      release(); document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', pagehide);
    };
  }, []);

  useEffect(() => {
    if (autoStartOnOpen.current && !document.hidden) void start();
  }, []);

  async function start() {
    release(); const run = generation.current;
    setPhase('starting'); setError(''); setResult(null); setFeedbackMessage(''); setStatus('Preparing pose observation…');
    try {
      const check = await fetch('/api/sports-coach/health', { signal: AbortSignal.timeout(12000) });
      const health = await check.json();
      if (!check.ok || health.ready !== true || health.protocol !== 'pocket-sports-pose/v1') throw new Error('Sports analysis is unavailable. Start the local service with the sports rules dependencies installed.');
      if (run !== generation.current) return;
      const { createSportsPoseDetector } = await import('../lib/sports/detector');
      const detector = await createSportsPoseDetector();
      if (run !== generation.current) { detector.close(); return; }
      detectorRef.current = detector;
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('The camera requires HTTPS or a localhost address.');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } }, audio: false });
      if (run !== generation.current) { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream;
      rememberSportsCameraAccess(); saveSportsCameraAutoStart(autoStartPreference.current);
      stream.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
        if (run === generation.current) stop('The camera disconnected. Turn it on again to continue.');
      }, { once: true }));
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      if (run !== generation.current) return;
      setAspect(video.videoWidth / video.videoHeight || 4 / 3);
      setPhase('running'); setStatus('Keep your whole body in view. Feedback appears after a continuous observation.');
      let lastVideoTime = -1, lastFrameAt = -Infinity, lastRequestAt = -Infinity;
      let observation = 0;
      const tick = (now: number) => {
        if (run !== generation.current) return;
        try {
          if (now - lastFrameAt > 250 && windowRef.current.frames.length) {
            observation++; windowRef.current.reset();
            requestRef.current?.abort(); requestRef.current = null;
            feedbackRef.current = null; setResult(null);
            setStatus('Video interrupted. Waiting for a clear, continuous view.');
            const canvas = canvasRef.current;
            if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
          }
          if (video.readyState >= 2 && video.currentTime !== lastVideoTime && now - lastFrameAt >= 50) {
            lastVideoTime = video.currentTime; lastFrameAt = now;
            const detected = detector.detectForVideo(video, now);
            const frame = toCoco17(detected.landmarks[0] || []);
            const buffer = windowRef.current;
            const ready = buffer.add(frame, now);
            if (!ready) {
              observation++;
              requestRef.current?.abort(); requestRef.current = null;
              feedbackRef.current = null; setResult(null);
              setStatus(buffer.frames.length ? `Observing · ${buffer.frames.length}/30 frames` : 'Waiting for a full-body view: keep your head, shoulders, wrists, hips, knees and ankles visible.');
            }
            const canvas = canvasRef.current;
            if (canvas) {
              if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
              if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
              if (frame) drawSkeleton(canvas, frame, feedbackRef.current?.affected_joints);
              else canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
            }
            if (ready && !requestRef.current && now - lastRequestAt >= 1000) {
              lastRequestAt = now;
              const epoch = observation, controller = new AbortController();
              requestRef.current = controller;
              const timer = window.setTimeout(() => controller.abort(), 12000);
              void fetch('/api/sports-coach/assess', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buffer.payload(sport.id, action, video.videoWidth, video.videoHeight)),
                signal: controller.signal,
              }).then(async response => {
                const value = await response.json();
                if (!response.ok) throw new Error(value.detail || 'Sports analysis is unavailable. Please try again.');
                if (run !== generation.current || epoch !== observation || controller.signal.aborted) return;
                if (value.protocol !== 'pocket-sports-pose/v1' || value.sport !== sport.id || value.cls_id !== action) throw new Error('The result does not match this exercise. Please try again.');
                feedbackRef.current = value; setResult(value); setError('');
                setStatus(value.valid ? 'Observing · orange joints indicate areas to check' : value.invalid_reason);
              }).catch(reason => {
                if (run !== generation.current || epoch !== observation) return;
                feedbackRef.current = null; setResult(null);
                setError(reason instanceof Error && reason.name === 'AbortError' ? 'Analysis timed out. Retrying…' : String(reason instanceof Error ? reason.message : reason));
              }).finally(() => {
                window.clearTimeout(timer);
                if (requestRef.current === controller) requestRef.current = null;
              });
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        } catch (reason) {
          stop('Pose tracking has stopped.'); setError(reason instanceof Error ? reason.message : 'Pose tracking failed. Please try again.');
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (reason) {
      if (run !== generation.current) return;
      stop('Pose observation has not started.');
      if (reason instanceof DOMException && (reason.name === 'NotAllowedError' || reason.name === 'SecurityError')) {
        autoStartPreference.current = false; setAutoStartEnabled(false); saveSportsCameraAutoStart(false);
      }
      setError(reason instanceof DOMException && reason.name === 'NotAllowedError'
        ? 'Camera access is blocked. Allow it in your browser or system settings, then try again.'
        : reason instanceof Error ? reason.message : 'Could not start. Please try again.');
    }
  }

  return <div className="flex h-full min-h-0 flex-col text-black" style={{ backgroundColor: sport.accent }} data-sports-coach={sport.id}>
    <header className="flex shrink-0 items-center gap-3 border-b-2 border-black bg-white p-3">
      <button type="button" aria-label={backLabel} onClick={() => { release(); onBack(); }} className="grid h-10 w-10 place-items-center border-2 border-black"><ChevronLeft size={20} /></button>
      <SkillAvatar skillId={sport.skillId} size={42} />
      <div className="flex-1"><h1 className="text-base font-black">{sport.skillName}</h1><p className="text-[10px] text-black/55">{sport.mascot} · 17 pose landmarks</p></div>
      <Activity size={22} />
    </header>
    <main className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
      {handoff && <p className="border border-black/20 bg-white/60 p-2 text-xs"><b>From Frost: </b>{handoff.objective}</p>}
      <section className="space-y-2">
        <label className="block text-xs font-bold" htmlFor="sports-action">Practice action</label>
        <select id="sports-action" value={action} disabled={phase !== 'idle'} onChange={event => { setAction(Number(event.target.value)); setResult(null); }} className="w-full border-2 border-black bg-white p-3 text-sm">
          {sport.actions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        {phase !== 'idle' && <p className="text-[11px] text-black/60">Stop observation to change the action.</p>}
        <p className="text-[11px] leading-relaxed text-black/60">Select the action you are practicing. Feedback uses pose rules; it does not automatically classify the action.</p>
      </section>
      <div className="relative overflow-hidden border-2 border-black bg-[#182a22]" style={{ aspectRatio: aspect }}>
        <video ref={videoRef} muted playsInline className="absolute inset-0 h-full w-full object-contain" style={{ transform: 'scaleX(-1)' }} />
        <canvas ref={canvasRef} aria-label="Body pose landmarks" className="absolute inset-0 h-full w-full object-contain" style={{ transform: 'scaleX(-1)' }} />
        {phase !== 'running' && <div className="absolute inset-0 grid place-content-center gap-3 text-center text-white/75"><Camera className="mx-auto" size={32} /><span className="mx-auto max-w-[250px] px-3 text-sm">{phase === 'starting' ? 'Preparing the camera…' : 'Keep your whole body in view and leave room to move'}</span></div>}
        <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-[10px] text-white">{phase === 'running' ? '● Camera on' : 'Camera off'}</span>
      </div>
      <p role="status" className="text-xs leading-relaxed">{status}</p>
      {error && <p role="alert" className="border border-[#bf442e] bg-[#fff0e9] p-3 text-xs text-[#9c3020]">{error}</p>}
      {result?.valid && <section aria-label="Pose feedback" className="space-y-3 border-2 border-black bg-white p-4">
        <div className="flex items-center justify-between"><div className="text-xs"><b>{result.cls_name}</b><p className="mt-1 text-black/50">Selected action · rule-based score</p></div><strong className="text-3xl">{Math.round(result.score!)}<span className="text-xs text-black/45"> / 100</span></strong></div>
        <p className="text-sm leading-relaxed">{result.correction}</p>
        {result.errors.length > 0 && <ul className="space-y-1 text-xs text-[#9c3020]">{result.errors.slice(0, 3).map(item => <li key={item.code}>{item.name}</li>)}</ul>}
        {typeof result.n_hops === 'number' && <p className="text-xs text-black/60">{result.n_hops} jumps observed in this window{result.tempo_spm ? ` · about ${Math.round(result.tempo_spm)} jumps/min` : ''}. Windows overlap; this is not a workout total.</p>}
        {handoff?.agentSessionId && <div className="border-t border-black/15 pt-3">
          <button type="button" disabled={sendingFeedback || feedbackSent}
            onClick={() => void sendFeedback()} className="border-2 border-black bg-[#e8f8ef] px-3 py-2 text-xs font-bold disabled:opacity-50">
            {sendingFeedback ? 'Sending feedback…' : 'Send this feedback to Frost'}
          </button>
          {feedbackMessage && <p role="status" className="mt-2 text-xs">{feedbackMessage}</p>}
        </div>}
      </section>}
      <p className="text-[11px] leading-relaxed text-black/55">Pose landmarks are extracted on your device. Only coordinates go to this app’s analysis service; video is never uploaded or saved. Keep the camera still and stop if you feel discomfort.</p>
      <label className="flex items-start gap-2 text-xs leading-relaxed">
        <input type="checkbox" checked={autoStartEnabled} onChange={event => {
          const enabled = event.target.checked; autoStartPreference.current = enabled; setAutoStartEnabled(enabled);
          // Enabling this before the first camera grant must not count as prior consent.
          saveSportsCameraAutoStart(enabled);
        }} className="mt-0.5" />
        <span>Auto-start the camera when I open a sports coach.<span className="mt-1 block text-[11px] text-black/55">After your first successful camera access, this applies to all five sports coaches on this browser. Turn it off here at any time.</span></span>
      </label>
      <button type="button" onClick={() => phase === 'idle' ? void start() : stop()} className="flex w-full items-center justify-center gap-2 border-2 border-black bg-[#7cff6b] p-3 text-sm font-black shadow-[3px_3px_0_#000]">
        {phase === 'idle' ? <Camera size={18} /> : <Square size={18} />}{phase === 'idle' ? hasSportsCameraAccess() ? 'Start observation' : 'Allow camera and start' : phase === 'starting' ? 'Cancel start' : 'Stop observation'}
      </button>
    </main>
  </div>;
}
