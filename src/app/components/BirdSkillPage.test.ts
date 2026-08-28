import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BadgeStatus } from '../lib/frostBadge';
import BirdSkillPage from './BirdSkillPage';

const state = vi.hoisted(() => ({ badge: {} as BadgeStatus }));
vi.mock('../lib/frostBadge', () => ({ frostBadge: {
  subscribe: () => () => {}, snapshot: () => state.badge,
} }));
vi.mock('./FrostBadgePanel', () => ({ default: () => null }));
vi.mock('./SkillAvatar', () => ({ default: () => null }));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
}));
beforeEach(() => {
  state.badge = { status: 'connected', connectionId: 'b-board:1', devices: [], endpoints: ['bird_mode_v1'],
    recording: false, receivedBytes: 0,
    bird: { enabled: true, active: true, busy: false, state: 'ready', message: '请长按B板触屏录制鸟叫，建议六秒后松手' } };
});
function render() {
  const html = renderToStaticMarkup(createElement(BirdSkillPage, { onBack() {} }));
  return { html, primary: html.slice(0, html.indexOf('<details')) };
}

describe('bird recording page', () => {
  it('puts the physical hold-to-record action first, with no second start button when ready', () => {
    const { html, primary } = render();
    expect(primary).toContain('按住 B 板屏幕录音');
    expect(primary).toContain('请长按B板触屏录制鸟叫');
    expect(primary).toContain('松手后自动识别');
    expect(primary).toContain('最多 10 秒自动停止');
    expect(html).toContain('3 秒分析窗');
    expect(primary).toContain('退出识鸟');
    expect(primary).not.toContain('重新准备识鸟');
    expect(html).not.toContain('现在进入识鸟');
    expect(html).not.toMatch(/<details[^>]*\bopen/);
  });

  it('shows a native failure and manual retry above the connection settings', () => {
    state.badge.bird = { ...state.badge.bird!, state: 'error', message: '网络暂不可用，请重试' };
    const { primary } = render();
    expect(primary).toContain('网络暂不可用，请重试');
    expect(primary).toMatch(/<button[^>]*>重新准备识鸟<\/button>/);
    expect(primary).not.toMatch(/\sdisabled(?:=|\s|>)/);
  });

  it('exposes connection controls when disconnected instead of pretending the board is ready', () => {
    state.badge = { ...state.badge, status: 'disconnected', connectionId: undefined, bird: undefined };
    const { html, primary } = render();
    expect(primary).toContain('请先连接 B 板');
    expect(primary).not.toContain('请长按B板触屏录制鸟叫');
    expect(html).toMatch(/<details[^>]*\bopen/);
    expect(primary).toMatch(/<button[^>]*\sdisabled=""[^>]*>重新准备识鸟<\/button>/);
  });

  it('keeps the live recording state visible without offering another activation', () => {
    state.badge.recording = true;
    state.badge.bird = { ...state.badge.bird!, busy: true, state: 'recording', message: '正在收录鸟叫' };
    const { primary } = render();
    expect(primary).toContain('正在收录鸟叫');
    expect(primary).not.toContain('重新准备识鸟');
    expect(primary).toContain('退出识鸟');
  });

  it('distinguishes complete BLE audio from a failed backend request', () => {
    state.badge.bird = { ...state.badge.bird!, state: 'error', stage: 'recognizing', captureId: 'capture-1',
      receivedBytes: 320000, expectedBytes: 320000, audioComplete: true, httpStatus: 503,
      message: '识鸟服务请求失败（HTTP 503），音频已在手机收齐' };
    const { primary } = render();
    expect(primary).toContain('320000 / 320000');
    expect(primary).toContain('10.0');
    expect(primary).toContain('完整校验通过');
    expect(primary).toContain('HTTP 503');
    expect(primary).toContain('尚未确认');
    expect(primary).not.toContain('已收到硬件解码回执');
  });

  it('never marks partial BLE audio or an unrequested backend call complete', () => {
    state.badge.bird = { ...state.badge.bird!, state: 'receiving', stage: 'receiving', captureId: 'capture-2',
      receivedBytes: 160000, expectedBytes: 320000, audioComplete: false, busy: true };
    const { primary } = render();
    expect(primary).toContain('160000 / 320000');
    expect(primary).toContain('尚未收齐');
    expect(primary).toContain('尚未请求');
    expect(primary).not.toContain('完整校验通过');
  });
});
