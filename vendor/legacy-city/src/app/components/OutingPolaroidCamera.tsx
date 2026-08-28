import { useEffect, useRef, useState } from "react";
import { Camera, Check, MapPin, RotateCcw, X } from "lucide-react";
import type {
  StreetPhoto,
  StreetPhotoFrame,
  StreetPhotoPlant,
  StreetPhotoScene,
  StreetPhotoSubject,
} from "../lib/street-photo/store";
import { cloneStreetPhotoScene } from "../lib/street-photo/store";
import "./OutingPolaroidCamera.css";

type CameraStage = "viewfinder" | "developing" | "review" | "saved";

type OutingPolaroidCameraProps = {
  scene: StreetPhotoScene;
  onClose: () => void;
  onSave: (
    frozenScene: StreetPhotoScene,
    hostPlant: StreetPhotoPlant | null,
  ) => StreetPhoto;
  captureFrame: () => Promise<StreetPhotoFrame | null>;
};

function Subject({ subject, order }: { subject: StreetPhotoSubject; order: number }) {
  const [failedUrl, setFailedUrl] = useState("");
  if (!subject.imageUrl || failedUrl === subject.imageUrl) return null;
  return (
    <span
      className={`opc-photo-subject opc-photo-subject--${subject.kind}`}
      style={
        {
          "--opc-order": order,
          "--opc-subject-color": subject.color || "#f3d58d",
        } as React.CSSProperties
      }
      title={subject.name}
    >
      <img
        src={subject.imageUrl}
        alt=""
        draggable={false}
        onError={() => setFailedUrl(subject.imageUrl!)}
      />
      <small>{subject.name}</small>
    </span>
  );
}

export function StreetPolaroid({
  scene,
  developed = true,
  compact = false,
}: {
  scene: StreetPhotoScene | StreetPhoto;
  developed?: boolean;
  compact?: boolean;
}) {
  const subjects = [scene.guide, ...scene.companions, ...scene.pocketBuddies];
  const capturedAt = "capturedAt" in scene ? new Date(scene.capturedAt) : new Date();
  return (
    <article
      className={`opc-polaroid${developed ? " is-developed" : ""}${
        compact ? " is-compact" : ""
      }`}
      aria-label={`${scene.place}的城市拍立得`}
    >
      <div
        className="opc-polaroid-image"
        style={
          scene.frame
            ? { aspectRatio: `${scene.frame.width} / ${scene.frame.height}` }
            : undefined
        }
      >
        {scene.frame ? (
          <img
            className="opc-photo-live-frame"
            src={scene.frame.dataUrl}
            alt={`${scene.place}拍摄时的真实地图画面`}
            draggable={false}
          />
        ) : (
          <>
            <span className="opc-photo-sky" />
            <span className="opc-photo-road opc-photo-road--one" />
            <span className="opc-photo-road opc-photo-road--two" />
            {scene.nearbyPlant && (
              <img
                className="opc-photo-plant"
                src={scene.nearbyPlant.imageUrl}
                alt=""
                draggable={false}
              />
            )}
            <div className="opc-photo-subjects">
              {subjects.slice(0, 6).map((subject, index) => (
                <Subject key={`${subject.kind}-${subject.id}`} subject={subject} order={index} />
              ))}
            </div>
          </>
        )}
        <span className="opc-photo-developing-grain" />
      </div>
      <footer>
        <div>
          <strong>{scene.place}</strong>
          <small>
            {scene.city} · {capturedAt.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}
          </small>
        </div>
        <span>CTC · ONE SHOT</span>
      </footer>
    </article>
  );
}

export default function OutingPolaroidCamera({
  scene,
  onClose,
  onSave,
  captureFrame,
}: OutingPolaroidCameraProps) {
  const [stage, setStage] = useState<CameraStage>("viewfinder");
  const [frozenScene, setFrozenScene] = useState<StreetPhotoScene>(scene);
  const [savedPhoto, setSavedPhoto] = useState<StreetPhoto | null>(null);
  const [captureError, setCaptureError] = useState("");
  const timersRef = useRef<number[]>([]);
  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  const releaseShutter = async () => {
    if (stage !== "viewfinder") return;
    setCaptureError("");
    const sceneAtShutter = cloneStreetPhotoScene(scene);
    setFrozenScene(sceneAtShutter);
    setStage("developing");
    const minimumDevelopTime = new Promise<void>((resolve) => {
      timersRef.current.push(window.setTimeout(resolve, 1900));
    });
    const capturedFrame = captureFrame().catch((error) => {
      console.warn("[street-photo] live map capture failed", error);
      return null;
    });
    const [frame] = await Promise.all([capturedFrame, minimumDevelopTime]);
    if (!mountedRef.current) return;
    if (!frame) {
      setCaptureError("这次没有取得真实画面，请保持地图稳定后再按一次快门。");
      setStage("viewfinder");
      return;
    }
    setFrozenScene({ ...sceneAtShutter, frame });
    setStage("review");
  };

  const retake = () => {
    setSavedPhoto(null);
    setCaptureError("");
    setFrozenScene(scene);
    setStage("viewfinder");
  };

  const keepPhoto = (hostPlant: StreetPhotoPlant | null) => {
    if (savedPhoto) return;
    const photo = onSave(frozenScene, hostPlant);
    setSavedPhoto(photo);
    setStage("saved");
  };

  const nearbyPlant = frozenScene.nearbyPlant;
  const subjectNames = [
    frozenScene.guide.name,
    ...frozenScene.companions.map((subject) => subject.name),
    ...frozenScene.pocketBuddies.map((subject) => subject.name),
  ];
  const stageTitle =
    stage === "viewfinder"
      ? "把今天留在城市里"
      : stage === "developing"
        ? "相纸正在记住光线"
        : stage === "review"
          ? "这一刻已经显影"
          : "照片留在城市里了";

  return (
    <div
      className={`opc-camera-layer is-${stage}`}
      data-ignore-map-destination
    >
      <div className="opc-viewfinder-hud" aria-live="polite">
        <span><i /> CITY INSTANT · 01</span>
        <strong>{stageTitle}</strong>
        <small>
          {stage === "viewfinder"
            ? "机身上方即照片边界 · 地图怎么转，照片就怎么留"
            : subjectNames.slice(0, 3).join(" · ")}
          {stage !== "viewfinder" && subjectNames.length > 3
            ? ` 等 ${subjectNames.length} 位`
            : ""}
        </small>
      </div>

      {stage === "viewfinder" && (
        <div className="opc-capture-boundary" aria-hidden="true">
          <span>LIVE VIEW · 所见即所得</span>
        </div>
      )}

      {captureError && (
        <p className="opc-capture-error" role="alert">{captureError}</p>
      )}

      {stage === "viewfinder" && (
        <div className="opc-focus-reticle" aria-hidden="true">
          <i /><i /><i /><i />
          <span>{nearbyPlant ? `${nearbyPlant.name}附近` : "城市街角"}</span>
        </div>
      )}

      {stage !== "viewfinder" && (
        <div className="opc-developed-sheet">
          <StreetPolaroid
            scene={frozenScene}
            developed={stage === "review" || stage === "saved"}
          />
          {stage === "developing" && (
            <p><i /> 显影中，请让它慢慢见光</p>
          )}
          {stage === "review" && (
            <div className="opc-photo-actions">
              <button type="button" onClick={retake}>
                <RotateCcw size={14} /> 重拍
              </button>
              <button type="button" onClick={() => keepPhoto(null)}>
                收进口袋
              </button>
              <button
                type="button"
                className="is-primary"
                onClick={() => keepPhoto(nearbyPlant)}
                disabled={!nearbyPlant}
                title={nearbyPlant ? `挂到${nearbyPlant.name}` : "附近没有可悬挂照片的植物"}
              >
                <MapPin size={14} />
                {nearbyPlant ? `挂到${nearbyPlant.name}` : "附近没有植物"}
              </button>
            </div>
          )}
          {stage === "saved" && savedPhoto && (
            <div className="opc-photo-saved">
              <span><Check size={16} /></span>
              <div>
                <strong>{savedPhoto.hostPlant ? "照片已经留在植物上" : "照片已收进口袋"}</strong>
                <small>
                  {savedPhoto.hostPlant
                    ? `下次来到${savedPhoto.hostPlant.name}旁，仍会看见这张相片。`
                    : "稍后可以在手帐里继续整理它。"}
                </small>
              </div>
              <button type="button" onClick={onClose}>回到街上</button>
            </div>
          )}
        </div>
      )}

      <div className="opc-camera-rig" aria-label="城市拍立得相机">
        <img
          className="opc-camera-hand opc-camera-hand--left"
          src="/assets/street-garden/ui/archive-hand-grip-v2.png"
          alt=""
          draggable={false}
        />
        <div className="opc-camera-body">
          <div className="opc-camera-top">
            <button type="button" onClick={onClose} aria-label="收起拍立得">
              <X size={15} strokeWidth={2.6} />
            </button>
            <span>carry the cosmos</span>
            <button
              type="button"
              className="opc-shutter"
              onClick={releaseShutter}
              disabled={stage !== "viewfinder"}
              aria-label="按下快门"
            >
              <Camera size={16} strokeWidth={2.6} />
            </button>
          </div>
          <div className="opc-camera-front">
            <span className="opc-camera-viewglass"><i /></span>
            <span className="opc-camera-wordmark">CITY<br />INSTANT</span>
            <span className="opc-camera-lens"><i /><b /></span>
            <span className="opc-camera-meter" />
          </div>
          <div className="opc-camera-slot">
            <i />
            <span>{stage === "viewfinder" ? "按绿色快门" : stage === "developing" ? "相纸吐出中" : "ONE SHOT"}</span>
          </div>
        </div>
        <img
          className="opc-camera-hand opc-camera-hand--right"
          src="/assets/street-garden/ui/archive-hand-grip-v2.png"
          alt=""
          draggable={false}
        />
      </div>

      {stage === "developing" && <span className="opc-flash" />}
    </div>
  );
}
