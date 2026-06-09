import type { SceneEntity } from '../../../game/rendering/scene/types';
import type { FleetBattle } from '../../../game/mechanics/FleetBattleSystem';
import { drawTooltip } from '../drawHelpers';
import { findNearest } from '../viewport';
import { W, H, DESKTOP_PICK_RADIUS, MOBILE_DETAIL_LABEL_RANGE_MULTIPLIER, type ViewportState, type PickTarget, type MobileLabel, type SystemData } from '../types';
import { renderStar, renderPlanets, renderDysonShells, renderAsteroidBelt } from './renderBodies';
import { renderFleetBattle, renderSecretBases, renderNpcShips, renderFleetShips, renderPlayer } from './renderContacts';
import { drawMobileLabels } from './mobileLabels';

export interface SceneResult {
  pickTargets: PickTarget[];
  mobileLabels: MobileLabel[];
  hasNpcShips: boolean;
  hasBattle: boolean;
  nearestId: string | null;
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  viewport: ViewportState,
  currentSystem: SystemData,
  entities: Map<string, SceneEntity>,
  battle: FleetBattle | null,
  playerPos: { x: number; z: number },
  defaultRange: number,
  hoverPos: [number, number] | null,
  hoveredId: string | null,
  selectedId: string | null,
  targetId: string | null,
  time: number,
  isMobile: boolean,
): SceneResult {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#010206';
  ctx.fillRect(0, 0, W, H);

  const pickTargets: PickTarget[] = [];
  const mobileLabels: MobileLabel[] = [];
  const showDetailLabels = isMobile && viewport.range <= defaultRange * MOBILE_DETAIL_LABEL_RANGE_MULTIPLIER;

  const rc = {
    ctx, viewport, isMobile, showDetailLabels, time,
    selectedId, hoveredId, targetId, pickTargets, mobileLabels,
  };

  renderStar(rc, currentSystem, defaultRange);
  if (battle) renderFleetBattle(rc, battle);
  renderPlanets(rc, currentSystem, defaultRange, entities);
  renderDysonShells(rc, currentSystem, entities);
  renderAsteroidBelt(rc, currentSystem);
  renderSecretBases(rc, currentSystem);
  renderNpcShips(rc, entities);
  renderFleetShips(rc, entities);
  renderPlayer(rc, playerPos);

  const nearest = !isMobile && hoverPos
    ? findNearest(hoverPos[0], hoverPos[1], pickTargets, DESKTOP_PICK_RADIUS)
    : null;

  if (!isMobile && nearest && hoverPos) {
    drawTooltip(ctx, nearest.tooltip, hoverPos[0], hoverPos[1]);
  }

  if (isMobile) {
    drawMobileLabels(ctx, mobileLabels);
  }

  return {
    pickTargets,
    mobileLabels,
    hasNpcShips: pickTargets.some(t => t.id.startsWith('npc-')),
    hasBattle: battle !== null,
    nearestId: nearest?.id ?? null,
  };
}
