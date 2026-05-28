import { useGameState } from '../../game/GameState';
import { useShallow } from 'zustand/react/shallow';
import { StatusBars, MobileStatusBars } from './StatusBars';
import { TargetIndicator } from './TargetIndicator';
import { SystemInfoPanel } from './SystemInfoPanel';
import { TargetInfoPanel } from './TargetInfoPanel';
import type { SceneEntity } from '../../game/rendering/SceneRenderer';
import { isScannableHost } from '../../game/rendering/scene/types';
import { getFaction } from '../../game/data/factions';
import { SCAN_INTEL_MAX_AGE_YEARS } from '../../game/constants';
import type { RuntimeProfile } from '../../runtime/runtimeProfile';
import type { ScannableBodyId } from '../../game/types';
import { TouchFlightControls } from './TouchFlightControls';
import { CrewRosterPanel } from './CrewRosterPanel';
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
  onControls: () => void;
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
  onControls,
}: HUDProps) {
  // Per-frame: only the player fields this component reads
  const { targetId, credits, speed } = useGameState(
    useShallow(s => ({
      targetId: s.player.targetId,
      credits: s.player.credits,
      speed: s.player.speed,
    })),
  );

  // Per-jump: stable within a system visit
  const cluster = useGameState(s => s.cluster);
  const currentSystem = useGameState(s => s.currentSystem);
  const { currentSystemId, galaxyYear, knownFactions, currentSystemPayload, scannedBodies } = useGameState(
    useShallow(s => ({
      currentSystemId: s.currentSystemId,
      galaxyYear: s.galaxyYear,
      knownFactions: s.knownFactions,
      currentSystemPayload: s.currentSystemPayload,
      scannedBodies: s.scannedBodies,
    })),
  );

  // UI state: changes during flight
  const { alert, info, scanProgress, scanLabel, uiMode, hyperspaceTarget, canDockNow, canLandNow, canScanNow, canHailNow } = useGameState(
    useShallow(s => ({
      alert: s.ui.alertMessage,
      info: s.ui.infoMessage,
      scanProgress: s.ui.scanProgress,
      scanLabel: s.ui.scanLabel,
      uiMode: s.ui.mode,
      hyperspaceTarget: s.ui.hyperspaceTarget,
      canDockNow: s.ui.canDockNow,
      canLandNow: s.ui.canLandNow,
      canScanNow: s.ui.canScanNow,
      canHailNow: s.ui.canHailNow,
    })),
  );

  const crewCount = useGameState(s => s.crew.length);
  const showCrewRoster = useGameState(s => s.ui.crewRosterOpen);
  const toggleCrewRoster = useGameState(s => s.toggleCrewRoster);

  const currentStar = cluster[currentSystemId];
  const targetStar = hyperspaceTarget !== null ? cluster[hyperspaceTarget] : null;
  const currentFaction = currentSystemPayload
    ? getFaction(currentSystemPayload.factionState.controllingFactionId)
    : undefined;
  const currentFactionKnown = currentFaction && knownFactions.has(currentFaction.id);

  // Target info
  const entities = getEntities();
  const targetEntity = targetId ? entities.get(targetId) : null;
  let targetDist = 0;
  if (targetEntity) {
    const sp = getShipPos();
    targetDist = Math.round(sp.distanceTo(targetEntity.worldPos));
  }
  const targetScanBodyId = targetEntity
    ? (
      targetEntity.type === 'landing_site'
        ? targetEntity.siteHostId ?? null
        : isScannableHost(targetEntity.type)
          ? targetEntity.id
          : null
    ) as ScannableBodyId | null
    : null;
  const scannedYear = targetScanBodyId ? scannedBodies[currentSystemId]?.[targetScanBodyId] : undefined;
  const targetIsScanned = scannedYear !== undefined && (galaxyYear - scannedYear <= SCAN_INTEL_MAX_AGE_YEARS);
  let targetSiteTotal = 0;
  let targetSiteDiscovered = 0;
  if (targetScanBodyId) {
    const sites = [...entities.values()]
      .filter(e => e.type === 'landing_site' && e.siteHostId === targetScanBodyId);
    targetSiteTotal = sites.length;
    targetSiteDiscovered = sites.filter(e => e.siteDiscovered).length;
  }

  const targetSecretBase = targetId && currentSystem
    ? currentSystem.secretBases.find(b => b.id === targetId)
    : undefined;
  const isMobileHUD = Boolean(runtimeProfile?.isMobile);
  const touchFlightEnabled = isMobileHUD && isLandscapePlayable && uiMode === 'flight';
  const isInMotion = speed > 1;
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
      {info && <div className={styles.infoBanner}>{info}</div>}
      {scanProgress > 0 && scanLabel && (
        <div className={styles.scanWidget}>
          <div className={styles.scanLabel}>{scanLabel}</div>
          <div className={styles.scanBar}>
            <div className={styles.scanFill} style={{ width: `${Math.round(scanProgress * 100)}%` }} />
          </div>
        </div>
      )}

      <SystemInfoPanel
        currentStar={currentStar}
        currentSystemPayload={currentSystemPayload}
        galaxyYear={galaxyYear}
        targetStar={targetStar}
        currentFaction={currentFaction}
        currentFactionKnown={Boolean(currentFactionKnown)}
        credits={credits}
        isMobileHUD={isMobileHUD}
        crewCount={crewCount}
        onClusterMap={onClusterMap}
        onSystemMap={onSystemMap}
        onControls={onControls}
        onCrewRoster={toggleCrewRoster}
      />

      {showCrewRoster && crewCount > 0 && (
        <CrewRosterPanel onClose={toggleCrewRoster} />
      )}

      <TargetInfoPanel
        targetEntity={targetEntity}
        targetSecretBase={targetSecretBase}
        targetDist={targetDist}
        targetIsScanned={targetIsScanned}
        targetSiteTotal={targetSiteTotal}
        targetSiteDiscovered={targetSiteDiscovered}
        isMobileHUD={isMobileHUD}
      />

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
          canHailNow={canHailNow}
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
