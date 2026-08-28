import { Platform } from "react-native";

/** Keep uploaded frames small; never write captures to storage on the web/iOS wrapper. */
export async function analysisFrame(base64: string): Promise<string> {
  const source = base64.startsWith("data:") ? base64 : `data:image/jpeg;base64,${base64}`;
  if (Platform.OS !== "web") return source;
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("摄像头画面读取失败"));
    image.src = source;
  });
  const scale = Math.min(1, 640 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器不支持画面处理");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.65);
}
