/**
 * Web-only：强制浏览器的 getUserMedia 使用首选外接摄像头（默认影石 Insta360）。
 *
 * 背景：expo-camera 在 web 上只按 facing(front/back) 通过设备 label 匹配挑摄像头
 * （front → facetime/user/front，back → back/rear），因此永远命中 MacBook 内置
 * 摄像头，无法指定影石这类外接 UVC 摄像头。这里在应用启动时给 getUserMedia 打补丁：
 * 凡是请求视频流，都改用 label 命中首选关键词的摄像头 deviceId。
 *
 * - 仅影响 web；native 上 navigator.mediaDevices 不存在，直接跳过。
 * - 关键词由 EXPO_PUBLIC_PREFERRED_CAMERA 配置（逗号分隔，留空 = 不干预，用系统默认）。
 * - 设备 label 只有在获得摄像头授权后才可见，因此首次会先普通授权拿一个流、
 *   枚举定位到首选设备后再正式取流。
 */

const KEYWORDS = (process.env.EXPO_PUBLIC_PREFERRED_CAMERA ?? "insta360")
  .split(",")
  .map((s: string) => s.trim().toLowerCase())
  .filter(Boolean);

let installed = false;
let cachedDeviceId: string | null = null;

export function installPreferredCamera(): void {
  if (installed) return;
  if (KEYWORDS.length === 0) return; // 显式留空 = 不干预

  const md =
    typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
  if (!md || typeof md.getUserMedia !== "function") return; // 非 web / 不支持

  installed = true;
  const original = md.getUserMedia.bind(md);

  const findPreferredId = async (): Promise<string | null> => {
    try {
      const devices = await md.enumerateDevices();
      const cams = devices.filter((d) => d.kind === "videoinput");
      const hit = cams.find((d) =>
        KEYWORDS.some((k: string) => d.label.toLowerCase().includes(k))
      );
      return hit?.deviceId ?? null;
    } catch {
      return null;
    }
  };

  md.getUserMedia = async (constraints: MediaStreamConstraints = {}) => {
    if (!constraints.video) return original(constraints); // 纯音频请求不干预

    if (!cachedDeviceId) {
      cachedDeviceId = await findPreferredId();
      if (!cachedDeviceId) {
        // label 需授权后才可见：先普通授权拿一个流，再枚举定位首选设备。
        try {
          const probe = await original({ video: true });
          probe.getTracks().forEach((t) => t.stop());
          cachedDeviceId = await findPreferredId();
        } catch {
          // 授权被拒或失败：交还原始逻辑，不阻断。
        }
      }
      if (cachedDeviceId) {
        // eslint-disable-next-line no-console
        console.log(
          `[preferredCamera] 已锁定外接摄像头 deviceId=${cachedDeviceId}（关键词 ${KEYWORDS.join(", ")}）`
        );
      } else {
        // eslint-disable-next-line no-console
        console.warn(
          `[preferredCamera] 未找到匹配 [${KEYWORDS.join(", ")}] 的摄像头，回退系统默认`
        );
      }
    }

    if (!cachedDeviceId) return original(constraints);

    const video =
      typeof constraints.video === "object" && constraints.video !== null
        ? constraints.video
        : {};
    return original({
      ...constraints,
      video: { ...video, deviceId: { exact: cachedDeviceId } },
    });
  };
}
