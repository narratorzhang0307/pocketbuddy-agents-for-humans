import type {
  AgentForgeSession,
  AgentMotionProfile,
  AgentVisualAssets,
  CityAgentManifest,
} from './types';

export type ForgeMode = 'direct' | 'mascot';
export type ForgeStatus = 'queued' | 'processing' | 'ready' | 'failed';

export type AgentForgeAsset = {
  id: string;
  name: string;
  sourceUrl: string;
  cutoutUrl: string;
  staticGlbUrl: string;
  glbUrl?: string;
  mapGlbUrl?: string;
  turnaroundUrl?: string;
  manifestUrl?: string;
  downloadUrl?: string;
  manifest?: CityAgentManifest;
  animation?: {
    clips?: string[];
    bone_count?: number;
  };
  compression?: {
    geometry?: string;
    texture?: string;
  };
};

export type AgentForgeJob = {
  id: string;
  accessToken?: string;
  name: string;
  status: ForgeStatus;
  stage: string;
  progress: number;
  degraded?: boolean;
  warning?: string;
  error?: string;
  asset?: AgentForgeAsset;
};

type SubmitOptions = {
  name: string;
  mode: ForgeMode;
  motionProfile: AgentMotionProfile;
};

function apiError(response: Response, body: unknown) {
  const detail =
    body && typeof body === 'object' && 'error' in body
      ? String((body as { error: unknown }).error)
      : `HTTP ${response.status}`;
  if (response.status === 503) {
    return new Error(`云端 3D 链路尚未启用：${detail}`);
  }
  return new Error(detail);
}

async function readResponse(response: Response): Promise<AgentForgeJob> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw apiError(response, body);
  return body as AgentForgeJob;
}

export async function submitAgentForgeJob(
  file: File,
  options: SubmitOptions,
  signal?: AbortSignal,
) {
  const response = await fetch('/api/agent-forge/jobs', {
    method: 'POST',
    headers: {
      'content-type': file.type,
      'x-file-name': encodeURIComponent(file.name),
      'x-agent-name': encodeURIComponent(options.name),
      'x-forge-mode': options.mode,
      'x-motion-profile': options.motionProfile,
    },
    body: file,
    signal,
  });
  const job = await readResponse(response);
  if (!job.accessToken) throw new Error('服务器没有返回作业访问凭证');
  return job as AgentForgeJob & { accessToken: string };
}

export async function getAgentForgeJob(
  session: AgentForgeSession,
  signal?: AbortSignal,
) {
  const response = await fetch(
    `/api/agent-forge/jobs/${encodeURIComponent(session.jobId)}?accessToken=${encodeURIComponent(session.accessToken)}`,
    { signal },
  );
  return readResponse(response);
}

export async function waitForAgentForgeJob(
  session: AgentForgeSession,
  onProgress: (job: AgentForgeJob) => void,
  signal?: AbortSignal,
) {
  const deadline = Date.now() + 30 * 60 * 1000;
  while (Date.now() < deadline) {
    const job = await getAgentForgeJob(session, signal);
    onProgress(job);
    if (job.status === 'ready') return job;
    if (job.status === 'failed') {
      throw new Error(job.error || '3D 建模失败');
    }
    await new Promise<void>((resolve, reject) => {
      const finish = () => {
        signal?.removeEventListener('abort', abort);
        resolve();
      };
      const timer = window.setTimeout(finish, 2500);
      const abort = () => {
        window.clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        reject(new DOMException('已取消', 'AbortError'));
      };
      signal?.addEventListener('abort', abort, { once: true });
    });
  }
  throw new Error('3D 建模等待超过 30 分钟，请稍后重试');
}

export function visualAssetsFromForge(job: AgentForgeJob): AgentVisualAssets {
  if (!job.asset) throw new Error('作业完成但没有模型产物');
  const rigged = Boolean(job.asset.glbUrl && job.asset.mapGlbUrl && !job.degraded);
  return {
    representation: rigged ? 'rigged-3d' : 'static-3d',
    version: job.id,
    heightMeters: 0.55,
    viewerGlbUrl: job.asset.glbUrl || job.asset.staticGlbUrl,
    mapGlbUrl: job.asset.mapGlbUrl || job.asset.staticGlbUrl,
    staticGlbUrl: job.asset.staticGlbUrl,
    downloadUrl: job.asset.downloadUrl,
    turnaroundUrl: job.asset.turnaroundUrl,
    clips: job.asset.animation?.clips || [],
    compression:
      job.asset.compression?.geometry === 'meshopt' ? 'meshopt' : 'none',
    degraded: !rigged,
  };
}

const refreshedJobs = new Map<string, { expiresAt: number; job: AgentForgeJob }>();

async function resolveProfileVisual(
  profile: {
    visual?: AgentVisualAssets;
    forgeSession?: AgentForgeSession;
  },
) {
  let visual = profile.visual;
  if (profile.forgeSession) {
    const cached = refreshedJobs.get(profile.forgeSession.jobId);
    const job =
      cached && cached.expiresAt > Date.now()
        ? cached.job
        : await getAgentForgeJob(profile.forgeSession);
    if (!cached || cached.job !== job) {
      refreshedJobs.set(profile.forgeSession.jobId, {
        job,
        expiresAt: Date.now() + 60_000,
      });
    }
    if (job.status === 'ready' && job.asset) {
      visual = visualAssetsFromForge(job);
    }
  }
  return visual;
}

export async function resolveAgentAssetUrl(
  profile: {
    visual?: AgentVisualAssets;
    forgeSession?: AgentForgeSession;
  },
  purpose: 'viewer' | 'map',
) {
  const visual = await resolveProfileVisual(profile);
  if (!visual) return null;
  return purpose === 'map'
    ? visual.mapGlbUrl || visual.viewerGlbUrl || visual.staticGlbUrl || null
    : visual.viewerGlbUrl || visual.staticGlbUrl || null;
}

export async function resolveAgentDownloadUrl(
  profile: {
    visual?: AgentVisualAssets;
    forgeSession?: AgentForgeSession;
  },
) {
  const visual = await resolveProfileVisual(profile);
  return visual?.downloadUrl || visual?.viewerGlbUrl || visual?.staticGlbUrl || null;
}
