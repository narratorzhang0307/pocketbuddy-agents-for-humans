import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const JOB_TTL_MS = 30 * 60 * 1000;
const SUPPORTED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const DASHSCOPE_IMAGE_ENDPOINT = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
const QWEN_IMAGE_MODEL = "qwen-image-2.0-pro";
const SUBJECT_PROMPT_VERSION = "qwen-forkworld-subject-v4";
const CHROMA_BACKGROUND = "#00FF00";
const RIG_TEMPLATE_CONTRACTS = Object.freeze({
  "long-quadruped-v2": {
    bodyPlan: "quadruped",
    footCount: 4,
    motionProfile: "quadruped",
  },
  "feline-v1": {
    bodyPlan: "quadruped",
    footCount: 4,
    motionProfile: "quadruped",
  },
  "rabbit-v1": {
    bodyPlan: "quadruped",
    footCount: 4,
    motionProfile: "quadruped",
  },
  "small-rodent-v1": {
    bodyPlan: "quadruped",
    footCount: 4,
    motionProfile: "quadruped",
  },
  "bird-v1": {
    bodyPlan: "winged-biped",
    footCount: 2,
    motionProfile: "biped",
  },
  "shelled-quadruped-v1": {
    bodyPlan: "shelled-quadruped",
    footCount: 4,
    motionProfile: "quadruped",
  },
  "adaptive-v1": {
    bodyPlan: "adaptive",
    footCount: null,
    motionProfile: "none",
  },
});

export const SUBJECT_STYLE_PROMPT = [
  "Treat this as a faithful image-to-image character conversion, not free-form generation.",
  "First inspect the uploaded photo and identify its single visually dominant primary subject as a person, an animal, or a physical object. Keep that category exactly; never default to an animal and never replace the subject with a different category.",
  "The uploaded subject is the sole identity and shape reference. Preserve its recognizable silhouette, proportions, orientation, pose, colors, materials, patterns, markings, facial or identity cues, clothing, accessories, and distinctive structural details.",
  "Always output exactly one complete, fully visible, uncropped subject. If the source is a bust, half-body, close-up, cropped, partly outside the frame, occluded, or missing limbs or other parts, conservatively reconstruct every missing part into a plausible complete full body or complete object. The completion must continue the visible anatomy, design, scale, perspective, clothing, material, and colors; do not invent a different identity.",
  "For a person: create a cute full-body version while retaining recognizable face cues, hairstyle, skin tone, body proportions, clothing colors, and accessories. If only the upper body is visible, infer the lower body and outfit naturally and conservatively.",
  "For an animal: retain its species, body proportions, coat colors and markings, ears, muzzle, limbs, and tail, and reconstruct any cropped anatomy into the same individual.",
  "For an object: retain its object category, original silhouette, structure, functional parts, material, colors, and recognizable details, and reconstruct any cropped physical parts. Do not turn the object into a person or animal.",
  "Visual style: one charming minimalist ForkWorld mascot illustration with rounded geometric simplification, thick slightly imperfect black hand-drawn outlines, warm flat color fills, two oversized round white eyes with small black pupils, tiny black oval feet where appropriate, very short simple limbs where appropriate, low detail, and a friendly emotionally warm expression. Apply this style without losing the source subject's identity or shape.",
  "Place the complete subject in the center at a readable size with generous empty padding on every side.",
  `Use one perfectly flat, uniform, opaque ${CHROMA_BACKGROUND} background. Every background pixel must be the same color.`,
  "Do not create a lineup, comparison sheet, alternate design, companion, duplicate subject, extra person, extra animal, extra object, or partial subject at any edge.",
  "No scenery, floor, shadow, glow, gradient, paper texture, text, watermark, border, unreferenced accessories, duplicated body parts, or photorealism.",
].join(" ");

export const IDENTITY_ISOLATION_PROMPT = [
  "This is a faithful subject-isolation edit, not free-form generation.",
  "Keep exactly one visually dominant person, animal, or physical object from the uploaded image.",
  "Preserve the subject's real identity, silhouette, proportions, pose, colors, materials, markings, facial details, clothing, accessories, and visible texture.",
  "Complete only body parts that were accidentally cropped by the source frame, and do so conservatively.",
  "Center the complete subject at a readable size with generous empty padding on all sides.",
  `Replace the entire surrounding scene with one perfectly flat, uniform, opaque ${CHROMA_BACKGROUND} background.`,
  "Do not add scenery, floor, shadows, text, borders, companions, duplicate subjects, or stylistic redesign.",
].join(" ");

function safeName(value) {
  return String(value || "新伙伴").trim().slice(0, 24) || "新伙伴";
}

function safeTemplateId(value) {
  const templateId = String(value || "adaptive-v1").trim().toLowerCase();
  return Object.hasOwn(RIG_TEMPLATE_CONTRACTS, templateId)
    ? templateId
    : "adaptive-v1";
}

function publicJob(job) {
  return {
    id: job.id,
    accessToken: job.accessToken,
    name: job.name,
    mode: job.mode,
    templateId: job.templateId,
    rig: { ...job.rig },
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    ...(job.error ? { error: job.error } : {}),
    ...(job.asset ? { asset: { ...job.asset } } : {}),
  };
}

function extensionForMime(mime) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/heic") return "heic";
  if (mime === "image/heif") return "heif";
  return "jpg";
}

async function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporaryPath, filePath);
}

async function fetchNetworkRetry(url, options, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const { timeoutMs, ...fetchOptions } = options;
      return await fetch(url, {
        ...fetchOptions,
        signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : fetchOptions.signal,
      });
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) {
        await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
      }
    }
  }
  const detail = lastError?.cause?.code || lastError?.cause?.message;
  throw new Error(detail ? `${lastError.message}: ${detail}` : lastError.message);
}

export async function normalizeQwenUpload(input) {
  const normalized = await sharp(input)
    .rotate()
    .resize(1536, 1536, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
  return {
    input: normalized,
    mime: "image/jpeg",
    dataUrl: `data:image/jpeg;base64,${normalized.toString("base64")}`,
  };
}

function qwenImageUrl(payload) {
  const content = payload?.output?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    const image = content.find(item => typeof item?.image === "string")?.image;
    if (image) return image;
  }
  return payload?.output?.results?.[0]?.url || payload?.output?.url || "";
}

async function editWithQwen(source, prompt) {
  if (!process.env.DASHSCOPE_API_KEY) throw new Error("DASHSCOPE_API_KEY is not configured");
  const normalized = await normalizeQwenUpload(source);
  const content = [{ image: normalized.dataUrl }];
  content.push({ text: prompt });
  const model = process.env.QWEN_PET_IMAGE_MODEL || QWEN_IMAGE_MODEL;
  const response = await fetchNetworkRetry(
    process.env.DASHSCOPE_IMAGE_ENDPOINT || DASHSCOPE_IMAGE_ENDPOINT,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: { messages: [{ role: "user", content }] },
        parameters: { size: "1024*1024", n: 1, prompt_extend: true, watermark: false },
      }),
      timeoutMs: 180_000,
    },
    2,
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Qwen image request failed (${response.status}): ${payload?.message || payload?.code || "unknown error"}`);
  }
  const url = qwenImageUrl(payload);
  if (!url) throw new Error("Qwen image request returned no image");
  return downloadImage(url, "Qwen image");
}

async function downloadImage(url, label) {
  const response = await fetch(url, { signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error(`${label} download failed (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

function countLargeComponents(mask, width, height) {
  const visited = new Uint8Array(mask.length);
  const componentSizes = [];
  const queue = new Int32Array(mask.length);
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    let head = 0;
    let tail = 0;
    let size = 0;
    queue[tail++] = start;
    visited[start] = 1;
    while (head < tail) {
      const index = queue[head++];
      size += 1;
      const x = index % width;
      const y = Math.floor(index / width);
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y + 1 < height ? index + width : -1,
      ];
      for (const neighbor of neighbors) {
        if (neighbor >= 0 && mask[neighbor] && !visited[neighbor]) {
          visited[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
    }
    componentSizes.push(size);
  }
  const foreground = componentSizes.reduce((total, size) => total + size, 0);
  const minimumLargeSize = Math.max(12, Math.round(foreground * 0.08));
  return componentSizes.filter(size => size >= minimumLargeSize).length;
}

export async function flattenChromaBackground(input) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const total = info.width * info.height;
  const background = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const isGreen = pixel => {
    const offset = pixel * info.channels;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const alpha = data[offset + 3];
    return alpha >= 220 && green >= 120 && green >= red * 1.35 && green >= blue * 1.35;
  };
  const enqueue = pixel => {
    if (pixel < 0 || pixel >= total || background[pixel] || !isGreen(pixel)) return;
    background[pixel] = 1;
    queue[tail++] = pixel;
  };

  for (let x = 0; x < info.width; x += 1) {
    enqueue(x);
    enqueue((info.height - 1) * info.width + x);
  }
  for (let y = 0; y < info.height; y += 1) {
    enqueue(y * info.width);
    enqueue(y * info.width + info.width - 1);
  }
  while (head < tail) {
    const pixel = queue[head++];
    const x = pixel % info.width;
    const y = Math.floor(pixel / info.width);
    if (x > 0) enqueue(pixel - 1);
    if (x + 1 < info.width) enqueue(pixel + 1);
    if (y > 0) enqueue(pixel - info.width);
    if (y + 1 < info.height) enqueue(pixel + info.width);
  }

  for (let pixel = 0; pixel < total; pixel += 1) {
    if (!background[pixel]) continue;
    const offset = pixel * info.channels;
    data[offset] = 0;
    data[offset + 1] = 255;
    data[offset + 2] = 0;
    data[offset + 3] = 255;
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

async function removeGreenSpill(input) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    const offset = pixel * info.channels;
    const alpha = data[offset + 3];
    if (!alpha) continue;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    if (green > red * 1.12 && green > blue * 1.12) {
      data[offset + 1] = Math.max(red, blue);
    }
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

export async function removeChromaBackground(input) {
  const normalized = await flattenChromaBackground(input);
  const { data, info } = await sharp(normalized)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const total = info.width * info.height;
  const transparent = new Uint8Array(total);
  for (let pixel = 0; pixel < total; pixel += 1) {
    const offset = pixel * info.channels;
    if (data[offset] <= 4 && data[offset + 1] >= 250 && data[offset + 2] <= 4) {
      transparent[pixel] = 1;
      data[offset + 3] = 0;
    }
  }
  for (let pass = 0; pass < 2; pass += 1) {
    const next = transparent.slice();
    for (let pixel = 0; pixel < total; pixel += 1) {
      if (transparent[pixel]) continue;
      const x = pixel % info.width;
      const y = Math.floor(pixel / info.width);
      const touchesBackground = (x > 0 && transparent[pixel - 1])
        || (x + 1 < info.width && transparent[pixel + 1])
        || (y > 0 && transparent[pixel - info.width])
        || (y + 1 < info.height && transparent[pixel + info.width]);
      if (!touchesBackground) continue;
      const offset = pixel * info.channels;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const dominance = green - Math.max(red, blue);
      if (green >= 90 && dominance >= 24) {
        const alpha = Math.max(0, Math.min(255, Math.round(255 * (78 - dominance) / 54)));
        data[offset + 3] = Math.min(data[offset + 3], alpha);
        data[offset + 1] = Math.min(green, Math.max(red, blue));
        if (alpha <= 24) next[pixel] = 1;
      }
    }
    transparent.set(next);
  }
  return removeGreenSpill(await sharp(data, { raw: info }).png().toBuffer());
}

export async function validateStylizedSubject(input) {
  const normalized = await flattenChromaBackground(input);
  const { data, info } = await sharp(normalized)
    .resize(128, 128, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(info.width * info.height);
  let foreground = 0;
  let borderForeground = 0;
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    const offset = pixel * info.channels;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const alpha = data[offset + 3];
    const isChroma = red <= 55 && green >= 200 && blue <= 55 && alpha >= 245;
    if (isChroma) continue;
    mask[pixel] = 1;
    foreground += 1;
    const x = pixel % info.width;
    const y = Math.floor(pixel / info.width);
    if (x <= 2 || y <= 2 || x >= info.width - 3 || y >= info.height - 3) borderForeground += 1;
  }
  const foregroundRatio = foreground / mask.length;
  if (foregroundRatio < 0.015) throw new Error("Generated image did not contain a visible subject");
  if (foregroundRatio > 0.62) throw new Error("Generated subject does not have enough solid-color padding");
  if (borderForeground > 2) throw new Error("Generated image contains a cropped subject at the canvas edge");
  if (countLargeComponents(mask, info.width, info.height) > 1) {
    throw new Error("Generated image contains more than one subject");
  }
  return normalized;
}

export async function validateTransparentSubject(input) {
  const normalized = await removeGreenSpill(input);
  const { data, info } = await sharp(normalized)
    .resize(128, 128, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let transparent = 0;
  let visible = 0;
  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    const alpha = data[pixel * info.channels + 3];
    if (alpha <= 8) transparent += 1;
    if (alpha >= 220) visible += 1;
  }
  const total = info.width * info.height;
  if (transparent / total < 0.25) throw new Error("Background removal did not produce a transparent PNG");
  if (visible / total < 0.01) throw new Error("Background removal erased the generated subject");
  return normalized;
}

async function stylizeWithQwen(source) {
  return editWithQwen(source, SUBJECT_STYLE_PROMPT);
}

async function isolateWithQwen(source) {
  return editWithQwen(source, IDENTITY_ISOLATION_PROMPT);
}

export class PetPipeline {
  constructor({
    dataDir,
    projectRoot,
    stylize = stylizeWithQwen,
    isolate = isolateWithQwen,
    removeBackground = removeChromaBackground,
  }) {
    this.dataDir = dataDir;
    this.assetDir = path.join(dataDir, "pet-assets");
    this.projectRoot = projectRoot;
    this.jobs = new Map();
    this.expiryTimers = new Map();
    this.stylize = stylize;
    this.isolate = isolate;
    this.removeBackground = removeBackground;
  }

  async init() {
    // Capture jobs are private, short-lived processing data. A restart clears
    // interrupted work instead of restoring it into a shared user-visible list.
    await rm(this.assetDir, { recursive: true, force: true });
    await mkdir(this.assetDir, { recursive: true });
  }

  submit(
    source,
    {
      filename = "capture.jpg",
      mime = "image/jpeg",
      name,
      mode = "direct",
      templateId = "adaptive-v1",
    } = {},
  ) {
    if (!Buffer.isBuffer(source) || !source.length) throw new Error("Image body is empty");
    if (source.length > MAX_UPLOAD_BYTES) throw new Error("Image exceeds the 12MB upload limit");
    if (!SUPPORTED_MIME.has(mime)) throw new Error("Only JPEG, PNG, WebP, and HEIC images are supported");

    const id = `pet-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const approvedTemplateId = safeTemplateId(templateId);
    const job = {
      id,
      accessToken: randomUUID(),
      name: safeName(name),
      mode: mode === "mascot" ? "mascot" : "direct",
      templateId: approvedTemplateId,
      rig: {
        templateId: approvedTemplateId,
        ...RIG_TEMPLATE_CONTRACTS[approvedTemplateId],
      },
      status: "queued",
      stage: "upload",
      progress: 8,
      filename,
      mime,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(id, job);
    this.scheduleExpiry(job);
    this.process(job, source, { filename, mime }).catch(() => {});
    return publicJob(job);
  }

  getJob(id, accessToken) {
    const job = this.jobs.get(id);
    return job?.accessToken === accessToken ? publicJob(job) : null;
  }

  async retry(id, accessToken) {
    const job = this.jobs.get(id);
    if (!job || job.accessToken !== accessToken) throw new Error("Agent generation job not found");
    if (job.status === "queued" || job.status === "processing") throw new Error("Agent generation is still running");
    if (!job.sourceFile) throw new Error("Saved source image is missing");
    const source = await readFile(path.join(this.assetDir, id, job.sourceFile));
    this.update(job, {
      status: "queued",
      stage: "upload",
      progress: 8,
      error: undefined,
      asset: undefined,
    });
    await this.persistJob(job);
    this.scheduleExpiry(job);
    this.process(job, source, { filename: job.filename, mime: job.mime }).catch(() => {});
    return publicJob(job);
  }

  resolveFile(id, kind, accessToken) {
    if (!["source", "clean", "final"].includes(kind)) return null;
    const job = this.jobs.get(id);
    if (!job || job.accessToken !== accessToken) return null;
    const filename = kind === "source" ? job.sourceFile : kind === "clean" ? "clean.png" : "final.png";
    return filename ? path.join(this.assetDir, id, filename) : null;
  }

  scheduleExpiry(job) {
    const existing = this.expiryTimers.get(job.id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.release(job.id, job.accessToken).catch(() => {});
    }, JOB_TTL_MS);
    timer.unref?.();
    this.expiryTimers.set(job.id, timer);
  }

  async release(id, accessToken) {
    const job = this.jobs.get(id);
    if (!job || job.accessToken !== accessToken) return false;
    const timer = this.expiryTimers.get(id);
    if (timer) clearTimeout(timer);
    this.expiryTimers.delete(id);
    this.jobs.delete(id);
    await rm(path.join(this.assetDir, id), { recursive: true, force: true });
    return true;
  }

  update(job, patch) {
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  }

  async persistJob(job) {
    const itemDir = path.join(this.assetDir, job.id);
    await mkdir(itemDir, { recursive: true });
    await writeJsonAtomic(path.join(itemDir, "job.json"), job);
  }

  async process(job, source, { filename, mime }) {
    try {
      const itemDir = path.join(this.assetDir, job.id);
      await mkdir(itemDir, { recursive: true });
      const sourceFile = `source.${extensionForMime(mime)}`;
      await writeFile(path.join(itemDir, sourceFile), source);
      this.update(job, {
        sourceFile,
        status: "processing",
        stage: job.mode === "mascot" ? "stylize" : "remove-background",
        progress: job.mode === "mascot" ? 28 : 42,
      });
      await this.persistJob(job);

      const model = process.env.QWEN_PET_IMAGE_MODEL || QWEN_IMAGE_MODEL;
      const stylizeProvider = job.mode === "mascot"
        ? `dashscope:${model}:mascot`
        : `dashscope:${model}:identity-isolation`;
      const generator = job.mode === "mascot" ? this.stylize : this.isolate;
      const clean = await validateStylizedSubject(await generator(
        source,
        mime,
        filename,
        { projectRoot: this.projectRoot },
      ));
      await writeFile(path.join(itemDir, "clean.png"), clean);
      this.update(job, { stage: "remove-background", progress: 68, stylizeProvider });
      await this.persistJob(job);

      const final = await validateTransparentSubject(await this.removeBackground(clean));
      const removeBackgroundProvider = "server:controlled-chroma-key-v2";
      await writeFile(path.join(itemDir, "final.png"), final);
      this.update(job, { stage: "localize", progress: 92, removeBackgroundProvider });
      await this.persistJob(job);

      const asset = {
        id: job.id,
        name: job.name,
        mode: job.mode,
        templateId: job.templateId,
        rig: { ...job.rig },
        role: job.mode === "mascot" ? "吉祥物城市伙伴" : "保真城市伙伴",
        world: "上街去",
        color: "#E8634A",
        sourceFile,
        sourceUrl: `/api/pets/${job.id}/files/source?accessToken=${encodeURIComponent(job.accessToken)}`,
        cleanUrl: `/api/pets/${job.id}/files/clean?accessToken=${encodeURIComponent(job.accessToken)}`,
        finalUrl: `/api/pets/${job.id}/files/final?accessToken=${encodeURIComponent(job.accessToken)}`,
        stylizeProvider,
        removeBackgroundProvider,
        promptVersion: job.mode === "mascot" ? SUBJECT_PROMPT_VERSION : "qwen-identity-cutout-v2",
        backgroundColor: CHROMA_BACKGROUND,
        outputFormat: "image/png",
        createdAt: job.createdAt,
      };
      this.update(job, { status: "ready", stage: "complete", progress: 100, asset });
      await this.persistJob(job);
    } catch (error) {
      this.update(job, { status: "failed", stage: "failed", error: error.message });
      await this.persistJob(job);
    }
  }
}

export const petUploadLimits = {
  maxBytes: MAX_UPLOAD_BYTES,
  mimeTypes: [...SUPPORTED_MIME],
};
