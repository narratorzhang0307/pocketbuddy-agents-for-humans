import { describe, expect, it } from 'vitest';
import { filterHeritageContentItems, sortProfessionalOcrLines, type ProfessionalOcrLine } from './professionalOcr';

const line = (text: string, left: number, top: number, right: number, bottom: number): ProfessionalOcrLine => ({
  text, left, top, right, bottom, score: 0.9,
});

describe('professional heritage OCR ordering', () => {
  it('reads vertical columns from right to left', () => {
    const lines = [line('左栏', 20, 10, 40, 200), line('右栏', 120, 10, 140, 200), line('中栏', 70, 10, 90, 200)];
    expect(sortProfessionalOcrLines(lines).map((item) => item.text)).toEqual(['右栏', '中栏', '左栏']);
  });

  it('reads horizontal lines from top to bottom', () => {
    const lines = [line('第二行', 10, 90, 180, 110), line('第一行', 10, 20, 180, 40)];
    expect(sortProfessionalOcrLines(lines).map((item) => item.text)).toEqual(['第一行', '第二行']);
  });

  it('drops small museum labels around a large rubbing inscription', () => {
    const item = (text: string, width: number, height: number) => ({ text, score: 0.9, poly: [[0, 0], [width, 0], [width, height], [0, height]] as Array<[number, number]> });
    expect(filterHeritageContentItems([item('館藏編號', 120, 20), item('晉故振威將軍', 700, 220)]).map((value) => value.text)).toEqual(['晉故振威將軍']);
  });
});
