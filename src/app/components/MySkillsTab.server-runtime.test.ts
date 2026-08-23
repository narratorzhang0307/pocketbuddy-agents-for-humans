import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const agentsSource = readFileSync(new URL('./MySkillsTab.tsx', import.meta.url), 'utf8');
const networkSource = readFileSync(new URL('./AgentsTab.tsx', import.meta.url), 'utf8');
const privateForgeSource = readFileSync(new URL('./PrivateSkillForgePanel.tsx', import.meta.url), 'utf8');
const plazaSource = readFileSync(new URL('./AgentPlazaPage.tsx', import.meta.url), 'utf8');
const routesSource = readFileSync(new URL('../lib/plaza/skillRoutes.ts', import.meta.url), 'utf8');
const sharedBrainSource = readFileSync(new URL('../../../frost-agent/harness/httpBrain.ts', import.meta.url), 'utf8');
const buddyBrainSource = readFileSync(new URL('../lib/pocket-buddy/brain.ts', import.meta.url), 'utf8');
const fitnessAgentSource = readFileSync(new URL('../lib/fitnessAgentRuntime.ts', import.meta.url), 'utf8');
const healthPageSource = readFileSync(new URL('./HealthFoundationSkillPage.tsx', import.meta.url), 'utf8');
const healthRuntimeSource = readFileSync(new URL('./HealthSkillRuntimePanel.tsx', import.meta.url), 'utf8');
const healthModelSource = readFileSync(new URL('../../../frost-agent/skills/health/serverModelControl.ts', import.meta.url), 'utf8');
const healthBuiltinsSource = readFileSync(new URL('../lib/skill/externalHealthBuiltins.ts', import.meta.url), 'utf8');
const taskmasterHealthSource = readFileSync(new URL('../../../frost-agent/taskmaster/externalSkills.ts', import.meta.url), 'utf8');
const viteSource = readFileSync(new URL('../../../vite.pocketbuddy.config.ts', import.meta.url), 'utf8');
const skillAssetsSource = readFileSync(new URL('../lib/skill/assets.ts', import.meta.url), 'utf8');

describe('MySkillsTab 服务端 Demo 运行边界', () => {
  it('不再暴露 SME2 端侧加速与证据账本入口', () => {
    expect(agentsSource).not.toContain('OnDeviceBrainPanel');
    expect(agentsSource).not.toContain('DeviceEvidenceLedgerPage');
    expect(agentsSource).not.toContain('SME2');
    expect(routesSource).not.toContain('deviceevidence');
    expect(existsSync(new URL('./OnDeviceBrainPanel.tsx', import.meta.url))).toBe(false);
    expect(existsSync(new URL('./DeviceEvidenceLedgerPage.tsx', import.meta.url))).toBe(false);
  });

  it('技能列表只展示服务端运行语义', () => {
    expect(agentsSource).toContain('SERVER ORCHESTRATED · AUDITABLE RUN');
    expect(agentsSource).toContain('>SERVER</span>');
    expect(agentsSource).not.toContain('QWEN4B·MNN');
    expect(agentsSource).not.toContain('LOCAL RULES');
    expect(agentsSource).not.toContain("runtimeBadge: 'LOCAL VISION'");
    expect(agentsSource).not.toContain('默认留在本机');
  });

  it('世界建议与私人 Skill 草案统一调用服务端 Qwen', () => {
    for (const source of [networkSource, privateForgeSource]) {
      expect(source).toContain('getFrostBrain().complete');
      expect(source).not.toContain('isNativeMnnPlatform');
      expect(source).not.toContain('runEdgeChat');
      expect(source).not.toContain('MNN');
    }
    expect(networkSource).toContain("task: 'agent-world-draft'");
    expect(privateForgeSource).toContain("task: 'private-skill-draft'");
  });

  it('智能体广场只展示服务端运行与验收语义', () => {
    expect(plazaSource).toContain('服务端运行契约');
    expect(plazaSource).toContain('服务端契约已验');
    expect(plazaSource).not.toContain('checkSkillOnDevice');
    expect(plazaSource).not.toContain('真机自检');
    expect(plazaSource).not.toContain('MNN');
    expect(existsSync(new URL('../lib/skill/deviceCheck.ts', import.meta.url))).toBe(false);
    expect(existsSync(new URL('../lib/skill/onDeviceCoverage.ts', import.meta.url))).toBe(false);
  });

  it('所有文本模型调用只走鉴权的 pocketbuddy-api', () => {
    for (const source of [sharedBrainSource, buddyBrainSource, fitnessAgentSource, healthModelSource, viteSource]) {
      expect(source).not.toContain('/api/frost-llm');
    }
    expect(sharedBrainSource).toContain('createDefaultPocketBuddyApiClient');
    expect(buddyBrainSource).toContain('createDefaultPocketBuddyApiClient');
    expect(fitnessAgentSource).toContain('createDefaultPocketBuddyApiClient');
    expect(fitnessAgentSource).not.toContain('edgeQwenCompletion');
    expect(fitnessAgentSource).not.toContain('edgeSafe');
    expect(healthModelSource).toContain('createDefaultPocketBuddyApiClient');
    expect(healthModelSource).not.toContain('callEdgeRequest');
    expect(healthBuiltinsSource).toContain('frost-server-control/v1');
    expect(healthBuiltinsSource).not.toContain('QWEN4B_HEALTH_ASSET');
    expect(healthBuiltinsSource).not.toContain('Qwen3-4B');
    expect(taskmasterHealthSource).not.toContain('Qwen3-4B');
    expect(healthPageSource).toContain('SERVER MODEL CONTROL PLANE');
    expect(healthPageSource).not.toContain('HealthQwenMnnCard');
    expect(healthPageSource).not.toContain('MNN 4B');
    expect(healthRuntimeSource).toContain('explainHealthDecisionWithServerModel');
    expect(healthRuntimeSource).not.toContain('Qwen3-4B');
    expect(existsSync(new URL('./HealthQwenMnnCard.tsx', import.meta.url))).toBe(false);
    expect(existsSync(new URL('../../../frost-agent/skills/health/qwenControl.ts', import.meta.url))).toBe(false);
    expect(viteSource).not.toContain('qwenChatDev');
    expect(existsSync(new URL('../../../server/qwen-health-provider.mjs', import.meta.url))).toBe(false);
  });

  it('生产入口不再注册或打包端侧 MNN 运行时', () => {
    expect(viteSource).not.toContain('frostEdge');
    expect(viteSource).not.toContain('frost-agent/edge');
    expect(skillAssetsSource).not.toContain('frost-agent/edge');
    expect(skillAssetsSource).not.toContain('installEdgeAsset');
    expect(skillAssetsSource).not.toContain('MNN 资产管理器');
  });
});
