import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BadgeStatus } from '../lib/frostBadge';
import type { FrostCompanionState } from '../lib/frostCompanion';
import FrostBadgePanel from './FrostBadgePanel';

const state = vi.hoisted(() => ({ badge: {} as BadgeStatus, shared: {} as FrostCompanionState }));
vi.mock('../lib/frostBadge', () => ({ frostBadge: {
  subscribe: () => () => {}, snapshot: () => state.badge, supported: () => true,
} }));
vi.mock('../lib/frostCompanion', () => ({ getFrostCompanion: vi.fn() }));
// Render the live store snapshots without mounting a native bridge or running effects.
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot() ?? state.shared,
}));

beforeEach(() => {
  state.badge = { status: 'disconnected', devices: [], endpoints: [], recording: false, receivedBytes: 0 };
  state.shared = { sessionId: 'local-session-example', userId: 'local-user', status: 'idle', pose: 'idle',
    avatarId: 'frost', reply: '', resultTone: false,
    voice: { autoSend: true, enabled: false, phase: 'off', transcript: '', spokenText: '' } };
});

function renderPanel() {
  const html = renderToStaticMarkup(createElement(FrostBadgePanel, { onVoiceDraft: vi.fn() }));
  const moreStart = html.indexOf('<details');
  return { html, primary: html.slice(0, moreStart), more: html.slice(moreStart) };
}

describe('compact badge panel', () => {
  it('keeps the normal view short, with two commands and no checkboxes or manual forms', () => {
    const { primary, more } = renderPanel();
    expect(primary).toContain('扫描吧唧');
    expect(primary).toContain('「进入地图模式」');
    expect(primary).toContain('「帮我种下一棵树」');
    expect(primary).toContain('GPS 就绪后说');
    expect(primary).not.toContain('type="checkbox"');
    expect(primary).not.toContain('<textarea');
    expect(primary).not.toContain('local-session');
    expect(primary).not.toContain('手动转文字');
    expect(primary.replace(/<[^>]+>/g, '').length).toBeLessThan(180);
    expect(more).toContain('>更多</summary>');
  });

  it('starts secondary controls collapsed', () => {
    const { html, more } = renderPanel();
    const details = [...html.matchAll(/<details\b[^>]*>/g)].map(match => match[0]);
    expect(details.length).toBeGreaterThanOrEqual(3);
    expect(details.every(tag => !/\bopen(?:[\s=>])/.test(tag))).toBe(true);
    expect(more).toContain('手动转文字');
    expect(more).toContain('手动生成语音');
    expect(more).toContain('任务完成提示音（本机）');
    expect(more).toContain('设备诊断');
  });

  it('removes the old long explanations instead of hiding them under More', () => {
    const { html } = renderPanel();
    for (const removed of ['使用说明', '按住实体键约 0.6 秒', '自动发送默认开启并记住选择',
      '两条地图口令均在本机处理', '相同回复复用音频', '首次摄像头授权及任务权限']) {
      expect(html).not.toContain(removed);
    }
    const paragraphs = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)]
      .map(match => match[1].replace(/<[^>]+>/g, ''));
    expect(paragraphs.length).toBeGreaterThan(0);
    expect(paragraphs.every(text => text.length <= 40)).toBe(true);
  });

  it('keeps the default automatic voice preference, but does not override an opt-out', () => {
    expect(renderPanel().more).toMatch(/type="checkbox"[^>]*checked=""/);
    state.shared.voice.autoSend = false;
    const { primary, more } = renderPanel();
    expect(primary).toContain('自动语音已关闭');
    expect(more).not.toMatch(/type="checkbox"[^>]*checked=""/);
  });

  it('keeps foreground, permission, privacy and cost notices accessible', () => {
    const { primary, more } = renderPanel();
    for (const notice of ['需保持前台', '首次定位请允许', '录音不上传', '云端问答可能计费']) {
      expect(primary).toContain(notice);
    }
    expect(more).toContain('生成语音（可能计费）');
    expect(more).toContain('勿填 API Key');
    expect(more).toContain('发送与授权需确认');
  });

  it('keeps ready status, stop playback and volume in the connected primary view', () => {
    state.badge.status = 'connected';
    state.shared.voice.enabled = true;
    state.shared.voice.phase = 'ready';
    const { primary, more } = renderPanel();
    for (const control of ['断开连接', '停止播放', '音量', '按住实体键说话，松手发送。']) {
      expect(primary).toContain(control);
    }
    expect(primary).not.toContain('type="checkbox"');
    expect(more).not.toContain('手动转文字');
    expect(more).not.toContain('手动生成语音');
  });

  it('keeps errors visible while hiding raw recording and session diagnostics', () => {
    state.badge.status = 'connected';
    state.badge.microphoneAvailable = false;
    state.badge.error = '蓝牙通道异常';
    state.badge.receivedBytes = 32000;
    state.badge.captureStats = { samples: 16000, peak: 0, dropped: 2, reason: 1, complete: false };
    const { primary, more } = renderPanel();
    expect(primary).toContain('蓝牙通道异常');
    expect(primary).toContain('麦克风未启用');
    expect(primary).toContain('未检测到声音');
    expect(primary).toContain('录音待校验');
    expect(primary).not.toContain('峰值');
    expect(more).toContain('峰值 0');
    expect(more).toContain('丢包 2');
    expect(more).toContain('会话 ·');
  });

  it('never hides the current speech failure under More', () => {
    state.badge.status = 'connected';
    state.shared.voice.enabled = true;
    state.shared.voice.phase = 'error';
    state.shared.voice.error = '本机识别暂不可用';
    state.shared.voice.transcript = '进入地图模式';
    const { primary } = renderPanel();
    expect(primary).toContain('语音异常');
    expect(primary).toContain('本机识别暂不可用');
    expect(primary).toContain('本次识别：进入地图模式');
  });
});
