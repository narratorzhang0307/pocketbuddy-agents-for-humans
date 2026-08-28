import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

const projectRoot = new URL('../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, projectRoot), 'utf8');
const projectPath = (path: string) => fileURLToPath(new URL(path, projectRoot));

describe('Android 桌面品牌', () => {
  it('Capacitor 使用独立的 Pocket Buddy 应用身份', () => {
    const capacitorSource = read('capacitor.config.ts');
    expect(capacitorSource).toContain("appId: 'art.throughtheglass.pocketbuddy'");
    expect(capacitorSource).toContain("appName: 'Pocket Buddy'");
    expect(capacitorSource).toContain('POCKET_BUDDY_LIVE_URL');
  });

  it('启动器使用米色方形底且不声明圆形图标', () => {
    expect(read('android/app/src/main/res/values/ic_launcher_background.xml'))
      .toContain('#FFF3D6');
    expect(read('android/app/src/main/AndroidManifest.xml'))
      .not.toContain('android:roundIcon');
  });

  it('五组 Android 密度图标尺寸完整', async () => {
    const densities = [
      ['mdpi', 48, 108],
      ['hdpi', 72, 162],
      ['xhdpi', 96, 216],
      ['xxhdpi', 144, 324],
      ['xxxhdpi', 192, 432],
    ] as const;

    for (const [density, legacySize, foregroundSize] of densities) {
      const legacy = await sharp(projectPath(`android/app/src/main/res/mipmap-${density}/ic_launcher.png`)).metadata();
      const round = await sharp(projectPath(`android/app/src/main/res/mipmap-${density}/ic_launcher_round.png`)).metadata();
      const foreground = await sharp(projectPath(`android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`)).metadata();
      expect([legacy.width, legacy.height]).toEqual([legacySize, legacySize]);
      expect([round.width, round.height]).toEqual([legacySize, legacySize]);
      expect([foreground.width, foreground.height]).toEqual([foregroundSize, foregroundSize]);
      expect(foreground.hasAlpha).toBe(true);

      for (const file of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
        const { data } = await sharp(projectPath(`android/app/src/main/res/mipmap-${density}/${file}`))
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        expect([...data.subarray(0, 4)]).toEqual([255, 243, 214, 255]);
      }
    }
  });
});
