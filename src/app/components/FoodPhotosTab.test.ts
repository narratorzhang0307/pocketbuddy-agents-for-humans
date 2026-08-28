import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import FoodPhotosTab from './FoodPhotosTab';

describe('Photos capture actions', () => {
  it('renders borderless actions with circular icons, separate from the rectangular tabs', () => {
    const html = renderToStaticMarkup(createElement(FoodPhotosTab));
    const actions = html.match(/<div role="group" aria-label="添加餐食照片"[^>]*>(.*?)<\/div>/s)?.[1];

    expect(actions).toBeDefined();
    expect(actions).toContain('拍一餐');
    expect(actions).toContain('从相册选择');
    expect(actions?.match(/<button type="button"/g)).toHaveLength(2);
    expect(actions?.match(/rounded-full border-0 bg-transparent/g)).toHaveLength(2);
    expect(actions?.match(/<span class="[^"]*size-10[^"]*rounded-full/g)).toHaveLength(2);
    expect(actions).not.toMatch(/border-2|grid-cols-2/);
    expect(html).toContain('餐食识别');
    expect(html).toContain('今天记忆 / 长期信息');
  });

  it('preserves the separate album and rear-camera inputs', () => {
    const html = renderToStaticMarkup(createElement(FoodPhotosTab));

    expect(html.match(/<input type="file" accept="image\/\*"/g)).toHaveLength(2);
    expect(html.match(/capture="environment"/g)).toHaveLength(1);
  });
});
