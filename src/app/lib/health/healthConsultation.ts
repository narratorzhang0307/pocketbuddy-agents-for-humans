import { askHospitalAgent, type HospitalAnswer, type HealthTurn } from './hospitalAgent';

export const HEALTH_GREETING = '已打开健康咨询。我是AI助手，不能代替医生。按键说话会将本次咨询交给云端Qwen，回复由吧唧朗读。你想咨询什么？';
interface ConsultationState { protocol: string; active: boolean; busy: boolean; department: string; turns: HealthTurn[]; answer: HospitalAnswer | null; error: string }

/** Page-owned, memory-only dialogue. Never writes health questions into Frost's persistent inbox. */
export class HealthConsultation {
  private value: ConsultationState = { protocol: 'pocket-health-consultation/v1', active: false, busy: false, department: '心内科', turns: [], answer: null, error: '' };
  private listeners = new Set<() => void>();
  private lifetime = new AbortController();
  private attempt = 0;
  private lastActivity = 0;
  constructor(private ask = askHospitalAgent, private now = Date.now) {}
  snapshot = () => this.value;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private update(patch: Partial<ConsultationState>) { this.value = { ...this.value, ...patch }; this.listeners.forEach(fn => fn()); }
  open() {
    this.close(); this.lifetime = new AbortController(); this.lastActivity = this.now();
    this.update({ active: true, turns: [], answer: null, error: '' });
  }
  close() { this.lifetime.abort(); ++this.attempt; this.update({ active: false, busy: false, turns: [], answer: null, error: '' }); }
  setDepartment(department: string) { this.update({ department }); }
  signal() { return this.lifetime.signal; }
  async send(question: string, signal?: AbortSignal): Promise<HospitalAnswer> {
    if (!this.value.active || this.now() - this.lastActivity > 30 * 60_000) {
      this.close(); throw new Error('咨询已结束，请重新打开健康咨询。');
    }
    if (this.value.busy) throw new Error('上一条咨询仍在处理，请等回复后再说。');
    const owner = ++this.attempt;
    const current = AbortSignal.any([this.lifetime.signal, ...(signal ? [signal] : [])]);
    current.throwIfAborted(); this.lastActivity = this.now(); this.update({ busy: true, error: '' });
    try {
      const answer = await this.ask({ question, department: this.value.department, consent: true, history: this.value.turns, signal: current });
      current.throwIfAborted();
      this.lastActivity = this.now();
      this.update({ answer, turns: [...this.value.turns, { role: 'user', text: question }, { role: 'assistant', text: answer.reply }].slice(-24) as HealthTurn[] });
      return answer;
    } catch (error) {
      if (owner === this.attempt && !current.aborted) this.update({ error: error instanceof Error ? error.message : '咨询未完成，请稍后重试。' });
      throw error;
    } finally { if (owner === this.attempt) this.update({ busy: false }); }
  }
}
export const healthConsultation = new HealthConsultation();

export async function handleHealthVoice(text: string, signal: AbortSignal, isWorkspaceCommand: (text: string) => boolean) {
  if (!healthConsultation.snapshot().active) return false;
  if (/^(?:请|帮我)?(?:退出|结束|关闭|停止)(?:健康咨询(?:agent|智能体|技能)?|咨询|对话)[。！!\s]*$/i.test(text.trim())) {
    healthConsultation.close(); return { message: '已结束健康咨询，本次会话已清除。' };
  }
  if (isWorkspaceCommand(text)) { healthConsultation.close(); return false; }
  const answer = await healthConsultation.send(text, signal);
  return { message: answer.reply, signal: healthConsultation.signal() };
}
