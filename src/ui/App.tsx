import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { useGameState, buildSaveData } from '../game/GameState';
import type { UIMode } from '../game/GameState';
import { Game } from '../game/Game';
import { HUD } from './HUD/HUD';
import { MainMenu } from './MainMenu/MainMenu';
import { SystemEntryText } from './HUD/SystemEntryText';
import { ClusterMap } from './ClusterMap/ClusterMap';
import { SystemMap } from './SystemMap/SystemMap';
import { StationUI } from './StationUI/StationUI';
import { LandingDialog } from './LandingDialog/LandingDialog';
import { SystemEntryDialog } from './SystemEntryDialog/SystemEntryDialog';
import { CommDialog } from './CommDialog/CommDialog';
import { LoadingScreen } from './LoadingScreen';
import { DeathScreen } from './DeathScreen';
import type { SceneEntity } from '../game/rendering/SceneRenderer';
import { TRAVEL_TERMS, type GoodName } from '../game/constants';
import { saveToSlot, loadFromSlot, loadAutosave, buildSlotMeta, loadAutosaveByKind, type AutosaveKind } from './MainMenu/saveSlots';
import { isFiniteVec3, isFiniteQuat, isOriginVec3 } from '../game/spatialValidation';
import { detectRuntimeProfile, type RuntimeProfile } from '../runtime/runtimeProfile';
import { useMobileOrientation } from './hooks/useMobileOrientation';
import * as THREE from 'three';

const BUILD_TAG_LABEL = `v: early beta • build ${__APP_BUILD__.number} • commits ${__APP_BUILD__.commitCount} • ${__APP_BUILD__.sha}`;

function runtimeProfileInitKey(profile: RuntimeProfile | null): string {
  if (!profile) return 'none';
  return [
    profile.isMobile ? '1' : '0',
    profile.isTouchPrimary ? '1' : '0',
    profile.pixelRatioCap,
    profile.qualityTier,
    profile.minSupportedYear,
  ].join(':');
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);

  const uiMode = useGameState(s => s.ui.mode);
  const hyperspaceCountdown = useGameState(s => s.ui.hyperspaceCountdown);
  const invertControls = useGameState(s => s.invertControls);
  const setInvertControls = useGameState(s => s.setInvertControls);
  const setUIMode = useGameState(s => s.setUIMode);
  const pendingSystemEntryDialog = useGameState(s => s.pendingSystemEntryDialog);

  const prevUiModeRef = useRef<UIMode>('flight');
  const [flashPhase, setFlashPhase] = useState<'none' | 'entry' | 'exit' | 'loadFade'>('none');
  const loadingSlotRef = useRef(false);
  const menuFromDeathRef = useRef(false);
  const [runtimeProfile, setRuntimeProfile] = useState<RuntimeProfile | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [contextLossNotice, setContextLossNotice] = useState<string | null>(null);
  const [gameEpoch, setGameEpoch] = useState(0);

  useEffect(() => {
    const updateProfile = () => setRuntimeProfile(detectRuntimeProfile());
    updateProfile();
    navigator.storage.persist().catch(() => {});
    window.addEventListener('resize', updateProfile);
    window.visualViewport?.addEventListener('resize', updateProfile);
    return () => {
      window.removeEventListener('resize', updateProfile);
      window.visualViewport?.removeEventListener('resize', updateProfile);
    };
  }, []);

  const runtimeInitKey = runtimeProfileInitKey(runtimeProfile);
  const frameStyle = useMemo(() => ({
    position: 'absolute' as const,
    inset: 0,
  }), []);

  useEffect(() => {
    if (!canvasRef.current || !runtimeProfile || gameRef.current) return;
    const canvas = canvasRef.current;
    setBootError(null);
    setContextLossNotice(null);

    if (!canvas.getContext('webgl2')) {
      setBootError('WebGL 2 is required. This browser or device is not supported.');
      return;
    }

    const game = new Game(canvas, {
      runtimeProfile,
      onContextLost: () => setContextLossNotice('Graphics context lost. Waiting for restore...'),
      onContextRestored: () => {
        const state = useGameState.getState();
        if (state.ui.mode !== 'hyperspace' && state.ui.mode !== 'loading') {
          state.saveGame();
        }
        setContextLossNotice('Graphics context restored. Reinitializing...');
        setGameEpoch((n) => n + 1);
      },
    });
    gameRef.current = game;
    game.start();
    if (import.meta.env.DEV) {
      (window as any).__GAME__ = game;
      (window as any).__STORE__ = useGameState;
    }

    return () => {
      game.dispose();
      gameRef.current = null;
    };
  }, [runtimeInitKey, gameEpoch]);

  useMobileOrientation(runtimeProfile);

  // Detect uiMode transitions for flash effects
  useEffect(() => {
    const prev = prevUiModeRef.current;
    if (prev === 'flight' && uiMode === 'hyperspace') {
      setFlashPhase('entry');
    } else if (prev === 'hyperspace' && uiMode === 'landing') {
      setFlashPhase('exit');
    } else if (prev === 'loading' && uiMode === 'flight' && loadingSlotRef.current) {
      loadingSlotRef.current = false;
      setFlashPhase('loadFade');
    }
    if (prev === 'dead') {
      setDeathAutosaveUnavailable(false);
    }
    if (prev === 'menu') {
      menuFromDeathRef.current = false;
    }
    prevUiModeRef.current = uiMode;
  }, [uiMode]);

  const getEntities = useCallback((): Map<string, SceneEntity> => {
    return gameRef.current?.['sceneRenderer']?.getAllEntities() ?? new Map();
  }, []);

  const getShipPos = useCallback((): THREE.Vector3 => {
    return gameRef.current?.['sceneRenderer']?.shipGroup?.position ?? new THREE.Vector3();
  }, []);

  const getCamera = useCallback((): THREE.PerspectiveCamera | null => {
    return gameRef.current?.['sceneRenderer']?.camera ?? null;
  }, []);

  const handleUndock = () => {
    gameRef.current?.undock();
  };

  const handleLandingChoice = (choiceId: string) => {
    gameRef.current?.completeLanding(choiceId);
  };

  const handleCloseClusterMap = () => setUIMode('flight');
  const handleCloseSystemMap = () => setUIMode('flight');
  const handleGetFleetBattle = useCallback(() => gameRef.current?.['sceneRenderer']?.getFleetBattle() ?? null, []);
  const handleSystemMapTarget = useCallback((id: string) => {
    useGameState.getState().setTarget(id);
  }, []);
  const handleClusterMapJump = () => {
    gameRef.current?.requestJump();
  };

  const handleNPCTrade = (action: 'buy' | 'sell', good: GoodName) => {
    gameRef.current?.tradeWithNPC(action, good);
  };

  const handleSystemEntryDialogDismiss = () => {
    gameRef.current?.dismissSystemEntryDialog();
  };

  const handleCommDismiss = () => {
    gameRef.current?.completeComm();
  };

  const [deathAutosaveUnavailable, setDeathAutosaveUnavailable] = useState(false);

  const handleLoadAutosaveOnDeath = async () => {
    const data = await loadAutosave();
    if (!data) {
      setDeathAutosaveUnavailable(true);
      return;
    }
    loadingSlotRef.current = true;
    gameRef.current?.loadSlotSave(data);
  };

  const handleSaveToSlot = async (index: number) => {
    const state = useGameState.getState();
    const data = buildSaveData(state);
    const spatial = gameRef.current?.getShipSpatialState();
    if (
      spatial
      && isFiniteVec3(spatial.position)
      && !isOriginVec3(spatial.position)
      && isFiniteQuat(spatial.quaternion)
      && isFiniteVec3(spatial.velocity)
    ) {
      data.shipPosition = spatial.position;
      data.shipQuaternion = spatial.quaternion;
      data.shipVelocity = spatial.velocity;
    }
    const meta = buildSlotMeta(state);
    await saveToSlot(index, data, meta);
  };

  const handleLoadFromSlot = async (index: number) => {
    const data = await loadFromSlot(index);
    if (!data) return;
    loadingSlotRef.current = true;
    gameRef.current?.loadSlotSave(data);
  };

  const handleLoadAutosave = async (kind?: AutosaveKind) => {
    const data = kind ? await loadAutosaveByKind(kind) : await loadAutosave();
    if (!data) return;
    loadingSlotRef.current = true;
    gameRef.current?.loadSlotSave(data);
  };

  const handleNewGame = () => {
    gameRef.current?.newGame();
  };

  const handleResume = () => {
    setUIMode('flight');
  };

  const handleToggleInvertControls = () => {
    setInvertControls(!invertControls);
  };

  const isLandscapePlayable = Boolean(runtimeProfile);

  useEffect(() => {
    if (uiMode !== 'flight' || !isLandscapePlayable) {
      gameRef.current?.clearTouchFlightInput();
    }
  }, [uiMode, isLandscapePlayable]);

  const handleTouchFlightInput = useCallback((input: { pitch: number; yaw: number; roll: number; thrust: number; boost: boolean }) => {
    if (uiMode !== 'flight' || !isLandscapePlayable) {
      gameRef.current?.clearTouchFlightInput();
      return;
    }
    gameRef.current?.setTouchFlightInput(input);
  }, [uiMode, isLandscapePlayable]);

  const handleTouchDock = () => gameRef.current?.requestDock();
  const handleTouchHail = () => gameRef.current?.requestHail();
  const handleTouchLand = () => gameRef.current?.requestLand();
  const handleTouchScan = () => gameRef.current?.requestScan();
  const handleTouchTargetCycle = () => gameRef.current?.requestCycleTarget();
  const handleTouchClusterMap = () => gameRef.current?.requestClusterMapToggle();
  const handleTouchSystemMap = () => gameRef.current?.requestSystemMapToggle();
  const handleTouchMenu = () => setUIMode('menu');

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
      <div style={frameStyle}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          touchAction: 'none',
          WebkitUserSelect: 'none',
        }}
      />

      {uiMode === 'loading' && <LoadingScreen />}

      {(uiMode === 'flight' || uiMode === 'comms') && (
        <HUD
          getEntities={getEntities}
          getShipPos={getShipPos}
          getCamera={getCamera}
          runtimeProfile={runtimeProfile}
          isLandscapePlayable={isLandscapePlayable}
          onTouchFlightInput={handleTouchFlightInput}
          onDock={handleTouchDock}
          onHail={handleTouchHail}
          onLand={handleTouchLand}
          onScan={handleTouchScan}
          onTargetCycle={handleTouchTargetCycle}
          onClusterMap={handleTouchClusterMap}
          onSystemMap={handleTouchSystemMap}
          onMenu={handleTouchMenu}
        />
      )}

      {uiMode === 'flight' && !pendingSystemEntryDialog && <SystemEntryText />}
      {pendingSystemEntryDialog && (
        <SystemEntryDialog onDismiss={handleSystemEntryDialogDismiss} />
      )}

      {uiMode === 'hyperspace' && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: '#000',
          pointerEvents: 'none',
          zIndex: 20,
        }} />
      )}

      {uiMode === 'hyperspace' && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: 'var(--color-hyperspace-bright)',
          fontSize: '24px',
          letterSpacing: '8px',
          textShadow: '0 0 20px #8866FF',
          pointerEvents: 'none',
          zIndex: 21,
        }}>
          {TRAVEL_TERMS.modeNameUpper}
        </div>
      )}

      {/* Nearlight passage charge glow — pulses during countdown */}
      {hyperspaceCountdown > 0 && (
        <div className="hyperChargeGlow" />
      )}

      {/* Entry / exit / load flash */}
      {flashPhase !== 'none' && (
        <div
          className={
            flashPhase === 'entry' ? 'flashEntry'
            : flashPhase === 'loadFade' ? 'fadeFromBlack'
            : 'flashExit'
          }
          onAnimationEnd={() => setFlashPhase('none')}
        />
      )}

      {uiMode === 'comms' && (
        <CommDialog onTrade={handleNPCTrade} onDismiss={handleCommDismiss} />
      )}

      {uiMode === 'cluster_map' && (
        <ClusterMap onClose={handleCloseClusterMap} onJump={handleClusterMapJump} />
      )}
      {uiMode === 'system_map' && (
        <SystemMap
          onClose={handleCloseSystemMap}
          getEntities={getEntities}
          getFleetBattle={handleGetFleetBattle}
          onTarget={handleSystemMapTarget}
        />
      )}
      {uiMode === 'landing' && <LandingDialog onChoice={handleLandingChoice} />}
      {uiMode === 'docked' && <StationUI onUndock={handleUndock} />}

      {uiMode === 'menu' && (
          <MainMenu
            onNewGame={handleNewGame}
            onResume={handleResume}
            onSaveToSlot={handleSaveToSlot}
            onLoadFromSlot={handleLoadFromSlot}
            onLoadAutosave={(kind) => handleLoadAutosave(kind)}
            invertControls={invertControls}
            onToggleInvertControls={handleToggleInvertControls}
            buildLabel={BUILD_TAG_LABEL}
          initialView={menuFromDeathRef.current ? 'load' : 'main'}
        />
      )}

      {uiMode === 'dead' && <DeathScreen autosaveUnavailable={deathAutosaveUnavailable} onLoadAutosave={handleLoadAutosaveOnDeath} onLoadSave={() => { menuFromDeathRef.current = true; setUIMode('menu'); }} onNewGame={handleNewGame} />}
      </div>

      {runtimeProfile?.isMobile && !runtimeProfile.isLandscape && (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 210,
          background: 'rgba(0, 0, 0, 0.92)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          color: 'var(--color-hud)',
          fontFamily: 'var(--font-hud)',
          letterSpacing: 2,
          textAlign: 'center',
          padding: 24,
        }}>
          <div style={{ fontSize: 28, opacity: 0.7 }}>&#8635;</div>
          <div style={{ fontSize: 13 }}>ROTATE TO LANDSCAPE</div>
        </div>
      )}

      {(runtimeProfile === null || bootError || contextLossNotice) && (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 250,
          pointerEvents: 'all',
          background: 'rgba(0, 0, 0, 0.9)',
          color: 'var(--color-hud)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: 24,
        }}>
          <div style={{ maxWidth: 520, lineHeight: 1.6 }}>
            {runtimeProfile === null && (
              <>
                <div style={{ fontSize: 20, letterSpacing: 3, marginBottom: 6 }}>CHECKING DEVICE</div>
                <div style={{ opacity: 0.75, fontSize: 13 }}>Preparing runtime profile...</div>
              </>
            )}
            {bootError && (
              <>
                <div style={{ fontSize: 20, letterSpacing: 3, marginBottom: 6, color: 'var(--color-danger)' }}>UNSUPPORTED</div>
                <div style={{ opacity: 0.85, fontSize: 13 }}>{bootError}</div>
              </>
            )}
            {!bootError && contextLossNotice && (
              <>
                <div style={{ fontSize: 20, letterSpacing: 3, marginBottom: 6 }}>RENDERER STATUS</div>
                <div style={{ opacity: 0.8, fontSize: 13 }}>{contextLossNotice}</div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

