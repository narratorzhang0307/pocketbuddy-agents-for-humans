import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { stubBrain, setFrostBrain } from './brain';
import { listRoutableSkills, parseCloudPlan, planFrostTask, runFrostOrchestrator } from './skillRouter';
import { BUILTIN_SKILLS, disableSkill, ensureBuiltinSkills, equipSkill, installSkillManifest, resetSkillRegistryForTests } from '../../src/app/lib/skill';

describe('Frost cross-skill router', () => {
  beforeEach(() => {
    resetSkillRegistryForTests();
    ensureBuiltinSkills();
    setFrostBrain(stubBrain);
  });

  afterEach(() => setFrostBrain(stubBrain));

  it('does not restore a stale built-in home target after an app update, or re-enable a disabled skill', () => {
    resetSkillRegistryForTests();
    const manifest = BUILTIN_SKILLS.find(skill => skill.identity.id === 'frost.openfoodfacts')!;
    const installed = installSkillManifest({ ...manifest, entry: { target: 'earth' } }, 'builtin');
    equipSkill(installed.key);
    ensureBuiltinSkills();
    expect(listRoutableSkills().find(skill => skill.id === manifest.identity.id)).toMatchObject({ target: 'frost-openfoodfacts', availability: 'equipped' });
    disableSkill(manifest.identity.id);
    ensureBuiltinSkills();
    expect(listRoutableSkills().find(skill => skill.id === manifest.identity.id)?.availability).toBe('installed');
  });

  it('preserves an explicitly installed third-party entry instead of rewriting its manifest', () => {
    resetSkillRegistryForTests();
    const manifest = BUILTIN_SKILLS.find(skill => skill.identity.id === 'frost.healthsync')!;
    installSkillManifest({ ...manifest, entry: { target: 'custom-health-view' } }, 'inline');
    expect(listRoutableSkills().find(skill => skill.id === manifest.identity.id)?.target).toBe('custom-health-view');
  });

  it('routes a form-correction request to the equipped Lianlema skill without cloud', async () => {
    const result = await runFrostOrchestrator({ now: new Date('2026-08-11T00:00:00Z'), surface: 'frost', userText: '用练了吗纠正我的深蹲' });
    expect(result.plan?.steps.map((step) => step.skillId)).toEqual(['pocket.lianlema']);
    expect(result.plan?.ready).toBe(true);
    expect(result.plan?.source).toBe('local-rule');
  });

  it('keeps one training domain inside one skill even when the sentence contains a sequence word', async () => {
    let calls = 0;
    setFrostBrain({ complete: async () => { calls += 1; return '{}'; } });
    const { plan } = await planFrostTask({ now: new Date(), surface: 'frost', userText: '做深蹲动作纠正，然后继续动作计数' });
    expect(calls).toBe(0);
    expect(plan?.mode).toBe('single');
    expect(plan?.steps.map((step) => step.skillId)).toEqual(['pocket.lianlema']);
  });

  it('distinguishes Lianlema correction from Her Motion companionship', async () => {
    const { plan } = await planFrostTask({ now: new Date(), surface: 'frost', userText: '打开 Her Motion 做瑜伽热身' });
    expect(plan?.steps[0].skillId).toBe('pocket.her-motion');
    expect(plan?.steps[0].availability).toBe('equipped');
    expect(plan?.ready).toBe(true);
  });

  it('builds a parallel plan only when the request names independent health domains', async () => {
    const { plan } = await planFrostTask({ now: new Date(), surface: 'frost', userText: '把 Garmin 训练状态和包装食品营养分别查一下' });
    expect(plan?.mode).toBe('parallel');
    expect(plan?.steps.map((step) => step.skillId)).toEqual(expect.arrayContaining(['frost.garmin-readonly', 'frost.openfoodfacts']));
  });

  it('preserves an explicit first-then dependency instead of sorting by match score', async () => {
    const { plan } = await planFrostTask({
      now: new Date(), surface: 'frost',
      userText: '先导入 Apple Health 看 HRV 趋势，再根据 readiness 判断今天能不能跑质量课',
    });
    expect(plan?.mode).toBe('sequence');
    expect(plan?.steps.map((step) => step.skillId)).toEqual(['frost.healthsync', 'frost.running-coach']);
  });

  it('never sends obvious private identifiers to the cloud planner', async () => {
    let calls = 0;
    setFrostBrain({ complete: async () => { calls += 1; return '{}'; } });
    const { plan, trace } = await planFrostTask({ now: new Date(), surface: 'frost', userText: '把身份证和家庭住址发给一个合适的 skill' });
    expect(calls).toBe(0);
    expect(plan).toBeNull();
    expect(trace.join('\n')).toContain('原文全程留在本机');
  });

  it('rejects a cloud plan that tries to revive a removed non-health skill', async () => {
    let calls = 0;
    setFrostBrain({
      complete: async () => { calls += 1; return JSON.stringify({
        mode: 'single', summary: '交给多视角思考',
        steps: [{ skillId: 'pocket.council', objective: '比较两个方案的风险', reason: '需要多个专业视角' }],
      }); },
    });
    const { plan, trace } = await planFrostTask({ now: new Date(), surface: 'frost', userText: '帮我审慎评估这个选择' });
    expect(calls).toBe(1);
    expect(plan).toBeNull();
    expect(trace.join('\n')).toContain('云端模型规划 · 未形成合法计划');
  });

  it('rejects unknown fields, invented skills and duplicated targets', () => {
    const catalog = [{
      id: 'pocket.lianlema', name: '练了吗', description: '动作纠正', target: 'lianlema-coach', kind: 'markdown' as const,
      availability: 'equipped' as const, scopes: [], tools: [], triggers: ['练了吗'], notFor: [],
    }, {
      id: 'learned.my-coach', name: '我的动作快捷方式', description: '动作纠正', target: 'lianlema-coach', kind: 'shortcut' as const,
      availability: 'equipped' as const, scopes: [], tools: [], triggers: ['深蹲'], notFor: [],
    }];
    expect(parseCloudPlan(JSON.stringify({ mode: 'single', summary: 'x', debug: true, steps: [{ skillId: 'pocket.lianlema', objective: 'x', reason: 'x' }] }), catalog)).toBeNull();
    expect(parseCloudPlan(JSON.stringify({ mode: 'single', summary: 'x', steps: [{ skillId: 'invented.skill', objective: 'x', reason: 'x' }] }), catalog)).toBeNull();
    expect(parseCloudPlan(JSON.stringify({ mode: 'parallel', summary: 'x', steps: [
      { skillId: 'pocket.lianlema', objective: 'x', reason: 'x' },
      { skillId: 'pocket.lianlema', objective: 'y', reason: 'y' },
    ] }), catalog)).toBeNull();
    expect(parseCloudPlan(JSON.stringify({ mode: 'parallel', summary: 'x', steps: [
      { skillId: 'pocket.lianlema', objective: 'x', reason: 'x' },
      { skillId: 'learned.my-coach', objective: 'y', reason: 'y' },
    ] }), catalog)).toBeNull();
  });

  it.each([
    ['帮我打开 Her Motion 做一组瑜伽热身', 'pocket.her-motion'],
    ['用练了吗做一组深蹲动作纠正', 'pocket.lianlema'],
    ['根据 readiness 和个人基线判断今天能不能跑质量课', 'frost.running-coach'],
    ['导入 Apple Health 并看最近 HRV 趋势', 'frost.healthsync'],
    ['用 MediaPipe 姿态关键点做连续帧确认', 'frost.mediapipe-motion'],
    ['用 Section 11 做耐力训练处方校验', 'frost.endurance-guard'],
    ['扫食品条码查每100g营养标签', 'frost.openfoodfacts'],
    ['查询佳明 Garmin 训练状态和 HRV', 'frost.garmin-readonly'],
    ['查中国食品库里的奶茶热量', 'frost.cn-health-library'],
    ['看杭州 AQI 和紫外线判断今天适不适合跑步', 'frost.outdoor-window'],
    ['导入 Strava 活动做一次配速分段回放', 'frost.strava-replay'],
    ['比较下午咖啡和最近睡眠质量的相关性', 'frost.sleep-detective'],
    ['用餐食照片估算这顿中餐', 'frost.meal-lens'],
    ['打开 wger 看今天的力量训练计划', 'frost.wger-planner'],
    ['用 Mealie 安排一顿训练后的恢复餐', 'frost.mealie-kitchen'],
  ])('routes trigger corpus %s to %s', async (userText, skillId) => {
    const { plan } = await planFrostTask({ now: new Date(), surface: 'frost', userText });
    expect(plan?.steps[0].skillId).toBe(skillId);
  });

  it.each([
    '你好', '一加一等于几', '翻译这句话', '讲一个笑话', '帮我写一封邮件',
    '解释量子纠缠', '把歌单按歌手整理', '记录看完的电影', '规划京都旅行', '把书单整理成阅读记录',
  ])('does not force an unrelated request into a Skill: %s', async (userText) => {
    setFrostBrain({ complete: async () => '' });
    const { plan } = await planFrostTask({ now: new Date(), surface: 'frost', userText });
    expect(plan).toBeNull();
  });
});
