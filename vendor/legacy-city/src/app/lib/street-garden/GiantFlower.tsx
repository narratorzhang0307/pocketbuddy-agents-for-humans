import type { CSSProperties, ReactNode } from "react";
import "./GiantFlower.css";

export type GiantFlowerTheme = "orange-crown" | "white-star";

export type GiantFlowerHangingKind =
  | "nameplate"
  | "photo"
  | "poem"
  | "postcard"
  | "ribbon"
  | "seed"
  | "ticket"
  | "voice";

export type GiantFlowerHanging = {
  kind: GiantFlowerHangingKind;
  label: string;
  note: string;
  accent?: string;
};

export type GiantFlower = {
  id: string;
  name: string;
  asset: string;
  position: [number, number];
  preview: [number, number];
  scale: number;
  rootX: number;
  poem: string;
  memory: string;
  giantTheme: GiantFlowerTheme;
  cityId?: string;
  district?: string;
  siteId?: string;
  siteName?: string;
  hangings?: GiantFlowerHanging[];
};

type GiantFlowerCandidate = {
  giantTheme?: GiantFlowerTheme;
};

const HANGING_MARK: Record<GiantFlowerHangingKind, string> = {
  nameplate: "牌",
  photo: "影",
  poem: "诗",
  postcard: "信",
  ribbon: "结",
  seed: "籽",
  ticket: "票",
  voice: "声",
};

const HANGING_DROP = 45;

export function isGiantFlower<T extends GiantFlowerCandidate>(
  flower: T,
): flower is T & GiantFlower {
  return flower.giantTheme !== undefined;
}

export function describeGiantFlower(flower: GiantFlower): string {
  const place = flower.siteName ? `${flower.siteName}的` : "";
  const hangingLabels = flower.hangings
    ?.map((item) => `${item.label}：${item.note}`)
    .join("；");
  return `查看${place}${flower.name}${
    hangingLabels ? `，花茎上钉着${hangingLabels}` : ""
  }`;
}

function hangingStyle(): CSSProperties {
  return {
    "--giant-hanging-drop": `${HANGING_DROP}px`,
    "--giant-hanging-thread-length": `${HANGING_DROP}px`,
  } as CSSProperties;
}

function postcardStyle(hanging: GiantFlowerHanging): CSSProperties {
  return {
    "--giant-hanging-accent": hanging.accent || "#d9b85c",
  } as CSSProperties;
}

export function GiantFlowerVisual({
  flower,
  children,
}: {
  flower: GiantFlower;
  children?: ReactNode;
}) {
  return (
    <>
      <span className="sg-plant-aura" />
      <span
        className={`sg-game-sprite sg-giant-flower-sprite is-${flower.giantTheme}`}
        aria-hidden="true"
      >
        <span className="sg-giant-sway-rig">
          <img src={flower.asset} alt="" draggable={false} />
          {!!flower.hangings?.length && (
            <span className="sg-giant-hangings">
              <span className="sg-giant-hanging" style={hangingStyle()}>
                <svg
                  className="sg-giant-hanging-thread"
                  viewBox="0 0 46 45"
                  preserveAspectRatio="none"
                  focusable="false"
                >
                  <path d="M23 3 L2 43 M23 3 L44 43" />
                </svg>
                <span className="sg-giant-postcard-stack">
                  {flower.hangings.slice(0, 3).map((hanging, index) => (
                    <span
                      key={`${hanging.kind}-${hanging.label}`}
                      className={`sg-giant-postcard is-${
                        hanging.kind
                      } is-stack-${index + 1}`}
                      style={postcardStyle(hanging)}
                      title={`${hanging.label}：${hanging.note}`}
                    >
                      <span className="sg-giant-postcard-image">
                        <b>{HANGING_MARK[hanging.kind]}</b>
                      </span>
                      <em>{hanging.label}</em>
                    </span>
                  ))}
                </span>
              </span>
            </span>
          )}
        </span>
      </span>
      {flower.district && flower.siteName && (
        <span className="sg-giant-location-tag" aria-hidden="true">
          <b>{flower.district.replace(/[区县市]$/, "")}</b>
          <em>{flower.siteName}</em>
        </span>
      )}
      {children}
    </>
  );
}
