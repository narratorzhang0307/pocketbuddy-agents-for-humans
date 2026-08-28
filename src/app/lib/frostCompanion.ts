import type { FrostAgentEvent, FrostAgentStatus } from '../../../frost-agent/runtime/contracts';
import { taskFromEvents } from '../../../frost-agent/runtime/turnContext';
import type { BadgeStatus } from './frostBadge';
import type { BadgePose } from './frostBadgeProtocol';
import { readFrostConversationReply, type FrostConversationReply } from './frostConversation';
import type { FrostAgentRunNotice, FrostAgentRunResult, FrostMessageOrigin } from './frostAgentRuntime';
import { presentFrostAgentRun } from './frostAgentPresentation';
import { BADGE_AVATAR_ENDPOINT, skillAvatarFor } from './skill/avatars';
import { tryVoiceTreeCommand } from '../../../vendor/legacy-city/src/app/lib/pocket-plants/voicePlanting';
import { tryVoiceMapCommand } from '../../../vendor/legacy-city/src/app/lib/location/voiceMapMode';

export interface FrostVoiceState {
  autoSend: boolean;
  enabled: boolean;
  phase: 'off' | 'ready' | 'listening' | 'transcribing' | 'sending' | 'speaking' | 'error';
  transcript: string;
  spokenText: string;
  error?: string;
}

export interface FrostCompanionState {
  sessionId?: string;
  userId: string;
  status: FrostAgentStatus;
  pose: BadgePose;
  avatarId: string;
  reply: string;
  task?: { id: string; status: string; message: string };
  attention?: string;
  error?: string;
  projectionError?: string;
  resultTone: boolean;
  voice: FrostVoiceState;
}

interface CompanionPorts {
  history(): Promise<FrostAgentEvent[]>;
  observe(listener: (event: FrostAgentEvent) => void): () => void;
  record(input: { id: string; kind: 'touch' | 'recording_ready'; count?: number; bytes?: number }): Promise<void>;
  badge: { snapshot(): BadgeStatus; subscribe(listener: () => void): () => void; projectPose(pose: BadgePose): Promise<void>; projectAvatar?(skillId: string): Promise<void>; testSpeaker(): Promise<void> };
  voice?: {
    transcribe(): Promise<{ text: string; inputId: string }>;
    handleLocalCommand?(text: string, inputId: string, signal: AbortSignal): Promise<boolean | { message: string }>;
    speak(text: string): Promise<void>;
    speakAnswer?(text: string, ticket: string, signal: AbortSignal): Promise<void>;
    stop(): Promise<void>;
    cancel(): Promise<void>;
    send(text: string, origin: FrostMessageOrigin): Promise<FrostAgentRunResult>;
    observe(listener: (notice: FrostAgentRunNotice) => void): () => void;
  };
}

const VOICE_AUTO_SEND_KEY = 'pe.frost.badge.auto-send.v1';
function voiceAutoSendPreference(): boolean {
  try { return localStorage.getItem(VOICE_AUTO_SEND_KEY) !== 'false'; } catch { return true; }
}
const initial = (autoSend = true): FrostCompanionState => ({ sessionId: undefined, userId: 'local-user', status: 'idle', pose: 'idle', avatarId: 'frost',
  reply: '', task: undefined, attention: undefined, error: undefined, projectionError: undefined, resultTone: false,
  voice: { autoSend, enabled: false, phase: 'off', transcript: '', spokenText: '' } });
const taskMessages: Record<string, string> = {
  completed: '任务已完成，详情请查看手机。', waiting_confirmation: '任务等待你在手机确认权限。',
  waiting_external: '已交给能力页面，等待真实结果。', running: '任务正在执行。',
  failed: '任务未完成，请查看手机。', safe_stopped: '任务已安全停止，请查看手机。',
};

/** Presentation/input adapter only. No model, Taskmaster executor or approval authority lives here. */
export class FrostCompanion {
  private value = initial(voiceAutoSendPreference());
  private listeners = new Set<() => void>();
  private release?: () => void;
  private epoch = 0;
  private cursor = 0;
  private seenInputs = new Set<string>();
  private seenOutcomes = new Set<string>();
  private sentPose = '';
  private foreground = true;
  private lastConnection?: string;
  private outcomeTimer?: ReturnType<typeof setTimeout>;
  private voiceEpoch = 0;
  private speechEpoch = 0;
  private answerSpeech?: AbortController;
  private localCommand?: AbortController;
  private voiceInputs = new Set<string>();
  private spokenRuns = new Set<string>();
  private pageRuns = new Set<string>();
  private voiceSending?: { inputId: string; epoch: number };
  private wasRecording = false;
  private hydrated = false;
  private voiceCaptureConnection?: string;
  constructor(private readonly ports: CompanionPorts) {}
  snapshot = () => this.value;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<FrostCompanionState>) {
    this.value = { ...this.value, ...patch };
    for (const listener of this.listeners) { try { listener(); } catch { /* presentation observer only */ } }
  }
  setResultTone(enabled: boolean) { this.update({ resultTone: enabled }); }
  setActiveSkill(idOrTarget?: string) {
    const avatarId = skillAvatarFor(idOrTarget).id;
    if (avatarId !== this.value.avatarId) { this.update({ avatarId }); this.project(); }
  }
  clearAttention() { this.update({ attention: undefined }); this.project(); }
  setForeground(active: boolean) {
    this.foreground = active; this.sentPose = '';
    this.syncVoiceMode();
    if (active) this.project();
  }
  private updateVoice(patch: Partial<FrostVoiceState>) { this.update({ voice: { ...this.value.voice, ...patch } }); }
  setVoiceMode(enabled: boolean) {
    // A persistent preference, not the transient connection/foreground state.
    try { localStorage.setItem(VOICE_AUTO_SEND_KEY, String(enabled)); } catch { /* private mode */ }
    this.updateVoice({ autoSend: enabled });
    this.syncVoiceMode();
  }
  private syncVoiceMode() {
    const badge = this.ports.badge.snapshot();
    const available = this.hydrated && this.value.voice.autoSend && !!this.ports.voice && this.foreground
      && badge.status === 'connected' && !!this.value.sessionId && badge.microphoneAvailable !== false;
    if (!available) this.setVoiceActive(false);
    else if (!this.value.voice.enabled && !badge.recording) this.setVoiceActive(true);
  }
  private setVoiceActive(enabled: boolean) {
    if (this.value.voice.enabled === enabled) return;
    const badge = this.ports.badge.snapshot();
    ++this.voiceEpoch;
    this.voiceCaptureConnection = undefined;
    // Resume only NEW physical recordings. Never process buffered/old PCM.
    if (badge.pcmId) this.voiceInputs.add(badge.pcmId);
    this.updateVoice({ enabled, phase: enabled ? 'ready' : 'off', error: undefined });
    if (!enabled) {
      this.answerSpeech?.abort();
      this.localCommand?.abort();
      void this.ports.voice?.cancel().catch(() => {});
      void this.ports.voice?.stop().catch(() => {});
    }
  }

  start(): () => void {
    if (this.release) return () => {};
    const epoch = ++this.epoch;
    let ready = false;
    const pending: FrostAgentEvent[] = [];
    const unobserve = this.ports.observe(event => { if (!ready) pending.push(event); else this.accept(event); });
    const unbadge = this.ports.badge.subscribe(() => { if (ready) this.badgeChanged(); });
    const unvoice = this.ports.voice?.observe(notice => { if (ready) this.feedback(notice); });
    this.release = () => { unobserve(); unbadge(); unvoice?.(); this.hydrated = false; this.setVoiceActive(false); if (this.outcomeTimer) clearTimeout(this.outcomeTimer); this.outcomeTimer = undefined; };
    void this.ports.history().then(events => {
      if (epoch !== this.epoch) return;
      // Hydration never replays sounds or sends historical input back to the Agent.
      for (const event of [...events, ...pending]) this.accept(event, true);
      ready = true; this.hydrated = true; this.wasRecording = this.ports.badge.snapshot().recording; this.badgeChanged();
    }).catch(error => { if (epoch === this.epoch) { ready = true; this.update({ error: String(error) }); } });
    return () => { ++this.epoch; this.release?.(); this.release = undefined; };
  }

  private accept(event: FrostAgentEvent, restoring = false) {
    if (this.value.sessionId !== event.session_id) {
      if (this.value.sessionId && event.type !== 'session.created') return;
      this.setVoiceActive(false);
      if (this.outcomeTimer) clearTimeout(this.outcomeTimer);
      this.outcomeTimer = undefined;
      this.cursor = 0; this.seenOutcomes.clear();
      this.pageRuns.clear();
      this.update({ ...initial(this.value.voice.autoSend), resultTone: this.value.resultTone, sessionId: event.session_id });
    }
    if (event.seq <= this.cursor) return;
    this.cursor = event.seq;
    if (event.type === 'user.message' && event.data.source === 'user') {
      this.answerSpeech?.abort();
      this.localCommand?.abort();
      if (this.outcomeTimer) clearTimeout(this.outcomeTimer);
      this.outcomeTimer = undefined;
      this.update({ task: undefined, attention: undefined, avatarId: 'frost' });
    }
    if (event.type === 'session.created' && typeof event.data.user_id === 'string') this.update({ userId: event.data.user_id });
    if ((event.type === 'session.status_changed' || event.type === 'session.restored') && typeof event.data.status === 'string') {
      this.update({ status: event.data.status as FrostAgentStatus });
    }
    if (event.type === 'assistant.message' && typeof event.data.text === 'string') this.update({ reply: event.data.text.slice(0, 4000) });
    if (event.type === 'skill.dispatched') {
      this.pageRuns.add(`${event.data.run_id}:${event.data.skill_id}:${event.data.target}`);
      this.update({ avatarId: skillAvatarFor(String(event.data.skill_id)).id });
    }
    if (event.type === 'tool.result' && ['frost.skill_answer', 'frost.task_delegate'].includes(String(event.data.tool))) {
      const result = event.data.result as { status?: string; data?: { answerSkillId?: string; skill_id?: string } } | undefined;
      const id = event.data.tool === 'frost.skill_answer' ? result?.data?.answerSkillId : result?.data?.skill_id;
      if (result?.status === 'success' && typeof id === 'string') this.update({ avatarId: skillAvatarFor(id).id });
    }
    if (event.type === 'skill.result' && this.pageRuns.has(`${event.data.run_id}:${event.data.skill_id}:${event.data.target}`)
      && ['completed', 'blocked', 'failed'].includes(String(event.data.status))) {
      this.update({ attention: undefined, task: { id: String(event.data.run_id), status: String(event.data.status), message: String(event.data.summary).slice(0, 500) } });
      if (event.data.status === 'completed') this.completeOutcome(`page:${event.data.run_id}`, restoring);
    }
    if (event.type === 'tool.result' && event.data.tool === 'frost.skill_plan') {
      const result = event.data.result as { data?: FrostConversationReply } | undefined;
      const children = result?.data?.delegations || [];
      const child = children.find(item => ['blocked', 'failed', 'waiting_user'].includes(item.status)) || children[0];
      if (child) this.update({ avatarId: skillAvatarFor(child.skill_id).id, task: { id: child.run_id, status: child.status,
        message: child.status === 'waiting_external' ? '子 Agent 已准备交接，请在手机能力页面执行；尚未完成任务。' : child.reply.slice(0, 500) } });
    }
    // Only real Taskmaster observations may be projected as task success; prepared page handoffs are not success.
    const task = String(event.data.tool || '').startsWith('taskmaster.') ? taskFromEvents([event]) : null;
    if (task && task.request?.user_id === this.value.userId) {
      this.update({ task: { id: task.task_id, status: task.status, message: taskMessages[task.status] || '请在手机查看任务状态。' } });
      const key = `${task.task_id}:${task.status}`;
      if (task.status === 'completed' && !this.seenOutcomes.has(key)) {
        this.completeOutcome(key, restoring);
      }
    }
    if (!restoring) { this.syncVoiceMode(); this.project(); }
  }

  private completeOutcome(key: string, restoring: boolean) {
    if (this.seenOutcomes.has(key)) return;
    this.seenOutcomes.add(key);
    if (this.seenOutcomes.size > 256) this.seenOutcomes.delete(this.seenOutcomes.values().next().value!);
    if (restoring) return;
    this.update({ pose: 'celebrate' });
    if (this.outcomeTimer) clearTimeout(this.outcomeTimer);
    this.outcomeTimer = setTimeout(() => { this.outcomeTimer = undefined; this.project(); }, 2500);
    const badge = this.ports.badge.snapshot();
    if (this.foreground && this.value.resultTone && !this.value.voice.enabled && badge.status === 'connected' && !badge.recording) {
      void this.ports.badge.testSpeaker().catch(error => this.update({ error: String(error) }));
    }
  }

  private badgeChanged() {
    const badge = this.ports.badge.snapshot();
    if (badge.connectionId !== this.lastConnection) {
      this.setVoiceActive(false);
      this.lastConnection = badge.connectionId; this.sentPose = '';
      if (this.value.projectionError) this.update({ projectionError: undefined });
    }
    this.syncVoiceMode();
    if (badge.recording && !this.wasRecording && this.value.voice.enabled) {
      this.answerSpeech?.abort();
      this.localCommand?.abort();
      ++this.voiceEpoch;
      this.voiceCaptureConnection = badge.connectionId;
      void this.ports.voice?.stop().catch(() => {});
      void this.ports.voice?.cancel().catch(() => {});
      this.updateVoice({ phase: 'listening', error: undefined });
    }
    this.wasRecording = badge.recording;
    if (this.value.voice.enabled && !badge.recording && badge.error && this.value.voice.phase === 'listening') {
      this.updateVoice({ phase: 'error', error: `录音未完成，未发送给 Frost：${badge.error}` });
    }
    if (badge.status === 'connected') {
      if (badge.lastTouch && badge.connectionId) this.recordOnce({ id: `${badge.connectionId}:touch:${badge.lastTouch.count}`, kind: 'touch', count: badge.lastTouch.count }, '收到吧唧触摸；请在手机输入或查看待确认任务。');
      if (badge.pcm?.length && badge.pcmId?.startsWith(`${badge.connectionId}:recording:`)) this.recordOnce({ id: badge.pcmId, kind: 'recording_ready', bytes: badge.pcm.length }, '收到完整录音，可在手机本机转成文字后确认发送。');
      if (this.value.voice.enabled && this.foreground && badge.pcmId && !this.voiceInputs.has(badge.pcmId)) {
        this.voiceInputs.add(badge.pcmId);
        if (this.voiceInputs.size > 256) this.voiceInputs.delete(this.voiceInputs.values().next().value!);
        const fresh = this.voiceCaptureConnection === badge.connectionId && badge.pcmId.startsWith(`${badge.connectionId}:recording:`);
        this.voiceCaptureConnection = undefined;
        if (!fresh) { /* It began before resume/connection: wait for the next physical press. */ }
        else if (!badge.captureStats?.complete || !badge.pcm?.length || badge.captureStats.dropped || badge.captureStats.peak === 0) {
          this.updateVoice({ phase: 'error', error: '录音不完整或没有声音信号，未识别、未发送。' });
        } else if (this.voiceSending || this.value.status === 'running') {
          this.updateVoice({ phase: 'error', error: '上一条指令仍在处理；这段录音未自动发送，请等回复后重新说话。' });
        } else { void this.processVoice(badge.pcmId); }
      }
    }
    this.project();
  }
  private voiceCurrent(epoch: number) {
    const badge = this.ports.badge.snapshot();
    return epoch === this.voiceEpoch && this.value.voice.enabled && this.foreground && badge.status === 'connected' && !badge.recording;
  }
  private async processVoice(inputId: string) {
    const epoch = ++this.voiceEpoch, voice = this.ports.voice!;
    const controller = new AbortController();
    this.update({ attention: undefined });
    this.updateVoice({ phase: 'transcribing', transcript: '', error: undefined });
    try {
      const draft = await voice.transcribe();
      if (!this.voiceCurrent(epoch) || draft.inputId !== inputId || this.ports.badge.snapshot().pcmId !== inputId) return;
      this.updateVoice({ phase: 'sending', transcript: draft.text });
      this.localCommand = controller;
      const localResult = await voice.handleLocalCommand?.(draft.text, inputId, controller.signal);
      if (localResult) {
        if (!this.voiceCurrent(epoch) || controller.signal.aborted) return;
        if (typeof localResult === 'object') {
          this.update({ attention: localResult.message });
          this.updateVoice({ phase: 'speaking', spokenText: localResult.message });
          try { await voice.speak(localResult.message); }
          catch (error) {
            if (this.voiceCurrent(epoch)) this.updateVoice({ phase: 'error', error: `结果已留在手机；吧唧朗读未完成：${String(error)}` });
            return;
          }
        }
        if (this.voiceCurrent(epoch)) this.updateVoice({ phase: 'ready', transcript: draft.text });
        return;
      }
      if (this.localCommand === controller) this.localCommand = undefined;
      if (controller.signal.aborted || !this.voiceCurrent(epoch) || this.ports.badge.snapshot().pcmId !== inputId) return;
      console.info(`[FrostVoice] asr_complete characters=${draft.text.length} source=badge onDevice=true`);
      this.voiceSending = { inputId, epoch };
      await voice.send(draft.text, { channel: 'badge_voice', inputId });
      console.info('[FrostVoice] agent_turn_complete source=badge same_runtime=true');
      if (this.voiceCurrent(epoch) && this.value.voice.phase === 'sending') this.updateVoice({ phase: 'ready' });
    } catch (error) {
      if (this.voiceCurrent(epoch)) this.updateVoice({ phase: 'error', error: String(error) });
    } finally {
      if (this.localCommand === controller) this.localCommand = undefined;
      if (this.voiceSending?.epoch === epoch) this.voiceSending = undefined;
    }
  }
  private feedback(notice: FrostAgentRunNotice) {
    const { result, input } = notice;
    if (!this.voiceCurrent(this.voiceEpoch) || result.session.session_id !== this.value.sessionId
      || this.value.voice.phase === 'transcribing' || this.localCommand) return;
    if (this.voiceSending && (this.voiceSending.epoch !== this.voiceEpoch
      || input?.origin.inputId !== this.voiceSending.inputId)) return;
    const last = [...result.events].reverse().find(event => event.type === 'assistant.message');
    if (!last || this.spokenRuns.has(last.event_id)) return;
    this.spokenRuns.add(last.event_id);
    if (this.spokenRuns.size > 256) this.spokenRuns.delete(this.spokenRuns.values().next().value!);
    const view = presentFrostAgentRun(result, input?.text || '');
    const answer = readFrostConversationReply(result.events);
    const message = result.task?.status === 'waiting_confirmation' ? '这项任务需要你在手机上确认权限，请回到 Frost 对话中确认。'
      : view.plan && !result.task ? `请在手机查看对应能力及待确认项。${view.text}` : view.text;
    const plain = message.replace(/https?:\/\/\S+/g, '').replace(/[*#`_>]/g, '').trim();
    const text = answer?.speech?.text || ([...plain].length > 100 ? `${[...plain].slice(0, 82).join('')}。完整内容请看手机。` : plain);
    if (!text) return;
    const epoch = this.voiceEpoch;
    const speechEpoch = ++this.speechEpoch;
    this.answerSpeech?.abort();
    const controller = new AbortController(); this.answerSpeech = controller;
    this.updateVoice({ phase: 'speaking', spokenText: text, error: undefined });
    const play = answer?.answerSkillId
      ? answer.speech && this.ports.voice!.speakAnswer
        ? this.ports.voice!.speakAnswer(text, answer.speech.ticket, controller.signal)
        : Promise.reject(new Error('问答语音暂不可用；未调用 MiniMax，也未改用手机扬声器。'))
      : this.ports.voice!.speak(text);
    void play.then(() => {
      console.info('[FrostVoice] reply_transferred transport=badge_pcm heard_by_user=unverified');
      if (speechEpoch === this.speechEpoch && this.voiceCurrent(epoch)) this.updateVoice({ phase: 'ready' });
    }).catch(error => {
      if (speechEpoch === this.speechEpoch && this.voiceCurrent(epoch)) this.updateVoice({ phase: 'error', error: `回复仍在手机中；吧唧朗读未完成：${String(error)}` });
    });
  }
  private recordOnce(input: Parameters<CompanionPorts['record']>[0], attention: string) {
    if (this.seenInputs.has(input.id)) return;
    this.seenInputs.add(input.id);
    if (this.seenInputs.size > 256) this.seenInputs.delete(this.seenInputs.values().next().value!);
    this.update({ attention });
    void this.ports.record(input).catch(error => this.update({ error: String(error) }));
  }
  private project() {
    const badge = this.ports.badge.snapshot();
    const pose: BadgePose = badge.recording ? 'busy' : this.value.status === 'running' || this.value.task?.status === 'running' ? 'busy'
      : ['failed', 'stopped'].includes(this.value.status) || ['failed', 'safe_stopped'].includes(this.value.task?.status || '') ? 'dizzy'
      : this.outcomeTimer ? 'celebrate'
      : this.value.attention || ['waiting_user', 'waiting_external'].includes(this.value.status)
        || ['waiting_user', 'waiting_external', 'waiting_confirmation', 'blocked'].includes(this.value.task?.status || '') ? 'attention' : 'idle';
    if (pose !== this.value.pose) this.update({ pose });
    const hasAvatars = badge.endpoints.includes(BADGE_AVATAR_ENDPOINT);
    const key = `${badge.connectionId}:${pose}:${this.value.avatarId}:${hasAvatars}`;
    // The firmware already displays the physical listening state. Avoid extra
    // control replies competing with microphone chunks, including the tail.
    const receiving = badge.recording || (!badge.pcm && !badge.error && (badge.receivedBytes > 0 || !!badge.captureStats));
    if (!this.foreground || badge.status !== 'connected' || receiving || key === this.sentPose) return;
    this.sentPose = key;
    // Do not retry on every incoming PCM/battery packet; reconnect or a new pose permits a retry.
    void Promise.all([
      this.ports.badge.projectPose(pose),
      hasAvatars ? this.ports.badge.projectAvatar?.(this.value.avatarId) : undefined,
    ]).then(() => {
      if (key === this.sentPose && this.value.projectionError) this.update({ projectionError: undefined });
    }, error => {
      if (key === this.sentPose) this.update({ projectionError: String(error) });
    });
  }
}

// The singleton is wired lazily so ordinary web entry does not initialize Bluetooth or request permissions.
let companion: FrostCompanion | undefined;
export async function getFrostCompanion(): Promise<FrostCompanion> {
  if (!companion) {
    const [runtime, { frostBadge }] = await Promise.all([import('./frostAgentRuntime'), import('./frostBadge')]);
    companion ||= new FrostCompanion({ history: () => runtime.readFrostAgentEvents(), observe: runtime.subscribeFrostAgentEvents,
      record: runtime.recordFrostPeripheralInput, badge: frostBadge, voice: {
        transcribe: () => frostBadge.transcribeRecording(), speak: text => frostBadge.speakText(text),
        handleLocalCommand: async (text, inputId, signal) => tryVoiceMapCommand(text, inputId, signal)
          ?? tryVoiceTreeCommand(text, inputId) ?? frostBadge.tryBirdCommand(text),
        speakAnswer: async (text, ticket, signal) => {
          const { requestFrostVoice } = await import('./frostVoice');
          signal.throwIfAborted();
          const connectionId = frostBadge.snapshot().connectionId;
          const audio = await requestFrostVoice(text, ticket, signal);
          signal.throwIfAborted();
          const current = frostBadge.snapshot();
          if (current.status !== 'connected' || current.recording || current.connectionId !== connectionId) return;
          const stop = () => { void frostBadge.stopPlayback().catch(() => {}); };
          signal.addEventListener('abort', stop, { once: true });
          try { await frostBadge.playPcm(audio.pcm); } finally { signal.removeEventListener('abort', stop); }
        },
        stop: () => frostBadge.stopPlayback(), cancel: () => frostBadge.cancelTranscription(),
        send: runtime.sendFrostAgentMessage, observe: runtime.subscribeFrostAgentRuns,
      } });
    const { startHealthBadgeSync } = await import('./frostHealthBadge');
    startHealthBadgeSync(() => {
      const state = companion!.snapshot();
      return state.status !== 'running' && !['running', 'waiting_external'].includes(state.task?.status || '')
        && !['listening', 'transcribing', 'sending', 'speaking'].includes(state.voice.phase);
    });
  }
  return companion;
}
