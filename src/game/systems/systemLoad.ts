import { useGameState } from '../GameState';
import type { SolarSystemData, WasmPlayerState } from '../engine';
import type { SystemId } from '../types';
import { SceneRenderer } from '../rendering/SceneRenderer';

export function buildWasmPlayerState(
  state: ReturnType<typeof useGameState.getState>,
): WasmPlayerState {
  const cargo: Record<string, number> = {};
  for (const [k, v] of Object.entries(state.player.cargo)) {
    if (v) cargo[k] = v;
  }

  const cargoCostBasis: Record<string, number> = {};
  for (const [k, v] of Object.entries(state.player.cargoCostBasis)) {
    if (v !== undefined) cargoCostBasis[k] = v;
  }

  const playerChoices: WasmPlayerState['playerChoices'] = {};
  for (const [k, v] of Object.entries(state.playerChoices)) {
    playerChoices[Number(k) as SystemId] = {
      tradingReputation: v.tradingReputation,
      bannedGoods: v.bannedGoods,
      priceModifier: v.priceModifier,
      factionTag: v.factionTag,
      completedEventIds: v.completedEventIds,
      flags: v.flags,
      firedTriggers: v.firedTriggers,
    };
  }

  const factionMemory: WasmPlayerState['factionMemory'] = {};
  for (const [k, v] of Object.entries(state.factionMemory)) {
    factionMemory[Number(k) as SystemId] = {
      factionId: v.factionId,
      contestingFactionId: v.contestingFactionId,
      galaxyYear: v.galaxyYear,
    };
  }

  return {
    credits: state.player.credits,
    cargo,
    cargoCostBasis,
    fuel: state.player.fuel,
    shields: state.player.shields,
    heat: state.player.heat,
    currentSystemId: state.currentSystemId,
    visitedSystems: Array.from(state.visitedSystems),
    galaxyYear: state.galaxyYear,
    playerChoices,
    lastVisitYear: { ...state.lastVisitYear },
    knownFactions: Array.from(state.knownFactions),
    factionMemory,
    seenSystemDialogIds: [...state.seenSystemDialogIds],
    chainTargets: state.chainTargets,
    playerHistory: state.playerHistory,
  };
}

export function placeShipNearMainStation(sceneRenderer: SceneRenderer, systemData: SolarSystemData): void {
  const mainPlanetId = systemData.mainStationPlanetId;
  const mainPlanet = systemData.planets.find(p => p.id === mainPlanetId);
  if (!mainPlanet) return;

  const angle = mainPlanet.orbitPhase;
  const planetX = Math.cos(angle) * mainPlanet.orbitRadius;
  const planetZ = Math.sin(angle) * mainPlanet.orbitRadius;
  const radialX = Math.cos(angle);
  const radialZ = Math.sin(angle);
  const spawnDist = mainPlanet.radius * 2.2 + 45;
  const lateralOffset = -20;
  sceneRenderer.shipGroup.position.set(
    planetX + radialX * spawnDist + radialZ * lateralOffset,
    0,
    planetZ + radialZ * spawnDist - radialX * lateralOffset,
  );
  const safeApproachYawOffset = 0.36;
  sceneRenderer.shipGroup.rotation.set(0.1, Math.atan2(radialX, radialZ) + safeApproachYawOffset, 0);

  const stationEntity = sceneRenderer.getAllEntities().get(`station-${mainPlanetId}`);
  if (stationEntity) {
    stationEntity.orbitPhase = angle + Math.PI;
  }
}
