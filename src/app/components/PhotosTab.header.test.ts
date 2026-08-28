import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Photos 顶部与 Skills 对齐', () => {
  const source = readFileSync(new URL('./PhotosTab.tsx', import.meta.url), 'utf8');

  it('删除英文标语并使用统一的标题区尺寸', () => {
    expect(source).not.toContain('Curate, retrieve, remember.');
    expect(source).toContain('font-pixel text-[9px] uppercase leading-none tracking-[0.14em]');
    expect(source).toContain('border-black bg-white px-4 py-3.5');
    expect(source).toContain('mt-1.5 truncate text-[11px] font-medium tracking-wide text-black/65');
  });

  it('精选与找照片合并，只保留精选和杂志两个子标签', () => {
    expect(source).toContain('border-black bg-black px-3 py-2');
    expect(source).toContain("const PHOTO_SECTIONS = ['精选', '杂志'] as const");
    expect(source).toContain("useState<PhotoSection>('杂志')");
    expect(source).toContain('grid grid-cols-2 gap-1.5');
    expect(source).not.toContain("section === '找照片'");
    expect(source).toContain('语义检索设置');
    expect(source).toContain('whitespace-nowrap border px-2 py-1.5 text-center font-pixel text-[7px]');
  });

  it('杂志直接展示内容，收录与相册入口收进精选底部', () => {
    expect(source).not.toContain('本批已收录');
    expect(source).not.toContain('带位置照片已同步');
    expect(source).toContain('aria-label="杂志收录"');
    expect(source).toContain('进入杂志 · {includedAnalyses.length} 张');
    expect(source.indexOf('aria-label="杂志收录"')).toBeGreaterThan(source.indexOf('端侧决策账本 · IndexedDB'));
  });

  it('空索引不再占位，个人偏好默认折叠', () => {
    expect(source).not.toContain('还没有真实本地索引');
    expect(source).toContain('<details className="border-2 border-black bg-[#f5f0ff]">');
    expect(source).toContain('需要训练或调整时展开');
  });

  it('精选各段与空搜索结果不再保留大块留白', () => {
    expect(source).not.toContain('space-y-3 p-3 pb-8');
    expect(source).not.toContain('py-16 text-center');
    expect(source).toContain('py-4 text-center text-[10px] text-black/40');
  });

  it('用编号标题区分精选与找照片区域', () => {
    expect(source).toContain('01 · CURATION / 精选');
    expect(source).toContain('02 · FIND PHOTOS / 找照片');
  });
});
