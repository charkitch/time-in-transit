import { useRef, useEffect, useState, useCallback } from 'react';
import { useGameState } from '../../game/GameState';
import { HyperspaceSystem } from '../../game/mechanics/HyperspaceSystem';
import { jumpYearsElapsed } from '../../game/mechanics/RelativisticTime';
import type { StarSystemData, ClusterSystemSummary } from '../../game/engine';
import { HYPERSPACE } from '../../game/constants';
import { getFaction } from '../../game/data/factions';
import styles from './ClusterMap.module.css';

const hyperspace = new HyperspaceSystem();
const MAP_W = 520;
const MAP_H = 420;
const MOBILE_BREAKPOINT = 820;
const MOBILE_CLUSTER_ZOOM = 4;

interface MapViewport {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  zoom: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampMobileCenter(x: number, y: number): { x: number; y: number } {
  const spanX = 100 / MOBILE_CLUSTER_ZOOM;
  const spanY = 100 / MOBILE_CLUSTER_ZOOM;
  const halfX = spanX / 2;
  const halfY = spanY / 2;
  return {
    x: clamp(x, halfX, 100 - halfX),
    y: clamp(y, halfY, 100 - halfY),
  };
}

function getViewport(centerX: number, centerY: number, isMobile: boolean): MapViewport {
  if (!isMobile) {
    return { minX: 0, maxX: 100, minY: 0, maxY: 100, zoom: 1 };
  }

  const { x, y } = clampMobileCenter(centerX, centerY);
  const spanX = 100 / MOBILE_CLUSTER_ZOOM;
  const spanY = 100 / MOBILE_CLUSTER_ZOOM;
  const halfX = spanX / 2;
  const halfY = spanY / 2;

  return {
    minX: x - halfX,
    maxX: x + halfX,
    minY: y - halfY,
    maxY: y + halfY,
    zoom: MOBILE_CLUSTER_ZOOM,
  };
}

function toCanvas(x: number, y: number, viewport: MapViewport): [number, number] {
  const nx = (x - viewport.minX) / (viewport.maxX - viewport.minX);
  const ny = (y - viewport.minY) / (viewport.maxY - viewport.minY);
  return [nx * MAP_W, ny * MAP_H];
}

function toWorld(px: number, py: number, viewport: MapViewport): [number, number] {
  return [
    viewport.minX + px * (viewport.maxX - viewport.minX),
    viewport.minY + py * (viewport.maxY - viewport.minY),
  ];
}

const STAR_TYPE_COLOR: Record<string, string> = {
  G: '#FFEE88', K: '#FFAA44', M: '#FF6633', F: '#FFFFFF', A: '#AABBFF',
  WD: '#F0F0FF', HE: '#88CCAA', NS: '#CCDDFF', PU: '#44AAFF', XB: '#FF6688',
  MG: '#DD44FF', BH: '#220022', XBB: '#FF4466', SGR: '#FFAA22',
};

function applyAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return `${hex}${a}`;
}

interface ClusterMapProps {
  onClose: () => void;
  onJump: () => void;
}

export function ClusterMap({ onClose, onJump }: ClusterMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panPointerIdRef = useRef<number | null>(null);
  const panStartPixelRef = useRef<{ x: number; y: number } | null>(null);
  const panStartCenterRef = useRef<{ x: number; y: number } | null>(null);
  const didPanRef = useRef(false);
  const [isMobile, setIsMobile] = useState(false);
  const cluster = useGameState(s => s.cluster);
  const currentSystemId = useGameState(s => s.currentSystemId);
  const visitedSystems = useGameState(s => s.visitedSystems);
  const player = useGameState(s => s.player);
  const hyperspaceTarget = useGameState(s => s.ui.hyperspaceTarget);
  const setHyperspaceTarget = useGameState(s => s.setHyperspaceTarget);
  const galaxyYear = useGameState(s => s.galaxyYear);
  const jumpLog = useGameState(s => s.jumpLog);
  const knownFactions = useGameState(s => s.knownFactions);
  const lastVisitYear = useGameState(s => s.lastVisitYear);
  const galaxySimState = useGameState(s => s.galaxySimState);
  const clusterSummary = useGameState(s => s.clusterSummary);

  const currentSys = cluster[currentSystemId];
  const reachable = hyperspace.getReachableSystems(currentSys, cluster);
  const reachableIds = new Set(reachable.map(s => s.id));
  const clusterSummaryById = new Map<number, ClusterSystemSummary>(
    clusterSummary.map(summary => [summary.id, summary]),
  );

  const [hovered, setHovered] = useState<StarSystemData | null>(null);
  const [mobileCenter, setMobileCenter] = useState<{ x: number; y: number }>({
    x: currentSys.x,
    y: currentSys.y,
  });

  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    setMobileCenter({ x: currentSys.x, y: currentSys.y });
    setHovered(null);
  }, [currentSystemId, currentSys.x, currentSys.y]);

  // Compute years-elapsed preview for hovered/targeted system
  const previewSys = hovered ?? (hyperspaceTarget !== null ? cluster[hyperspaceTarget] : null);
  const previewYears = previewSys && previewSys.id !== currentSystemId
    ? (() => {
        const dx = previewSys.x - currentSys.x;
        const dy = previewSys.y - currentSys.y;
        return jumpYearsElapsed(Math.sqrt(dx * dx + dy * dy));
      })()
    : null;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const viewport = isMobile
      ? getViewport(mobileCenter.x, mobileCenter.y, true)
      : getViewport(currentSys.x, currentSys.y, false);

    ctx.clearRect(0, 0, MAP_W, MAP_H);
    ctx.fillStyle = '#010206';
    ctx.fillRect(0, 0, MAP_W, MAP_H);

    // Range ring
    const [cx, cy] = toCanvas(currentSys.x, currentSys.y, viewport);
    const rangePixels = (HYPERSPACE.maxRange / (viewport.maxX - viewport.minX)) * MAP_W;

    // Soft outer glow pass so the range ring stays readable against dense stars/lines.
    ctx.strokeStyle = 'rgba(68, 220, 255, 0.22)';
    ctx.lineWidth = 7;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(cx, cy, rangePixels, 0, Math.PI * 2);
    ctx.stroke();

    // Crisp primary ring pass with a higher-contrast dash pattern.
    ctx.strokeStyle = 'rgba(102, 255, 204, 0.82)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([10, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, rangePixels, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Systems
    for (const sys of cluster) {
      const [sx, sy] = toCanvas(sys.x, sys.y, viewport);
      if (sx < -30 || sx > MAP_W + 30 || sy < -30 || sy > MAP_H + 30) continue;
      const isReachable = reachableIds.has(sys.id);
      const isCurrent = sys.id === currentSystemId;
      const isTarget = sys.id === hyperspaceTarget;
      const isVisited = visitedSystems.has(sys.id);
      const summary = clusterSummaryById.get(sys.id);

      // Line to reachable
      if (isReachable) {
        ctx.strokeStyle = 'rgba(51,255,136,0.15)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(sx, sy);
        ctx.stroke();
      }

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

      if (!isVisited && !isReachable && !isCurrent) {
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
      if (galaxySimState) {
        const simState = galaxySimState.find(s => s.systemId === sys.id);
        if (simState) {
          const ix = sx - r - 5;
          const iy = sy + r + 2;

          // Prosperity indicator: green up-arrow or red down-arrow
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

          // Stability indicator: small dot (green = stable, orange = shaky, red = chaos)
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

          // Crisis/golden age marker from recent events
          const lastEvent = simState.recentEvents[simState.recentEvents.length - 1];
          if (lastEvent) {
            if (lastEvent.includes('Crisis')) {
              ctx.fillStyle = 'rgba(255,68,68,0.6)';
              ctx.font = '7px Courier New';
              ctx.fillText('!', sx + r + 2, sy + r + 5);
            } else if (lastEvent.includes('Golden')) {
              ctx.fillStyle = 'rgba(255,215,0,0.6)';
              ctx.font = '7px Courier New';
              ctx.fillText('★', sx + r + 2, sy + r + 5);
            }
          }
        }
      }

      // Name label
      if (isCurrent || isTarget || hovered?.id === sys.id) {
        ctx.fillStyle = isCurrent ? '#33FF88' : isTarget ? '#44CCFF' : '#FFFFFF';
        ctx.font = '10px Courier New';
        ctx.fillText(sys.name.toUpperCase(), sx + 8, sy + 4);
      }
    }
  }, [cluster, currentSystemId, visitedSystems, hyperspaceTarget, reachableIds, hovered, currentSys, knownFactions, lastVisitYear, galaxyYear, galaxySimState, clusterSummaryById, isMobile, mobileCenter.x, mobileCenter.y]);

  useEffect(() => { draw(); }, [draw]);

  const getMapPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const viewport = isMobile
      ? getViewport(mobileCenter.x, mobileCenter.y, true)
      : getViewport(currentSys.x, currentSys.y, false);
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const [mx, my] = toWorld(px, py, viewport);
    const pickRadius = (isMobile ? 28 : 18) * (viewport.maxX - viewport.minX) / MAP_W;

    return {
      mx,
      my,
      pickRadius,
    };
  };

  const pickNearestSystem = (mx: number, my: number, pickRadius: number): StarSystemData | null => {
    let nearest: StarSystemData | null = null;
    let nearestDist = Infinity;
    for (const sys of cluster) {
      const d = Math.hypot(sys.x - mx, sys.y - my);
      if (d < nearestDist && d < pickRadius) {
        nearest = sys;
        nearestDist = d;
      }
    }
    return nearest;
  };

  const selectAtPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { mx, my, pickRadius } = getMapPointer(e);
    const nearest = pickNearestSystem(mx, my, pickRadius);
    if (nearest && nearest.id !== currentSystemId && reachableIds.has(nearest.id)) {
      setHyperspaceTarget(nearest.id);
    }
  };

  const handleCanvasDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isMobile) {
      selectAtPointer(e);
      return;
    }

    const rect = canvasRef.current!.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    panPointerIdRef.current = e.pointerId;
    panStartPixelRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    panStartCenterRef.current = {
      x: mobileCenter.x,
      y: mobileCenter.y,
    };
    didPanRef.current = false;
  };

  const handleCanvasMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isMobile && panPointerIdRef.current === e.pointerId && panStartPixelRef.current && panStartCenterRef.current) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const dx = px - panStartPixelRef.current.x;
      const dy = py - panStartPixelRef.current.y;
      const viewport = getViewport(panStartCenterRef.current.x, panStartCenterRef.current.y, true);
      const worldPerPxX = (viewport.maxX - viewport.minX) / rect.width;
      const worldPerPxY = (viewport.maxY - viewport.minY) / rect.height;
      const moved = Math.hypot(dx, dy);
      if (moved > 6) didPanRef.current = true;

      const next = clampMobileCenter(
        panStartCenterRef.current.x - dx * worldPerPxX,
        panStartCenterRef.current.y - dy * worldPerPxY,
      );
      setMobileCenter(next);
      return;
    }

    let nearest: StarSystemData | null = null;
    const { mx, my, pickRadius } = getMapPointer(e);
    nearest = pickNearestSystem(mx, my, pickRadius);
    setHovered(nearest);
  };

  const handleCanvasUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isMobile) return;
    if (panPointerIdRef.current !== e.pointerId) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (!didPanRef.current) {
      selectAtPointer(e);
    }
    panPointerIdRef.current = null;
    panStartPixelRef.current = null;
    panStartCenterRef.current = null;
    didPanRef.current = false;
  };

  const handleCanvasCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isMobile && panPointerIdRef.current === e.pointerId) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      panPointerIdRef.current = null;
      panStartPixelRef.current = null;
      panStartCenterRef.current = null;
      didPanRef.current = false;
    }
  };

  const selectedSys = hyperspaceTarget !== null ? cluster[hyperspaceTarget] : null;
  const selectedSummary = selectedSys ? clusterSummaryById.get(selectedSys.id) : undefined;
  const jumpCost = selectedSys ? hyperspace.jumpCost(currentSys, selectedSys) : 0;
  const canJump = selectedSys
    ? hyperspace.canJump(currentSys, selectedSys, player.fuel).ok
    : false;

  const handleJump = () => {
    if (!canJump) return;
    onJump();
  };

  // Jump log: show system names
  const recentJumps = jumpLog.slice(0, 5);

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.panel}>
        <div className={styles.title}>
          CLUSTER CHART
          <span style={{ fontSize: '11px', letterSpacing: '2px', color: 'var(--color-hud-dim)', marginLeft: '16px' }}>
            YEAR {galaxyYear.toLocaleString()}
          </span>
        </div>
        <canvas
          ref={canvasRef}
          width={MAP_W}
          height={MAP_H}
          className={styles.canvas}
          onPointerDown={handleCanvasDown}
          onPointerMove={handleCanvasMove}
          onPointerUp={handleCanvasUp}
          onPointerCancel={handleCanvasCancel}
          onPointerLeave={() => setHovered(null)}
        />
        <div className={styles.info}>
          <div>
            <div>CURRENT: <span className={styles.selected}>{currentSys.name.toUpperCase()}</span></div>
            {selectedSys && (
              <div style={{ marginTop: '4px' }}>
                TARGET: <span className={styles.selected}>{selectedSys.name.toUpperCase()}</span>
                <br />
                FUEL COST: {jumpCost.toFixed(1)} / {player.fuel.toFixed(1)}
                <br />
                {(() => {
                  const dx = selectedSys.x - currentSys.x;
                  const dy = selectedSys.y - currentSys.y;
                  const yrs = jumpYearsElapsed(Math.sqrt(dx * dx + dy * dy));
                  return <span style={{ color: 'var(--color-warning)' }}>+{yrs.toLocaleString()} YRS</span>;
                })()}
                <br />
                TECH LV: {selectedSummary?.techLevel ?? selectedSys.techLevel} · {selectedSummary?.economy ?? selectedSys.economy}
                {galaxySimState && (() => {
                  const sim = galaxySimState.find(s => s.systemId === selectedSys.id);
                  if (!sim) return null;
                  const stabilityLabel = sim.stability > 0.7 ? 'STABLE' : sim.stability > 0.4 ? 'UNSETTLED' : 'CHAOS';
                  const prosperityLabel = sim.prosperity > 0.7 ? 'BOOMING' : sim.prosperity > 0.4 ? 'MODERATE' : 'DEPRESSED';
                  const sColor = sim.stability > 0.7 ? '#44FF88' : sim.stability > 0.4 ? '#FFAA44' : '#FF4444';
                  const pColor = sim.prosperity > 0.7 ? '#44FF88' : sim.prosperity > 0.4 ? '#FFAA44' : '#FF4444';
                  return <>
                    <br />
                    <span style={{ color: sColor }}>{stabilityLabel}</span>
                    {' · '}
                    <span style={{ color: pColor }}>{prosperityLabel}</span>
                  </>;
                })()}
                {visitedSystems.has(selectedSys.id) && lastVisitYear[selectedSys.id] != null && (() => {
                  const seen = lastVisitYear[selectedSys.id];
                  const ago = galaxyYear - seen;
                  return <>
                    <br />
                    <span style={{ color: 'var(--color-hud-dim)' }}>
                      LAST SEEN: YEAR {seen.toLocaleString()}{ago > 0 ? ` (${ago.toLocaleString()} YRS AGO)` : ''}
                    </span>
                  </>;
                })()}
                {(() => {
                  if (!selectedSummary) return null;
                  const f = getFaction(selectedSummary.controllingFactionId);
                  if (!f || !knownFactions.has(f.id)) return null;
                  const fc = `#${f.color.toString(16).padStart(6, '0')}`;
                  return <>
                    <br />
                    <span style={{ color: 'var(--color-hud-dim)' }}>{selectedSummary.politics.toUpperCase()}</span>
                    <br />
                    <span style={{ color: fc }}>{f.name.toUpperCase()}</span>
                    {selectedSummary.contestingFactionId && (() => {
                      const cf = getFaction(selectedSummary.contestingFactionId);
                      if (!cf || !knownFactions.has(cf.id)) return null;
                      const cc = `#${cf.color.toString(16).padStart(6, '0')}`;
                      return <span style={{ color: cc }}> vs {cf.name.toUpperCase()}</span>;
                    })()}
                  </>;
                })()}
              </div>
            )}
            {previewYears !== null && !selectedSys && hovered && reachableIds.has(hovered.id) && (
              <div style={{ marginTop: '4px', color: 'var(--color-warning)', fontSize: '11px' }}>
                HOVER: {hovered.name.toUpperCase()} +{previewYears.toLocaleString()} YRS
                {visitedSystems.has(hovered.id) && lastVisitYear[hovered.id] != null && (() => {
                  const ago = galaxyYear - lastVisitYear[hovered.id];
                  return ago > 0
                    ? <span style={{ color: 'var(--color-hud-dim)', marginLeft: 6 }}>SEEN {ago.toLocaleString()}Y AGO</span>
                    : null;
                })()}
                {(() => {
                  const hoveredSummary = clusterSummaryById.get(hovered.id);
                  if (!hoveredSummary) return null;
                  const f = getFaction(hoveredSummary.controllingFactionId);
                  if (!f || !knownFactions.has(f.id)) return null;
                  const fc = `#${f.color.toString(16).padStart(6, '0')}`;
                  return <span style={{ color: fc, marginLeft: 6 }}>{f.name.toUpperCase()}</span>;
                })()}
              </div>
            )}
          </div>
          <div>
            {recentJumps.length > 0 && (
              <div style={{ fontSize: '10px', opacity: 0.7 }}>
                <div style={{ marginBottom: '3px', letterSpacing: '1px' }}>RECENT JUMPS</div>
                {recentJumps.map((entry, i) => {
                  const fromName = cluster[entry.fromSystemId]?.name ?? '?';
                  const toName = cluster[entry.toSystemId]?.name ?? '?';
                  return (
                    <div key={i} style={{ marginBottom: '2px' }}>
                      {fromName.toUpperCase()} → {toName.toUpperCase()}
                      <span style={{ color: 'var(--color-warning)', marginLeft: 4 }}>
                        +{entry.yearsElapsed.toLocaleString()}Y
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className={styles.hint} style={{ marginTop: recentJumps.length > 0 ? '8px' : 0 }}>
              {isMobile ? 'Drag to pan local stars' : 'Tap to select target'}<br />
              Use close button to return<br />
              Tap JUMP to initiate
            </div>
          </div>
        </div>
        <button
          className={styles.jumpBtn}
          disabled={!canJump}
          onClick={handleJump}
        >
          {canJump ? `JUMP TO ${selectedSys?.name.toUpperCase()}` : selectedSys ? 'INSUFFICIENT FUEL' : 'SELECT TARGET'}
        </button>
      </div>
    </div>
  );
}
