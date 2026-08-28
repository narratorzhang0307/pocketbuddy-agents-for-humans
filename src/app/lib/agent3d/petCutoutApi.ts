export type PetCutoutMode = 'direct' | 'mascot';

export type PetRigContract = {
  templateId: string;
  bodyPlan:
    | 'quadruped'
    | 'winged-biped'
    | 'shelled-quadruped'
    | 'adaptive';
  footCount: number | null;
  motionProfile: 'biped' | 'quadruped' | 'hover' | 'none';
};

export type PetCutoutAsset = {
  id: string;
  name: string;
  mode: PetCutoutMode;
  templateId: string;
  rig: PetRigContract;
  sourceUrl: string;
  cleanUrl: string;
  finalUrl: string;
  stylizeProvider: string;
  removeBackgroundProvider: string;
  promptVersion: string;
  createdAt: string;
};

export type PetCutoutJob = {
  id: string;
  accessToken: string;
  name: string;
  mode: PetCutoutMode;
  templateId: string;
  rig: PetRigContract;
  status: 'queued' | 'processing' | 'ready' | 'failed';
  stage:
    | 'upload'
    | 'stylize'
    | 'remove-background'
    | 'localize'
    | 'complete'
    | 'failed';
  progress: number;
  error?: string;
  asset?: PetCutoutAsset;
};

const API_BASE = '/api/pets';

export type PetCutoutHealth = {
  ok: boolean;
  configured: boolean;
  provider?: string;
  backgroundRemoval?: string;
  privacy: 'temporary-private';
  retentionMinutes: number;
  modes: PetCutoutMode[];
  rigSelection: string;
};

function friendlyError(message: string) {
  if (/DASHSCOPE_API_KEY is not configured/i.test(message)) {
    return '精细抠图服务尚未配置，已经保留本机抠图结果';
  }
  if (/Qwen image request/i.test(message)) return 'Qwen 图像处理暂时失败，已经保留本机抠图结果';
  if (/timed out/i.test(message)) return '精细抠图等待超时，可直接重试，不必重新上传';
  if (/more than one subject/i.test(message)) return '照片里检测到多个主要主体，请换一张主体更明确的照片';
  if (/canvas edge|cropped subject/i.test(message)) return '主体贴近照片边缘，无法建立完整身体，请留出一点四周空间';
  if (/transparent PNG/i.test(message)) return '精细抠图没有产生合格透明背景，请重试';
  if (/erased the generated subject/i.test(message)) return '精细抠图误删了主体，请换图或使用本机抠图';
  return message || '精细抠图失败';
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(friendlyError(payload.error || `图片服务返回 ${response.status}`));
  }
  return payload as T;
}

function jobUrl(job: Pick<PetCutoutJob, 'id' | 'accessToken'>, suffix = '') {
  return `${API_BASE}/${encodeURIComponent(job.id)}${suffix}?accessToken=${encodeURIComponent(job.accessToken)}`;
}

export async function readPetCutoutHealth(signal?: AbortSignal) {
  return readJson<PetCutoutHealth>(
    await fetch(`${API_BASE}/health`, { cache: 'no-store', signal }),
  );
}

export async function submitPetCutout(
  file: File,
  options: {
    name: string;
    templateId: string;
    mode: PetCutoutMode;
    signal: AbortSignal;
  },
) {
  let response: Response;
  try {
    response = await fetch(API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': file.type,
        'X-File-Name': encodeURIComponent(file.name),
        'X-Pet-Name': encodeURIComponent(options.name),
        'X-Forge-Mode': options.mode,
        'X-Rig-Template': encodeURIComponent(options.templateId),
      },
      body: file,
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal.aborted) throw new DOMException('已取消', 'AbortError');
    void error;
    throw new Error('精细抠图服务未连接，已经保留本机抠图结果');
  }
  return readJson<PetCutoutJob>(response);
}

export async function readPetCutoutJob(
  job: Pick<PetCutoutJob, 'id' | 'accessToken'>,
  signal: AbortSignal,
) {
  return readJson<PetCutoutJob>(
    await fetch(jobUrl(job), { cache: 'no-store', signal }),
  );
}

export async function retryPetCutout(
  job: Pick<PetCutoutJob, 'id' | 'accessToken'>,
  signal: AbortSignal,
) {
  return readJson<PetCutoutJob>(
    await fetch(jobUrl(job, '/retry'), { method: 'POST', signal }),
  );
}

export async function releasePetCutout(
  job: Pick<PetCutoutJob, 'id' | 'accessToken'>,
) {
  await fetch(jobUrl(job), {
    method: 'DELETE',
    keepalive: true,
  }).catch(() => undefined);
}

function abortableDelay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('已取消', 'AbortError'));
      return;
    }
    const timer = window.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer);
        reject(new DOMException('已取消', 'AbortError'));
      },
      { once: true },
    );
  });
}

export async function waitForPetCutout(
  submitted: PetCutoutJob,
  options: {
    signal: AbortSignal;
    onProgress: (job: PetCutoutJob) => void;
  },
) {
  let current = submitted;
  for (let attempt = 0; attempt < 1200; attempt += 1) {
    current = await readPetCutoutJob(current, options.signal);
    options.onProgress(current);
    if (current.status === 'ready' && current.asset) return current;
    if (current.status === 'failed') {
      const error = new Error(friendlyError(current.error || '精细抠图失败')) as Error & {
        job?: PetCutoutJob;
      };
      error.job = current;
      throw error;
    }
    await abortableDelay(attempt < 8 ? 650 : 1100, options.signal);
  }
  throw new Error('精细抠图等待超时，可直接重试，不必重新上传');
}

export async function downloadPetCutout(
  job: PetCutoutJob,
  signal: AbortSignal,
) {
  if (!job.asset) throw new Error('精细抠图没有返回透明图片');
  const response = await fetch(job.asset.finalUrl, {
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw new Error(`透明图片下载失败（${response.status}）`);
  const blob = await response.blob();
  return new File([blob], `${job.name || 'pet'}-cutout.png`, {
    type: 'image/png',
    lastModified: Date.now(),
  });
}
