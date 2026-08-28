/**
 * 动作分析 Provider 选择器 —— 全应用统一只用真实模型（ModelCoachProvider）。
 *
 * 模型地址来自 app/.env 的 EXPO_PUBLIC_MODEL_BASE_URL；
 * 未配置时回退到本机 http://127.0.0.1:4000（电脑浏览器调试用）。
 * 不再提供演示/桩模式。
 *
 * 在 app/.env 配置（web_app.py 默认监听 4000）：
 *   EXPO_PUBLIC_MODEL_BASE_URL=http://10.160.0.120:4000
 *   EXPO_PUBLIC_MODEL_MODE=manual   # 或 auto（模型自动识别动作）
 */
import type { FormAnalysisProvider } from "./FormAnalysisProvider";
import { ModelCoachProvider } from "./ModelCoachProvider";

const DEFAULT_BASE_URL = "http://127.0.0.1:4000";
const MODEL_BASE_URL =
  process.env.EXPO_PUBLIC_MODEL_BASE_URL?.trim() || DEFAULT_BASE_URL;
const MODEL_MODE =
  process.env.EXPO_PUBLIC_MODEL_MODE?.trim() === "auto" ? "auto" : "manual";

let singleton: FormAnalysisProvider | null = null;

export function getFormProvider(): FormAnalysisProvider {
  if (singleton === null) {
    singleton = new ModelCoachProvider(MODEL_BASE_URL, MODEL_MODE);
  }
  return singleton;
}

/** 当前使用的模型服务地址（供 UI 显示）。 */
export function modelBaseUrl(): string {
  return MODEL_BASE_URL;
}

/** 结束当前模型会话（ModelCoachProvider.stop）。 */
export async function stopFormSession(): Promise<void> {
  const p = singleton as { stop?: () => Promise<unknown> } | null;
  if (p && typeof p.stop === "function") {
    await p.stop();
  }
}

export * from "./FormAnalysisProvider";
export { ModelCoachProvider } from "./ModelCoachProvider";
