import { HYPERSPACE } from '../constants';
import type { StarSystemData } from '../engine';

export class HyperspaceSystem {
  canJump(
    currentSystem: StarSystemData,
    targetSystem: StarSystemData,
    fuel: number,
  ): { ok: boolean; reason?: string } {
    const dx = targetSystem.x - currentSystem.x;
    const dy = targetSystem.y - currentSystem.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > HYPERSPACE.maxRange) {
      return { ok: false, reason: 'Target out of range' };
    }

    const cost = this.jumpCost(currentSystem, targetSystem);
    if (fuel < cost) {
      return { ok: false, reason: 'Insufficient fuel' };
    }

    return { ok: true };
  }

  jumpCost(from: StarSystemData, to: StarSystemData): number {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return Math.max(0.5, Math.min(3.0, dist * HYPERSPACE.fuelPerUnit));
  }

  getReachableSystems(
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
}
