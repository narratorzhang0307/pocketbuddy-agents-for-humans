import { type FrostTaskRequest, type TaskSignal, validateHealthEvent } from './contracts';
import { replayDeviceEvents } from './deviceGateway';
import type { FrostHealthTaskmaster } from './orchestrator';
import type { TaskmasterStore } from './store';

export interface ApiRequest { method: 'GET' | 'POST'; path: string; body?: unknown }
export interface ApiResponse { status: number; body: unknown }

/** 与 Node/Edge 框架无关的 API 核心；server.mjs、TiDB Cloud 或本地服务器都可包这一层。 */
export class FrostTaskmasterApi {
  constructor(private readonly taskmaster: FrostHealthTaskmaster, private readonly store: TaskmasterStore) {}

  async handle(request: ApiRequest): Promise<ApiResponse> {
    try {
      if (request.method === 'POST' && request.path === '/api/frost-taskmaster/events') {
        const validation = validateHealthEvent(request.body);
        if (!validation.ok || !validation.value) return { status: 400, body: { error: 'invalid_health_event', details: validation.errors } };
        return { status: 200, body: await this.store.appendHealthEvent(validation.value) };
      }
      if (request.method === 'POST' && request.path === '/api/frost-taskmaster/device/replay') {
        const values = request.body && typeof request.body === 'object' && 'events' in request.body
          ? (request.body as { events?: unknown }).events : null;
        if (!Array.isArray(values)) return { status: 400, body: { error: 'events_must_be_array' } };
        return { status: 200, body: await replayDeviceEvents(this.store, values) };
      }
      if (request.method === 'POST' && request.path === '/api/frost-taskmaster/tasks') {
        return { status: 200, body: await this.taskmaster.start(request.body as FrostTaskRequest) };
      }
      const confirm = request.path.match(/^\/api\/frost-taskmaster\/tasks\/([^/]+)\/confirm$/);
      if (request.method === 'POST' && confirm) {
        const actionId = request.body && typeof request.body === 'object' && 'action_id' in request.body ? String((request.body as { action_id?: unknown }).action_id || '') : '';
        if (!actionId) return { status: 400, body: { error: 'action_id_required' } };
        return { status: 200, body: await this.taskmaster.confirm(decodeURIComponent(confirm[1]), actionId) };
      }
      const resume = request.path.match(/^\/api\/frost-taskmaster\/tasks\/([^/]+)\/resume$/);
      if (request.method === 'POST' && resume) return { status: 200, body: await this.taskmaster.resume(decodeURIComponent(resume[1])) };
      const signals = request.path.match(/^\/api\/frost-taskmaster\/tasks\/([^/]+)\/signals$/);
      if (signals) {
        const taskId = decodeURIComponent(signals[1]);
        if (request.method === 'POST') {
          const signal = request.body as TaskSignal;
          if (!signal || signal.task_id !== taskId) return { status: 400, body: { error: 'signal_task_id_mismatch' } };
          return { status: 200, body: await this.taskmaster.signal(signal) };
        }
        if (request.method === 'GET') return { status: 200, body: await this.store.listTaskSignals(taskId) };
      }
      const trace = request.path.match(/^\/api\/frost-taskmaster\/tasks\/([^/]+)\/trace$/);
      if (request.method === 'GET' && trace) {
        const task = await this.taskmaster.get(decodeURIComponent(trace[1]));
        if (!task) return { status: 404, body: { error: 'task_not_found' } };
        return { status: 200, body: await this.store.listTraces(task.run_id) };
      }
      const effects = request.path.match(/^\/api\/frost-taskmaster\/tasks\/([^/]+)\/effects$/);
      if (request.method === 'GET' && effects) {
        const task = await this.taskmaster.get(decodeURIComponent(effects[1]));
        if (!task) return { status: 404, body: { error: 'task_not_found' } };
        const records = await Promise.all(task.actions.map((action) => this.store.getEffect(`effect:${action.action_id}`)));
        return { status: 200, body: records.filter(Boolean) };
      }
      const get = request.path.match(/^\/api\/frost-taskmaster\/tasks\/([^/]+)$/);
      if (request.method === 'GET' && get) {
        const task = await this.taskmaster.get(decodeURIComponent(get[1]));
        return task ? { status: 200, body: task } : { status: 404, body: { error: 'task_not_found' } };
      }
      return { status: 404, body: { error: 'route_not_found' } };
    } catch (error) {
      return { status: 409, body: { error: error instanceof Error ? error.message : 'taskmaster_request_failed' } };
    }
  }
}
