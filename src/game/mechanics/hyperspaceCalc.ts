import { HYPERSPACE } from '../constants';
import type { StarSystemData } from '../engine';

export function canJump(
  currentSystem: StarSystemData,
  targetSystem: StarSystemData,
  fuel: number,
): { ok: boolean; reason?: string } {
  if (!import.meta.env.DEV && targetSystem.starType === 'IRON') {
    return { ok: false, reason: 'Unknown region — navigation unavailable' };
  }

  const dx = targetSystem.x - currentSystem.x;
  const dy = targetSystem.y - currentSystem.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > HYPERSPACE.maxRange) {
    return { ok: false, reason: 'Target out of range' };
  }

  const cost = jumpCost(currentSystem, targetSystem);
  if (fuel < cost) {
    return { ok: false, reason: 'Insufficient fuel' };
  }

  return { ok: true };
}

export function jumpCost(from: StarSystemData, to: StarSystemData): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return Math.max(0.5, Math.min(3.0, dist * HYPERSPACE.fuelPerUnit));
}

export function getReachableSystems(
  currentSystem: StarSystemData,
  galaxy: StarSystemData[],
): StarSystemData[] {
  return galaxy.filter(s => {
    if (s.id === currentSystem.id) return false;
    const dx = s.x - currentSystem.x;
    const dy = s.y - currentSystem.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist <= HYPERSPACE.maxRange;
  });
}
