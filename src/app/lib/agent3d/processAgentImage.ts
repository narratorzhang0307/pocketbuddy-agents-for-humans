import type { CityAgentManifest } from './types';

export type BackgroundRemovalMethod =
  CityAgentManifest['source']['backgroundRemoval'];

export type ProcessedAgentImage = {
  sourceUrl: string;
  portraitUrl: string;
  color: string;
  accent: string;
  usedFallbackMask: boolean;
  backgroundRemoval: BackgroundRemovalMethod;
  warnings: string[];
  metrics: {
    width: number;
    height: number;
    transparentRatio: number;
    visibleRatio: number;
    componentCount: number;
    touchesCanvasEdge: boolean;
  };
};

type ProcessOptions = {
  signal?: AbortSignal;
  alreadyCutout?: boolean;
  backgroundRemoval?: BackgroundRemovalMethod;
  maxEdge?: number;
};

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_PIXEL_COUNT = 48_000_000;
const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
}

export function inferImageMime(bytes: Uint8Array, declared = '') {
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  const webp =
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  const detected = jpeg
    ? 'image/jpeg'
    : png
      ? 'image/png'
      : webp
        ? 'image/webp'
        : '';
  if (!detected) return '';
  if (declared && SUPPORTED_TYPES.has(declared) && declared !== detected) return '';
  return detected;
}

export function validateAgentUpload(file: Pick<File, 'size' | 'type'>, magicMime: string) {
  if (!magicMime || !SUPPORTED_TYPES.has(magicMime)) {
    throw new Error('请上传真实的 JPG、PNG 或 WebP 图片');
  }
  if (file.type && !SUPPORTED_TYPES.has(file.type)) {
    throw new Error('请上传 JPG、PNG 或 WebP 图片');
  }
  if (file.size <= 0) throw new Error('这张图片没有内容');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('图片不能超过 12MB');
}

function channelDistance(
  r: number,
  g: number,
  b: number,
  reference: [number, number, number],
) {
  return Math.hypot(r - reference[0], g - reference[1], b - reference[2]);
}

function dataUrl(canvas: HTMLCanvasElement, type = 'image/png', quality?: number) {
  return canvas.toDataURL(type, quality);
}

function borderSamples(
  data: Uint8ClampedArray,
  width: number,
  height: number,
) {
  const samples: [number, number, number][] = [];
  const step = Math.max(1, Math.round(Math.min(width, height) / 48));
  const add = (x: number, y: number) => {
    const offset = (y * width + x) * 4;
    if (data[offset + 3] > 20) {
      samples.push([data[offset], data[offset + 1], data[offset + 2]]);
    }
  };
  for (let x = 0; x < width; x += step) {
    add(x, 0);
    add(x, height - 1);
  }
  for (let y = step; y < height - step; y += step) {
    add(0, y);
    add(width - 1, y);
  }
  return samples;
}

function sampledBorderColor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
) {
  const samples = borderSamples(data, width, height);
  const bins = new Map<string, { count: number; red: number; green: number; blue: number }>();
  for (const [red, green, blue] of samples) {
    const key = `${red >> 4}-${green >> 4}-${blue >> 4}`;
    const bin = bins.get(key) || { count: 0, red: 0, green: 0, blue: 0 };
    bin.count += 1;
    bin.red += red;
    bin.green += green;
    bin.blue += blue;
    bins.set(key, bin);
  }
  const dominant = [...bins.values()].sort((left, right) => right.count - left.count)[0];
  const background: [number, number, number] = dominant
    ? [
        dominant.red / dominant.count,
        dominant.green / dominant.count,
        dominant.blue / dominant.count,
      ]
    : [255, 255, 255];
  const distances = samples
    .map(([red, green, blue]) => channelDistance(red, green, blue, background))
    .sort((left, right) => left - right);
  const lowerHalf = distances.slice(0, Math.max(1, Math.ceil(distances.length * 0.55)));
  const spread = lowerHalf[Math.floor(lowerHalf.length * 0.8)] || 0;
  return {
    background,
    threshold: Math.max(38, Math.min(82, 34 + spread * 1.25)),
  };
}

function floodRemoveBorder(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  background: [number, number, number],
  threshold: number,
) {
  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  let removed = 0;

  const canRemove = (pixel: number) => {
    const offset = pixel * 4;
    return (
      pixels[offset + 3] > 0 &&
      channelDistance(
        pixels[offset],
        pixels[offset + 1],
        pixels[offset + 2],
        background,
      ) < threshold
    );
  };
  const enqueue = (pixel: number) => {
    if (pixel < 0 || pixel >= total || visited[pixel] || !canRemove(pixel)) return;
    visited[pixel] = 1;
    queue[tail++] = pixel;
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  while (head < tail) {
    const pixel = queue[head++];
    const offset = pixel * 4;
    pixels[offset + 3] = 0;
    removed += 1;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (x > 0) enqueue(pixel - 1);
    if (x + 1 < width) enqueue(pixel + 1);
    if (y > 0) enqueue(pixel - width);
    if (y + 1 < height) enqueue(pixel + width);
  }
  return removed / total;
}

function applySoftOvalMask(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
) {
  const centerX = width / 2;
  const centerY = height / 2;
  const radiusX = width * 0.48;
  const radiusY = height * 0.48;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const distance = Math.hypot((x - centerX) / radiusX, (y - centerY) / radiusY);
      if (distance <= 0.86) continue;
      const alpha = Math.max(0, Math.min(1, (1 - distance) / 0.14));
      pixels[(y * width + x) * 4 + 3] *= alpha;
    }
  }
}

function softenAlphaEdge(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
) {
  const alpha = new Uint8ClampedArray(width * height);
  for (let pixel = 0; pixel < alpha.length; pixel += 1) {
    alpha[pixel] = pixels[pixel * 4 + 3];
  }
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const pixel = y * width + x;
      if (alpha[pixel] === 0) continue;
      const transparentNeighbors =
        Number(alpha[pixel - 1] === 0) +
        Number(alpha[pixel + 1] === 0) +
        Number(alpha[pixel - width] === 0) +
        Number(alpha[pixel + width] === 0);
      if (transparentNeighbors) {
        pixels[pixel * 4 + 3] = Math.min(
          pixels[pixel * 4 + 3],
          transparentNeighbors >= 3 ? 88 : 176,
        );
      }
    }
  }
}

function transparentPixelRatio(pixels: Uint8ClampedArray) {
  let transparent = 0;
  for (let offset = 3; offset < pixels.length; offset += 4) {
    if (pixels[offset] < 24) transparent += 1;
  }
  return transparent / Math.max(1, pixels.length / 4);
}

function visibleBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] < 28) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return { x: 0, y: 0, width, height };
  const margin = Math.max(4, Math.round(Math.max(width, height) * 0.035));
  const left = Math.max(0, minX - margin);
  const top = Math.max(0, minY - margin);
  const right = Math.min(width - 1, maxX + margin);
  const bottom = Math.min(height - 1, maxY + margin);
  return {
    x: left,
    y: top,
    width: right - left + 1,
    height: bottom - top + 1,
    touchesCanvasEdge:
      minX <= 1 || minY <= 1 || maxX >= width - 2 || maxY >= height - 2,
  };
}

function visibleComponentCount(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
) {
  const mask = new Uint8Array(width * height);
  let foreground = 0;
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (pixels[pixel * 4 + 3] >= 70) {
      mask[pixel] = 1;
      foreground += 1;
    }
  }
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  const minimum = Math.max(18, Math.round(foreground * 0.018));
  let large = 0;
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    let head = 0;
    let tail = 0;
    let size = 0;
    visited[start] = 1;
    queue[tail++] = start;
    while (head < tail) {
      const pixel = queue[head++];
      size += 1;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      const neighbors = [
        x > 0 ? pixel - 1 : -1,
        x + 1 < width ? pixel + 1 : -1,
        y > 0 ? pixel - width : -1,
        y + 1 < height ? pixel + width : -1,
      ];
      for (const neighbor of neighbors) {
        if (neighbor >= 0 && mask[neighbor] && !visited[neighbor]) {
          visited[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
    }
    if (size >= minimum) large += 1;
  }
  return large;
}

function subjectPalette(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
) {
  const colors: [number, number, number][] = [];
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const offset = (y * width + x) * 4;
      if (pixels[offset + 3] < 140) continue;
      colors.push([pixels[offset], pixels[offset + 1], pixels[offset + 2]]);
    }
  }
  const average = (items: [number, number, number][]) => {
    const sum = items.reduce(
      (value, item) => [
        value[0] + item[0],
        value[1] + item[1],
        value[2] + item[2],
      ],
      [0, 0, 0],
    );
    const count = Math.max(1, items.length);
    return sum.map((value) => value / count) as [number, number, number];
  };
  const primary = average(colors);
  const darker = colors
    .filter(([red, green, blue]) => red + green + blue < primary[0] + primary[1] + primary[2])
    .sort((left, right) => left[0] + left[1] + left[2] - (right[0] + right[1] + right[2]))
    .slice(Math.floor(colors.length * 0.08), Math.floor(colors.length * 0.34));
  const accent = average(darker.length ? darker : colors);
  const toHex = ([red, green, blue]: [number, number, number]) =>
    `#${[red, green, blue]
      .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0'))
      .join('')}`;
  return {
    color: colors.length ? toHex(primary) : '#c88f59',
    accent: colors.length ? toHex(accent) : '#3e3329',
  };
}

async function decodeImage(file: File, signal?: AbortSignal) {
  throwIfAborted(signal);
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: 'from-image',
    });
    return {
      source: bitmap as CanvasImageSource,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  } catch {
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('图片已经损坏或浏览器无法解码'));
        element.src = objectUrl;
      });
      return {
        source: image as CanvasImageSource,
        width: image.naturalWidth,
        height: image.naturalHeight,
        close: () => undefined,
      };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

export async function processAgentImage(
  file: File,
  options: ProcessOptions = {},
): Promise<ProcessedAgentImage> {
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const magicMime = inferImageMime(header, file.type);
  validateAgentUpload(file, magicMime);
  throwIfAborted(options.signal);

  const decoded = await decodeImage(file, options.signal);
  try {
    if (
      decoded.width < 16 ||
      decoded.height < 16 ||
      decoded.width * decoded.height > MAX_PIXEL_COUNT
    ) {
      throw new Error('图片尺寸异常，请使用边长至少 16px、总像素不超过 4800 万的照片');
    }
    const maxEdge = Math.max(256, Math.min(720, options.maxEdge || 560));
    const scale = Math.min(1, maxEdge / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const workCanvas = document.createElement('canvas');
    workCanvas.width = width;
    workCanvas.height = height;
    const context = workCanvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('浏览器无法读取图片');
    context.drawImage(decoded.source, 0, 0, width, height);
    throwIfAborted(options.signal);

    const sourcePreview = document.createElement('canvas');
    sourcePreview.width = width;
    sourcePreview.height = height;
    const previewContext = sourcePreview.getContext('2d');
    if (!previewContext) throw new Error('浏览器无法建立照片预览');
    previewContext.fillStyle = '#f7f2e4';
    previewContext.fillRect(0, 0, width, height);
    previewContext.drawImage(decoded.source, 0, 0, width, height);
    const sourceUrl = dataUrl(sourcePreview, 'image/jpeg', 0.8);

    const imageData = context.getImageData(0, 0, width, height);
    const existingTransparency = transparentPixelRatio(imageData.data);
    let usedFallbackMask = false;
    let backgroundRemoval: BackgroundRemovalMethod =
      options.backgroundRemoval ||
      (options.alreadyCutout ? 'service' : 'deterministic');
    const warnings: string[] = [];

    if (options.alreadyCutout) {
      if (existingTransparency < 0.08) {
        throw new Error('透明图片没有足够的透明背景');
      }
    } else if (existingTransparency < 0.01) {
      const { background, threshold } = sampledBorderColor(
        imageData.data,
        width,
        height,
      );
      const removedRatio = floodRemoveBorder(
        imageData.data,
        width,
        height,
        background,
        threshold,
      );
      usedFallbackMask = removedRatio < 0.04 || removedRatio > 0.91;
      if (usedFallbackMask) {
        applySoftOvalMask(imageData.data, width, height);
        backgroundRemoval = 'fallback-mask';
        warnings.push('背景较复杂，本机只能生成柔边预览；可开启精细抠图改善毛发和边缘');
      } else {
        softenAlphaEdge(imageData.data, width, height);
      }
    }

    const transparentRatio = transparentPixelRatio(imageData.data);
    const visibleRatio = 1 - transparentRatio;
    if (visibleRatio < 0.015) throw new Error('抠图后没有检测到清晰主体');
    if (visibleRatio > 0.94 && options.alreadyCutout) {
      throw new Error('精细抠图结果仍然包含大面积背景');
    }
    const bounds = visibleBounds(imageData.data, width, height);
    const componentCount = visibleComponentCount(imageData.data, width, height);
    if (componentCount > 3) {
      warnings.push('检测到多个分离区域，请确认照片中只有一只主要宠物');
    }
    if (bounds.touchesCanvasEdge) {
      warnings.push('宠物碰到照片边缘，侧面和背面推断可能不完整');
    }
    const palette = subjectPalette(imageData.data, width, height);

    context.clearRect(0, 0, width, height);
    context.putImageData(imageData, 0, 0);
    const portraitCanvas = document.createElement('canvas');
    portraitCanvas.width = bounds.width;
    portraitCanvas.height = bounds.height;
    const portraitContext = portraitCanvas.getContext('2d');
    if (!portraitContext) throw new Error('浏览器无法建立透明角色图');
    portraitContext.drawImage(
      workCanvas,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      0,
      0,
      bounds.width,
      bounds.height,
    );
    throwIfAborted(options.signal);

    return {
      sourceUrl,
      portraitUrl: dataUrl(portraitCanvas),
      color: palette.color,
      accent: palette.accent,
      usedFallbackMask,
      backgroundRemoval,
      warnings,
      metrics: {
        width: bounds.width,
        height: bounds.height,
        transparentRatio,
        visibleRatio,
        componentCount,
        touchesCanvasEdge: Boolean(bounds.touchesCanvasEdge),
      },
    };
  } finally {
    decoded.close();
  }
}
