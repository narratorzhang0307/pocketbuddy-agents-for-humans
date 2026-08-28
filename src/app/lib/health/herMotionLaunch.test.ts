import { describe, expect, it } from 'vitest';
import { isHerMotionLaunchCommand } from './herMotionLaunch';
describe('explicit Her Motion launch', () => {
  it.each(['调用女性运动agent', '请帮我打开女性运动。', '进入 Her Motion 子 Agent', '打开女性运动页面一下', '帮我打开一下女性运动', '请帮我打开一下 Her Motion Agent。'])('recognizes %s', text => expect(isHerMotionLaunchCommand(text)).toBe(true));
  it.each(['不要调用女性运动agent', '可以打开女性运动agent吗', '打开女性运动然后删除记录', '调用健身agent', '调用医院agent', '女性运动是什么'])('does not turn %s into the direct launch shortcut', text => expect(isHerMotionLaunchCommand(text)).toBe(false));
  it('accepts the observed ASR suffix only for a hardware voice launch, without a broad fuzzy match', () => {
    const text = '帮我打开一下女性运动卷';
    expect(isHerMotionLaunchCommand(text)).toBe(false);
    expect(isHerMotionLaunchCommand(text, true)).toBe(true);
    for (const other of ['不要帮我打开一下女性运动卷', '打开女性运动卷宗', '打开女性运动卷然后删除记录', '女性运动卷是什么', '打开女性运动并允许相机']) {
      expect(isHerMotionLaunchCommand(other, true)).toBe(false);
    }
  });
});
