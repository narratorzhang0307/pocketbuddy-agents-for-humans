import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { EdgeRequest, EdgeResponse } from './types';

interface PocketMnnPlugin {
  run(options: { request: EdgeRequest }): Promise<EdgeResponse>;
  addListener(eventName: 'assetProgress', listener: (event: NativeAssetProgress) => void): Promise<PluginListenerHandle>;
}

export interface NativeAssetProgress {
  assetId: string;
  downloaded: number;
  total: number;
  phase: 'downloading' | 'verifying' | 'done';
}

const nativeGlobal = globalThis as typeof globalThis & { __pocketMnnPlugin?: PocketMnnPlugin };
const PocketMnn = nativeGlobal.__pocketMnnPlugin || registerPlugin<PocketMnnPlugin>('PocketMnn');
nativeGlobal.__pocketMnnPlugin = PocketMnn;

const QWEN_SEMANTIC_TASKS = new Set<EdgeRequest['task']>(['chat', 'classify', 'rank', 'embed', 'vision']);

/** Android semantic requests are allowed to return only the native Qwen/MNN backend. */
export function normalizeNativeMnnResponse(request: EdgeRequest, response?: EdgeResponse | null): EdgeResponse {
  if (!response?.backend) return { backend: 'stub', error: 'invalid_native_response' };
  if (response.backend === 'ollama') return { backend: 'stub', error: 'unexpected_android_ollama_backend' };
  if (QWEN_SEMANTIC_TASKS.has(request.task) && response.backend !== 'mnn' && response.backend !== 'stub') {
    return { backend: 'stub', error: `unexpected_android_semantic_backend:${response.backend}` };
  }
  return response;
}

export function isNativeMnnPlatform(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function callNativeMnn(request: EdgeRequest): Promise<EdgeResponse> {
  if (!isNativeMnnPlatform()) return { backend: 'stub', error: 'not_android_native' };
  try {
    const response = await PocketMnn.run({ request });
    return normalizeNativeMnnResponse(request, response);
  } catch (error) {
    return { backend: 'stub', error: `native_bridge_failed:${String(error)}` };
  }
}

export async function subscribeNativeAssetProgress(listener: (event: NativeAssetProgress) => void): Promise<() => Promise<void>> {
  if (!isNativeMnnPlatform()) return async () => {};
  const handle = await PocketMnn.addListener('assetProgress', listener);
  return () => handle.remove();
}
