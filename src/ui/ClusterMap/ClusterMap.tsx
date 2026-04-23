import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useGameState } from '../../game/GameState';
import { canJump as checkCanJump, jumpCost as calcJumpCost, getReachableSystems } from '../../game/mechanics/hyperspaceCalc';
import { jumpYearsElapsed } from '../../game/mechanics/RelativisticTime';
import type { StarSystemData, ClusterSystemSummary, SystemSimState } from '../../game/engine';
import type { SystemId } from '../../game/types';
import { POLITICAL_TYPE_DISPLAY } from '../../game/constants';
import { getFaction } from '../../game/data/factions';
import styles from './ClusterMap.module.css';
import {
  MAP_W, MAP_H, MOBILE_BREAKPOINT,
  getViewport, toWorld, clampMobileCenter,
} from './ClusterMapViewport';
import { drawClusterMap } from './ClusterMapRendering';

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
  const chainTargets = useGameState(s => s.chainTargets);

  const currentSys = cluster[currentSystemId];
  const reachableIds = useMemo(
    () => new Set(getReachableSystems(currentSys, cluster).map(s => s.id)),
    [currentSys, cluster],
  );
  const clusterSummaryById = useMemo(
    () => new Map<SystemId, ClusterSystemSummary>(
      clusterSummary.map(summary => [summary.id, summary]),
    ),
    [clusterSummary],
  );
  const simStateById = useMemo(
    () => new Map<SystemId, SystemSimState>((galaxySimState ?? []).map(s => [s.systemId, s])),
    [galaxySimState],
  );

  const [hovered, setHovered] = useState<StarSystemData | null>(null);
  const [mobileCenter, setMobileCenter] = useState<{ x: number; y: number }>({
    x: currentSys.x,
    y: currentSys.y,
  });

  useEffect(() => {
    const media = window.matchMedia(
      `(max-width: ${MOBILE_BREAKPOINT}px), (hover: none) and (pointer: coarse)`,
    );
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

    drawClusterMap({
      ctx, viewport, cluster, currentSystemId, currentSys,
      visitedSystems, hyperspaceTarget, reachableIds, hovered,
      knownFactions, lastVisitYear, galaxyYear, galaxySimState,
      clusterSummaryById, chainTargets,
    });
  }, [cluster, currentSystemId, visitedSystems, hyperspaceTarget, reachableIds, hovered, currentSys, knownFactions, lastVisitYear, galaxyYear, galaxySimState, clusterSummaryById, chainTargets, isMobile, mobileCenter.x, mobileCenter.y]);

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
  const jumpCost = selectedSys ? calcJumpCost(currentSys, selectedSys) : 0;
  const canJump = selectedSys
    ? checkCanJump(currentSys, selectedSys, player.fuel).ok
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
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">&times;</button>
        <div className={styles.title}>
          CLUSTER CHART
          <span style={{ fontSize: '11px', letterSpacing: '2px', color: 'var(--color-hud-dim)', marginLeft: '16px' }}>
            YEAR {galaxyYear.toLocaleString()}
          </span>
        </div>
        <div className={styles.content}>
          <div className={styles.canvasViewport}>
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
          </div>
          <div className={styles.info}>
            <div className={styles.infoPrimary}>
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
                  {(() => {
                    const sim = simStateById.get(selectedSys.id);
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
                      <span style={{ color: 'var(--color-hud-dim)' }}>{(POLITICAL_TYPE_DISPLAY[selectedSummary.politics] ?? selectedSummary.politics).toUpperCase()}</span>
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
            <div className={styles.infoSecondary}>
              {recentJumps.length > 0 && (
                <div className={styles.recentJumps}>
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
                {isMobile ? 'Drag to pan local stars' : 'Click a star inside the ring to target'}<br />
                {isMobile ? 'Tap JUMP to initiate' : 'Click outside or ✕ to close'}
              </div>
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
