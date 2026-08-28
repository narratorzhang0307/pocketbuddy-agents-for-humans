import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('iOS input focus does not leave the App zoomed in', () => {
  it('applies an unlayered, platform-scoped 16px minimum before any form is focused', () => {
    const entry = readFileSync(new URL('../main.tsx', import.meta.url), 'utf8');
    expect(entry).toContain('document.documentElement.dataset.pocketPlatform = Capacitor.getPlatform()');
    const css = readFileSync(new URL('../styles/theme.css', import.meta.url), 'utf8');
    const rule = css.slice(css.indexOf("html[data-pocket-platform='ios'] input"));
    for (const control of ['input', 'textarea', 'select']) {
      expect(rule).toContain(`html[data-pocket-platform='ios'] ${control}`);
    }
    expect(rule).toContain('font-size: max(16px, 1rem)');
    expect(rule).not.toMatch(/:focus|transform\s*:|zoom\s*:/);
  });

  it('preserves user zoom and never sizes the native App from a desktop preview scale', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    expect(html).not.toMatch(/user-scalable\s*=\s*(?:no|0)|maximum-scale\s*=\s*1(?:\.0)?(?:[,"\s]|$)/i);
    const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
    expect(app).toContain('Capacitor.isNativePlatform()');
    expect(app).toContain('const fullViewport = standalone || phoneViewport');
  });
});
