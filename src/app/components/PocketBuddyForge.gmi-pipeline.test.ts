import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Pocket Buddy Forge · Qwen 生成链路', () => {
  const source = readFileSync(
    new URL('./PocketBuddyForge.tsx', import.meta.url),
    'utf8',
  );
  const css = readFileSync(
    new URL('./PocketBuddyForge.css', import.meta.url),
    'utf8',
  );

  it('选图后默认使用 Qwen 萌化与透明抠图流程', () => {
    expect(source).toContain("mode: 'mascot'");
    expect(source).toContain('submitPetCutout(file');
    expect(source).toContain('waitForPetCutout(submitted');
    expect(source).toContain('downloadPetCutout(ready');
    expect(source).toContain('Qwen 萌化 + 透明抠图 · 拍照即可生成口袋伙伴');
    expect(source).toContain("setPortraitUrl('');");
    expect(source).not.toContain('setPortraitUrl(local.portraitUrl);');
    expect(source).toContain("busy ? 'Qwen 生成中'");
    expect(source).not.toContain('allowCloudMascot');
    expect(source).not.toContain('云端萌化</label>');
  });

  it('Qwen 失败时留空，不自动使用另一个视觉结果', () => {
    expect(source).toContain('形象留空，请重试。');
    expect(source).not.toContain('setPortraitUrl(localPortrait);');
    expect(source).not.toContain('已保留本机抠图');
  });

  it('相机在取景框内拍摄并自动回填同一条 Qwen 链路', () => {
    expect(source).toContain('navigator.mediaDevices.getUserMedia');
    expect(source).toContain("facingMode: { ideal: 'environment' }");
    expect(source).toContain('canvas.toBlob');
    expect(source).toContain('1440 / Math.max(video.videoWidth, video.videoHeight)');
    expect(source).toContain('context.drawImage(video, 0, 0, canvas.width, canvas.height)');
    expect(css).toMatch(/\.pbf-camera-viewfinder video\s*\{[\s\S]*?object-fit:\s*contain;/);
    expect(source).toContain('onCapture(new File');
    expect(source).toContain('void handleFile(file)');
    expect(source).toContain('打开相机 · 扫描物件');
    expect(source).toContain('返回卡册');
    expect(source).toContain("setPanel('catalog')");
  });

  it('相机入口使用浅色设计且人格表单只显示边界', () => {
    expect(css).toMatch(/\.pbf-camera-launch\s*\{[\s\S]*?background:\s*linear-gradient\([\s\S]*?box-shadow:\s*none;/);
    expect(source).not.toContain('恐惧 / 边界');
    expect(source).toContain('<label>边界<textarea');
  });
});
