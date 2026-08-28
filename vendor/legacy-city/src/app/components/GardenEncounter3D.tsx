import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sprout } from 'lucide-react';
import {
  loadAgent3DRuntime,
  type Agent3DRuntime,
} from '../lib/agent3d/loadAgentRuntime';
import {
  agentForwardCorrection,
  dampAngle,
} from '../lib/agent3d/heading';
import {
  liveOutingFrameInterval,
  mapAgentPixelRatio,
} from '../lib/agent3d/mapRendering';
import {
  RIGGED_DACHSHUND_MAP_AGENT,
} from '../lib/agent3d/profiles';
import {
  createLiveOutingFlock,
  liveOutingCompanionPlacement,
  liveOutingLocalPlacement,
  stepLiveOutingFlock,
} from '../lib/agent3d/mapPlacement';
import type { Agent3DProfile } from '../lib/agent3d/types';
import './GardenEncounter3D.css';
import type { GiantFlowerHanging } from '../lib/street-garden';
import { importWithChunkRecovery } from '../lib/runtime/lazyRetry';

export type OutingCompanionMode = 'leash' | 'follow';
export type LiveOutingLocationMode = 'gps' | 'preview';

function gpsStatusHeadline(
  statusMessage: string,
  moving: boolean,
) {
  if (!statusMessage) return moving ? 'GPS 同行中' : 'GPS 已连接 · 已停下';
  if (statusMessage.includes('权限')) return '定位权限未开启';
  if (statusMessage.includes('信号较弱')) return 'GPS 信号较弱';
  if (
    statusMessage.includes('超时') ||
    statusMessage.includes('重试') ||
    statusMessage.includes('暂时无法')
  ) {
    return '正在重试 GPS';
  }
  return '正在连接 GPS';
}
type DisposableThreeResource = { dispose: () => void };

type GardenEncounter3DProps = {
  mode?: 'flower' | 'gps';
  locationMode?: LiveOutingLocationMode;
  previewControlMode?: 'auto' | 'manual';
  companionMode?: OutingCompanionMode;
  plantName: string;
  plantSiteName?: string;
  plantHangings?: readonly GiantFlowerHanging[];
  anchor: [number, number] | null;
  markerHost?: HTMLElement | null;
  heading: number;
  moving: boolean;
  mapScale?: number;
  accuracyMeters?: number | null;
  tripMeters?: number;
  todaySteps?: number;
  stepGoal?: number;
  totalExperience?: number;
  stepAchievement?: {
    key: string;
    title: string;
    experience: number;
  } | null;
  statusMessage?: string;
  actionMessage?: string;
  guide: Agent3DProfile;
  follower: Agent3DProfile;
  followers?: readonly Agent3DProfile[];
  onLocationModeChange?: (mode: LiveOutingLocationMode) => void;
  onPlant?: () => void;
  onClose: () => void;
};

function companionScale(
  profile: Agent3DProfile,
) {
  if (profile.id === RIGGED_DACHSHUND_MAP_AGENT.id) return 0.56;
  return 0.72;
}

function companionForward(profile: Agent3DProfile) {
  return agentForwardCorrection(profile.species, profile.visual?.version);
}

function placeLeashSegment(
  THREE: typeof import('three'),
  segment: InstanceType<typeof THREE.Mesh>,
  start: InstanceType<typeof THREE.Vector3>,
  end: InstanceType<typeof THREE.Vector3>,
  direction: InstanceType<typeof THREE.Vector3>,
  up: InstanceType<typeof THREE.Vector3>,
) {
  direction.subVectors(end, start);
  const length = direction.length();
  if (length <= 0.0001) return;
  segment.position.addVectors(start, end).multiplyScalar(0.5);
  segment.quaternion.setFromUnitVectors(
    up,
    direction.normalize(),
  );
  segment.scale.set(1, length, 1);
}

export default function GardenEncounter3D({
  mode = 'flower',
  locationMode = 'gps',
  previewControlMode = 'auto',
  companionMode = 'follow',
  plantName,
  plantSiteName = '',
  plantHangings = [],
  anchor,
  markerHost = null,
  heading,
  moving,
  mapScale = 1,
  accuracyMeters = null,
  tripMeters = 0,
  todaySteps = 0,
  stepGoal = 10_000,
  totalExperience = 0,
  stepAchievement = null,
  statusMessage = '',
  actionMessage = '',
  guide,
  follower,
  followers,
  onLocationModeChange,
  onPlant,
  onClose,
}: GardenEncounter3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const movingRef = useRef(moving);
  const headingRef = useRef(heading);
  const mapScaleRef = useRef(mapScale);
  const locationModeRef = useRef(locationMode);
  const [ready, setReady] = useState(false);
  const activeFollowers = followers?.length ? followers : [follower];
  const followerSignature = activeFollowers
    .map(
      (profile) =>
        `${profile.id}@${profile.visual?.version ?? ''}@${profile.name}`,
    )
    .join('|');
  const followerNames = activeFollowers.map((profile) => profile.name);
  const activeFollowerCount = activeFollowers.length;

  useEffect(() => {
    movingRef.current = moving;
  }, [moving]);

  useEffect(() => {
    headingRef.current = heading;
  }, [heading]);

  useEffect(() => {
    mapScaleRef.current = mapScale;
  }, [mapScale]);

  useEffect(() => {
    locationModeRef.current = locationMode;
  }, [locationMode]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let raf = 0;
    let resizeObserver: ResizeObserver | null = null;
    let intersectionObserver: IntersectionObserver | null = null;
    let canvasVisible = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let renderer: any = null;
    let followerModels: Agent3DRuntime[] = [];
    let guideModel: Agent3DRuntime | null = null;
    let leashGeometry: DisposableThreeResource | null = null;
    let leashMaterial: DisposableThreeResource | null = null;
    let timer: DisposableThreeResource | null = null;
    setReady(false);

    (async () => {
      const THREE = await importWithChunkRecovery(() => import('three'));
      if (disposed || !mountRef.current) return;

      const width = mount.clientWidth || 390;
      const height = mount.clientHeight || 720;
      const reducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(mapAgentPixelRatio(window.devicePixelRatio || 1));
      renderer.setSize(width, height);
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.setAttribute(
        'aria-label',
        `${guide.name}与${followerNames.join('、')}在高德地图上行走的三维场景`,
      );
      mount.appendChild(renderer.domElement);
      if ('IntersectionObserver' in window) {
        intersectionObserver = new IntersectionObserver(
          ([entry]) => {
            canvasVisible = entry?.isIntersecting ?? true;
          },
          { rootMargin: '48px' },
        );
        intersectionObserver.observe(mount);
      }

      const scene = new THREE.Scene();

      const camera = new THREE.PerspectiveCamera(51, width / height, 0.1, 80);
      camera.position.set(0, 3.8, 10);

      scene.add(new THREE.HemisphereLight(0xfff6d6, 0x71827a, 2.1));
      const sun = new THREE.DirectionalLight(0xfff0c2, 2.4);
      sun.position.set(-5, 10, 6);
      scene.add(sun);

      const travelers = new THREE.Group();
      travelers.scale.setScalar(mapScaleRef.current);
      scene.add(travelers);
      // 花径偶遇与 GPS 出门共用“我的形象”骨骼人物，避免再出现旧程序化人偶。
      const loaded = await Promise.all([
        ...activeFollowers.map((profile) =>
          loadAgent3DRuntime(profile, 'map'),
        ),
        loadAgent3DRuntime(guide, 'map'),
      ]);
      const loadedGuide = loaded.at(-1) ?? null;
      const loadedFollowers = loaded.slice(0, -1);
      if (disposed) {
        loadedFollowers.forEach((runtime) => runtime.dispose());
        loadedGuide?.dispose();
        return;
      }
      followerModels = loadedFollowers;
      guideModel = loadedGuide;

      // 经纬度位移由高德道路路线驱动；Three.js 只负责原地步态，避免两套位移叠加后偏离道路。
      const livePlacement = liveOutingLocalPlacement(companionMode);
      const outingVariation = Math.floor(Math.random() * 0xffffffff);
      const companionFlock = createLiveOutingFlock(
        companionMode,
        activeFollowers.map((profile) => profile.id),
        outingVariation,
      );

      let guideHand: InstanceType<typeof THREE.Object3D> | null = null;
      if (guideModel) {
        guideModel.root.scale.setScalar(2.2);
        guideModel.root.position.set(
          ...(mode === 'gps'
            ? livePlacement.guide
            : ([0, 0, 0] as const)),
        );
        guideModel.root.rotation.y = agentForwardCorrection(
          guide.species,
          guide.visual?.version,
        );
        travelers.add(guideModel.root);
        guideHand =
          guideModel.root.getObjectByName('Bone_HandRight') ?? null;
      }

      leashMaterial = new THREE.MeshStandardMaterial({
        color: 0xb9473a,
        roughness: 0.78,
        metalness: 0,
      });
      leashGeometry = new THREE.CylinderGeometry(0.02, 0.02, 1, 8);
      const runtimeCompanions = loadedFollowers.map((model, index) => {
        const profile = activeFollowers[index];
        const companion = model.root;
        companion.scale.setScalar(companionScale(profile));
        companion.rotation.y = companionForward(profile);
        const companionPosition =
          mode === 'gps'
            ? liveOutingCompanionPlacement(companionMode, index)
            : index === 0
              ? livePlacement.companion
              : liveOutingCompanionPlacement(companionMode, index);
        companion.position.set(...companionPosition);
        travelers.add(companion);

        const fallbackCollar = new THREE.Object3D();
        fallbackCollar.position.set(0, 0.64, -0.12);
        companion.add(fallbackCollar);
        const collar =
          companion.getObjectByName('Bone_Head') ?? fallbackCollar;
        const leash = new THREE.Group();
        leash.name = `Guide_Leash_${index + 1}`;
        const upper = new THREE.Mesh(leashGeometry, leashMaterial);
        const lower = new THREE.Mesh(leashGeometry, leashMaterial);
        leash.add(upper, lower);
        leash.visible = false;
        travelers.add(leash);
        return { profile, model, collar, leash, upper, lower, index };
      });
      const handPoint = new THREE.Vector3();
      const collarPoint = new THREE.Vector3();
      const leashSag = new THREE.Vector3();
      const leashDirection = new THREE.Vector3();
      const leashUp = new THREE.Vector3(0, 1, 0);
      const updateLeashes = (elapsed: number, isMoving: boolean) => {
        if (companionMode !== 'leash' || !guideHand) {
          runtimeCompanions.forEach((entry) => {
            entry.leash.visible = false;
          });
          return;
        }
        travelers.updateMatrixWorld(true);
        guideHand.localToWorld(handPoint.set(0, -0.075, 0));
        travelers.worldToLocal(handPoint);
        runtimeCompanions.forEach((entry) => {
          if (entry.profile.id === RIGGED_DACHSHUND_MAP_AGENT.id) {
            entry.collar.localToWorld(collarPoint.set(0.34, -0.02, 0));
          } else {
            entry.collar.localToWorld(collarPoint.set(0, 0, 0));
          }
          travelers.worldToLocal(collarPoint);
          leashSag.copy(handPoint).add(collarPoint).multiplyScalar(0.5);
          leashSag.y -=
            0.13 +
            entry.index * 0.015 +
            (isMoving
              ? Math.sin(elapsed * 9.2 + entry.index * 0.7) * 0.018
              : 0);
          placeLeashSegment(
            THREE,
            entry.upper,
            handPoint,
            leashSag,
            leashDirection,
            leashUp,
          );
          placeLeashSegment(
            THREE,
            entry.lower,
            leashSag,
            collarPoint,
            leashDirection,
            leashUp,
          );
          entry.leash.visible = true;
        });
      };

      travelers.rotation.y = headingRef.current;
      updateLeashes(0, false);
      setReady(true);

      const frameTimer = new THREE.Timer();
      frameTimer.connect(document);
      timer = frameTimer;
      const cameraTarget = new THREE.Vector3(0, 1.05, -4.7);
      const footAnchor = new THREE.Vector3(
        ...(mode === 'gps'
          ? livePlacement.footAnchor
          : ([0, 0.18, 0] as const)),
      );

      camera.position.set(0, 3.8, 8.2);
      camera.lookAt(cameraTarget);

      const alignCanvasFootToRoad = () => {
        const projectedFoot = footAnchor.clone().project(camera);
        const canvasWidth = mountRef.current?.clientWidth || width;
        const canvasHeight = mountRef.current?.clientHeight || height;
        const footX = (projectedFoot.x * 0.5 + 0.5) * canvasWidth;
        const footY = (-projectedFoot.y * 0.5 + 0.5) * canvasHeight;
        mount.style.setProperty('--sg-foot-x', `${-footX}px`);
        mount.style.setProperty('--sg-foot-y', `${-footY}px`);
      };
      alignCanvasFootToRoad();

      let lastRenderAt = 0;
      const frame = (now: number) => {
        if (disposed) return;
        raf = requestAnimationFrame(frame);
        if (document.hidden || !canvasVisible) {
          // Keep the simulation clock current while the canvas is outside the
          // viewport, otherwise returning to it would create a large time jump.
          frameTimer.update(now);
          return;
        }
        const minimumFrameMs = liveOutingFrameInterval(
          movingRef.current,
          activeFollowerCount,
          locationModeRef.current === 'preview',
          reducedMotion,
        );
        if (now - lastRenderAt < minimumFrameMs) return;
        lastRenderAt = now;
        frameTimer.update(now);
        const delta = Math.min(frameTimer.getDelta(), 0.05);
        const elapsed = frameTimer.getElapsed();
        const motion = movingRef.current ? 1 : 0;
        const turnEase = 1 - Math.exp(-delta * 8);
        travelers.scale.setScalar(mapScaleRef.current);
        travelers.rotation.y = dampAngle(
          travelers.rotation.y,
          headingRef.current,
          turnEase,
        );

        if (mode === 'gps' && motion && !reducedMotion) {
          stepLiveOutingFlock(
            companionFlock,
            companionMode,
            elapsed,
            delta,
          );
          runtimeCompanions.forEach((entry) => {
            const flockMember = companionFlock[entry.index];
            entry.model.root.position.x = flockMember.x;
            entry.model.root.position.z = flockMember.z;
          });
        }

        runtimeCompanions.forEach((entry) => {
          entry.model.update(
            elapsed + 0.18 + entry.index * 0.11,
            Boolean(motion),
            delta,
          );
        });
        guideModel?.update(elapsed + 0.08, Boolean(motion), delta);
        updateLeashes(elapsed, Boolean(motion));

        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(frame);

      resizeObserver = new ResizeObserver(() => {
        if (!mountRef.current || disposed) return;
        const nextWidth = mountRef.current.clientWidth || 390;
        const nextHeight = mountRef.current.clientHeight || 720;
        camera.aspect = nextWidth / nextHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(nextWidth, nextHeight);
        alignCanvasFootToRoad();
      });
      resizeObserver.observe(mount);
    })().catch((error: unknown) => {
      console.error('花径 3D 场景加载失败', error);
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      timer?.dispose();
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      followerModels.forEach((model) => model.dispose());
      guideModel?.dispose();
      leashGeometry?.dispose();
      leashMaterial?.dispose();
      if (renderer) {
        try {
          renderer.dispose();
          renderer.forceContextLoss?.();
          renderer.domElement.remove();
        } catch {
          // WebGL 上下文可能已由浏览器释放。
        }
      }
    };
  }, [
    companionMode,
    followerSignature,
    guide.id,
    guide.visual?.version,
    mode,
    plantName,
  ]);

  return (
    <section
      className="sg-encounter"
      aria-label={
        mode === 'gps'
          ? locationMode === 'preview'
            ? `和${followerNames.join('、')}一起默认行走`
            : `和${followerNames.join('、')}一起实时出门`
          : `经过${plantName}的花径漫游`
      }
      data-follower-id={activeFollowers.map((profile) => profile.id).join(',')}
      data-follower-count={activeFollowers.length}
      data-guide-id={guide.id}
      data-heading={heading.toFixed(3)}
      data-mode={mode}
      data-location-mode={locationMode}
      data-companion-mode={companionMode}
      data-map-scale={mapScale.toFixed(4)}
    >
      {markerHost
        ? createPortal(
            <div
              ref={mountRef}
              className="sg-encounter-canvas sg-encounter-canvas--map-marker"
              data-map-avatar-collision-zone={mode === 'gps' ? 'true' : undefined}
            />,
            markerHost,
          )
        : (
            <div
              ref={mountRef}
              className="sg-encounter-canvas"
              data-map-avatar-collision-zone={mode === 'gps' ? 'true' : undefined}
              style={{
                left: anchor ? `${anchor[0]}px` : '50%',
                top: anchor ? `${anchor[1]}px` : '50%',
              } as React.CSSProperties}
            />
          )}
      {mode === 'flower' && plantHangings.length > 0 && (
        <aside className="sg-encounter-flower-story">
          <small>{plantSiteName || plantName}</small>
          {plantHangings.slice(0, 3).map((hanging) => (
            <span key={`${hanging.kind}-${hanging.label}`}>
              <b>{hanging.label}</b>
              <em>{hanging.note}</em>
            </span>
          ))}
        </aside>
      )}
      {mode === 'gps' && (
        <>
          {!ready && <div className="sg-encounter-loading">正在长出花径…</div>}
          <div className="sg-live-outing-topbar">
            <button type="button" className="sg-encounter-close" onClick={onClose}>
              ■ 结束出门
            </button>
            <div
              className="sg-live-outing-location-toggle"
              role="group"
              aria-label="选择杭州演示场景或根据真实位置校正"
            >
              <button
                type="button"
                className={locationMode === 'gps' ? 'is-active is-core-action' : 'is-core-action'}
                aria-pressed={locationMode === 'gps'}
                onClick={() => onLocationModeChange?.('gps')}
              >
                根据真实位置校正
              </button>
              <button
                type="button"
                className={locationMode === 'preview' ? 'is-active' : ''}
                aria-pressed={locationMode === 'preview'}
                onClick={() => onLocationModeChange?.('preview')}
              >
                杭州默认场景
              </button>
            </div>
            <button
              type="button"
              className="sg-live-outing-plant"
              onClick={onPlant}
              disabled={todaySteps < 3_000 || locationMode !== 'gps'}
              title={
                todaySteps < 3_000
                  ? `再走 ${Math.max(0, 3_000 - todaySteps).toLocaleString('zh-CN')} 步即可种植物`
                  : locationMode !== 'gps'
                    ? '切换到真实 GPS 后可以在当前位置种植物'
                    : '选择一枚种子，在当前 GPS 位置种下'
              }
            >
              <Sprout size={13} strokeWidth={2.6} />
              {todaySteps >= 3_000 ? '种下植物' : `${todaySteps.toLocaleString('zh-CN')}/3,000`}
            </button>
            <div
              className={`sg-live-outing-status${
                locationMode === 'preview' ? ' is-preview' : ''
              }`}
              role="status"
              aria-live="polite"
            >
              <strong>
                {locationMode === 'preview'
                  ? previewControlMode === 'manual'
                    ? moving
                      ? '手动操控中'
                      : '手动操控待命'
                    : '杭州场景巡游中'
                  : gpsStatusHeadline(statusMessage, moving)}
              </strong>
              <span>
                {companionMode === 'leash' ? '牵绳同行' : '自动跟随'}
                {activeFollowers.length > 1
                  ? ` · ${activeFollowers.length} 位散步搭子`
                  : ''}
                {accuracyMeters !== null
                  ? ` · 精度 ±${Math.round(accuracyMeters)}m`
                  : ''}
                {tripMeters > 0 ? ` · ${Math.round(tripMeters)}m` : ''}
                {locationMode === 'preview' ? ' · 尚未读取真实位置' : ''}
              </span>
              {statusMessage && locationMode !== 'preview' && (
                <small>{statusMessage}</small>
              )}
              {actionMessage && <small>{actionMessage}</small>}
            </div>
          </div>
          <aside
            className="sg-live-outing-steps"
            aria-label={`今日步数 ${todaySteps} 步，目标 ${stepGoal} 步`}
          >
            <header>
              <span aria-hidden="true">◎</span>
              <small>TODAY STEPS</small>
              <em>EXP {totalExperience}</em>
            </header>
            <p>
              <strong>{todaySteps.toLocaleString('zh-CN')}</strong>
              <span>/ {stepGoal.toLocaleString('zh-CN')}</span>
            </p>
            <i aria-hidden="true">
              <b
                style={{
                  width: `${Math.min(100, Math.max(0, (todaySteps / stepGoal) * 100))}%`,
                }}
              />
            </i>
            <small>
              {locationMode === 'preview'
                ? '杭州演示场景不计步'
                : todaySteps >= stepGoal
                  ? '今日目标已完成'
                  : `还差 ${Math.max(0, stepGoal - todaySteps).toLocaleString('zh-CN')} 步`}
            </small>
          </aside>
          {stepAchievement && (
            <div
              key={stepAchievement.key}
              className="sg-live-outing-achievement"
              role="status"
              aria-live="assertive"
            >
              <small>WALK QUEST · 10K</small>
              <strong>任务完成！</strong>
              <span>经验 +{stepAchievement.experience}</span>
              <em>{stepAchievement.title}</em>
            </div>
          )}
        </>
      )}
    </section>
  );
}
