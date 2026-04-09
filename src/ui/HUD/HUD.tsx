import { useGameState } from '../../game/GameState';
import { useState, useRef, useEffect } from 'react';
import { StatusBars, MobileStatusBars } from './StatusBars';
import { TargetIndicator } from './TargetIndicator';
import type { SceneEntity } from '../../game/rendering/SceneRenderer';
import { getFaction } from '../../game/data/factions';
import type { SecretBaseData } from '../../game/engine';
import { STAR_TYPE_DISPLAY, STAR_DESCRIPTIONS, ECONOMY_DESCRIPTIONS, SCAN_INTEL_MAX_AGE_YEARS } from '../../game/constants';
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
  onLand: () => void;
  onScan: () => void;
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
  onLand,
  onScan,
  onTargetCycle,
  onClusterMap,
  onSystemMap,
  onMenu,
}: HUDProps) {
  const [isStarTooltipOpen, setIsStarTooltipOpen] = useState(false);
  const [isEconTooltipOpen, setIsEconTooltipOpen] = useState(false);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const econTooltipRef = useRef<HTMLSpanElement>(null);

  const player = useGameState(s => s.player);
  const cluster = useGameState(s => s.cluster);
  const currentSystemId = useGameState(s => s.currentSystemId);
  const alert = useGameState(s => s.ui.alertMessage);
  const hyperspaceTarget = useGameState(s => s.ui.hyperspaceTarget);
  const scanProgress = useGameState(s => s.ui.scanProgress);
  const scanLabel = useGameState(s => s.ui.scanLabel);
  const uiMode = useGameState(s => s.ui.mode);
  const canDockNow = useGameState(s => s.ui.canDockNow);
  const canLandNow = useGameState(s => s.ui.canLandNow);
  const canScanNow = useGameState(s => s.ui.canScanNow);
  const canHailNow = useGameState(s => s.ui.canHailNow);
  const galaxyYear = useGameState(s => s.galaxyYear);
  const knownFactions = useGameState(s => s.knownFactions);
  const currentSystemPayload = useGameState(s => s.currentSystemPayload);
  const scannedHosts = useGameState(s => s.scannedHosts);

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

  useEffect(() => {
    if (!isEconTooltipOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (econTooltipRef.current && !econTooltipRef.current.contains(e.target as Node)) {
        setIsEconTooltipOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsEconTooltipOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isEconTooltipOpen]);

  const currentStar = cluster[currentSystemId];
  const targetStar = hyperspaceTarget !== null ? cluster[hyperspaceTarget] : null;

  const currentSystem = useGameState(s => s.currentSystem);
  const currentFaction = currentSystemPayload
    ? getFaction(currentSystemPayload.factionState.controllingFactionId)
    : undefined;
  const currentFactionKnown = currentFaction && knownFactions.has(currentFaction.id);

  // Target info
  const entities = getEntities();
  const targetEntity = player.targetId ? entities.get(player.targetId) : null;
  let targetDist = 0;
  if (targetEntity) {
    const sp = getShipPos();
    targetDist = Math.round(sp.distanceTo(targetEntity.worldPos));
  }
  const targetScanHostId = targetEntity
    ? (
      targetEntity.type === 'landing_site'
        ? targetEntity.siteHostId ?? null
        : targetEntity.type === 'planet' || targetEntity.type === 'dyson_shell'
          ? targetEntity.id
          : null
    )
    : null;
  const scannedYear = targetScanHostId ? scannedHosts[currentSystemId]?.[targetScanHostId] : undefined;
  const targetIsScanned = scannedYear !== undefined && (galaxyYear - scannedYear <= SCAN_INTEL_MAX_AGE_YEARS);
  let targetSiteTotal = 0;
  let targetSiteDiscovered = 0;
  if (targetScanHostId) {
    for (const [, entity] of entities) {
      if (entity.type !== 'landing_site') continue;
      if (entity.siteHostId !== targetScanHostId) continue;
      targetSiteTotal++;
      if (entity.siteDiscovered) targetSiteDiscovered++;
    }
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
  const isInMotion = player.speed > 1;
  const isLandingIntelAlert = Boolean(alert?.startsWith('LANDING SITES MAPPED:'));

  return (
    <div className={`${styles.hud} ${isMobileHUD ? styles.mobile : ''}`}>
      <TargetIndicator getEntities={getEntities} getCamera={getCamera} />
      {/* Crosshair */}
      <div className={styles.center}>
        <div className={styles.crosshair} />
      </div>

      {/* Alert */}
      {alert && <div className={`${styles.alertBanner} ${isLandingIntelAlert ? styles.alertBannerIntel : ''}`}>{alert}</div>}
      {scanProgress > 0 && scanLabel && (
        <div className={styles.scanWidget}>
          <div className={styles.scanLabel}>{scanLabel}</div>
          <div className={styles.scanBar}>
            <div className={styles.scanFill} style={{ width: `${Math.round(scanProgress * 100)}%` }} />
          </div>
        </div>
      )}

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
          </span> · <span
            ref={econTooltipRef}
            className={`${styles.starType} ${isEconTooltipOpen ? styles.active : ''}`}
            onClick={() => setIsEconTooltipOpen(!isEconTooltipOpen)}
          >
            {currentSystemPayload?.civState.economy ?? currentStar?.economy}
            {(() => {
              const econKey = currentSystemPayload?.civState.economy ?? currentStar?.economy;
              return econKey && ECONOMY_DESCRIPTIONS[econKey] ? (
                <div className={`${styles.tooltip} ${isEconTooltipOpen ? styles.tooltipOpen : ''}`}>
                  <button
                    className={styles.closeButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEconTooltipOpen(false);
                    }}
                  >
                    ×
                  </button>
                  {ECONOMY_DESCRIPTIONS[econKey].desc}
                </div>
              ) : null;
            })()}
          </span><span className={styles.systemInfoText}>
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
            F Dock / Land · G Cluster Map · 1 System Map · J Jump · H Hail · V Scan
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
                <div>
                  {targetEntity.type === 'landing_site'
                    ? (targetEntity.siteLabel ?? 'INTERACTION SITE')
                    : (targetDyson ? targetDyson.name.toUpperCase() : targetEntity.id.replace(`${currentSystemId}-`, '').replace(/(\d+)$/, (_, n) => String(Number(n) + 1)))}
                </div>
                <div style={{ color: 'var(--color-hud-dim)', fontSize: '11px' }}>
                  DIST: {targetDist} wu
                </div>
                <div style={{ fontSize: '10px', opacity: 0.6 }}>
                  TYPE: {targetEntity.type === 'dyson_shell'
                    ? 'DYSON SHELL'
                    : targetEntity.type === 'landing_site'
                      ? `SITE · ${(targetEntity.siteClassification ?? 'unknown').split('_').join(' ').toUpperCase()}`
                      : targetEntity.type.toUpperCase()}
                </div>
                {targetEntity.type === 'landing_site' && targetEntity.siteHostLabel && (
                  <div style={{ fontSize: '10px', opacity: 0.6 }}>
                    HOST: {targetEntity.siteHostLabel.toUpperCase()}
                  </div>
                )}
                {(targetEntity.type === 'planet' || targetEntity.type === 'dyson_shell' || targetEntity.type === 'landing_site') && (
                  <div style={{ fontSize: '10px', opacity: 0.75 }}>
                    SCAN: {targetIsScanned ? 'SCANNED' : 'UNSCANNED'}
                    {targetIsScanned ? ` · SITES ${targetSiteDiscovered}/${targetSiteTotal}` : ''}
                  </div>
                )}
                {targetEntity.type === 'landing_site' && (
                  <div style={{ color: '#66FFAA', fontSize: '10px', marginTop: '4px', letterSpacing: '1px' }}>
                    F TO LAND
                  </div>
                )}
              </>
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
      {!isMobileHUD && uiMode === 'flight' && (canDockNow || canLandNow || canScanNow || canHailNow) && (
        <div className={styles.desktopActionStack}>
          {canDockNow && (
            <button type="button" className={`${styles.desktopActionButton} ${styles.desktopDockButton}`} onClick={onDock}>
              DOCK
            </button>
          )}
          {canLandNow && !canDockNow && (
            <button type="button" className={`${styles.desktopActionButton} ${styles.desktopLandButton}`} onClick={onLand}>
              LAND
            </button>
          )}
          {canScanNow && (
            <button type="button" className={`${styles.desktopActionButton} ${styles.desktopScanButton}`} onClick={onScan}>
              SCAN
            </button>
          )}
          {canHailNow && (
            <button type="button" className={`${styles.desktopActionButton} ${styles.desktopHailButton}`} onClick={onHail}>
              HAIL
            </button>
          )}
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
          isInMotion={isInMotion}
          canDockNow={canDockNow}
          canLandNow={canLandNow}
          canScanNow={canScanNow}
          onInputChange={onTouchFlightInput}
          onDock={onDock}
          onHail={onHail}
          onLand={onLand}
          onScan={onScan}
          onTargetCycle={onTargetCycle}
          onClusterMap={onClusterMap}
          onSystemMap={onSystemMap}
          onMenu={onMenu}
        />
      )}
    </div>
  );
}
