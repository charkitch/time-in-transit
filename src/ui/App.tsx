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
import type { SceneEntity } from '../game/rendering/SceneRenderer';
import { TRAVEL_TERMS, type GoodName } from '../game/constants';
import { saveToSlot, loadFromSlot, buildSlotMeta } from './MainMenu/saveSlots';
import { detectRuntimeProfile, type RuntimeProfile } from '../runtime/runtimeProfile';
import * as THREE from 'three';

const BUILD_TAG_LABEL = `v${__APP_BUILD__.version} • build ${__APP_BUILD__.number} • commits ${__APP_BUILD__.commitCount} • ${__APP_BUILD__.sha}`;

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
  const orientationLockAttemptedRef = useRef(false);

  const uiMode = useGameState(s => s.ui.mode);
  const hyperspaceCountdown = useGameState(s => s.ui.hyperspaceCountdown);
  const invertControls = useGameState(s => s.invertControls);
  const setInvertControls = useGameState(s => s.setInvertControls);
  const setUIMode = useGameState(s => s.setUIMode);
  const pendingSystemEntryDialog = useGameState(s => s.pendingSystemEntryDialog);

  const prevUiModeRef = useRef<UIMode>('flight');
  const [flashPhase, setFlashPhase] = useState<'none' | 'entry' | 'exit' | 'loadFade'>('none');
  const loadingSlotRef = useRef(false);
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
        useGameState.getState().saveGame();
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

  useEffect(() => {
    if (!runtimeProfile?.isMobile || orientationLockAttemptedRef.current) return;
    const orientationApi = screen.orientation as (ScreenOrientation & {
      lock?: (orientation: 'any' | 'natural' | 'landscape' | 'portrait' | 'portrait-primary' | 'portrait-secondary' | 'landscape-primary' | 'landscape-secondary') => Promise<void>;
    }) | undefined;
    if (!orientationApi?.lock) {
      orientationLockAttemptedRef.current = true;
      return;
    }
    const attemptLock = () => {
      if (orientationLockAttemptedRef.current) return;
      orientationLockAttemptedRef.current = true;
      orientationApi.lock?.('landscape').catch(() => {
        // Browser denied lock (common on iOS/without active user gesture). Keep letterboxed fallback.
      });
    };
    window.addEventListener('pointerdown', attemptLock, { once: true });
    window.addEventListener('touchstart', attemptLock, { once: true });
    window.addEventListener('keydown', attemptLock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', attemptLock);
      window.removeEventListener('touchstart', attemptLock);
      window.removeEventListener('keydown', attemptLock);
    };
  }, [runtimeProfile]);

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

  const handleRespawn = () => {
    gameRef.current?.respawn();
  };

  const handleSaveToSlot = async (index: number) => {
    const state = useGameState.getState();
    const data = buildSaveData(state);
    const spatial = gameRef.current?.getShipSpatialState();
    if (spatial) {
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
      {uiMode === 'system_map' && <SystemMap onClose={handleCloseSystemMap} />}
      {uiMode === 'landing' && <LandingDialog onChoice={handleLandingChoice} />}
      {uiMode === 'docked' && <StationUI onUndock={handleUndock} />}

      {uiMode === 'menu' && (
        <MainMenu
          onNewGame={handleNewGame}
          onResume={handleResume}
          onSaveToSlot={handleSaveToSlot}
          onLoadFromSlot={handleLoadFromSlot}
          invertControls={invertControls}
          onToggleInvertControls={handleToggleInvertControls}
          buildLabel={BUILD_TAG_LABEL}
        />
      )}

      {uiMode === 'dead' && <DeathScreen onRespawn={handleRespawn} onNewGame={handleNewGame} />}
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

function LoadingScreen() {
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      zIndex: 200,
      background: '#000',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      fontFamily: 'var(--font-hud)',
      pointerEvents: 'all',
    }}>
      <div style={{
        fontSize: 22,
        letterSpacing: 6,
        color: 'var(--color-hud)',
        opacity: 0.9,
      }}>
        INITIALIZING
      </div>
      <div style={{
        width: 180,
        height: 2,
        background: 'rgba(255,255,255,0.1)',
        borderRadius: 1,
        overflow: 'hidden',
      }}>
        <div style={{
          width: '40%',
          height: '100%',
          background: 'var(--color-hud)',
          opacity: 0.6,
          animation: 'loadingSlide 1.2s ease-in-out infinite',
        }} />
      </div>
      <div style={{
        fontSize: 11,
        letterSpacing: 3,
        color: 'var(--color-hud)',
        opacity: 0.4,
        marginTop: 4,
      }}>
        GENERATING STAR SYSTEM
      </div>
      <style>{`
        @keyframes loadingSlide {
          0% { transform: translateX(-180px); }
          100% { transform: translateX(270px); }
        }
      `}</style>
    </div>
  );
}

function DeathScreen({ onRespawn, onNewGame }: { onRespawn: () => void; onNewGame: () => void }) {
  const credits = useGameState(s => s.player.credits);
  const deathMessage = useGameState(s => s.ui.deathMessage);
  const penalty = Math.max(100, Math.floor(credits * 0.1));

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(40,0,0,0.97)', zIndex: 40, pointerEvents: 'all',
    }}>
      <div style={{
        border: '1px solid rgba(255,34,0,0.6)',
        padding: '36px 44px',
        maxWidth: 480,
        textAlign: 'center',
        fontFamily: 'Courier New, monospace',
      }}>
        <div style={{ fontSize: 28, letterSpacing: 8, color: '#FF2200', marginBottom: 16 }}>
          SHIP DESTROYED
        </div>
        <div style={{ fontSize: 13, color: 'rgba(220,180,180,0.8)', lineHeight: 1.7, marginBottom: 24 }}>
          {deathMessage?.length ? (
            <>
              {deathMessage.map((line, i) => (
                <span key={i}>
                  {line}
                  <br />
                </span>
              ))}
            </>
          ) : (
            <>
              Hull integrity failed. Emergency beacon triggered.<br />
              Rescue vessel recovered pilot and cargo.<br />
            </>
          )}
          <span style={{ color: '#FFAA00' }}>
            Insurance deducted: CR {penalty.toLocaleString()}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            onClick={onRespawn}
            style={{
              padding: '10px 28px', fontSize: 13, letterSpacing: 3,
              border: '1px solid rgba(255,34,0,0.5)',
              background: 'rgba(255,34,0,0.1)', color: '#FF6644',
              fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            CLAIM INSURANCE
          </button>
          <button
            onClick={onNewGame}
            style={{
              padding: '10px 28px', fontSize: 13, letterSpacing: 3,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)',
              fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            NEW GAME
          </button>
        </div>
      </div>
    </div>
  );
}
