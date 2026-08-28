import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('SME2 真机开关与效率记录', () => {
  const panelSource = readFileSync(new URL('./OnDeviceBrainPanel.tsx', import.meta.url), 'utf8');
  const ledgerSource = readFileSync(new URL('./DeviceEvidenceLedgerPage.tsx', import.meta.url), 'utf8');
  const heritagePageSource = readFileSync(new URL('./HeritageRestorationPage.tsx', import.meta.url), 'utf8');
  const heritageRuntimeSource = readFileSync(new URL('../lib/heritage/rubbing.ts', import.meta.url), 'utf8');
  const nativeSource = readFileSync(new URL('../../../android/native/pocket_mnn_jni.cpp', import.meta.url), 'utf8');

  it('JNI 将 OFF/ON 分别下沉到 target 2/3，并只按实际 target 标记生效', () => {
    expect(nativeSource).toContain('const int requested_target = next_sme2 ? 3 : 2;');
    expect(nativeSource).toContain('PocketMnnSetCpuTargetForBenchmark(requested_target)');
    expect(nativeSource).toContain('applied_target == 3');
    expect(nativeSource).not.toContain('const int next_target = 0;');
  });

  it('提供同一固定输入的一键 OFF/ON 实测并在结束后保持 ON', () => {
    expect(panelSource).toContain("const prompt = '只回复 SME2_AB_OK'");
    expect(panelSource).toContain('await configureEdgeRuntime(true, false)');
    expect(panelSource).toContain('await configureEdgeRuntime(true, true)');
    expect(panelSource).toContain('一键实测 OFF → ON（结束保持 ON）');
  });

  it('精简面板说明但保留开关、实测和效率记录入口', () => {
    expect(panelSource).not.toContain('MNN 固定开启，你只控制 SME2');
    expect(panelSource).not.toContain('JNI 实际状态');
    expect(panelSource).not.toContain('真实开关只在 Android APK 启用');
    expect(panelSource).toContain('SME2 指令加速');
    expect(panelSource).toContain('查看 SME2 效率记录');
  });

  it('默认折叠并提供明确的展开与收起状态', () => {
    expect(panelSource).toContain('useState(false)');
    expect(panelSource).toContain('aria-expanded={open}');
    expect(panelSource).toContain("{open ? '收起' : '展开'}");
  });

  it('效率账本展示每一次真实推理而不只展示已配对结果', () => {
    expect(panelSource).toContain('inferenceRecords.length} 次 / {comparisons.length} 组');
    expect(ledgerSource).toContain('每次真实推理');
    expect(ledgerSource).toContain('TARGET {record.cpuTarget');
    expect(ledgerSource).toContain('record.stats?.decodeTokensPerSecond');
  });

  it('古籍识别尊重当前 SME2 选择，不在运行前偷偷切回 OFF', () => {
    expect(heritageRuntimeSource).not.toContain('configureEdgeRuntime(true, false)');
    expect(heritagePageSource).toContain("runtime?.sme2Requested ?? true");
    expect(heritagePageSource).toContain('configureEdgeRuntime(true, requestedSme2)');
  });
});
