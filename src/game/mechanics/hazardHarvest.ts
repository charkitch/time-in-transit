import type { GoodName } from '../constants';
import type { CargoHarvest } from '../engine';

interface TimedHarvestParams {
  active: boolean;
  wasActive: boolean;
  timer: number;
  interval: number;
  immediateOnEntry?: boolean;
  good: GoodName;
  message: string;
  collectedThisPass: boolean;
  cargoHarvests: CargoHarvest[];
  canHarvest: (good: GoodName) => boolean;
}

interface TimedHarvestResult {
  active: boolean;
  timer: number;
  collectedThisPass: boolean;
  infoMessage: string | null;
}

export function runTimedHarvest(params: TimedHarvestParams): TimedHarvestResult {
  const {
    active, wasActive, interval, immediateOnEntry = false,
    good, message, cargoHarvests, canHarvest,
  } = params;
  let { timer, collectedThisPass } = params;

  if (!active) {
    return {
      active: false,
      timer: 0,
      collectedThisPass: false,
      infoMessage: null,
    };
  }

  const entering = !wasActive;
  if (entering && immediateOnEntry && canHarvest(good)) {
    cargoHarvests.push({ good, qty: 1 });
    collectedThisPass = true;
  }

  timer += 0;
  while (timer >= interval && canHarvest(good)) {
    cargoHarvests.push({ good, qty: 1 });
    timer -= interval;
    collectedThisPass = true;
  }

  return {
    active: true,
    timer,
    collectedThisPass,
    infoMessage: collectedThisPass ? message : null,
  };
}

export function runEntryHarvest(params: {
  active: boolean;
  wasActive: boolean;
  good: GoodName;
  message: string;
  collectedThisPass: boolean;
  cargoHarvests: CargoHarvest[];
  canHarvest: (good: GoodName) => boolean;
}): { active: boolean; collectedThisPass: boolean; infoMessage: string | null } {
  const { active, wasActive, good, message, cargoHarvests, canHarvest } = params;
  let { collectedThisPass } = params;

  if (!active) {
    return { active: false, collectedThisPass: false, infoMessage: null };
  }

  if (!wasActive && canHarvest(good)) {
    cargoHarvests.push({ good, qty: 1 });
    collectedThisPass = true;
  }

  return {
    active: true,
    collectedThisPass,
    infoMessage: collectedThisPass ? message : null,
  };
}
