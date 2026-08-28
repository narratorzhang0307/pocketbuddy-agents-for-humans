export type LocalReliefDepthResult = {
  depthUrl: string;
  elapsedMs: number;
  width: number;
  height: number;
};

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('local_depth_image_decode_failed'));
    image.src = source;
  });
}

export function localReliefDepthByte(
  alpha: number,
  red: number,
  green: number,
  blue: number,
  x: number,
  y: number,
  width: number,
  height: number,
): number {
  if (alpha <= 3) return 0;
  const opacity = Math.max(0, Math.min(1, alpha / 255));
  const luminance = Math.max(0, Math.min(1, (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255));
  const nx = width <= 1 ? 0 : (x / (width - 1) - 0.5) * 2;
  const ny = height <= 1 ? 0 : (y / (height - 1) - 0.5) * 2;
  const centerPrior = Math.max(0, 1 - Math.hypot(nx, ny) / Math.SQRT2);
  const relief = 0.44 + centerPrior * 0.34 + (1 - luminance) * 0.22;
  return Math.round(255 * opacity * Math.max(0, Math.min(1, relief)));
}

/**
 * Builds the depth texture used by the 2.5D viewer from this run's MNN alpha
 * and cutout.  No case-bundled depth asset is read here.
 */
export async function buildLocalReliefDepth(cutout: string, alpha: string): Promise<LocalReliefDepthResult> {
  const started = performance.now();
  const [colorImage, alphaImage] = await Promise.all([loadImage(cutout), loadImage(alpha)]);
  const width = alphaImage.naturalWidth || alphaImage.width;
  const height = alphaImage.naturalHeight || alphaImage.height;
  if (width < 1 || height < 1) throw new Error('local_depth_invalid_dimensions');

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = width;
  colorCanvas.height = height;
  const colorContext = colorCanvas.getContext('2d', { willReadFrequently: true });
  if (!colorContext) throw new Error('local_depth_canvas_unavailable');
  colorContext.drawImage(colorImage, 0, 0, width, height);
  const colorPixels = colorContext.getImageData(0, 0, width, height).data;

  const alphaCanvas = document.createElement('canvas');
  alphaCanvas.width = width;
  alphaCanvas.height = height;
  const alphaContext = alphaCanvas.getContext('2d', { willReadFrequently: true });
  if (!alphaContext) throw new Error('local_depth_alpha_canvas_unavailable');
  alphaContext.drawImage(alphaImage, 0, 0, width, height);
  const alphaPixels = alphaContext.getImageData(0, 0, width, height).data;

  const depthCanvas = document.createElement('canvas');
  depthCanvas.width = width;
  depthCanvas.height = height;
  const depthContext = depthCanvas.getContext('2d');
  if (!depthContext) throw new Error('local_depth_output_canvas_unavailable');
  const depth = depthContext.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const value = localReliefDepthByte(
        alphaPixels[offset],
        colorPixels[offset],
        colorPixels[offset + 1],
        colorPixels[offset + 2],
        x,
        y,
        width,
        height,
      );
      depth.data[offset] = value;
      depth.data[offset + 1] = value;
      depth.data[offset + 2] = value;
      depth.data[offset + 3] = 255;
    }
  }
  depthContext.putImageData(depth, 0, 0);
  const depthUrl = depthCanvas.toDataURL('image/png');
  if (!depthUrl.startsWith('data:image/png')) throw new Error('local_depth_encode_failed');
  return { depthUrl, elapsedMs: performance.now() - started, width, height };
}
