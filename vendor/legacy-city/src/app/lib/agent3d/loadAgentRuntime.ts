import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { resolveAgentAssetUrl } from "./forgeApi";
import type { Agent3DProfile } from "./types";
import { importWithChunkRecovery } from "../runtime/lazyRetry";

export type Agent3DRuntime = {
  root: InstanceType<typeof THREE.Group>;
  update: (elapsed: number, moving: boolean, delta: number) => void;
  dispose: () => void;
  representation: "static-3d" | "rigged-3d";
  reconfigure?: (profile: Agent3DProfile) => void;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setRigMaterialColor(root: any, name: string, color: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  root.traverse((object: any) => {
    const materials = Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    materials.forEach((value: any) => {
      if (value.name !== name || !value.color) return;
      value.color.set(color);
      value.needsUpdate = true;
    });
  });
}

function offsetRigColor(color: string, lightness: number) {
  const value = new THREE.Color(color);
  value.offsetHSL(0, 0, lightness);
  return `#${value.getHexString()}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setRigMorph(root: any, name: string, value: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  root.traverse((object: any) => {
    const index = object.morphTargetDictionary?.[name];
    if (index === undefined || !object.morphTargetInfluences) return;
    object.morphTargetInfluences[index] = value;
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setRelativeScale(
  object: InstanceType<typeof THREE.Object3D> | undefined,
  x: number,
  y = x,
  z = x,
) {
  if (!object) return;
  const base =
    object.userData.agentBaseScale ||
    (object.userData.agentBaseScale = object.scale.clone());
  object.scale.set(base.x * x, base.y * y, base.z * z);
}

function setRelativeXPosition(
  object: InstanceType<typeof THREE.Object3D> | undefined,
  multiplier: number,
) {
  if (!object) return;
  const base =
    object.userData.agentBasePosition ||
    (object.userData.agentBasePosition = object.position.clone());
  object.position.set(base.x * multiplier, base.y, base.z);
}

export function applyAgentProfileRig(
  root: InstanceType<typeof THREE.Object3D>,
  profile: Agent3DProfile,
) {
  setRigMaterialColor(root, "Skin_Coat", profile.color);
  setRigMaterialColor(root, "Skin_Accent", profile.accent);
  const palette = profile.visual?.palette;
  const skinColor = palette?.skin || "#d99162";
  const shirtColor = palette?.shirt || profile.color;
  const backpackColor = palette?.backpack || "#253c50";
  setRigMaterialColor(root, "Skin_Warm", skinColor);
  setRigMaterialColor(
    root,
    "Skin_Shade",
    palette?.skin ? offsetRigColor(skinColor, -0.12) : "#bd724e",
  );
  setRigMaterialColor(root, "Shirt_Marigold", shirtColor);
  setRigMaterialColor(root, "Shirt_Stitch", offsetRigColor(shirtColor, 0.09));
  setRigMaterialColor(root, "Shorts_Indigo", palette?.shorts || profile.accent);
  setRigMaterialColor(root, "Backpack_Navy", backpackColor);
  setRigMaterialColor(
    root,
    "Backpack_Trim",
    palette?.backpack ? offsetRigColor(backpackColor, -0.1) : "#172633",
  );
  setRigMaterialColor(root, "Cap_Red", palette?.cap || "#d94436");
  const parameters = (profile.rig?.parameters ?? profile.rigSettings) as
    Record<string, number> | undefined;
  if (!parameters) return;
  const value = (name: string, fallback = 1) => {
    const candidate = parameters[name];
    return typeof candidate === "number" && Number.isFinite(candidate)
      ? candidate
      : fallback;
  };
  if (profile.rig?.templateId === "kaykit-city-child") {
    setRelativeScale(root.getObjectByName("head"), value("headScale"));
    setRelativeScale(root.getObjectByName("chest"), 1, value("bodyScale"), 1);
    ["upperarm.l", "upperarm.r"].forEach((name) => {
      setRelativeScale(root.getObjectByName(name), 1, value("armLength"), 1);
    });
    ["upperleg.l", "upperleg.r"].forEach((name) => {
      setRelativeScale(
        root.getObjectByName(name),
        1,
        value("avatarLegLength"),
        1,
      );
    });
    root.updateMatrixWorld(true);
    return;
  }
  if (profile.rig?.templateId === "kenney-mini-character") {
    setRelativeScale(root.getObjectByName("head"), value("headScale"));
    setRelativeScale(root.getObjectByName("torso"), 1, value("bodyScale"), 1);
    ["arm-left", "arm-right"].forEach((name) => {
      setRelativeScale(root.getObjectByName(name), 1, value("armLength"), 1);
      setRelativeXPosition(root.getObjectByName(name), value("shoulderWidth"));
    });
    ["leg-left", "leg-right"].forEach((name) => {
      setRelativeScale(
        root.getObjectByName(name),
        1,
        value("avatarLegLength"),
        1,
      );
    });
    root.updateMatrixWorld(true);
    return;
  }
  setRigMorph(root, "BodyLength", value("bodyLength", 0));
  setRigMorph(root, "BodyRoundness", value("bodyRoundness", 0));
  setRigMorph(root, "MuzzleLength", value("muzzleLength", 0));
  setRigMorph(root, "EarLength", value("earLength", 0));
  setRelativeScale(root.getObjectByName("Bone_Head"), value("headScale"));
  [
    "Bone_FrontLeft",
    "Bone_FrontRight",
    "Bone_RearLeft",
    "Bone_RearRight",
  ].forEach((name) => {
    setRelativeScale(root.getObjectByName(name), 1, value("legLength"), 1);
  });
  setRelativeScale(
    root.getObjectByName("Bone_Spine"),
    1,
    value("bodyScale"),
    1,
  );
  ["Bone_ArmLeft_Upper", "Bone_ArmRight_Upper"].forEach((name) => {
    setRelativeScale(root.getObjectByName(name), 1, value("armLength"), 1);
    setRelativeXPosition(root.getObjectByName(name), value("shoulderWidth"));
  });
  ["Bone_LegLeft_Upper", "Bone_LegRight_Upper"].forEach((name) => {
    setRelativeScale(
      root.getObjectByName(name),
      1,
      value("avatarLegLength"),
      1,
    );
  });
  setRelativeScale(
    root.getObjectByName("Backpack_Main"),
    value("backpackScale"),
  );
  root.updateMatrixWorld(true);
}

function prepareKayKitCityChild(root: InstanceType<typeof THREE.Object3D>) {
  const accessories: InstanceType<typeof THREE.Object3D>[] = [];
  root.traverse((object: InstanceType<typeof THREE.Object3D>) => {
    if (
      "isMesh" in object &&
      // KayKit keeps its weapons and cape as rigid meshes. The five skinned
      // body pieces are retained; fantasy props are removed before framing.
      !(object as InstanceType<typeof THREE.SkinnedMesh>).isSkinnedMesh
    ) {
      accessories.push(object);
    }
  });
  accessories.forEach((object) => object.removeFromParent());
  root.updateMatrixWorld(true);
}

type SplitNormalSample = {
  attribute:
    | InstanceType<typeof THREE.BufferAttribute>
    | InstanceType<typeof THREE.InterleavedBufferAttribute>;
  index: number;
  direction: InstanceType<typeof THREE.Vector3>;
  fromFaces: boolean;
};

export function smoothSplitMeshNormals(
  root: InstanceType<typeof THREE.Object3D>,
) {
  const positionPrecision = 100_000;
  const smoothAngleCosine = Math.cos(THREE.MathUtils.degToRad(60));
  const groups = new Map<string, SplitNormalSample[]>();
  const changedAttributes = new Set<SplitNormalSample["attribute"]>();

  root.traverse((object: InstanceType<typeof THREE.Object3D>) => {
    if (!("isMesh" in object) || !object.isMesh) return;
    const geometry = (object as InstanceType<typeof THREE.Mesh>).geometry;
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    if (!position || !normal || position.count !== normal.count) return;
    const faceNormalSums = Array.from(
      { length: position.count },
      () => new THREE.Vector3(),
    );
    const triangleCount = Math.floor(
      (geometry.index ? geometry.index.count : position.count) / 3,
    );
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const edgeAB = new THREE.Vector3();
    const edgeAC = new THREE.Vector3();
    const faceNormal = new THREE.Vector3();
    const vertexIndex = (offset: number) =>
      geometry.index ? geometry.index.getX(offset) : offset;
    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      const ia = vertexIndex(triangle * 3);
      const ib = vertexIndex(triangle * 3 + 1);
      const ic = vertexIndex(triangle * 3 + 2);
      a.fromBufferAttribute(position, ia);
      b.fromBufferAttribute(position, ib);
      c.fromBufferAttribute(position, ic);
      edgeAB.subVectors(b, a);
      edgeAC.subVectors(c, a);
      faceNormal.crossVectors(edgeAB, edgeAC);
      faceNormalSums[ia].add(faceNormal);
      faceNormalSums[ib].add(faceNormal);
      faceNormalSums[ic].add(faceNormal);
    }

    for (let index = 0; index < position.count; index += 1) {
      const fromFaces = faceNormalSums[index].lengthSq() > 0;
      const key = [
        Math.round(position.getX(index) * positionPrecision),
        Math.round(position.getY(index) * positionPrecision),
        Math.round(position.getZ(index) * positionPrecision),
      ].join(":");
      const samples = groups.get(key) ?? [];
      samples.push({
        attribute: normal,
        index,
        direction: fromFaces
          ? faceNormalSums[index].normalize()
          : new THREE.Vector3(
              normal.getX(index),
              normal.getY(index),
              normal.getZ(index),
            ).normalize(),
        fromFaces,
      });
      groups.set(key, samples);
    }
  });

  let smoothedVertices = 0;
  groups.forEach((samples) => {
    if (samples.length < 2) return;
    if (samples.every((sample) => sample.fromFaces)) {
      const average = samples.reduce(
        (sum, sample) => sum.add(sample.direction),
        new THREE.Vector3(),
      );
      if (average.lengthSq() > 0.0001) {
        average.normalize();
        samples.forEach((sample) => {
          sample.attribute.setXYZ(
            sample.index,
            average.x,
            average.y,
            average.z,
          );
          changedAttributes.add(sample.attribute);
          smoothedVertices += 1;
        });
        return;
      }
    }
    const clusters: Array<{
      samples: SplitNormalSample[];
      sum: InstanceType<typeof THREE.Vector3>;
    }> = [];
    samples.forEach((sample) => {
      const cluster = clusters.find(
        (candidate) =>
          sample.direction.dot(candidate.sum.clone().normalize()) >=
          smoothAngleCosine,
      );
      if (cluster) {
        cluster.samples.push(sample);
        cluster.sum.add(sample.direction);
      } else {
        clusters.push({
          samples: [sample],
          sum: sample.direction.clone(),
        });
      }
    });
    clusters.forEach((cluster) => {
      if (cluster.samples.length < 2) return;
      const average = cluster.sum.normalize();
      cluster.samples.forEach((sample) => {
        sample.attribute.setXYZ(sample.index, average.x, average.y, average.z);
        changedAttributes.add(sample.attribute);
        smoothedVertices += 1;
      });
    });
  });
  changedAttributes.forEach((attribute) => {
    attribute.needsUpdate = true;
  });
  return smoothedVertices;
}

export function mergeSplitSkinnedMeshes(
  root: InstanceType<typeof THREE.Object3D>,
) {
  const parts: InstanceType<typeof THREE.SkinnedMesh>[] = [];
  root.traverse((object: InstanceType<typeof THREE.Object3D>) => {
    if ("isSkinnedMesh" in object && object.isSkinnedMesh) {
      parts.push(object as InstanceType<typeof THREE.SkinnedMesh>);
    }
  });
  if (parts.length < 2) return 0;
  const geometry = mergeGeometries(
    parts.map((part) => part.geometry),
    false,
  );
  if (!geometry) return 0;

  const first = parts[0];
  const merged = new THREE.SkinnedMesh(geometry, first.material);
  merged.name = "tripo_chick_surface";
  merged.bindMode = first.bindMode;
  merged.bind(first.skeleton, first.bindMatrix);
  merged.castShadow = first.castShadow;
  merged.receiveShadow = first.receiveShadow;
  parts.forEach((part) => {
    part.removeFromParent();
    part.geometry.dispose();
  });
  root.add(merged);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  root.updateMatrixWorld(true);
  return parts.length;
}

export function useBakedTripoSurface(
  root: InstanceType<typeof THREE.Object3D>,
) {
  const replacements = new Map<
    InstanceType<typeof THREE.Material>,
    InstanceType<typeof THREE.MeshBasicMaterial>
  >();
  root.traverse((object: InstanceType<typeof THREE.Object3D>) => {
    if (!("isMesh" in object) || !object.isMesh) return;
    const mesh = object as InstanceType<typeof THREE.Mesh>;
    const position = mesh.geometry.getAttribute("position");
    if (position && !mesh.geometry.getAttribute("color")) {
      mesh.geometry.computeBoundingBox();
      const bounds = mesh.geometry.boundingBox;
      if (bounds) {
        const height = Math.max(bounds.max.y - bounds.min.y, 0.0001);
        const depth = Math.max(bounds.max.z - bounds.min.z, 0.0001);
        const colors: number[] = [];
        for (let index = 0; index < position.count; index += 1) {
          const vertical = (position.getY(index) - bounds.min.y) / height;
          const front = (position.getZ(index) - bounds.min.z) / depth;
          const shade = THREE.MathUtils.clamp(
            0.8 + vertical * 0.15 + front * 0.05,
            0.8,
            1,
          );
          colors.push(shade, shade, shade);
        }
        mesh.geometry.setAttribute(
          "color",
          new THREE.Float32BufferAttribute(colors, 3),
        );
      }
    }
    const sources = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    const materials = sources.map(
      (material: InstanceType<typeof THREE.Material>) => {
        const cached = replacements.get(material);
        if (cached) return cached;
        const map =
          "map" in material
            ? (material.map as InstanceType<typeof THREE.Texture> | null)
            : null;
        const replacement = new THREE.MeshBasicMaterial({
          map,
          color:
            "color" in material
              ? (material.color as InstanceType<typeof THREE.Color>)
              : 0xffffff,
          side: material.side,
          transparent: material.transparent,
          opacity: material.opacity,
          alphaTest: material.alphaTest,
          toneMapped: false,
          vertexColors: true,
        });
        replacement.name = `${material.name || "tripo"}_baked`;
        replacements.set(material, replacement);
        return replacement;
      },
    );
    mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
  });
  replacements.forEach((_replacement, source) => source.dispose());
  return replacements.size;
}

function disposeScene(root: InstanceType<typeof THREE.Object3D>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  root.traverse((object: any) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    materials.forEach((material: any) => {
      Object.values(material).forEach((value) => {
        if (
          value &&
          typeof value === "object" &&
          "isTexture" in value &&
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (value as any).isTexture
        ) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (value as any).dispose?.();
        }
      });
      material.dispose?.();
    });
  });
}

export function makeLocomotionClipInPlace(
  source: InstanceType<typeof THREE.AnimationClip>,
) {
  const clip = source.clone();
  clip.tracks.forEach((track: InstanceType<typeof THREE.KeyframeTrack>) => {
    if (
      !/(?:^|[:/.])(?:Root|tripoRoot|Hip|Hips|Pelvis)\.position$/i.test(
        track.name,
      ) ||
      track.getValueSize() !== 3 ||
      track.times.length < 2
    ) {
      return;
    }
    const values = track.values;
    const lastOffset = (track.times.length - 1) * 3;
    const duration = track.times[track.times.length - 1] - track.times[0];
    if (duration <= 0) return;
    const drift = [
      values[lastOffset] - values[0],
      values[lastOffset + 1] - values[1],
      values[lastOffset + 2] - values[2],
    ];
    for (let frame = 0; frame < track.times.length; frame += 1) {
      const progress = (track.times[frame] - track.times[0]) / duration;
      for (let axis = 0; axis < 3; axis += 1) {
        values[frame * 3 + axis] -= drift[axis] * progress;
      }
    }
  });
  return clip;
}

export function selectAgentAnimationClips(
  animations: InstanceType<typeof THREE.AnimationClip>[],
) {
  const idleClip = animations.find((clip) => /idle/i.test(clip.name));
  const namedWalkClip = animations.find((clip) => /walk|run/i.test(clip.name));
  const walkSource =
    namedWalkClip ??
    (!idleClip && animations.length === 1 ? animations[0] : undefined);
  return {
    idleClip,
    walkClip: walkSource ? makeLocomotionClipInPlace(walkSource) : undefined,
  };
}

export function amplifySiameseForelegBend(
  source: InstanceType<typeof THREE.AnimationClip>,
) {
  const clip = source.clone();
  const bendFactor = 2;
  clip.tracks.forEach((track: InstanceType<typeof THREE.KeyframeTrack>) => {
    if (
      !/^tripo0_(?:Left|Right)_Limb_1\.quaternion$/i.test(track.name) ||
      track.getValueSize() !== 4 ||
      track.times.length < 2
    ) {
      return;
    }
    const base = new THREE.Quaternion().fromArray(track.values, 0);
    const current = new THREE.Quaternion();
    const amplified = new THREE.Quaternion();
    for (let frame = 0; frame < track.times.length; frame += 1) {
      current.fromArray(track.values, frame * 4);
      amplified.slerpQuaternions(base, current, bendFactor);
      amplified.toArray(track.values, frame * 4);
    }
  });
  return clip;
}

export type BirdBoneLocomotion = {
  update: (elapsed: number, moving: boolean, delta: number) => void;
};

const MAP_GUIDE_WALK_CADENCE = 2 / 2.375;
const MAP_COMPANION_STRIDES_PER_GUIDE_CYCLE = 3;
const MAP_COMPANION_WALK_CADENCE =
  MAP_GUIDE_WALK_CADENCE * MAP_COMPANION_STRIDES_PER_GUIDE_CYCLE;
const MAP_SLOW_COMPANION_WALK_CADENCE = MAP_COMPANION_WALK_CADENCE * 0.5;
const BIRD_VIEWER_WALK_CADENCE = MAP_GUIDE_WALK_CADENCE * 2.5;

export function createBirdBoneLocomotion(
  profile: Agent3DProfile,
  root: InstanceType<typeof THREE.Object3D>,
  purpose: "viewer" | "map" = "viewer",
): BirdBoneLocomotion | null {
  if (
    profile.species !== "bird" ||
    !profile.visual?.version.startsWith("tripo-yellow-chick-rigged")
  ) {
    return null;
  }

  const names = ["L_Foot", "R_Foot"] as const;
  const bones = Object.fromEntries(
    names.map((name) => [name, root.getObjectByName(name)]),
  ) as Record<(typeof names)[number], InstanceType<typeof THREE.Object3D>>;
  if (names.some((name) => !bones[name])) return null;

  root.updateMatrixWorld(true);
  const parentWorldQuaternion = new THREE.Quaternion();
  const inverseParentWorldQuaternion = new THREE.Quaternion();
  const modelForward = new THREE.Vector3(0, 0, 1);
  const modelUp = new THREE.Vector3(0, 1, 0);
  const footPoses = names.map((name, index) => {
    const bone = bones[name];
    bone.parent?.getWorldQuaternion(parentWorldQuaternion);
    inverseParentWorldQuaternion.copy(parentWorldQuaternion).invert();
    return {
      bone,
      phaseOffset: index === 0 ? 0 : 0.5,
      basePosition: bone.position.clone(),
      targetPosition: new THREE.Vector3(),
      localForward: modelForward
        .clone()
        .applyQuaternion(inverseParentWorldQuaternion),
      localUp: modelUp.clone().applyQuaternion(inverseParentWorldQuaternion),
    };
  });
  const wingPoses = (["L_Upperarm", "R_Upperarm"] as const).flatMap(
    (name, index) => {
      const bone = root.getObjectByName(name);
      return bone
        ? [
            {
              bone,
              phase: index === 0 ? -1 : 1,
              baseQuaternion: bone.quaternion.clone(),
              targetQuaternion: new THREE.Quaternion(),
            },
          ]
        : [];
    },
  );
  const wingRotation = new THREE.Quaternion();
  const wingAxis = new THREE.Vector3(1, 0, 0);
  const bodyBaseY = root.position.y;
  const head = root.getObjectByName("Head");
  const headBasePosition = head?.position.clone();
  const headTargetPosition = new THREE.Vector3();
  const headLocalUp = new THREE.Vector3(0, 1, 0);
  if (head?.parent) {
    head.parent.getWorldQuaternion(parentWorldQuaternion);
    headLocalUp.applyQuaternion(
      inverseParentWorldQuaternion.copy(parentWorldQuaternion).invert(),
    );
  }
  const tailParts = [
    root.getObjectByName("tripo_part_5"),
    root.getObjectByName("tripo_part_11"),
    root.getObjectByName("tripo_part_12"),
  ].filter((part): part is InstanceType<typeof THREE.Object3D> =>
    Boolean(part),
  );
  const tailParent = tailParts[0]?.parent;
  const tailPivot =
    tailParts.length === 3 &&
    tailParent &&
    tailParts.every((part) => part.parent === tailParent)
      ? new THREE.Group()
      : null;
  if (tailPivot && tailParent) {
    tailPivot.name = "BirdTailPivot";
    tailPivot.position.set(0, 0.32, -0.2);
    tailParent.add(tailPivot);
    tailParent.updateMatrixWorld(true);
    tailParts.forEach((part) => tailPivot.attach(part));
  }
  const tailBaseQuaternion = tailPivot?.quaternion.clone();
  const tailTargetQuaternion = new THREE.Quaternion();
  const tailRotation = new THREE.Quaternion();
  const tailAxis = new THREE.Vector3(1, 0, 0);
  let walkTime = 0;
  let wasMoving = false;
  const walkAngularSpeed =
    Math.PI *
    2 *
    (purpose === "map" ? MAP_COMPANION_WALK_CADENCE : BIRD_VIEWER_WALK_CADENCE);

  return {
    update(elapsed, moving, delta) {
      if (moving) {
        if (!wasMoving) walkTime = 0;
        walkTime =
          purpose === "map" ? elapsed : walkTime + Math.min(delta, 0.05);
      } else {
        walkTime = 0;
      }
      const motion = moving ? 1 : 0;
      const ease = 1 - Math.exp(-Math.min(delta, 0.05) * 13);
      const stride = walkTime * walkAngularSpeed;
      const swing = Math.sin(stride) * motion;
      const gaitCycle = (stride / (Math.PI * 2) + 0.19) % 1;
      // Like the dachshund clip, each foot advances quickly, then spends
      // longer planted and pushing back instead of swinging like a pendulum.
      // 躯干与腿骨保持原姿势，避免圆润身体被错误权重带着拉裂。
      footPoses.forEach((pose) => {
        const stepPhase = (gaitCycle + pose.phaseOffset) % 1;
        const swingPortion = 0.4;
        const isSwinging = stepPhase < swingPortion;
        const progress = isSwinging
          ? stepPhase / swingPortion
          : (stepPhase - swingPortion) / (1 - swingPortion);
        const easedProgress = progress * progress * (3 - 2 * progress);
        const foreAft = isSwinging
          ? -1 + easedProgress * 2
          : 1 - easedProgress * 2;
        const lift = isSwinging ? Math.sin(progress * Math.PI) : 0;
        pose.targetPosition
          .copy(pose.basePosition)
          .addScaledVector(pose.localForward, foreAft * 0.04 * motion)
          .addScaledVector(pose.localUp, lift * 0.009 * motion);
        pose.bone.position.lerp(pose.targetPosition, ease);
      });
      wingPoses.forEach((pose) => {
        wingRotation.setFromAxisAngle(wingAxis, swing * pose.phase * 0.07);
        pose.targetQuaternion.copy(pose.baseQuaternion).multiply(wingRotation);
        pose.bone.quaternion.slerp(pose.targetQuaternion, ease);
      });
      // The tail has no dedicated bone, so move the whole model together.
      // Two small vertical pulses per gait cycle keep it grounded without
      // twisting the body away from the tail-weighted lower skeleton.
      const bodyBob =
        Math.abs(Math.sin((gaitCycle - 0.4) * Math.PI * 2)) * 0.0015 * motion;
      root.position.y += (bodyBaseY + bodyBob - root.position.y) * ease;
      if (head && headBasePosition) {
        headTargetPosition
          .copy(headBasePosition)
          .addScaledVector(headLocalUp, -bodyBob * 0.6);
        head.position.lerp(headTargetPosition, ease);
      }
      if (tailPivot && tailBaseQuaternion) {
        const tailFollow =
          Math.sin((gaitCycle - 0.4) * Math.PI * 4 - 0.55) * 0.026 * motion;
        tailRotation.setFromAxisAngle(tailAxis, tailFollow);
        tailTargetQuaternion.copy(tailBaseQuaternion).multiply(tailRotation);
        tailPivot.quaternion.slerp(tailTargetQuaternion, ease * 0.7);
      }
      wasMoving = moving;
    },
  };
}

const TRIPO_QUADRUPED_CYCLES_PER_CLIP = 3;
const TRIPO_DACHSHUND_PHASE_SECONDS = 0.082;

export function agentWalkTimeScale(
  profile: Agent3DProfile,
  purpose: "viewer" | "map",
  clipDuration: number,
) {
  const isHengdouPig =
    profile.species === "pig" &&
    profile.visual?.version.startsWith("tripo-pig-hengdou-rigged-v2");
  const hasNormalizedTripoQuadrupedGait =
    (profile.species === "dachshund" &&
      profile.visual?.version.startsWith("tripo-dachshund-rigged-v3")) ||
    (profile.species === "cat" &&
      profile.visual?.version.startsWith("tripo-siamese-cat-rigged-v1")) ||
    (profile.species === "squirrel" &&
      profile.visual?.version.startsWith("tripo-squirrel-rigged-v1")) ||
    isHengdouPig;
  const usesMapCadence =
    purpose === "map" || (purpose === "viewer" && isHengdouPig);
  if (
    !usesMapCadence ||
    !hasNormalizedTripoQuadrupedGait ||
    !Number.isFinite(clipDuration) ||
    clipDuration <= 0
  ) {
    return 1;
  }
  const sourceCadence = TRIPO_QUADRUPED_CYCLES_PER_CLIP / clipDuration;
  const usesHalfSpeedGait =
    (profile.species === "cat" &&
      profile.visual?.version.startsWith("tripo-siamese-cat-rigged-v1")) ||
    (profile.species === "squirrel" &&
      profile.visual?.version.startsWith("tripo-squirrel-rigged-v1"));
  const targetCadence =
    usesHalfSpeedGait
      ? MAP_SLOW_COMPANION_WALK_CADENCE
      : MAP_COMPANION_WALK_CADENCE;
  return targetCadence / sourceCadence;
}

export function agentWalkStartTime(
  profile: Agent3DProfile,
  purpose: "viewer" | "map",
) {
  return purpose === "map" &&
    profile.species === "dachshund" &&
    profile.visual?.version.startsWith("tripo-dachshund-rigged-v3")
    ? TRIPO_DACHSHUND_PHASE_SECONDS
    : 0;
}

async function loadGlbRuntime(
  profile: Agent3DProfile,
  purpose: "viewer" | "map",
): Promise<Agent3DRuntime | null> {
  const url = await resolveAgentAssetUrl(profile, purpose);
  if (!url) return null;

  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    importWithChunkRecovery(() => import("three/examples/jsm/loaders/GLTFLoader.js")),
    importWithChunkRecovery(() => import("three/examples/jsm/libs/meshopt_decoder.module.js")),
  ]);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  const content = gltf.scene;
  const hasSplitTripoSurface =
    profile.visual?.version.startsWith("tripo-yellow-chick-rigged-v6") ||
    profile.visual?.version.startsWith("tripo-pig-hengdou-rigged-v2");
  if (hasSplitTripoSurface) {
    smoothSplitMeshNormals(content);
    mergeSplitSkinnedMeshes(content);
  }
  if (profile.visual?.version.startsWith("tripo-yellow-chick-rigged-v6")) {
    useBakedTripoSurface(content);
  }
  if (profile.rig?.templateId === "kaykit-city-child") {
    prepareKayKitCityChild(content);
  }
  applyAgentProfileRig(content, profile);
  const bounds = new THREE.Box3().setFromObject(content);
  const size = bounds.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.y) || size.y <= 0.0001) {
    disposeScene(content);
    throw new Error("GLB 没有可用的三维边界");
  }

  const root = new THREE.Group();
  const normalized = new THREE.Group();
  content.position.set(
    -(bounds.min.x + bounds.max.x) / 2,
    -bounds.min.y,
    -(bounds.min.z + bounds.max.z) / 2,
  );
  normalized.scale.setScalar(1 / size.y);
  normalized.add(content);
  root.add(normalized);

  const mixer = gltf.animations.length
    ? new THREE.AnimationMixer(content)
    : null;
  const selectedClips = selectAgentAnimationClips(gltf.animations);
  const idleClip = selectedClips.idleClip;
  const walkClip =
    selectedClips.walkClip &&
    profile.species === "cat" &&
    profile.visual?.version.startsWith("tripo-siamese-cat-rigged-v1")
      ? amplifySiameseForelegBend(selectedClips.walkClip)
      : selectedClips.walkClip;
  const idleAction = idleClip && mixer ? mixer.clipAction(idleClip) : null;
  const walkAction = walkClip && mixer ? mixer.clipAction(walkClip) : null;
  const birdBoneLocomotion =
    walkAction || idleAction
      ? null
      : createBirdBoneLocomotion(profile, content, purpose);
  const walkTimeScale = agentWalkTimeScale(
    profile,
    purpose,
    walkClip?.duration ?? 0,
  );
  walkAction?.setEffectiveTimeScale(walkTimeScale);
  const walkStartTime = agentWalkStartTime(profile, purpose);
  let active = idleAction || walkAction || null;
  if (walkAction && !idleAction) {
    walkAction.play();
    walkAction.paused = true;
  } else {
    active?.play();
  }
  let lastMoving = false;

  return {
    root,
    representation:
      (mixer && (idleAction || walkAction)) || birdBoneLocomotion
        ? "rigged-3d"
        : "static-3d",
    reconfigure(nextProfile) {
      applyAgentProfileRig(content, nextProfile);
    },
    update(elapsed, moving, delta) {
      let mapWalkSynchronized = false;
      if (walkAction && !idleAction) {
        if (moving && !lastMoving) {
          walkAction.reset().play();
          walkAction.time = walkStartTime;
          walkAction.paused = false;
          active = walkAction;
        } else if (!moving && lastMoving) {
          walkAction.paused = true;
          walkAction.time = 0;
          mixer?.update(0);
        }
        if (purpose === "map" && moving && walkClip && walkClip.duration > 0) {
          walkAction.time =
            (elapsed * walkTimeScale + walkStartTime) % walkClip.duration;
          mixer?.update(0);
          mapWalkSynchronized = true;
        }
      } else {
        const wanted =
          moving && walkAction ? walkAction : idleAction || walkAction;
        if (wanted && wanted !== active) {
          active?.fadeOut(0.18);
          wanted.reset().fadeIn(0.18).play();
          if (wanted === walkAction) wanted.time = walkStartTime;
          active = wanted;
        }
      }
      if (!mapWalkSynchronized) {
        mixer?.update(Math.min(delta, 0.05));
      }
      birdBoneLocomotion?.update(elapsed, moving, delta);
      if (!walkAction && !birdBoneLocomotion && moving) {
        normalized.position.y = Math.abs(Math.sin(elapsed * 7.5)) * 0.025;
      } else if (lastMoving && !moving) {
        normalized.position.y = 0;
      }
      lastMoving = moving;
    },
    dispose() {
      mixer?.stopAllAction();
      disposeScene(content);
    },
  };
}

export async function loadAgent3DRuntime(
  profile: Agent3DProfile,
  purpose: "viewer" | "map",
): Promise<Agent3DRuntime> {
  // Only load the selected model. Missing/failed assets leave the caller's
  // canvas empty; never manufacture a substitute character, even for old saves.
  const model = await loadGlbRuntime(profile, purpose);
  if (!model) throw new Error("该形象尚无可用的 3D 模型，预览留空");
  return model;
}
