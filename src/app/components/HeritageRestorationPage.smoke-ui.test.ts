import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('HERITAGE-SKILL smoke 前端', () => {
  const pageSource = readFileSync(new URL('./HeritageRestorationPage.tsx', import.meta.url), 'utf8');
  const runtimeSource = readFileSync(new URL('../lib/heritage/rubbing.ts', import.meta.url), 'utf8');
  const ocrSource = readFileSync(new URL('../lib/heritage/professionalOcr.ts', import.meta.url), 'utf8');
  const conservationSource = readFileSync(new URL('./DigitalConservationPanel.tsx', import.meta.url), 'utf8');

  it('古籍与碑拓页面统一展示 LoRA ON 和目标架构', () => {
    expect(pageSource).toContain('QWEN3-VL-2B BASE · MNN ON-DEVICE · LORA ON');
    expect(pageSource).toContain('PP-OCR + QWEN-VL-2B + {localAdapterName.toUpperCase()}');
    expect(pageSource).not.toContain('LORA OFF');
  });

  it('合并 OCR 与 Qwen 候选为一处', () => {
    expect(pageSource).toContain("const mergedOcrText = ocr ? (ocr.lora.valid ? ocr.lora.text : ocr.base.text) : '';");
    expect(pageSource).not.toContain('grid grid-cols-2 divide-x-2 divide-black border-b-2 border-black');
    expect(pageSource).not.toContain('PP-OCRV5 忠实主稿</span>');
    expect(pageSource).not.toContain('QWEN3-VL-2B BASE 复核</span>');
  });

  it('证据文案使用指定名称并删除 LoRA OFF 说明', () => {
    expect(runtimeSource).toContain('官方 Qwen3-VL-2B Base + 古籍 LoRA 通过 MNN');
    expect(runtimeSource).not.toContain('当前运行不加载 LoRA');
  });

  it('碑拓明确路由到项目内更强的 PP-OCRv6 Small', () => {
    expect(runtimeSource).toContain("profile ?? (material === 'rubbing' ? 'document' : 'heritage')");
    expect(ocrSource).toContain("profile: ChineseOcrProfile = 'heritage'");
    expect(runtimeSource).toContain("result.model === 'PP-OCRv6_small' ? 'PP-OCRv6 Small'");
  });

  it('数字化补全强制使用 PP-OCRv6 Small 并继承无投影运行卡片', () => {
    expect(conservationSource).toContain("runHeritageOcr(image, material, undefined, 'document')");
    expect(conservationSource).toContain('PP-OCRv6 Small 读取周围文字');
    expect(conservationSource).toContain('<RunTrace runId={runId} collapseWhenDone flat />');
  });

  it('HERITAGE 页面及数字化补全面板不再带卡片投影', () => {
    expect(pageSource).not.toContain('shadow-[');
    expect(conservationSource).not.toContain('shadow-[');
    expect(pageSource).toContain('<RunTrace runId={runId} collapseWhenDone flat />');
  });
});
