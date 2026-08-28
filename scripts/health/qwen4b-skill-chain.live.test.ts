import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { planFrostTask } from '../../frost-agent/harness/skillRouter';
import { EXTERNAL_HEALTH_SKILL_DEFINITIONS } from '../../frost-agent/taskmaster/externalSkills';
import {
  assessReadiness,
  auditEndurancePrescription,
  buildGarminReadCommand,
  buildHealthsyncReadCommand,
  buildOpenFoodFactsRequest,
  confirmPoseSignal,
  validateTrainingPrescription,
} from '../../frost-agent/skills/health/foundation';
import { searchCnFoods } from '../../frost-agent/skills/health/cnFoodLibrary';
import { buildEvidenceBoundWeeklyReport, normalizeAppleHealthRecord } from '../../frost-agent/skills/health/evidenceReport';
import {
  buildHealthSkillChainPrompt,
  parseHealthSkillChainDecision,
  type HealthSkillChainInput,
  type HealthSkillChainOutcome,
} from '../../frost-agent/skills/health/qwenSkillChain';
import { normalizeOpenFoodFactsProduct } from '../../server/health-skill-bridge.mjs';
import { ensureBuiltinSkills, resetSkillRegistryForTests } from '../../src/app/lib/skill';

const BASE_URL = String(process.env.QWEN4B_BASE_URL || '').replace(/\/$/, '');
const MODEL = process.env.QWEN4B_MODEL || 'qwen3-4b-local';

interface LiveCase {
  id: string;
  routeText: string;
  userRequest: string;
  requiredOutcome: HealthSkillChainOutcome;
  requiredTools: string[];
  evidence: Record<string, unknown>;
  evidenceRefs: string[];
  messageMustMatch: RegExp;
  messageMustNotMatch?: RegExp;
}

function connectorVersion(name: 'healthsync' | 'garmin-connect'): string {
  const binary = resolve(process.cwd(), 'var', 'health-skills', 'bin', name);
  const args = name === 'healthsync' ? ['version'] : ['--version'];
  const result = spawnSync(binary, args, { encoding: 'utf8', timeout: 5_000 });
  return result.status === 0 ? result.stdout.trim() : `unavailable:${result.status ?? 'spawn_error'}`;
}

function definitionFor(id: string) {
  const definition = EXTERNAL_HEALTH_SKILL_DEFINITIONS.find((candidate) => candidate.skill_id === id);
  if (!definition) throw new Error(`missing_health_skill:${id}`);
  return definition;
}

async function openFoodFactsEvidence(): Promise<Record<string, unknown>> {
  const url = buildOpenFoodFactsRequest({ barcode: '3017620422003' });
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`openfoodfacts_http_${response.status}`);
  const raw = await response.json() as { product?: unknown };
  const product = normalizeOpenFoodFactsProduct(raw.product);
  if (!product) throw new Error('openfoodfacts_product_missing');
  return {
    source: `Open Food Facts:${url.hostname}:http-${response.status}`,
    product: `${product.name};brands=${product.brands};quantity=${product.quantity}`,
    每100g: {
      能量千卡: product.nutritionPer100g.energyKcal,
      蛋白质克: product.nutritionPer100g.proteinG,
      脂肪克: product.nutritionPer100g.fatG,
      碳水克: product.nutritionPer100g.carbsG,
      糖克: product.nutritionPer100g.sugarsG,
      膳食纤维克: product.nutritionPer100g.fiberG,
      盐克: product.nutritionPer100g.saltG,
    },
    missing: product.missing,
  };
}

async function buildCases(): Promise<LiveCase[]> {
  const runningReadiness = assessReadiness({
    sleepHours: 4.5, hrvDeltaPct: -22, restingHeartRateDeltaBpm: 11, fatigue: 8, pain: 0,
  });
  const runningValidation = validateTrainingPrescription({
    intensity: 'hard', durationMin: 45,
    stopRules: ['胸痛、晕厥、异常呼吸或影响步态的疼痛立即停止'],
    evidenceIds: ['readiness:2026-08-19'],
  }, runningReadiness);

  const enduranceReadiness = assessReadiness({
    sleepHours: 6, hrvDeltaPct: -12, restingHeartRateDeltaBpm: 2, fatigue: 5, pain: 0,
  });
  const enduranceAudit = auditEndurancePrescription({
    prescription: {
      intensity: 'moderate', durationMin: 50, stopRules: ['异常即停'], evidenceIds: ['run:event-17'],
    },
    readiness: enduranceReadiness,
    dataReadAt: '2026-08-19T08:00:00.000Z',
    sourceEventIds: ['run:event-17'],
    progressionVariables: ['duration', 'intensity'],
    thresholdChangeSource: 'estimate',
    now: new Date('2026-08-19T10:00:00.000Z'),
  });

  const appleRecord = normalizeAppleHealthRecord({
    type: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN', value: 43, unit: 'ms',
    startDate: '2026-08-18T07:30:00.000Z', sourceName: 'Apple Watch',
  });
  const weeklyReport = buildEvidenceBoundWeeklyReport([
    { id: 'health:steps:18', occurredAt: '2026-08-18T12:00:00.000Z', metric: 'steps', value: 8234, unit: 'count', confirmed: true },
    { id: 'health:exercise:18', occurredAt: '2026-08-18T18:00:00.000Z', metric: 'exercise-minutes', value: 32, unit: 'min', confirmed: true },
    { id: 'health:unconfirmed', occurredAt: '2026-08-19T08:00:00.000Z', metric: 'sleep-hours', value: 7.2, unit: 'hours', confirmed: false },
  ], '2026-08-17');

  return [
    {
      id: 'frost.running-coach', routeText: 'Running Coach readiness 跑步处方',
      userRequest: '我昨晚只睡4.5小时，但今天想做45分钟高强度间歇跑。',
      requiredOutcome: 'degrade', requiredTools: ['coach.assess-readiness', 'coach.validate-prescription'],
      evidence: {
        gate: `${runningReadiness.band};max=${runningReadiness.maxIntensity};confidence=${runningReadiness.confidence}`,
        reasons: ['sleep<5h', 'hrv<-20%', 'rhr+11bpm', 'fatigue=8/10'],
        validation: `${runningValidation.ok ? 'pass' : 'fail'}:${runningValidation.errors.join(',')}`,
        conservative: `${runningValidation.conservative.intensity},${runningValidation.conservative.durationMin}min,stop-rule=yes`,
      },
      evidenceRefs: ['readiness:2026-08-19'], messageMustMatch: /恢复|轻松|休息|暂停|不被允许|上限/,
      messageMustNotMatch: /建议.*高强度|可以.*间歇/,
    },
    {
      id: 'frost.healthsync', routeText: 'Healthsync 查询 Apple Health HRV趋势',
      userRequest: '看一下这周 Apple Health 的 HRV；没有记录的日期不要算成0。',
      requiredOutcome: 'proceed', requiredTools: ['healthsync.query'],
      evidence: {
        connector: connectorVersion('healthsync'),
        allowlisted_command: buildHealthsyncReadCommand({ metric: 'hrv', from: '2026-08-17', to: '2026-08-19', limit: 20 }),
        normalized_record: appleRecord ? `${appleRecord.metric}=43ms@2026-08-18` : null,
        coverage: 'observed=2026-08-18;missing=2026-08-17,2026-08-19;missing-is-not-zero',
      },
      evidenceRefs: ['healthsync:synthetic-local-2026-08-19'], messageMustMatch: /缺失|覆盖|记录/,
      messageMustNotMatch: /缺失.*0|上传.*原始/,
    },
    {
      id: 'frost.mediapipe-motion', routeText: 'MediaPipe 姿态关键点连续帧确认',
      userRequest: '我这一帧动作做完了吗？', requiredOutcome: 'wait', requiredTools: ['motion.confirm-pose'],
      evidence: {
        input: 'confidence=.82;frames=3;visible=25/33',
        pose_gate: confirmPoseSignal({ confidence: 0.82, consecutiveFrames: 3, visibleLandmarks: 25 }),
      },
      evidenceRefs: ['pose:session-01:frame-128'], messageMustMatch: /等待|连续帧|未确认|尚未/,
      messageMustNotMatch: /动作已完成|诊断|受伤/,
    },
    {
      id: 'frost.endurance-guard', routeText: 'Section 11 耐力训练处方校验负荷递增',
      userRequest: '本周同时增加时长和强度，并用估算阈值发布训练计划。',
      requiredOutcome: 'degrade', requiredTools: ['endurance.validate-prescription'],
      evidence: {
        readiness: `${enduranceReadiness.band};max=${enduranceReadiness.maxIntensity}`,
        audit: `${enduranceAudit.ok ? 'pass' : 'fail'}:${enduranceAudit.errors.join(',')}`,
        conservative: `${enduranceAudit.conservative.intensity},${enduranceAudit.conservative.durationMin}min`,
      },
      evidenceRefs: ['endurance:audit-2026-08-19'], messageMustMatch: /不通过|未通过|保守|轻松|降级|只调整/,
      messageMustNotMatch: /校验通过|可以发布/,
    },
    {
      id: 'frost.openfoodfacts', routeText: 'OpenFoodFacts 食品条码 每100g 营养标签',
      userRequest: '扫这个包装食品条码，告诉我每100克营养；不知道份量就别算整包。',
      requiredOutcome: 'proceed', requiredTools: ['food.off.lookup'], evidence: await openFoodFactsEvidence(),
      evidenceRefs: ['off:barcode:3017620422003'], messageMustMatch: /100g|100克|每百克/,
      messageMustNotMatch: /整包.*\d+.*千卡|钠/,
    },
    {
      id: 'frost.garmin-readonly', routeText: 'Garmin 佳明训练状态 training readiness',
      userRequest: '读取今天 Garmin 的训练准备度。', requiredOutcome: 'wait', requiredTools: ['garmin.query-readonly'],
      evidence: {
        connector: connectorVersion('garmin-connect'),
        allowlisted_command: buildGarminReadCommand({ operation: 'training-readiness', date: '2026-08-19' }),
        auth: 'not_tested_without_user_credentials', provider_data: null,
      },
      evidenceRefs: ['garmin:local-auth-boundary'], messageMustMatch: /登录|授权|鉴权|认证|等待|暂无/,
      messageMustNotMatch: /准备度.*\d+|HRV.*\d+|上传|删除/,
    },
    {
      id: 'frost.cn-health-library', routeText: '中国食品库 中餐营养 健康周报',
      userRequest: '查宫保鸡丁的估算范围，并只用确认过的数据做本周健康周报。',
      requiredOutcome: 'proceed', requiredTools: ['food.cn.lookup', 'report.weekly-evidence'],
      evidence: {
        food: (() => {
          const food = searchCnFoods('宫保鸡丁', 1)[0];
          return food ? `${food.name};${food.energyText};basis=${food.energyBasis};approx=${food.approximate};source=${food.source}` : 'not_found';
        })(),
        weekly: `coverage=${weeklyReport.coverageDays}d;metrics=${weeklyReport.metrics.map((metric) => `${metric.metric}:${metric.value}${metric.unit}`).join(',')};ids=${weeklyReport.sourceEventIds.join(',')};ignored=${weeklyReport.ignoredEventCount}`,
      },
      evidenceRefs: ['cn-health:week-2026-08-17'], messageMustMatch: /估算|范围|确认|周报/,
      messageMustNotMatch: /诊断|处方药|减重药/,
    },
  ];
}

async function callQwen(input: HealthSkillChainInput): Promise<{ raw: string; elapsedMs: number }> {
  const { system, prompt } = buildHealthSkillChainPrompt(input);
  const started = performance.now();
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      model: MODEL, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      temperature: 0, max_tokens: 64, response_format: { type: 'json_object' }, stream: false,
    }),
  });
  if (!response.ok) throw new Error(`qwen_http_${response.status}:${await response.text()}`);
  const data = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
  const raw = data.choices?.[0]?.message?.content;
  if (typeof raw !== 'string') throw new Error('qwen_response_content_missing');
  return { raw, elapsedMs: Math.round(performance.now() - started) };
}

describe.skipIf(!BASE_URL)('Qwen3-4B live chain across all external health skills', () => {
  let cases: LiveCase[] = [];

  beforeAll(async () => {
    resetSkillRegistryForTests();
    ensureBuiltinSkills();
    cases = await buildCases();
  }, 30_000);

  for (const id of EXTERNAL_HEALTH_SKILL_DEFINITIONS.map((skill) => skill.skill_id)) {
    it(`routes, grounds and validates ${id}`, async () => {
      const scenario = cases.find((candidate) => candidate.id === id)!;
      const route = await planFrostTask({ now: new Date('2026-08-19T10:00:00.000Z'), surface: 'frost', userText: scenario.routeText });
      expect(route.plan?.steps[0]?.skillId).toBe(id);
      expect(route.plan?.source).toBe('local-rule');

      const input: HealthSkillChainInput = {
        definition: definitionFor(id), userRequest: scenario.userRequest,
        requiredOutcome: scenario.requiredOutcome, requiredTools: scenario.requiredTools,
        evidence: scenario.evidence, evidenceRefs: scenario.evidenceRefs,
      };
      const response = await callQwen(input);
      let decision;
      try { decision = parseHealthSkillChainDecision(response.raw, input); }
      catch (error) {
        console.info(JSON.stringify({ skill: id, elapsedMs: response.elapsedMs, rejectedRaw: response.raw }));
        throw error;
      }
      expect(decision.outcome).toBe(scenario.requiredOutcome);
      expect(decision.user_message).toMatch(scenario.messageMustMatch);
      if (scenario.messageMustNotMatch) expect(decision.user_message).not.toMatch(scenario.messageMustNotMatch);
      console.info(JSON.stringify({ skill: id, outcome: decision.outcome, elapsedMs: response.elapsedMs, message: decision.user_message }));
    }, 130_000);
  }
});
