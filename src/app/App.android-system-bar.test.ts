import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Android 底部系统手势区', () => {
  const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
  const stylesSource = readFileSync(
    new URL('../../android/app/src/main/res/values/styles.xml', import.meta.url),
    'utf8',
  );

  it('启动主题结束后切回与底部 Tab 同色的正式主题', () => {
    expect(stylesSource).toContain('<item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>');
    expect(stylesSource).toContain('<item name="android:navigationBarColor">#EAEAEA</item>');
    expect(stylesSource).toContain('<item name="android:enforceNavigationBarContrast">false</item>');
  });

  it('网页底部 Tab 继续覆盖系统注入的安全区', () => {
    expect(appSource).toContain("const safeAreaBottom = 'var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))'");
    expect(appSource).toContain("style={{ paddingBottom: fullViewport ? safeAreaBottom : '20px' }}");
    expect(appSource).toContain('absolute bottom-0 left-0 right-0 bg-[#EAEAEA]');
  });
});
