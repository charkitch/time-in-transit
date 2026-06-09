import { useRef, useEffect, useCallback, useState } from 'react';
import { useGameState } from '../../game/GameState';
import {
  W, H, MOBILE_BREAKPOINT, MOBILE_PICK_RADIUS, DESKTOP_PICK_RADIUS, MOBILE_DEFAULT_RANGE_MULTIPLIER,
  PLAYER_COLOR, PLANET_COLOR, MOON_COLOR, STATION_COLOR, DYSON_COLOR, SECRET_BASE_COLOR,
  NPC_COLOR_HUMAN, FLEET_BATTLE_COLOR,
  type SystemMapProps, type ViewportState, type PickTarget,
} from './types';
import { canvasCoordsFromClient, clampRange, computeDefaultRange, computeWorldBounds, findNearest } from './viewport';
import { getSelectedInfo } from './selection';
import { renderScene } from './render/renderScene';
import { useMapGestures } from './useMapGestures';
import styles from './SystemMap.module.css';

export function SystemMap({ onClose, getEntities, getFleetBattle, onTarget }: SystemMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pickTargetsRef = useRef<PickTarget[]>([]);

  const [hoverPos, setHoverPos] = useState<[number, number] | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hasNpcShips, setHasNpcShips] = useState(false);
  const [hasBattle, setHasBattle] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const currentSystem = useGameState(s => s.currentSystem);
  const currentSystemId = useGameState(s => s.currentSystemId);
  const cluster = useGameState(s => s.cluster);
  const starData = cluster[currentSystemId];
  const time = useGameState(s => s.time);
  const targetId = useGameState(s => s.player.targetId);
  const playerPos = useGameState(s => s.player.position);

  const defaultRange = currentSystem ? computeDefaultRange(currentSystem, playerPos) : 400;

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
    if (!isMobile) {
      setSelectedId(null);
    } else if (targetId) {
      setSelectedId(prev => prev ?? targetId);
    }
  }, [isMobile, targetId]);

  const getWorldBounds = useCallback(() => {
    if (!currentSystem) return null;
    return computeWorldBounds(currentSystem, getEntities(), getFleetBattle(), playerPos);
  }, [currentSystem, getEntities, getFleetBattle, playerPos]);

  const selectAtCanvasPoint = useCallback((mx: number, my: number) => {
    const hit = findNearest(mx, my, pickTargetsRef.current, isMobile ? MOBILE_PICK_RADIUS : DESKTOP_PICK_RADIUS);
    if (!hit) {
      if (isMobile) setSelectedId(null);
      return;
    }
    setSelectedId(hit.id);
    onTarget(hit.id);
  }, [isMobile, onTarget]);

  const [initialViewport] = useState<ViewportState>(() => ({
    centerX: playerPos.x,
    centerZ: playerPos.z,
    range: currentSystem
      ? clampRange(defaultRange * MOBILE_DEFAULT_RANGE_MULTIPLIER, defaultRange, currentSystem)
      : defaultRange * MOBILE_DEFAULT_RANGE_MULTIPLIER,
  }));

  const { viewport: mobileViewport, applyViewport, handlers, zoom } = useMapGestures({
    isMobile,
    currentSystem,
    defaultRange,
    getWorldBounds,
    onTap: selectAtCanvasPoint,
    initialViewport,
  });

  useEffect(() => {
    if (!currentSystem) return;
    const nextRange = clampRange(defaultRange * MOBILE_DEFAULT_RANGE_MULTIPLIER, defaultRange, currentSystem);
    applyViewport(playerPos.x, playerPos.z, nextRange);
    setSelectedId(targetId ?? null);
    setHoverPos(null);
    setHoveredId(null);
  }, [currentSystemId]); // intentionally reset only on system change

  const getViewport = useCallback((): ViewportState => {
    if (isMobile) return mobileViewport;
    return { centerX: playerPos.x, centerZ: playerPos.z, range: defaultRange };
  }, [defaultRange, isMobile, mobileViewport, playerPos.x, playerPos.z]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentSystem) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const viewport = getViewport();
    const result = renderScene(
      ctx, viewport, currentSystem, getEntities(), getFleetBattle(),
      playerPos, defaultRange, hoverPos, hoveredId, selectedId, targetId, time, isMobile,
    );

    pickTargetsRef.current = result.pickTargets;

    if (!isMobile && result.nearestId !== hoveredId) {
      setHoveredId(result.nearestId);
    }
    setHasNpcShips(prev => prev !== result.hasNpcShips ? result.hasNpcShips : prev);
    setHasBattle(prev => prev !== result.hasBattle ? result.hasBattle : prev);
  }, [currentSystem, defaultRange, getEntities, getFleetBattle, getViewport, hoverPos, hoveredId, isMobile, playerPos.x, playerPos.z, selectedId, targetId, time]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isMobile) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const [mx, my] = canvasCoordsFromClient(e.clientX, e.clientY, canvas);
    selectAtCanvasPoint(mx, my);
  }, [isMobile, selectAtCanvasPoint]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!isMobile) {
      setHoverPos(canvasCoordsFromClient(e.clientX, e.clientY, canvas));
      return;
    }
    handlers.onPointerMove(e);
  }, [handlers, isMobile]);

  const handlePointerLeave = useCallback(() => {
    if (isMobile) return;
    setHoverPos(null);
    setHoveredId(null);
  }, [isMobile]);

  const selectedInfo = currentSystem
    ? getSelectedInfo(selectedId ?? (isMobile ? targetId : null), currentSystem, starData?.name, getEntities())
    : null;

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.title}>{starData?.name.toUpperCase()} SYSTEM</div>
          {isMobile ? (
            <div className={styles.mobileActions}>
              <button type="button" className={styles.utilityBtn} onClick={() => zoom(0.82)} aria-label="Zoom in">+</button>
              <button type="button" className={styles.utilityBtn} onClick={() => zoom(1.22)} aria-label="Zoom out">-</button>
              <button type="button" className={styles.utilityBtn} onClick={onClose} aria-label="Close">&times;</button>
            </div>
          ) : null}
        </div>
        <div className={styles.content}>
          <div className={styles.mapViewport}>
            <canvas
              ref={canvasRef}
              width={W}
              height={H}
              data-testid="system-map-canvas"
              className={styles.canvas}
              style={{ cursor: !isMobile && hoveredId ? 'pointer' : 'default' }}
              onClick={handleCanvasClick}
              onPointerDown={handlers.onPointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlers.onPointerUp}
              onPointerCancel={handlers.onPointerCancel}
              onMouseLeave={handlePointerLeave}
            />
          </div>
          {isMobile ? (
            <div className={styles.selectionCard} data-testid="system-map-selection-card">
              {selectedInfo ? (
                <>
                  <div className={styles.selectionHeader}>
                    <span className={styles.selectionAccent} style={{ background: selectedInfo.accent }} />
                    <span className={styles.selectionTitle}>{selectedInfo.title}</span>
                    {targetId === (selectedId ?? targetId) ? (
                      <span className={styles.selectionBadge}>TARGET</span>
                    ) : null}
                  </div>
                  <div className={styles.selectionSubtitle}>{selectedInfo.subtitle}</div>
                </>
              ) : (
                <>
                  <div className={styles.selectionTitle}>Local chart</div>
                  <div className={styles.selectionSubtitle}>Tap a body to target it. Drag to pan. Pinch or use +/- to zoom.</div>
                </>
              )}
            </div>
          ) : null}
          <div className={styles.legend}>
            <span><span className={styles.dot} style={{ background: PLAYER_COLOR }} />You</span>
            <span><span className={styles.dot} style={{ background: PLANET_COLOR }} />Planet</span>
            <span><span className={styles.dot} style={{ background: MOON_COLOR }} />Moon</span>
            <span><span className={styles.dot} style={{ background: STATION_COLOR }} />Station</span>
            <span><span className={styles.dot} style={{ background: '#888877' }} />Asteroids</span>
            {currentSystem && currentSystem.dysonShells.length > 0 && (
              <span><span className={styles.dot} style={{ background: DYSON_COLOR }} />Dyson Shell</span>
            )}
            {currentSystem && currentSystem.secretBases.length > 0 && (
              <span><span className={styles.dot} style={{ background: SECRET_BASE_COLOR }} />Transmission Ghost</span>
            )}
            {hasNpcShips && (
              <span><span className={styles.dot} style={{ background: NPC_COLOR_HUMAN }} />Ship</span>
            )}
            {hasBattle && (
              <span><span className={styles.dot} style={{ background: FLEET_BATTLE_COLOR }} />Fleet Battle</span>
            )}
          </div>
        </div>
        {!isMobile ? (
          <button className={styles.closeBtn} onClick={onClose}>CLOSE</button>
        ) : null}
      </div>
    </div>
  );
}
