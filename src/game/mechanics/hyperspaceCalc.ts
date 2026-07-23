import { HYPERSPACE } from '../constants';
import type { StarSystemData } from '../engine';

export function systemDistance(from: StarSystemData, to: StarSystemData): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

export function canJump(
  currentSystem: StarSystemData,
  targetSystem: StarSystemData,
  fuel: number,
): { ok: boolean; reason?: string } {
  if (systemDistance(currentSystem, targetSystem) > HYPERSPACE.maxRange) {
    return { ok: false, reason: 'Target out of range' };
  }

  const cost = jumpCost(currentSystem, targetSystem);
  if (fuel < cost) {
    return { ok: false, reason: 'Insufficient fuel' };
  }

  return { ok: true };
}

export function jumpCost(from: StarSystemData, to: StarSystemData): number {
  return Math.max(0.5, Math.min(3.0, systemDistance(from, to) * HYPERSPACE.fuelPerUnit));
}

export function getReachableSystems(
  currentSystem: StarSystemData,
  galaxy: StarSystemData[],
): StarSystemData[] {
  return galaxy.filter(s =>
    s.id !== currentSystem.id && systemDistance(currentSystem, s) <= HYPERSPACE.maxRange,
  );
}
