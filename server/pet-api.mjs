import { readFile } from "node:fs/promises";
import path from "node:path";
import { PetPipeline, petUploadLimits } from "./pet-pipeline.mjs";

function sendJson(response, status, payload) {
  if (response.headersSent) return;
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": response.getHeader("Access-Control-Allow-Origin") || "*",
    "Access-Control-Allow-Headers": "Content-Type,X-Pet-Name,X-File-Name,X-Forge-Mode,X-Rig-Template",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Cache-Control": "private, no-store",
  });
  response.end(status === 204 ? undefined : JSON.stringify(payload));
}

function sendBinary(response, payload, contentType) {
  response.writeHead(200, {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": response.getHeader("Access-Control-Allow-Origin") || "*",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(payload);
}

function decodeHeader(value, fallback = "") {
  try {
    return decodeURIComponent(String(value || fallback));
  } catch {
    return fallback;
  }
}

async function readImage(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > petUploadLimits.maxBytes) {
      throw new Error("图片不能超过 12MB");
    }
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (!chunks.length) throw new Error("没有读取到图片内容");
  return Buffer.concat(chunks);
}

function contentTypeForSource(filePath) {
  return {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".heic": "image/heic",
    ".heif": "image/heif",
  }[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

export async function createPetApi({ dataDir, projectRoot }) {
  const pipeline = new PetPipeline({ dataDir, projectRoot });
  await pipeline.init();

  return async function handlePetApi(request, response) {
    const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
    if (!url.pathname.startsWith("/api/pets")) return false;

    try {
      if (request.method === "OPTIONS") {
        sendJson(response, 204, {});
        return true;
      }
      if (request.method === "GET" && url.pathname === "/api/pets/health") {
        sendJson(response, 200, {
          ok: true,
          configured: Boolean(process.env.DASHSCOPE_API_KEY),
          provider: `dashscope:${process.env.QWEN_PET_IMAGE_MODEL || "qwen-image-2.0-pro"}`,
          backgroundRemoval: "controlled-chroma-key-v2",
          privacy: "temporary-private",
          retentionMinutes: 30,
          modes: ["direct", "mascot"],
          rigSelection: "explicit-template",
        });
        return true;
      }
      if (request.method === "POST" && url.pathname === "/api/pets") {
        const mime = String(request.headers["content-type"] || "")
          .split(";")[0]
          .trim()
          .toLowerCase();
        const job = pipeline.submit(await readImage(request), {
          mime,
          name: decodeHeader(request.headers["x-pet-name"], "新伙伴"),
          filename: decodeHeader(request.headers["x-file-name"], "capture.jpg"),
          mode: String(request.headers["x-forge-mode"] || "") === "mascot"
            ? "mascot"
            : "direct",
          templateId: decodeHeader(
            request.headers["x-rig-template"],
            "adaptive-v1",
          ),
        });
        sendJson(response, 202, job);
        return true;
      }

      const retryMatch = url.pathname.match(/^\/api\/pets\/(pet-[a-z0-9-]+)\/retry$/);
      if (request.method === "POST" && retryMatch) {
        sendJson(
          response,
          202,
          await pipeline.retry(retryMatch[1], url.searchParams.get("accessToken") || ""),
        );
        return true;
      }

      const jobMatch = url.pathname.match(/^\/api\/pets\/(pet-[a-z0-9-]+)$/);
      if (request.method === "GET" && jobMatch) {
        const job = pipeline.getJob(jobMatch[1], url.searchParams.get("accessToken") || "");
        sendJson(response, job ? 200 : 404, job || { error: "抠图任务不存在或已经过期" });
        return true;
      }
      if (request.method === "DELETE" && jobMatch) {
        const released = await pipeline.release(
          jobMatch[1],
          url.searchParams.get("accessToken") || "",
        );
        sendJson(response, released ? 200 : 404, released ? { ok: true } : { error: "抠图任务不存在" });
        return true;
      }

      const fileMatch = url.pathname.match(
        /^\/api\/pets\/(pet-[a-z0-9-]+)\/files\/(source|clean|final)$/,
      );
      if (request.method === "GET" && fileMatch) {
        const filePath = pipeline.resolveFile(
          fileMatch[1],
          fileMatch[2],
          url.searchParams.get("accessToken") || "",
        );
        if (!filePath) {
          sendJson(response, 404, { error: "图片不存在或已经过期" });
          return true;
        }
        const payload = await readFile(filePath);
        sendBinary(
          response,
          payload,
          fileMatch[2] === "source" ? contentTypeForSource(filePath) : "image/png",
        );
        return true;
      }

      sendJson(response, 404, { error: "未知的伙伴处理接口" });
      return true;
    } catch (error) {
      sendJson(response, 400, {
        error: error instanceof Error ? error.message : "伙伴处理失败",
      });
      return true;
    }
  };
}
