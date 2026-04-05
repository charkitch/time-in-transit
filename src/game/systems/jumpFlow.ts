import { useGameState } from '../GameState';
import type { JumpResult, SystemPayload } from '../engine';
import type { FlightModel } from '../flight/FlightModel';
import type { SceneRenderer } from '../rendering/SceneRenderer';

export function applyJumpExecution(params: {
  state: ReturnType<typeof useGameState.getState>;
  targetId: number;
  jumpCost: number;
  infiniteFuelDev: boolean;
  hyperspaceTankSize: number;
  jumpResult: JumpResult;
}): SystemPayload {
  const {
    state,
    targetId,
    jumpCost,
    infiniteFuelDev,
    hyperspaceTankSize,
    jumpResult,
  } = params;

  if (!infiniteFuelDev) {
    state.setFuel(state.player.fuel - jumpCost);
  } else if (state.player.fuel < hyperspaceTankSize) {
    state.setFuel(hyperspaceTankSize);
  }

  state.setClusterSummary(jumpResult.clusterSummary);
  state.setGalaxySimState(jumpResult.galaxySimState);
  state.setChainTargets(jumpResult.chainTargets);
  state.advanceGalaxyYear(jumpResult.yearsElapsed);
  state.addJumpLogEntry({
    fromSystemId: state.currentSystemId,
    toSystemId: targetId,
    yearsElapsed: jumpResult.yearsElapsed,
    galaxyYearAfter: jumpResult.newGalaxyYear,
  });

  state.setUIMode('hyperspace');
  return jumpResult.systemPayload;
}

export function applySystemArrival(params: {
  state: ReturnType<typeof useGameState.getState>;
  targetId: number;
  payload: SystemPayload;
  sceneRenderer: SceneRenderer;
  flightModel: FlightModel;
  discoverFactions: (
    state: ReturnType<typeof useGameState.getState>,
    factionState: { controllingFactionId: string | null; contestingFactionId: string | null },
  ) => void;
}): void {
  const {
    state,
    targetId,
    payload,
    sceneRenderer,
    flightModel,
    discoverFactions,
  } = params;

  const systemData = payload.system;
  const starData = state.cluster[targetId];

  state.setCurrentSystemPayload(targetId, payload);
  state.markVisited(targetId);

  sceneRenderer.loadSystem(
    systemData,
    targetId,
    state.galaxyYear,
    starData.name,
    payload.factionState,
    starData.x,
    starData.y,
  );

  sceneRenderer.shipGroup.position.set(0, 0, 8000);
  sceneRenderer.shipGroup.rotation.set(0, 0, 0);
  flightModel.reset(sceneRenderer.shipGroup.position);
  flightModel.velocity.set(0, 0, -150);

  if (payload.systemEntryDialog) {
    state.setPendingSystemEntryDialog(payload.systemEntryDialog);
  }

  const lines = [...payload.systemEntryLines];
  const battle = sceneRenderer.getFleetBattle();
  if (battle) {
    const battlePlanet = systemData.planets.find(p => p.id === battle.planetId);
    const planetName = battlePlanet ? battlePlanet.id.replace(`${targetId}-`, '') : 'UNKNOWN';
    lines.push(`FLEET ENGAGEMENT DETECTED NEAR ${planetName.toUpperCase()}`);
  }
  state.setSystemEntryLines(lines);

  const factionState = payload.factionState;
  discoverFactions(state, factionState);
  state.setFactionMemory(targetId, {
    factionId: factionState.controllingFactionId,
    contestingFactionId: factionState.contestingFactionId,
    galaxyYear: state.galaxyYear,
  });

  state.setUIMode('flight');
}
