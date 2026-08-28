import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { nativeApiEndpoint } from '../../native/apiOrigin';
import { badgeBytes } from './frostBadgeProtocol';

export const FROST_VOICE_MAX_TEXT = 100;
const PATH = '/api/frost-voice/tts';
const NATIVE_URL = `https://pocketearth.throughtheglass.art${PATH}`;
export interface FrostVoiceAudio { pcm: Uint8Array; durationMs: number }

export function parseFrostVoiceAudio(value: unknown): FrostVoiceAudio {
  const data = value as Record<string, unknown> | null;
  const audio = data?.audioBase64;
  if (data?.format !== 'pcm_s16le' || data.sampleRate !== 16000 || data.channels !== 1 ||
      typeof audio !== 'string' || !audio.length || audio.length > 1280000 || audio.length % 4 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(audio)) throw new Error('语音返回格式错误，已阻止播放。');
  const pcm = badgeBytes(audio);
  if (!pcm.length || pcm.length > 960000 || pcm.length % 2) throw new Error('语音采样不完整或超过 30 秒，已阻止播放。');
  return { pcm, durationMs: pcm.length / 32 };
}

function voiceError(value: unknown, status: number): Error {
  const code = (value as Record<string, unknown> | null)?.error;
  const messages: Record<string, string> = {
    minimax_key_not_configured: '后端尚未配置 MiniMax API Key；请在服务器 .env 中填写并重启服务。',
    voice_access_required: '请输入独立的后端语音访问码，不是 MiniMax API Key。',
    voice_request_in_progress: '已有语音正在生成，请等待；本次未调用 MiniMax。',
    voice_rate_limited: '已达到每分钟 6 次的保护上限，请稍后手动操作。',
    minimax_timeout_no_retry: 'MiniMax 响应超时；可能已经计费，未自动重试。',
  };
  if (typeof code === 'string' && messages[code]) return new Error(messages[code]);
  const upstream = typeof code === 'string' && code.match(/^minimax_(?:error|http)_(\d+)$/);
  return new Error(upstream ? `MiniMax 返回错误码 ${upstream[1]}，未自动重试。` : `语音请求失败（HTTP ${status}），未自动重试。`);
}

// Only a user-selected short text is sent. Never send the microphone or Frost's full history here.
export async function requestFrostVoice(text: string, accessCode = '', signal?: AbortSignal): Promise<FrostVoiceAudio> {
  const input = text.trim(), code = accessCode.trim();
  signal?.throwIfAborted();
  if (!input || [...input].length > FROST_VOICE_MAX_TEXT) throw new Error('请输入 1–100 字的短句。');
  if (code && (code.startsWith('sk-') || code.length < 32 || !/^[\x21-\x7e]+$/.test(code))) {
    throw new Error('这里需要至少 32 位的独立后端访问码；MiniMax API Key 只能放在服务器 .env。');
  }
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (code) headers.authorization = `Bearer ${code}`;
  let status: number, data: unknown;
  try {
    if (Capacitor.isNativePlatform()) {
      const response = await CapacitorHttp.post({
        url: nativeApiEndpoint(PATH, NATIVE_URL), headers, data: { text: input },
        connectTimeout: 10000, readTimeout: 35000, responseType: 'json', disableRedirects: true,
      });
      status = response.status;
      data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    } else {
      const response = await fetch(PATH, {
        method: 'POST', headers, body: JSON.stringify({ text: input }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(35000)]) : AbortSignal.timeout(35000), redirect: 'error', cache: 'no-store',
      });
      status = response.status; data = await response.json();
    }
  } catch {
    // Retrying a timed out synthesis can incur a second charge. Leave the decision to the user.
    throw new Error('语音网络请求失败；可能已经计费，未自动重试。');
  }
  if (status < 200 || status >= 300) throw voiceError(data, status);
  signal?.throwIfAborted();
  return parseFrostVoiceAudio(data);
}
