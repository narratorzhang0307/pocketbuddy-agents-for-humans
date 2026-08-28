export const HOSPITAL_CONNECTION_STATES = {
  checking: { label: '检测中', detail: '只检查医生 Agent 的 /health，不启动诊疗或评测。' },
  not_configured: { label: '待连接 · 未配置地址', detail: '尚未配置医生 Agent 的部署地址。需要朋友提供可访问的服务地址，以及必要的访问凭据。' },
  reachable: { label: '健康检查通过', detail: '医生 Agent 的 /health 已响应。此结果不代表模型、比赛凭据或诊疗流程已验证；当前 SDK 未提供用户聊天接口。' },
  auth_required: { label: '服务需要认证', detail: '服务器返回 401 / 403。请在 Pocket Buddy 服务端配置该部署所需的访问凭据。' },
  unreachable: { label: '服务暂不可达', detail: '健康检查失败或超时。请确认部署地址、服务运行状态与网络连接。' },
  invalid_response: { label: '接口响应不匹配', detail: '地址可访问，但没有返回 SDK 约定的健康响应。请确认这是医生 Agent 地址，而不是介绍页或比赛服务。' },
  invalid_config: { label: '服务配置有误', detail: '服务地址须为不含凭据、查询参数或片段的 HTTP(S) 地址。远端认证连接必须使用 HTTPS。' },
  bridge_unavailable: { label: '连接检测未就绪', detail: 'Pocket Buddy 的连接检测接口未响应。请确认本项目的开发或生产服务已更新并启动。' },
} as const;

export type HospitalConnectionState = keyof typeof HOSPITAL_CONNECTION_STATES;
type HospitalHealthStatus = Exclude<HospitalConnectionState, 'checking' | 'bridge_unavailable'>;

export async function checkHospitalAgentHealth(signal?: AbortSignal): Promise<HospitalHealthStatus> {
  const response = await fetch('/api/hospital-agent/health', {
    method: 'GET', cache: 'no-store', signal,
  });
  if (!response.ok) throw new Error('hospital_bridge_unavailable');
  const data = await response.json();
  const status: unknown = data?.status;
  if (typeof status !== 'string'
    || !Object.prototype.hasOwnProperty.call(HOSPITAL_CONNECTION_STATES, status)
    || status === 'checking' || status === 'bridge_unavailable') throw new Error('invalid_hospital_status');
  return status as HospitalHealthStatus;
}
