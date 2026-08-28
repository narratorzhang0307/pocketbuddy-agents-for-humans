export type LiveOutingCompanionMode = 'leash' | 'follow';
export type LocalMapPoint = readonly [number, number, number];
export type LiveOutingFlockMember = {
  id: string;
  seed: number;
  x: number;
  z: number;
  velocityX: number;
  velocityZ: number;
};

export const LIVE_OUTING_FLOCK_MIN_SEPARATION = 1.08;
export const LIVE_OUTING_FLOCK_GUIDE_CLEARANCE = 1;
const LIVE_OUTING_FLOCK_MAX_SPEED = 0.22;

export function liveOutingFlockRadius(mode: LiveOutingCompanionMode) {
  return mode === 'leash' ? 2.45 : 3.05;
}

/**
 * GPS 同行的经纬度投影点始终对应人物双脚的接地点。
 * 宠物只保存相对人物的局部位置，地图缩放和旋转不能改变人物锚点。
 */
export function liveOutingLocalPlacement(mode: LiveOutingCompanionMode) {
  const guide: LocalMapPoint = [0, 0, 0];
  const companion = liveOutingCompanionPlacement(mode, 0);

  return {
    footAnchor: guide,
    guide,
    companion,
  };
}

/**
 * 散步编队以人物脚下的真实经纬度为唯一锚点。
 * 每只搭子只拿一个随行方向上的局部偏移；整个编队随后与人物朝向一起旋转，
 * 因此地图旋转、转弯和缩放都不会让搭子互相穿模或漂出道路锚点。
 */
export function liveOutingCompanionPlacement(
  mode: LiveOutingCompanionMode,
  index: number,
): LocalMapPoint {
  const formations: Record<
    LiveOutingCompanionMode,
    readonly LocalMapPoint[]
  > = {
    leash: [
      [1, 0, 0.16],
      [-1, 0, 0.28],
      [1.22, 0, 1.14],
      [-1.22, 0, 1.22],
      [0, 0, 1.78],
    ],
    follow: [
      [0.68, 0, 0.96],
      [-0.68, 0, 1.08],
      [1.12, 0, 1.9],
      [-1.12, 0, 2.02],
      [0, 0, 2.62],
    ],
  };
  const formation = formations[mode];
  return formation[Math.max(0, Math.min(index, formation.length - 1))];
}

function companionSeed(id: string, index: number) {
  let value = 2166136261 ^ index;
  for (let cursor = 0; cursor < id.length; cursor += 1) {
    value = Math.imul(value ^ id.charCodeAt(cursor), 16777619);
  }
  return value >>> 0;
}

function seededUnit(seed: number, step: number, salt: number) {
  let value = seed ^ Math.imul(step + 1, 0x9e3779b1) ^ salt;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296;
}

function flockTarget(
  member: LiveOutingFlockMember,
  mode: LiveOutingCompanionMode,
  elapsed: number,
) {
  const duration = 9 + seededUnit(member.seed, 0, 17) * 5;
  const phase = elapsed / duration + seededUnit(member.seed, 0, 31) * 2;
  const step = Math.floor(phase);
  const progress = phase - step;
  const eased = progress * progress * (3 - 2 * progress);
  const maxRadius = liveOutingFlockRadius(mode) - 0.2;
  const point = (targetStep: number) => {
    const angle = seededUnit(member.seed, targetStep, 47) * Math.PI * 2;
    const radius =
      1.12 + seededUnit(member.seed, targetStep, 83) * (maxRadius - 1.12);
    return {
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
    };
  };
  const from = point(step);
  const to = point(step + 1);
  return {
    x: from.x + (to.x - from.x) * eased,
    z: from.z + (to.z - from.z) * eased,
  };
}

export function createLiveOutingFlock(
  mode: LiveOutingCompanionMode,
  companionIds: readonly string[],
  outingVariation = 0,
): LiveOutingFlockMember[] {
  return companionIds.map((id, index) => {
    const [x, , z] = liveOutingCompanionPlacement(mode, index);
    return {
      id,
      seed: companionSeed(`${id}:${outingVariation}`, index),
      x,
      z,
      velocityX: 0,
      velocityZ: 0,
    };
  });
}

/**
 * A tiny deterministic flock simulation: independently changing goals create
 * chance encounters, while guide cohesion and pair separation keep the group
 * close and prevent companion meshes from touching.
 */
export function stepLiveOutingFlock(
  members: LiveOutingFlockMember[],
  mode: LiveOutingCompanionMode,
  elapsed: number,
  delta: number,
) {
  const stepSeconds = Math.min(Math.max(delta, 0), 0.08);
  if (stepSeconds <= 0 || members.length === 0) return members;

  const previous = members.map(({ x, z }) => ({ x, z }));
  members.forEach((member, index) => {
    const target = flockTarget(member, mode, elapsed);
    let desiredX = target.x - member.x;
    let desiredZ = target.z - member.z;
    const desiredLength = Math.hypot(desiredX, desiredZ);
    if (desiredLength > LIVE_OUTING_FLOCK_MAX_SPEED) {
      const scale = LIVE_OUTING_FLOCK_MAX_SPEED / desiredLength;
      desiredX *= scale;
      desiredZ *= scale;
    }

    members.forEach((other, otherIndex) => {
      if (index === otherIndex) return;
      const offsetX = member.x - other.x;
      const offsetZ = member.z - other.z;
      const distance = Math.max(Math.hypot(offsetX, offsetZ), 0.001);
      if (distance >= LIVE_OUTING_FLOCK_MIN_SEPARATION * 1.35) return;
      const pressure =
        ((LIVE_OUTING_FLOCK_MIN_SEPARATION * 1.35 - distance) /
          (LIVE_OUTING_FLOCK_MIN_SEPARATION * 1.35)) *
        0.32;
      desiredX += (offsetX / distance) * pressure;
      desiredZ += (offsetZ / distance) * pressure;
    });

    const ease = 1 - Math.exp(-stepSeconds * 1.8);
    member.velocityX += (desiredX - member.velocityX) * ease;
    member.velocityZ += (desiredZ - member.velocityZ) * ease;
    const speed = Math.hypot(member.velocityX, member.velocityZ);
    if (speed > LIVE_OUTING_FLOCK_MAX_SPEED) {
      const scale = LIVE_OUTING_FLOCK_MAX_SPEED / speed;
      member.velocityX *= scale;
      member.velocityZ *= scale;
    }
    member.x += member.velocityX * stepSeconds;
    member.z += member.velocityZ * stepSeconds;
  });

  const maxRadius = liveOutingFlockRadius(mode);
  for (let pass = 0; pass < 4; pass += 1) {
    members.forEach((member, index) => {
      members.slice(index + 1).forEach((other) => {
        let offsetX = other.x - member.x;
        let offsetZ = other.z - member.z;
        let distance = Math.hypot(offsetX, offsetZ);
        const resolvedSeparation = LIVE_OUTING_FLOCK_MIN_SEPARATION + 0.01;
        if (distance >= resolvedSeparation) return;
        if (distance < 0.001) {
          const angle = seededUnit(member.seed ^ other.seed, pass, 109) * Math.PI * 2;
          offsetX = Math.cos(angle);
          offsetZ = Math.sin(angle);
          distance = 1;
        }
        const push = (resolvedSeparation - distance) / 2;
        const pushX = (offsetX / distance) * push;
        const pushZ = (offsetZ / distance) * push;
        member.x -= pushX;
        member.z -= pushZ;
        other.x += pushX;
        other.z += pushZ;
      });
    });

    members.forEach((member) => {
      const guideDistance = Math.hypot(member.x, member.z);
      if (guideDistance < LIVE_OUTING_FLOCK_GUIDE_CLEARANCE) {
        if (guideDistance < 0.001) {
          const angle = seededUnit(member.seed, pass, 137) * Math.PI * 2;
          member.x = Math.cos(angle) * LIVE_OUTING_FLOCK_GUIDE_CLEARANCE;
          member.z = Math.sin(angle) * LIVE_OUTING_FLOCK_GUIDE_CLEARANCE;
        } else {
          const scale = LIVE_OUTING_FLOCK_GUIDE_CLEARANCE / guideDistance;
          member.x *= scale;
          member.z *= scale;
        }
      } else if (guideDistance > maxRadius) {
        const scale = maxRadius / guideDistance;
        member.x *= scale;
        member.z *= scale;
      }
    });
  }

  members.forEach((member, index) => {
    member.velocityX = (member.x - previous[index].x) / stepSeconds;
    member.velocityZ = (member.z - previous[index].z) / stepSeconds;
    const speed = Math.hypot(member.velocityX, member.velocityZ);
    if (speed > LIVE_OUTING_FLOCK_MAX_SPEED) {
      const scale = LIVE_OUTING_FLOCK_MAX_SPEED / speed;
      member.velocityX *= scale;
      member.velocityZ *= scale;
    }
  });
  return members;
}
