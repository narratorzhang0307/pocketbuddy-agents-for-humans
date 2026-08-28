import { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  loadAgent3DRuntime,
  type Agent3DRuntime,
} from "../lib/agent3d/loadAgentRuntime";
import type { Agent3DProfile } from "../lib/agent3d/types";

type Agent3DViewerProps = {
  profile: Agent3DProfile;
  autoRotate?: boolean;
  autoRotateSpeed?: number;
  moving?: boolean;
  showPedestal?: boolean;
  className?: string;
  onReady?: () => void;
  onError?: (message: string) => void;
};

export default function Agent3DViewer({
  profile,
  autoRotate = true,
  autoRotateSpeed = 0.45,
  moving = false,
  showPedestal = true,
  className = "",
  onReady,
  onError,
}: Agent3DViewerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const modelRef = useRef<Agent3DRuntime | null>(null);
  const movingRef = useRef(moving);
  const autoRotateRef = useRef(autoRotate);
  const autoRotateSpeedRef = useRef(autoRotateSpeed);
  const profileRef = useRef(profile);

  useEffect(() => {
    profileRef.current = profile;
    modelRef.current?.reconfigure?.(profile);
  }, [profile]);

  useEffect(() => {
    movingRef.current = moving;
  }, [moving]);

  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    autoRotateSpeedRef.current = autoRotateSpeed;
  }, [autoRotateSpeed]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let raf = 0;
    let resizeObserver: ResizeObserver | null = null;
    let model: Agent3DRuntime | null = null;
    let timer: { dispose: () => void } | null = null;
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    const usesAlbaLighting = profile.rig?.templateVersion === "alba-style-v1";
    const usesSoftCharacterLighting =
      usesAlbaLighting ||
      profile.rig?.templateId === "kenney-mini-character" ||
      profile.rig?.templateVersion === "rounded-city-biped-v1";
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (usesAlbaLighting) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.98;
    } else if (usesSoftCharacterLighting) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.82;
    }
    renderer.domElement.setAttribute(
      "aria-label",
      `${profile.name}的360度三维形象`,
    );
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(
      new THREE.HemisphereLight(
        usesAlbaLighting ? 0xfffdf4 : 0xfff9df,
        usesAlbaLighting ? 0xe0d8c8 : 0x7d9381,
        usesAlbaLighting ? 1.25 : usesSoftCharacterLighting ? 1.05 : 2.4,
      ),
    );
    const key = new THREE.DirectionalLight(
      usesAlbaLighting ? 0xfff3e2 : 0xfff2c9,
      usesAlbaLighting ? 1.35 : usesSoftCharacterLighting ? 1.2 : 2.2,
    );
    key.position.set(-4, 8, 6);
    scene.add(key);
    if (usesAlbaLighting) {
      // 绘本哑光风：高环境光打底，暖主光塑形，冷轮廓光只留一点点边缘。
      const rim = new THREE.DirectionalLight(0xdfe8ff, 0.7);
      rim.position.set(3.6, 4.5, -5.5);
      scene.add(rim);
      const fill = new THREE.DirectionalLight(0xffffff, 0.45);
      fill.position.set(3.2, 1.8, 5.2);
      scene.add(fill);
    }
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
    camera.position.set(0, 2.6, profile.species === "dachshund" ? 7.4 : 5.8);
    camera.lookAt(0, 0.82, 0);

    const pedestal = showPedestal
      ? new THREE.Mesh(
          new THREE.CylinderGeometry(
            profile.species === "dachshund" ? 2.25 : 1.45,
            profile.species === "dachshund" ? 2.25 : 1.45,
            0.08,
            48,
          ),
          usesAlbaLighting
            ? new THREE.MeshStandardMaterial({
                color: 0xf3ede2,
                roughness: 0.9,
                metalness: 0,
              })
            : new THREE.MeshToonMaterial({ color: 0xe8dfc9 }),
        )
      : null;
    if (pedestal) {
      pedestal.position.y = 0.02;
      scene.add(pedestal);
    }

    const riggedPreviewAngle = {
      cat: profile.visual?.version.startsWith("tripo-siamese-cat-rigged-v1")
        ? -0.42
        : Math.PI - 0.42,
      rabbit: Math.PI - 0.24,
      squirrel: -0.42,
      bird: profile.visual?.version.startsWith("tripo-yellow-chick-rigged")
        ? -0.42
        : Math.PI,
      pig: Math.PI / 2 - 0.42,
      tortoise: Math.PI - 0.62,
    } as const;
    let rotationY =
      profile.species === "dachshund"
        ? 0
        : profile.visual?.representation === "rigged-3d"
          ? (riggedPreviewAngle[
              profile.species as keyof typeof riggedPreviewAngle
            ] ?? Math.PI)
          : 0.08;
    let pointerDown = false;
    let pointerX = 0;
    let resumeAt = 0;
    const onPointerDown = (event: PointerEvent) => {
      pointerDown = true;
      pointerX = event.clientX;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!pointerDown) return;
      rotationY += (event.clientX - pointerX) * 0.012;
      pointerX = event.clientX;
      resumeAt = performance.now() + 1500;
    };
    const onPointerUp = (event: PointerEvent) => {
      pointerDown = false;
      resumeAt = performance.now() + 1500;
      renderer.domElement.releasePointerCapture(event.pointerId);
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);

    const load = async () => {
      model = await loadAgent3DRuntime(profileRef.current, "viewer");
      if (disposed) {
        model.dispose();
        return;
      }
      model.root.scale.setScalar(
        profile.species === "dachshund"
          ? 2.25
          : profile.species === "tortoise"
            ? 1.08
            : 1.9,
      );
      modelRef.current = model;
      scene.add(model.root);
      onReady?.();

      const frameTimer = new THREE.Timer();
      frameTimer.connect(document);
      timer = frameTimer;
      const frame = (now?: number) => {
        if (disposed || !model) return;
        frameTimer.update(now);
        const delta = Math.min(frameTimer.getDelta(), 0.05);
        if (
          autoRotateRef.current &&
          !pointerDown &&
          performance.now() >= resumeAt
        ) {
          rotationY += delta * autoRotateSpeedRef.current;
        }
        model.root.rotation.y += (rotationY - model.root.rotation.y) * 0.13;
        model.update(frameTimer.getElapsed(), movingRef.current, delta);
        renderer.render(scene, camera);
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    };
    load().catch((error: unknown) => {
      if (disposed) return;
      renderer.clear();
      console.error("智能体三维查看器加载失败", error);
      onError?.(
        error instanceof Error ? error.message : "三维伙伴模板加载失败",
      );
    });

    const resize = () => {
      const width = mount.clientWidth || 320;
      const height = mount.clientHeight || 320;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      timer?.dispose();
      resizeObserver?.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      model?.dispose();
      modelRef.current = null;
      pedestal?.geometry.dispose();
      pedestal?.material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [
    onError,
    onReady,
    profile.id,
    profile.species,
    profile.visual?.version,
    profile.visual?.viewerGlbUrl,
    showPedestal,
  ]);

  return <div ref={mountRef} className={className} />;
}
