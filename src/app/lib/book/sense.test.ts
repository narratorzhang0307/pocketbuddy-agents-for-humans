import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ visionRead: vi.fn(), runChineseOcr: vi.fn() }));
vi.mock('../skills/visionRead', () => ({ visionRead: mocks.visionRead }));
vi.mock('../ocr/chineseOcr', () => ({ runChineseOcr: mocks.runChineseOcr }));

import { readBookCover } from './sense';

describe('book cover on-device contract', () => {
  beforeEach(() => {
    mocks.visionRead.mockReset();
    mocks.runChineseOcr.mockReset().mockResolvedValue([{ text: '百年孤独 加西亚·马尔克斯' }]);
  });

  it('keeps only visible book fields returned by Qwen VL', async () => {
    mocks.visionRead.mockResolvedValueOnce(JSON.stringify({
      title: '《百年孤独》', author: '加西亚·马尔克斯', translator: '范晔', publisher: '南海出版公司',
      visibleTags: ['诺贝尔文学奖', '魔幻现实主义'], visibleText: '百年孤独 加西亚·马尔克斯', country: '哥伦比亚',
    }));
    await expect(readBookCover('data:image/jpeg;base64,AA==')).resolves.toEqual({
      title: '百年孤独', author: '加西亚·马尔克斯', translator: '', publisher: '',
      visibleTags: [], rawVisibleText: '百年孤独 加西亚·马尔克斯', ocrUsed: true,
    });
    expect(mocks.visionRead).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('【端侧专业 OCR 候选】百年孤独 加西亚·马尔克斯'), expect.objectContaining({ detail: 'high' }));
  });

  it('returns an empty draft when edge output is not strict JSON', async () => {
    mocks.visionRead.mockResolvedValueOnce('我觉得这是一本小说');
    await expect(readBookCover('data:image/jpeg;base64,AA==')).resolves.toMatchObject({ title: '', author: '' });
  });

  it('keeps PP-OCR as the raw evidence instead of letting the VL rewrite it', async () => {
    mocks.runChineseOcr.mockResolvedValueOnce([{ text: '房思琪的初戀樂園 林奕含' }]);
    mocks.visionRead.mockResolvedValueOnce(JSON.stringify({ title: '房思琪的初恋乐园', author: '林奕含', visibleText: '模型改写文本' }));
    await expect(readBookCover('data:image/jpeg;base64,AA==')).resolves.toMatchObject({
      title: '房思琪的初恋乐园', rawVisibleText: '房思琪的初戀樂園 林奕含', ocrUsed: true,
    });
  });

  it('rejects a VL title that is not grounded in the PP-OCR evidence', async () => {
    mocks.runChineseOcr.mockResolvedValueOnce([{ text: '夜航西飞 柏瑞尔·马卡姆' }]);
    mocks.visionRead.mockResolvedValueOnce(JSON.stringify({ title: '百年孤独', author: '加西亚·马尔克斯' }));
    await expect(readBookCover('data:image/jpeg;base64,AA==')).resolves.toMatchObject({
      title: '', author: '', rawVisibleText: '夜航西飞 柏瑞尔·马卡姆', ocrUsed: true,
    });
  });
});
