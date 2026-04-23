import type { StarSystemData, ClusterSystemSummary, ChainTarget, SystemSimState } from '../../game/engine';
import { HYPERSPACE } from '../../game/constants';
import { getFaction } from '../../game/data/factions';
import type { GalaxyYear, SystemId } from '../../game/types';
import {
  MAP_W, MAP_H,
  type MapViewport, type OffscreenIndicator,
  toCanvas, isOnCanvas, edgePointForOffscreen,
  STAR_TYPE_COLOR, applyAlpha,
} from './ClusterMapViewport';

export interface DrawClusterMapParams {
  ctx: CanvasRenderingContext2D;
  viewport: MapViewport;
  cluster: StarSystemData[];
  currentSystemId: SystemId;
  currentSys: StarSystemData;
  visitedSystems: Set<SystemId>;
  hyperspaceTarget: SystemId | null;
  reachableIds: Set<SystemId>;
  hovered: StarSystemData | null;
  knownFactions: Set<string>;
  lastVisitYear: Record<SystemId, GalaxyYear>;
  galaxyYear: GalaxyYear;
  galaxySimState: SystemSimState[] | null;
  clusterSummaryById: Map<SystemId, ClusterSystemSummary>;
  chainTargets: ChainTarget[];
}

export function drawClusterMap(params: DrawClusterMapParams): void {
  const { ctx, viewport, cluster, currentSys, hyperspaceTarget, chainTargets, galaxySimState } = params;

  // Lift per-system lookups to O(1) — drawSystems iterates all cluster systems.
  const chainTargetIds = new Set(chainTargets.map(ct => ct.targetSystemId));
  const simStateById = new Map((galaxySimState ?? []).map(s => [s.systemId, s]));

  ctx.clearRect(0, 0, MAP_W, MAP_H);
  ctx.fillStyle = '#010206';
  ctx.fillRect(0, 0, MAP_W, MAP_H);

  const fontScale = Math.min(viewport.zoom, 2);

  // Cluster boundary
  const [bx0, by0] = toCanvas(0, 0, viewport);
  const [bx1, by1] = toCanvas(100, 100, viewport);
  ctx.strokeStyle = 'rgba(51, 255, 136, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx0, by0, bx1 - bx0, by1 - by0);

  // Range ring
  const [cx, cy] = toCanvas(currentSys.x, currentSys.y, viewport);
  const rangePixelsX = (HYPERSPACE.maxRange / (viewport.maxX - viewport.minX)) * MAP_W;
  const rangePixelsY = (HYPERSPACE.maxRange / (viewport.maxY - viewport.minY)) * MAP_H;

  drawRangeRing(ctx, cx, cy, rangePixelsX, rangePixelsY);
  drawFocusVector(ctx, viewport, cx, cy, params);
  drawSystems(ctx, viewport, params, chainTargetIds, simStateById, fontScale);
  drawOffscreenIndicators(ctx, viewport, cluster, hyperspaceTarget, chainTargetIds, fontScale);
}

function drawRangeRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rangePixelsX: number,
  rangePixelsY: number,
): void {
  // Soft outer glow pass
  ctx.strokeStyle = 'rgba(68, 220, 255, 0.22)';
  ctx.lineWidth = 7;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rangePixelsX, rangePixelsY, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Crisp primary ring pass
  ctx.strokeStyle = 'rgba(102, 255, 204, 0.82)';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([10, 4]);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rangePixelsX, rangePixelsY, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawSystems(
  ctx: CanvasRenderingContext2D,
  viewport: MapViewport,
  params: DrawClusterMapParams,
  chainTargetIds: Set<SystemId>,
  simStateById: Map<SystemId, SystemSimState>,
  fontScale: number,
): void {
  const {
    cluster, currentSystemId, visitedSystems, hyperspaceTarget, reachableIds,
    hovered, knownFactions, lastVisitYear, galaxyYear,
    clusterSummaryById,
  } = params;

  for (const sys of cluster) {
    const [sx, sy] = toCanvas(sys.x, sys.y, viewport);
    if (sx < -30 || sx > MAP_W + 30 || sy < -30 || sy > MAP_H + 30) continue;
    const isReachable = reachableIds.has(sys.id);
    const isCurrent = sys.id === currentSystemId;
    const isTarget = sys.id === hyperspaceTarget;
    const isVisited = visitedSystems.has(sys.id);
    const summary = clusterSummaryById.get(sys.id);

    const color = STAR_TYPE_COLOR[sys.starType] ?? '#FFFFFF';
    const r = isCurrent ? 7 : isTarget ? 6 : 4;

    // Glow for target
    if (isTarget) {
      const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, 20);
      grad.addColorStop(0, 'rgba(68,204,255,0.5)');
      grad.addColorStop(1, 'rgba(68,204,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(sx, sy, 20, 0, Math.PI * 2);
      ctx.fill();
    }

    // Glow for hovered
    if (hovered?.id === sys.id && !isTarget && !isCurrent) {
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sx, sy, r + 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Staleness: visited stars dim over centuries
    let starFill: string;
    if (isCurrent) {
      starFill = '#33FF88';
    } else if (isTarget) {
      starFill = '#44CCFF';
    } else if (isReachable) {
      starFill = isVisited ? applyAlpha(color, 0.95) : applyAlpha(color, 0.9);
    } else if (isVisited) {
      const yearsSince = galaxyYear - (lastVisitYear[sys.id] ?? galaxyYear);
      const staleness = Math.max(0.3, 1 - yearsSince / 1000);
      starFill = applyAlpha(color, staleness);
    } else {
      starFill = `${color}66`;
    }

    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fillStyle = starFill;
    ctx.fill();

    if (isReachable && !isCurrent && !isTarget) {
      ctx.strokeStyle = 'rgba(102,255,204,0.65)';
      ctx.lineWidth = 1.25;
      ctx.stroke();
    } else if (!isVisited && !isReachable && !isCurrent) {
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Accretion ring indicator for black holes
    if (sys.starType === 'BH') {
      ctx.strokeStyle = 'rgba(255,102,34,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sx, sy, r + 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Faction color pips from Rust cluster summary
    if (summary) {
      const faction = getFaction(summary.controllingFactionId);
      if (faction && knownFactions.has(faction.id)) {
        const fc = `#${faction.color.toString(16).padStart(6, '0')}`;
        ctx.beginPath();
        ctx.arc(sx + r + 4, sy - r + 2, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = fc;
        ctx.fill();

        if (summary.contestingFactionId) {
          const cf = getFaction(summary.contestingFactionId);
          if (cf && knownFactions.has(cf.id)) {
            const cc = `#${cf.color.toString(16).padStart(6, '0')}`;
            ctx.beginPath();
            ctx.arc(sx + r + 4, sy - r + 8, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = cc;
            ctx.fill();
          }
        }
      }
    }

    // Simulation indicators (stability/prosperity)
    {
      const simState = simStateById.get(sys.id);
      if (simState) {
        const ix = sx - r - 5;
        const iy = sy + r + 2;

        if (simState.prosperity > 0.7) {
          ctx.fillStyle = '#44FF88';
          ctx.beginPath();
          ctx.moveTo(ix, iy + 4);
          ctx.lineTo(ix + 2, iy);
          ctx.lineTo(ix + 4, iy + 4);
          ctx.closePath();
          ctx.fill();
        } else if (simState.prosperity < 0.3) {
          ctx.fillStyle = '#FF4444';
          ctx.beginPath();
          ctx.moveTo(ix, iy);
          ctx.lineTo(ix + 2, iy + 4);
          ctx.lineTo(ix + 4, iy);
          ctx.closePath();
          ctx.fill();
        }

        if (simState.stability < 0.3) {
          ctx.fillStyle = '#FF4444';
          ctx.beginPath();
          ctx.arc(ix + 7, iy + 2, 1.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (simState.stability < 0.5) {
          ctx.fillStyle = '#FFAA44';
          ctx.beginPath();
          ctx.arc(ix + 7, iy + 2, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }

        const lastEvent = simState.recentEvents[simState.recentEvents.length - 1];
        if (lastEvent) {
          if (lastEvent.includes('Crisis')) {
            ctx.fillStyle = 'rgba(255,68,68,0.6)';
            ctx.font = `${Math.round(7 * fontScale)}px Courier New`;
            ctx.fillText('!', sx + r + Math.round(2 * fontScale), sy + r + Math.round(5 * fontScale));
          } else if (lastEvent.includes('Golden')) {
            ctx.fillStyle = 'rgba(255,215,0,0.6)';
            ctx.font = `${Math.round(7 * fontScale)}px Courier New`;
            ctx.fillText('★', sx + r + Math.round(2 * fontScale), sy + r + Math.round(5 * fontScale));
          }
        }
      }
    }

    // Chain target indicator
    if (chainTargetIds.has(sys.id)) {
      const dx = 3;
      const ix = sx - r - 8;
      const iy = sy - r + 1;
      ctx.fillStyle = 'rgba(255, 200, 80, 0.85)';
      ctx.beginPath();
      ctx.moveTo(ix, iy - dx);
      ctx.lineTo(ix + dx, iy);
      ctx.lineTo(ix, iy + dx);
      ctx.lineTo(ix - dx, iy);
      ctx.closePath();
      ctx.fill();
    }

    // Name label
    ctx.fillStyle = isCurrent
      ? '#33FF88'
      : isTarget
        ? '#44CCFF'
        : hovered?.id === sys.id
          ? '#FFFFFF'
          : 'rgba(140, 210, 190, 0.78)';
    ctx.font = `${Math.round(9 * fontScale)}px Courier New`;
    ctx.fillText(sys.name.toUpperCase(), sx + Math.round(8 * fontScale), sy + Math.round(4 * fontScale));
  }
}

function drawFocusVector(
  ctx: CanvasRenderingContext2D,
  viewport: MapViewport,
  cx: number,
  cy: number,
  params: DrawClusterMapParams,
): void {
  const { hovered, hyperspaceTarget, currentSystemId, cluster, reachableIds } = params;
  const hoveredReachable = hovered && hovered.id !== currentSystemId && reachableIds.has(hovered.id)
    ? hovered
    : null;
  const selectedTarget = hyperspaceTarget !== null ? cluster[hyperspaceTarget] : null;
  const focusSystem = hoveredReachable
    ?? (selectedTarget && selectedTarget.id !== currentSystemId && reachableIds.has(selectedTarget.id)
      ? selectedTarget
      : null);
  if (!focusSystem || focusSystem.id === currentSystemId || !reachableIds.has(focusSystem.id)) return;

  const [fx, fy] = toCanvas(focusSystem.x, focusSystem.y, viewport);

  ctx.strokeStyle = hoveredReachable?.id === focusSystem.id
    ? 'rgba(255,255,255,0.45)'
    : 'rgba(68,204,255,0.55)';
  ctx.lineWidth = 1.25;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(fx, fy);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawOffscreenIndicators(
  ctx: CanvasRenderingContext2D,
  viewport: MapViewport,
  cluster: StarSystemData[],
  hyperspaceTarget: SystemId | null,
  chainTargetIds: Set<SystemId>,
  fontScale: number,
): void {
  const indicators: OffscreenIndicator[] = [];
  const selectedTarget = hyperspaceTarget !== null ? cluster[hyperspaceTarget] : null;
  if (selectedTarget) {
    const [tx, ty] = toCanvas(selectedTarget.x, selectedTarget.y, viewport);
    if (!isOnCanvas(tx, ty)) {
      const [ix, iy] = edgePointForOffscreen(tx, ty);
      indicators.push({ id: `jump-${selectedTarget.id}`, x: ix, y: iy, color: '#44CCFF', label: 'TARGET' });
    }
  }

  for (const targetId of chainTargetIds) {
    if (selectedTarget && selectedTarget.id === targetId) continue;
    const sys = cluster[targetId];
    if (!sys) continue;
    const [tx, ty] = toCanvas(sys.x, sys.y, viewport);
    if (!isOnCanvas(tx, ty)) {
      const [ix, iy] = edgePointForOffscreen(tx, ty);
      indicators.push({ id: `chain-${targetId}`, x: ix, y: iy, color: 'rgba(255, 200, 80, 0.95)', label: 'CHAIN' });
    }
  }

  const centerX = MAP_W / 2;
  const centerY = MAP_H / 2;
  for (const indicator of indicators) {
    const angle = Math.atan2(indicator.y - centerY, indicator.x - centerX);
    const tipX = indicator.x;
    const tipY = indicator.y;
    const baseDist = 8;
    const wing = 5;
    const backX = tipX - Math.cos(angle) * baseDist;
    const backY = tipY - Math.sin(angle) * baseDist;
    const leftX = backX + Math.cos(angle + Math.PI / 2) * wing;
    const leftY = backY + Math.sin(angle + Math.PI / 2) * wing;
    const rightX = backX + Math.cos(angle - Math.PI / 2) * wing;
    const rightY = backY + Math.sin(angle - Math.PI / 2) * wing;

    ctx.fillStyle = indicator.color;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = `${Math.round(8 * fontScale)}px Courier New`;
    ctx.fillStyle = indicator.color;
    ctx.fillText(indicator.label, tipX + Math.round(6 * fontScale), tipY - Math.round(4 * fontScale));
  }
}
