import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { agentForwardCorrection, dampAngle } from "../lib/agent3d/heading";
import {
  loadAgent3DRuntime,
  type Agent3DRuntime,
} from "../lib/agent3d/loadAgentRuntime";
import { liveOutingLocalPlacement } from "../lib/agent3d/mapPlacement";
import { mapAgentPixelRatio } from "../lib/agent3d/mapRendering";
import { RIGGED_WAYFARER_GUIDE } from "../lib/agent3d/profiles";
import type { Agent3DProfile } from "../lib/agent3d/types";
import "./GardenRouteCompare3D.css";

export type GardenCompareMode = "legacy" | "rigged";

export type GardenRoutePose = {
  anchor: [number, number];
  heading: number;
};

export type GardenRoutePoses = {
  legacy: GardenRoutePose;
  rigged: GardenRoutePose;
};

type Props = {
  activeMode: GardenCompareMode;
  legacyPose: GardenRoutePose;
  riggedPose: GardenRoutePose;
  livePosesRef: { readonly current: GardenRoutePoses | null };
  legacyMapScale: number;
  riggedFollower: Agent3DProfile;
  markerHost?: HTMLElement | null;
};

function placeLeashSegment(
  segment: InstanceType<typeof THREE.Mesh>,
  start: InstanceType<typeof THREE.Vector3>,
  end: InstanceType<typeof THREE.Vector3>,
) {
  const direction = end.clone().sub(start);
  const length = direction.length();
  segment.position.copy(start).add(end).multiplyScalar(0.5);
  segment.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );
  segment.scale.set(1, length, 1);
}

export default function GardenRouteCompare3D({
  activeMode,
  legacyPose,
  riggedPose,
  livePosesRef,
  legacyMapScale,
  riggedFollower,
  markerHost = null,
}: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const activeModeRef = useRef(activeMode);
  const legacyPoseRef = useRef(legacyPose);
  const riggedPoseRef = useRef(riggedPose);
  const legacyMapScaleRef = useRef(legacyMapScale);

  useEffect(() => {
    activeModeRef.current = activeMode;
  }, [activeMode]);
  useEffect(() => {
    legacyPoseRef.current = legacyPose;
  }, [legacyPose]);
  useEffect(() => {
    riggedPoseRef.current = riggedPose;
  }, [riggedPose]);
  useEffect(() => {
    legacyMapScaleRef.current = legacyMapScale;
  }, [legacyMapScale]);
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let raf = 0;
    let resizeObserver: ResizeObserver | null = null;
    let riggedFollowerModel: Agent3DRuntime | null = null;
    let riggedGuide: Agent3DRuntime | null = null;
    let guideHand: InstanceType<typeof THREE.Object3D> | null = null;
    let followerCollar: InstanceType<typeof THREE.Object3D> | null = null;
    const followsWithoutLeash =
      riggedFollower.species === "bird" ||
      riggedFollower.species === "cat" ||
      riggedFollower.species === "squirrel" ||
      riggedFollower.species === "pig";
    const mobileMode =
      window.matchMedia("(pointer: coarse)").matches ||
      Math.min(window.innerWidth, window.innerHeight) <= 600;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(mapAgentPixelRatio(window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.autoClear = false;
    renderer.domElement.setAttribute(
      "aria-label",
      `我的形象和${riggedFollower.name}在地图上同行`,
    );
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff7db, 0x6b7b72, 2.15));
    const sun = new THREE.DirectionalLight(0xffe9bc, 2.35);
    sun.position.set(-180, 260, 190);
    scene.add(sun);

    // 与原 GardenEncounter3D 共用同一组近景相机参数和脚底投影。
    const camera = new THREE.PerspectiveCamera(51, 154 / 196, 0.1, 80);
    camera.position.set(0, 3.8, 8.2);
    camera.lookAt(new THREE.Vector3(0, 1.05, -4.7));

    const riggedHeadingRoot = new THREE.Group();
    scene.add(riggedHeadingRoot);
    const riggedPlacement = liveOutingLocalPlacement(
      followsWithoutLeash ? "follow" : "leash",
    );

    const leashMaterial = new THREE.MeshStandardMaterial({
      color: 0xb9473a,
      roughness: 0.78,
      metalness: 0,
    });
    const leashGeometry = new THREE.CylinderGeometry(0.02, 0.02, 1, 8);
    const leash = new THREE.Group();
    leash.name = "Guide_Leash";
    const leashUpper = new THREE.Mesh(leashGeometry, leashMaterial);
    const leashLower = new THREE.Mesh(leashGeometry, leashMaterial);
    leash.add(leashUpper, leashLower);
    leash.visible = false;
    riggedHeadingRoot.add(leash);
    const handPoint = new THREE.Vector3();
    const collarPoint = new THREE.Vector3();
    const leashSag = new THREE.Vector3();

    const updateLeash = (elapsed: number, moving: boolean) => {
      if (followsWithoutLeash || !guideHand || !followerCollar) {
        leash.visible = false;
        return;
      }
      riggedHeadingRoot.updateMatrixWorld(true);
      guideHand.localToWorld(handPoint.set(0, -0.075, 0));
      followerCollar.localToWorld(collarPoint.set(0.34, -0.02, 0));
      riggedHeadingRoot.worldToLocal(handPoint);
      riggedHeadingRoot.worldToLocal(collarPoint);
      leashSag.copy(handPoint).add(collarPoint).multiplyScalar(0.5);
      leashSag.y -= 0.13 + (moving ? Math.sin(elapsed * 9.2) * 0.018 : 0);
      placeLeashSegment(leashUpper, handPoint, leashSag);
      placeLeashSegment(leashLower, leashSag, collarPoint);
      leash.visible = true;
    };

    let renderWidth = mount.clientWidth || (markerHost ? 190 : 390);
    let renderHeight = mount.clientHeight || (markerHost ? 242 : 720);
    let viewWidth = markerHost
      ? renderWidth
      : Math.min(210, renderWidth * 0.62);
    let viewHeight = markerHost ? renderHeight : 196 * (viewWidth / 154);
    const resize = () => {
      renderWidth = mount.clientWidth || (markerHost ? 190 : 390);
      renderHeight = mount.clientHeight || (markerHost ? 242 : 720);
      viewWidth = markerHost ? renderWidth : Math.min(210, renderWidth * 0.62);
      viewHeight = markerHost ? renderHeight : 196 * (viewWidth / 154);
      camera.aspect = viewWidth / viewHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(renderWidth, renderHeight, false);
      if (markerHost) {
        const projectedFoot = new THREE.Vector3(0, 0.18, 0).project(camera);
        const footX = (projectedFoot.x * 0.5 + 0.5) * viewWidth;
        const footY = (-projectedFoot.y * 0.5 + 0.5) * viewHeight;
        mount.style.setProperty("--sg-route-foot-x", `${-footX}px`);
        mount.style.setProperty("--sg-route-foot-y", `${-footY}px`);
      }
    };
    resize();
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);

    Promise.all([
      loadAgent3DRuntime(riggedFollower, "map"),
      loadAgent3DRuntime(RIGGED_WAYFARER_GUIDE, "map"),
    ])
      .then(([loadedFollower, loadedRiggedGuide]) => {
        if (disposed) {
          loadedFollower.dispose();
          loadedRiggedGuide.dispose();
          return;
        }
        riggedFollowerModel = loadedFollower;
        riggedGuide = loadedRiggedGuide;

        // GLB 载入后按高度归一化；稍放大骨骼路线，帽子、背包、手脚与牵绳在手机地图上仍看得清。
        riggedFollowerModel.root.scale.setScalar(
          riggedFollower.species === "bird"
            ? 0.72
            : riggedFollower.species === "squirrel"
              ? 0.64
              : 0.56,
        );
        riggedFollowerModel.root.position.set(...riggedPlacement.companion);
        riggedFollowerModel.root.rotation.y = agentForwardCorrection(
          riggedFollower.species,
          riggedFollower.visual?.version,
        );
        riggedHeadingRoot.add(riggedFollowerModel.root);

        // 街角邮差播放导入的原地行走骨骼循环；小肠模式才连接牵绳。
        riggedGuide.root.scale.setScalar(2.2);
        riggedGuide.root.position.set(...riggedPlacement.guide);
        riggedGuide.root.rotation.y = agentForwardCorrection(
          RIGGED_WAYFARER_GUIDE.species,
        );
        riggedHeadingRoot.add(riggedGuide.root);
        guideHand = riggedGuide.root.getObjectByName("Bone_HandRight") ?? null;
        followerCollar =
          riggedFollowerModel.root.getObjectByName("Bone_Head") ?? null;
        updateLeash(0, false);
        mount.dataset.ready = "true";
      })
      .catch((error: unknown) => {
        console.error(`地图骨骼向导与${riggedFollower.name}加载失败`, error);
      });

    const timer = new THREE.Timer();
    timer.connect(document);
    let lastRenderAt = 0;
    const frame = (now: number) => {
      if (disposed) return;
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      if (mobileMode && now - lastRenderAt < 1000 / 30) return;
      lastRenderAt = now;
      timer.update(now);
      const delta = Math.min(timer.getDelta(), 0.05);
      const elapsed = timer.getElapsed();
      const livePoses = livePosesRef.current;
      const currentRiggedPose = livePoses?.rigged ?? riggedPoseRef.current;
      const currentLegacyScale = legacyMapScaleRef.current;
      riggedHeadingRoot.scale.setScalar(markerHost ? 1 : currentLegacyScale);
      riggedHeadingRoot.rotation.y = dampAngle(
        riggedHeadingRoot.rotation.y,
        currentRiggedPose.heading,
        1 - Math.exp(-delta * 8),
      );

      const riggedMoving = true;
      riggedFollowerModel?.update(elapsed, riggedMoving, delta);
      riggedGuide?.update(elapsed + 0.08, riggedMoving, delta);
      updateLeash(elapsed, riggedMoving);

      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, renderWidth, renderHeight);
      renderer.clear(true, true, true);

      if (markerHost) {
        renderer.render(scene, camera);
        return;
      }

      renderer.setScissorTest(true);
      const renderAtRoadAnchor = (pose: GardenRoutePose) => {
        const projectedFoot = new THREE.Vector3(0, 0, 0).project(camera);
        const footX = (projectedFoot.x * 0.5 + 0.5) * viewWidth;
        const footY = (-projectedFoot.y * 0.5 + 0.5) * viewHeight;
        const left = pose.anchor[0] - footX;
        const top = pose.anchor[1] - footY;
        const bottom = renderHeight - top - viewHeight;
        const clipLeft = Math.max(0, left);
        const clipRight = Math.min(renderWidth, left + viewWidth);
        const clipTop = Math.max(0, top);
        const clipBottom = Math.min(renderHeight, top + viewHeight);
        if (clipRight <= clipLeft || clipBottom <= clipTop) return;

        renderer.setViewport(left, bottom, viewWidth, viewHeight);
        renderer.setScissor(
          clipLeft,
          renderHeight - clipBottom,
          clipRight - clipLeft,
          clipBottom - clipTop,
        );
        renderer.clearDepth();
        renderer.render(scene, camera);
      };

      renderAtRoadAnchor(currentRiggedPose);
      renderer.setScissorTest(false);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      timer.dispose();
      resizeObserver?.disconnect();
      riggedFollowerModel?.dispose();
      riggedGuide?.dispose();
      leashGeometry.dispose();
      leashMaterial.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [markerHost, riggedFollower.id, riggedFollower.visual?.version]);

  const content = (
    <div
      ref={mountRef}
      className={
        markerHost
          ? "sg-route-compare-3d sg-route-compare-3d--map-marker"
          : "sg-route-compare-3d"
      }
      data-active-mode={activeMode}
      data-rigged-guide={RIGGED_WAYFARER_GUIDE.id}
      data-rigged-follower={riggedFollower.id}
      data-legacy-map-scale={legacyMapScale.toFixed(4)}
      data-legacy-heading={legacyPose.heading.toFixed(4)}
      data-rigged-heading={riggedPose.heading.toFixed(4)}
      data-legacy-anchor={legacyPose.anchor
        .map((value) => value.toFixed(1))
        .join(",")}
      data-rigged-anchor={riggedPose.anchor
        .map((value) => value.toFixed(1))
        .join(",")}
    />
  );

  return markerHost ? createPortal(content, markerHost) : content;
}
