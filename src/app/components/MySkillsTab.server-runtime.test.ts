import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const agentsSource = readFileSync(new URL('./MySkillsTab.tsx', import.meta.url), 'utf8');
const networkSource = readFileSync(new URL('./AgentsTab.tsx', import.meta.url), 'utf8');
const privateForgeSource = readFileSync(new URL('./PrivateSkillForgePanel.tsx', import.meta.url), 'utf8');
const plazaSource = readFileSync(new URL('./AgentPlazaPage.tsx', import.meta.url), 'utf8');
const routesSource = readFileSync(new URL('../lib/plaza/skillRoutes.ts', import.meta.url), 'utf8');

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
});
