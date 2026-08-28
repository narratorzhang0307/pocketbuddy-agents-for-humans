import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BadgeStatus } from '../lib/frostBadge';
import BirdSkillPage from './BirdSkillPage';
import BirdSoundCard from './BirdSoundCard';
import { BIRD_DECK, birdConfidenceLabel, isCurrentBirdCandidate } from '../lib/birdDeck';
import { BIRD_ASSETS } from '../lib/birdListener';

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
  return { html, primary: html.slice(0, html.indexOf('<details data-bird-settings')) };
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
    expect(primary).toContain('连接 B 板</button>');
    expect(primary).not.toContain('重新准备识鸟</button>');
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

  it('keeps HTTP unrequested when complete audio is waiting for board control', () => {
    state.badge.bird = { ...state.badge.bird!, state: 'recognizing', stage: 'preparing', captureId: 'capture-3',
      receivedBytes: 320000, expectedBytes: 320000, audioComplete: true, busy: true,
      message: '音频已收齐，正在准备识别' };
    const { primary } = render();
    expect(primary).toContain('完整校验通过');
    expect(primary).toContain('尚未请求');
    expect(primary).not.toContain('请求中');
  });

  it('puts the twelve reference cards between recording and hardware settings', () => {
    const { html } = render();
    expect(html.indexOf('按住 B 板屏幕录音')).toBeLessThan(html.indexOf('我的鸟声卡组'));
    expect(html.indexOf('我的鸟声卡组')).toBeLessThan(html.indexOf('蓝牙连接与黑屏设置'));
    expect(html.match(/class="bird-deck-card"/g)).toHaveLength(12);
    expect(html).toContain('卡组是图鉴，不是识别记录');
    expect(html).not.toContain('is-candidate');
    expect(html).not.toContain('<audio');
    expect(html).not.toContain('已收集');
  });

  it('only highlights the actual current candidate without claiming hardware receipt', () => {
    state.badge.bird = { ...state.badge.bird!, state: 'result', speciesId: 'pica-serica', name: '喜鹊', confidence: 0.83, imageApplied: false };
    const { html, primary } = render();
    expect(html.match(/class="bird-deck-card is-candidate"/g)).toHaveLength(1);
    expect(primary).toContain('查看本次候选喜鹊鸟卡');
    expect(primary).toContain('模型置信度 83%');
    expect(primary).toContain('不是准确率');
    expect(primary).toContain('鸟图回传硬件尚未确认');
    expect(primary).not.toContain('已收到硬件解码回执');
  });

  it('does not relabel an unknown result or stale species as an identified card', () => {
    state.badge.bird = { ...state.badge.bird!, state: 'result', speciesId: 'unknown-bird', name: '未知鸟种' };
    const { html, primary } = render();
    expect(primary).toContain('未知鸟种');
    expect(primary).toContain('模型未提供有效置信度');
    expect(html).not.toContain('is-candidate');
    expect(isCurrentBirdCandidate({ ...state.badge.bird!, state: 'recording', speciesId: 'pica-serica' }, 'pica-serica')).toBe(false);
  });
});

describe('approved bird sound cards', () => {
  it('derives all art and reference audio from the one native bird catalog', () => {
    expect(BIRD_DECK.map(entry => entry.id)).toEqual(BIRD_ASSETS.slice(1).map(asset => asset.id));
    for (const entry of BIRD_DECK) {
      const asset = BIRD_ASSETS.find(asset => asset.id === entry.id)!;
      expect(typeof asset.source).toBe('object');
      if (typeof asset.source !== 'object') throw new Error('Missing canonical bird source');
      expect(entry.spriteUrl).toBe(asset.source.sprite.webp.url);
      expect(entry.backgroundUrl).toBe(asset.source.background.pngUrl);
      expect(entry.audioUrl).toBe(asset.source.audioUrl);
      expect(entry.profile?.speciesId).toBe(entry.id);
    }
  });

  it('renders shared front and back with reference sound, not a fabricated encounter', () => {
    const html = renderToStaticMarkup(createElement(BirdSoundCard, { entry: BIRD_DECK[0] }));
    expect(html).toContain('ccc-front');
    expect(html).toContain('ccc-wildlife-back');
    expect(html).toContain('图鉴参考');
    expect(html).toContain('POCKET BUDDY · BIRD DECK');
    expect(html).toContain('物种参考鸟声 · 非本次录音');
    expect(html).toContain(BIRD_DECK[0].audioUrl);
    expect(html).toContain(BIRD_DECK[0].spriteUrl);
    expect(html).not.toContain('声音证据 0%');
    expect(html).not.toContain('生声不息');
    expect(html).not.toContain('苏堤');
    expect(html).not.toContain('见过 1 次');
    expect(html).not.toContain('听见地点');
    expect(html).not.toContain('autoplay');
    expect(html).not.toContain('frames-clean');
  });

  it('keeps current card details honest about missing location and retained audio', () => {
    const html = renderToStaticMarkup(createElement(BirdSoundCard, {
      entry: BIRD_DECK[0], bird: { ...state.badge.bird!, state: 'result', speciesId: BIRD_DECK[0].id, confidence: 0.76 },
    }));
    expect(html).toContain('本次候选');
    expect(html).toContain('模型置信度 76%');
    expect(html).toContain('未采集位置');
    expect(html).toContain('未保留可回听片段');
    expect(html).not.toContain('原始录音已保留');
  });

  it('never turns missing or invalid confidence into a fake percentage', () => {
    for (const confidence of [undefined, NaN, Infinity, -1, 2]) {
      expect(birdConfidenceLabel(confidence)).toBe('模型未提供有效置信度');
    }
    expect(birdConfidenceLabel(0)).toBe('模型置信度 0%');
  });
});
