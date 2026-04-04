import { useGameState } from '../../game/GameState';
import { useState, useRef, useEffect } from 'react';
import { StatusBars, MobileStatusBars } from './StatusBars';
import { TargetIndicator } from './TargetIndicator';
import type { SceneEntity } from '../../game/rendering/SceneRenderer';
import { getFaction } from '../../game/data/factions';
import type { SecretBaseData } from '../../game/engine';
import { STAR_TYPE_DISPLAY, STAR_DESCRIPTIONS } from '../../game/constants';
import type { RuntimeProfile } from '../../runtime/runtimeProfile';
import { TouchFlightControls } from './TouchFlightControls';
import styles from './HUD.module.css';
import * as THREE from 'three';

interface HUDProps {
  getEntities: () => Map<string, SceneEntity>;
  getShipPos: () => THREE.Vector3;
  getCamera: () => THREE.PerspectiveCamera | null;
  runtimeProfile: RuntimeProfile | null;
  isLandscapePlayable: boolean;
  onTouchFlightInput: (input: { pitch: number; yaw: number; roll: number; thrust: number; boost: boolean }) => void;
  onDock: () => void;
  onHail: () => void;
  onTargetCycle: () => void;
  onClusterMap: () => void;
  onSystemMap: () => void;
  onMenu: () => void;
}

export function HUD({
  getEntities,
  getShipPos,
  getCamera,
  runtimeProfile,
  isLandscapePlayable,
  onTouchFlightInput,
  onDock,
  onHail,
  onTargetCycle,
  onClusterMap,
  onSystemMap,
  onMenu,
}: HUDProps) {
  const [isStarTooltipOpen, setIsStarTooltipOpen] = useState(false);
  const tooltipRef = useRef<HTMLSpanElement>(null);

  const player = useGameState(s => s.player);
  const cluster = useGameState(s => s.cluster);
  const currentSystemId = useGameState(s => s.currentSystemId);
  const alert = useGameState(s => s.ui.alertMessage);
  const hyperspaceTarget = useGameState(s => s.ui.hyperspaceTarget);
  const uiMode = useGameState(s => s.ui.mode);
  const canDockNow = useGameState(s => s.ui.canDockNow);
  const galaxyYear = useGameState(s => s.galaxyYear);
  const knownFactions = useGameState(s => s.knownFactions);
  const currentSystemPayload = useGameState(s => s.currentSystemPayload);

  useEffect(() => {
    if (!isStarTooltipOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setIsStarTooltipOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsStarTooltipOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isStarTooltipOpen]);

  const currentStar = cluster[currentSystemId];
  const targetStar = hyperspaceTarget !== null ? cluster[hyperspaceTarget] : null;

  const currentSystem = useGameState(s => s.currentSystem);
  const currentFaction = currentSystemPayload
    ? getFaction(currentSystemPayload.factionState.controllingFactionId)
    : undefined;
  const currentFactionKnown = currentFaction && knownFactions.has(currentFaction.id);

  // Target info
  const targetEntity = player.targetId ? getEntities().get(player.targetId) : null;
  let targetDist = 0;
  if (targetEntity) {
    const sp = getShipPos();
    targetDist = Math.round(sp.distanceTo(targetEntity.worldPos));
  }

  // Check if target is a secret base
  const targetSecretBase: SecretBaseData | undefined =
    player.targetId && currentSystem
      ? currentSystem.secretBases.find(b => b.id === player.targetId)
      : undefined;
  const targetDyson =
    player.targetId && currentSystem
      ? currentSystem.dysonShells.find(s => s.id === player.targetId)
      : undefined;
  const isMobileHUD = Boolean(runtimeProfile?.isMobile);
  const touchFlightEnabled = isMobileHUD && isLandscapePlayable && uiMode === 'flight';

  return (
    <div className={`${styles.hud} ${isMobileHUD ? styles.mobile : ''}`}>
      <TargetIndicator getEntities={getEntities} getCamera={getCamera} />
      {/* Crosshair */}
      <div className={styles.center}>
        <div className={styles.crosshair} />
      </div>

      {/* Alert */}
      {alert && <div className={styles.alertBanner}>{alert}</div>}

      {/* Top-left: system info + credits */}
      <div className={styles.topLeft}>
        <div className={styles.credits}>CR {player.credits.toLocaleString()}</div>
        <div style={{ fontSize: '11px', color: 'var(--color-hud-dim)', letterSpacing: '2px', marginBottom: '2px' }}>
          YEAR {galaxyYear.toLocaleString()}
        </div>
        <div className={styles.systemInfo}>
          <span className={styles.systemInfoText}>
            {currentStar?.name} · </span><span
            ref={tooltipRef}
            className={`${styles.starType} ${isStarTooltipOpen ? styles.active : ''}`}
            onClick={() => setIsStarTooltipOpen(!isStarTooltipOpen)}
          >
            {STAR_TYPE_DISPLAY[currentStar?.starType] ?? `${currentStar?.starType}-TYPE`}
            {currentStar && STAR_DESCRIPTIONS[currentStar.starType] && (
              <div className={`${styles.tooltip} ${isStarTooltipOpen ? styles.tooltipOpen : ''}`}>
                <button
                  className={styles.closeButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsStarTooltipOpen(false);
                  }}
                >
                  ×
                </button>
                {STAR_DESCRIPTIONS[currentStar.starType].desc}
                <a
                  href={STAR_DESCRIPTIONS[currentStar.starType].wiki}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.wikiLink}
                  onClick={(e) => e.stopPropagation()}
                >
                  LEARN MORE ON WIKIPEDIA
                </a>
              </div>
            )}
          </span><span className={styles.systemInfoText}> · {currentSystemPayload?.civState.economy ?? currentStar?.economy}
          {currentSystemPayload && (
            <span
              style={{
                color: currentFactionKnown && currentFaction
                  ? `#${currentFaction.color.toString(16).padStart(6, '0')}`
                  : 'var(--color-hud-dim)',
                marginLeft: '6px',
              }}
            >
              · {currentFactionKnown && currentFaction ? currentFaction.name.toUpperCase() : 'UNKNOWN'}
            </span>
          )}
          </span>
        </div>
        {targetStar && (
          <div style={{ color: 'var(--color-hyperspace-bright)', fontSize: '11px', marginTop: '4px' }}>
            JUMP TARGET: {targetStar.name}
          </div>
        )}
        {!isMobileHUD && (
          <div className={styles.controls}>
            W/S Pitch · A/D Roll · Q/E Yaw<br />
            SPACE Thrust · SHIFT Boost · TAB Target<br />
            F Dock · G Cluster Map · 1 System Map · J Jump · H Hail
          </div>
        )}
      </div>

      {/* Top-right: target info */}
      <div className={styles.topRight}>
        {targetEntity ? (
          <div className={styles.targetInfo}>
            {targetSecretBase ? (
              <>
                <div className={styles.targetLabel} style={{
                  color: targetSecretBase.type === 'asteroid' ? '#AA7744'
                    : targetSecretBase.type === 'oort_cloud' ? '#4488CC'
                    : '#8844FF',
                }}>SIGNAL</div>
                <div>{targetSecretBase.name.toUpperCase()}</div>
                <div style={{ color: 'var(--color-hud-dim)', fontSize: '11px' }}>
                  DIST: {targetDist} wu
                </div>
                <div style={{ fontSize: '10px', opacity: 0.6 }}>
                  TYPE: {targetSecretBase.type === 'asteroid' ? 'ASTEROID BASE'
                    : targetSecretBase.type === 'oort_cloud' ? 'OORT CLOUD BASE'
                    : 'VOID STATION'}
                </div>
                <div style={{
                  color: targetSecretBase.type === 'asteroid' ? '#AA7744'
                    : targetSecretBase.type === 'oort_cloud' ? '#4488CC'
                    : '#8844FF',
                  fontSize: '10px', marginTop: '4px', letterSpacing: '1px',
                }}>
                  F TO DOCK
                </div>
              </>
            ) : (
              <>
                <div className={styles.targetLabel}>TARGET</div>
                <div>{targetDyson ? targetDyson.name.toUpperCase() : targetEntity.id.replace(`${currentSystemId}-`, '')}</div>
                <div style={{ color: 'var(--color-hud-dim)', fontSize: '11px' }}>
                  DIST: {targetDist} wu
                </div>
                <div style={{ fontSize: '10px', opacity: 0.6 }}>
                  TYPE: {targetEntity.type === 'dyson_shell' ? 'DYSON SHELL' : targetEntity.type.toUpperCase()}
                </div>
              </>
            )}
            {targetEntity.type === 'npc_ship' && (
              <div style={{ color: 'var(--color-station)', fontSize: '10px', marginTop: '4px', letterSpacing: '1px' }}>
                H TO HAIL
              </div>
            )}
          </div>
        ) : (
          <div className={styles.targetInfo}>
            <div className={styles.targetLabel}>NO TARGET</div>
            <div style={{ fontSize: '10px', opacity: 0.5 }}>
              {isMobileHUD ? 'ACTIONS > TARGET' : 'TAB to cycle'}
            </div>
          </div>
        )}
      </div>

      {/* Bottom-left: status bars (desktop only) */}
      {!isMobileHUD && (
        <div className={styles.bottomLeft}>
          <StatusBars />
        </div>
      )}

      {/* Top-center: thin status bars (mobile only) */}
      {isMobileHUD && (
        <div className={styles.topCenter}>
          <MobileStatusBars />
        </div>
      )}

      {isMobileHUD && (
        <TouchFlightControls
          enabled={touchFlightEnabled}
          canDockNow={canDockNow}
          onInputChange={onTouchFlightInput}
          onDock={onDock}
          onHail={onHail}
          onTargetCycle={onTargetCycle}
          onClusterMap={onClusterMap}
          onSystemMap={onSystemMap}
          onMenu={onMenu}
        />
      )}
    </div>
  );
}
