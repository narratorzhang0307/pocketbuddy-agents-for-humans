import { runProfessionalChineseOcr } from './app/lib/heritage/professionalOcr';
import { runChineseOcr } from './app/lib/ocr/chineseOcr';
import { decideReadingPpOcr, readingSelectionBox, selectReadingCropEvidence, selectReadingOcrLines } from './app/lib/readingJot';
import { runReadingEdgeAnalysis } from './app/lib/readingJotAi';

const button = document.querySelector<HTMLButtonElement>('#run-heritage')!;
const documentButton = document.querySelector<HTMLButtonElement>('#run-document')!;
const realWorldButton = document.querySelector<HTMLButtonElement>('#run-real-world')!;
const edgeButton = document.querySelector<HTMLButtonElement>('#run-reading-edge')!;
const output = document.querySelector<HTMLPreElement>('#output')!;

interface RealWorldFixture {
  id: string;
  label: string;
  file: string;
  mode: 'underline' | 'brackets';
  strokes: Array<Array<[number, number]>>;
  expectedText: string;
}

function asDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function decodedImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

function cropDataUrl(source: HTMLImageElement, box: ReturnType<typeof readingSelectionBox>): string {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(box.width * source.naturalWidth));
  canvas.height = Math.max(1, Math.round(box.height * source.naturalHeight));
  canvas.getContext('2d')!.drawImage(
    source,
    Math.round(box.x * source.naturalWidth), Math.round(box.y * source.naturalHeight), canvas.width, canvas.height,
    0, 0, canvas.width, canvas.height,
  );
  return canvas.toDataURL('image/jpeg', 0.92);
}

function normalizedText(value: string): string {
  return value.replace(/[\s\p{P}\p{S}]/gu, '');
}

function strictText(value: string): string {
  return value.replace(/\s/gu, '');
}

function editDistance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length] || 0;
}

function characterErrorRate(actual: string, expected: string): number {
  const actualText = normalizedText(actual);
  const expectedText = normalizedText(expected);
  return expectedText ? editDistance(actualText, expectedText) / expectedText.length : actualText ? 1 : 0;
}

button.addEventListener('click', async () => {
  button.disabled = true;
  output.textContent = '加载 PP-OCRv5…';
  try {
    const response = await fetch('/assets/heritage-demo/stele-rubbing-npm-33679.jpg');
    const blob = await response.blob();
    const image = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const result = await runProfessionalChineseOcr(image);
    output.textContent = JSON.stringify({ reference: '晉故振威將軍鬱林太守關內侯河內趙府君墓道', ...result }, null, 2);
  } catch (error) {
    output.textContent = `ERROR\n${String(error)}\n${error instanceof Error ? error.stack : ''}`;
  } finally {
    button.disabled = false;
  }
});

documentButton.addEventListener('click', async () => {
  documentButton.disabled = true;
  output.textContent = '加载共享 PP-OCRv6 Small…';
  try {
    const response = await fetch('/tests/fixtures/reading-jot/reading-jot-page.png');
    if (!response.ok) throw new Error(`fixture_${response.status}`);
    const blob = await response.blob();
    const image = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const source = await new Promise<HTMLImageElement>((resolve, reject) => {
      const value = new Image(); value.onload = () => resolve(value); value.onerror = reject; value.src = image;
    });
    const box = readingSelectionBox('underline', [[{ x: 0.15, y: 0.43 }, { x: 0.85, y: 0.43 }]]);
    const crop = document.createElement('canvas');
    crop.width = Math.round(box.width * source.naturalWidth); crop.height = Math.round(box.height * source.naturalHeight);
    crop.getContext('2d')!.drawImage(
      source,
      Math.round(box.x * source.naturalWidth), Math.round(box.y * source.naturalHeight), crop.width, crop.height,
      0, 0, crop.width, crop.height,
    );
    const [result, cropResult] = await runChineseOcr([image, crop.toDataURL('image/jpeg', 0.9)], { profile: 'document', rotations: [0] });
    const lines = selectReadingOcrLines(result.lines, { width: result.width, height: result.height }, box);
    const decision = decideReadingPpOcr({ text: cropResult.text, confidence: cropResult.meanConfidence, detectedBoxes: cropResult.detectedBoxes }, lines);
    output.textContent = JSON.stringify({
      expected: ['真正值得留下的', '旅行的意义不在抵达更多地方'],
      model: result.model,
      text: result.text,
      detectedBoxes: result.detectedBoxes,
      meanConfidence: result.meanConfidence,
      totalMs: result.totalMs,
      provider: result.provider,
      underlineDecision: decision,
    }, null, 2);
  } catch (error) {
    output.textContent = `ERROR\n${String(error)}\n${error instanceof Error ? error.stack : ''}`;
  } finally {
    documentButton.disabled = false;
  }
});

realWorldButton.addEventListener('click', async () => {
  realWorldButton.disabled = true;
  output.textContent = '加载真实书页与共享 PP-OCRv6 Small…';
  try {
    const manifestResponse = await fetch('/tests/fixtures/reading-jot/real-world/cases.json');
    if (!manifestResponse.ok) throw new Error(`manifest_${manifestResponse.status}`);
    const manifest = await manifestResponse.json() as { cases: RealWorldFixture[] };
    const prepared = [];
    for (const fixture of manifest.cases) {
      const response = await fetch(`/tests/fixtures/reading-jot/real-world/${fixture.file}`);
      if (!response.ok) throw new Error(`${fixture.id}_${response.status}`);
      const pageDataUrl = await asDataUrl(await response.blob());
      const image = await decodedImage(pageDataUrl);
      const strokes = fixture.strokes.map((stroke) => stroke.map(([x, y]) => ({ x, y })));
      const box = readingSelectionBox(fixture.mode, strokes);
      prepared.push({ fixture, pageDataUrl, image, strokes, box, cropDataUrl: cropDataUrl(image, box) });
    }
    const ocr = await runChineseOcr(prepared.flatMap((item) => [item.pageDataUrl, item.cropDataUrl]), { profile: 'document', rotations: [0] });
    const results = prepared.map((item, index) => {
      const page = ocr[index * 2];
      const crop = ocr[index * 2 + 1];
      const lines = selectReadingOcrLines(page.lines, { width: page.width, height: page.height }, item.box, { mode: item.fixture.mode, strokes: item.strokes });
      const cropLines = selectReadingCropEvidence(crop.lines, lines);
      const decision = decideReadingPpOcr({
        text: cropLines.map((line) => line.text).join('\n'),
        confidence: cropLines.reduce((sum, line) => sum + line.score, 0) / Math.max(1, cropLines.length),
        detectedBoxes: crop.detectedBoxes,
      }, lines);
      return {
        id: item.fixture.id,
        label: item.fixture.label,
        expectedText: item.fixture.expectedText,
        box: item.box,
        page: { width: page.width, height: page.height, detectedBoxes: page.detectedBoxes, meanConfidence: page.meanConfidence, totalMs: page.totalMs },
        cropLines,
        geometryLines: lines,
        decision,
        characterErrorRate: characterErrorRate(decision.finalText, item.fixture.expectedText),
        exactNormalizedMatch: normalizedText(decision.finalText) === normalizedText(item.fixture.expectedText),
        strictCharacterErrorRate: (() => {
          const actual = strictText(decision.finalText);
          const expected = strictText(item.fixture.expectedText);
          return expected ? editDistance(actual, expected) / expected.length : actual ? 1 : 0;
        })(),
        exactTextMatch: strictText(decision.finalText) === strictText(item.fixture.expectedText),
      };
    });
    output.textContent = JSON.stringify({ schema: 'pocket-earth.reading-jot-real-world-result.v1', results }, null, 2);
  } catch (error) {
    output.textContent = `ERROR\n${String(error)}\n${error instanceof Error ? error.stack : ''}`;
  } finally {
    realWorldButton.disabled = false;
  }
});

edgeButton.addEventListener('click', async () => {
  edgeButton.disabled = true;
  output.textContent = '调用本机 MNN / Qwen3-VL-2B 整理确认文字…';
  try {
    const result = await runReadingEdgeAnalysis({ excerpt: '發行人：蕭宗謀' });
    output.textContent = JSON.stringify({
      schema: 'pocket-earth.reading-jot-edge-analysis-result.v1',
      input: '發行人：蕭宗謀',
      result,
      grounded: result.interpretation === '这是一条书籍出版信息，原文标注的發行人为“蕭宗謀”。'
        && !result.bookTitleCandidate && result.tags.includes('出版信息'),
    }, null, 2);
  } catch (error) {
    output.textContent = `ERROR\n${String(error)}\n${error instanceof Error ? error.stack : ''}`;
  } finally {
    edgeButton.disabled = false;
  }
});
