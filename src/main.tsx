import './demoReset';   // 显式 ?reset 时才清本应用数据；默认保留 PWA 本地展品/3D 缓存
import { Capacitor } from '@capacitor/core';
import { createRoot } from "react-dom/client";
import App from "./app/App";
import "./styles/index.css";
import { setFrostBrain } from "../frost-agent/harness/brain";
import { httpBrain } from "../frost-agent/harness/httpBrain";

if (Capacitor.isNativePlatform()) {
  document.documentElement.dataset.pocketPlatform = Capacitor.getPlatform();
}

// 接入受控服务端模型；服务不可用时 Skill 自动走确定性规则 fallback。
setFrostBrain(httpBrain);

createRoot(document.getElementById("root")!).render(<App />);

// 持久 Goal Driver 只在有到期目标时唤醒 Frost；无目标时不调用模型。
setTimeout(() => {
  void import('./app/lib/fitnessAgentRuntime').then(({ startFrostGoalDriver }) => startFrostGoalDriver()).catch(() => {});
}, 5000);

// 注册 Service Worker —— PWA 可安装 + 离线打开应用壳。
// 仅生产：dev 下注册会缓存 HMR 资源、干扰热更新，故用 import.meta.env.PROD 门控。
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((registration) => {
      registration.update().catch(() => {});
    }).catch(() => {});
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      const key = "pe.swReloaded.v46";
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
      window.location.reload();
    });
  });
}
