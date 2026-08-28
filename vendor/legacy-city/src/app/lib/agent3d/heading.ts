import type { AgentSpecies } from './types';

const FULL_TURN = Math.PI * 2;

export function normalizeAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/**
 * Converts a screen-space route vector into a Three.js yaw for an object whose
 * canonical forward direction is -Z. Screen Y grows downward.
 */
export function sceneYawFromScreenVector(dx: number, dy: number) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 0.01) {
    return null;
  }
  return normalizeAngle(-Math.atan2(dy, dx) - Math.PI / 2);
}

/**
 * The generated species do not all share the same authored forward axis.
 * This correction makes each one face canonical -Z before route yaw is added.
 */
export function agentForwardCorrection(
  species: AgentSpecies,
  visualVersion?: string,
) {
  if (
    species === 'dachshund' &&
    visualVersion?.startsWith('tripo-dachshund-rigged-v3')
  ) {
    // This GLB's head sits on local +X, so +90° aligns it to canonical -Z.
    return Math.PI / 2;
  }
  if (species === 'dachshund' || species === 'tortoise') {
    return -Math.PI / 2;
  }
  if (
    species === 'pig' &&
    visualVersion?.startsWith('tripo-pig-hengdou-rigged-v2')
  ) {
    return -Math.PI / 2;
  }
  return Math.PI;
}

export function dampAngle(current: number, target: number, amount: number) {
  const shortestDelta = normalizeAngle(target - current);
  const next = current + shortestDelta * Math.min(1, Math.max(0, amount));
  // Avoid unbounded accumulated turns during long-running map sessions.
  return Math.abs(next) > FULL_TURN ? normalizeAngle(next) : next;
}
