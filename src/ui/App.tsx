import { useRef, useEffect, useCallback, useState } from 'react';
import { useGameState } from '../game/GameState';
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
import type { GoodName } from '../game/constants';
import { detectRuntimeProfile, type RuntimeProfile } from '../runtime/runtimeProfile';
import * as THREE from 'three';

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
  const [flashPhase, setFlashPhase] = useState<'none' | 'entry' | 'exit'>('none');
  const [runtimeProfile, setRuntimeProfile] = useState<RuntimeProfile | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [contextLossNotice, setContextLossNotice] = useState<string | null>(null);
  const [gameEpoch, setGameEpoch] = useState(0);

  useEffect(() => {
    const updateProfile = () => setRuntimeProfile(detectRuntimeProfile());
    updateProfile();
    window.addEventListener('resize', updateProfile);
    window.visualViewport?.addEventListener('resize', updateProfile);
    return () => {
      window.removeEventListener('resize', updateProfile);
      window.visualViewport?.removeEventListener('resize', updateProfile);
    };
  }, []);

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

    return () => {
      game.dispose();
      gameRef.current = null;
    };
  }, [runtimeProfile, gameEpoch]);

  // Detect uiMode transitions for flash effects
  useEffect(() => {
    const prev = prevUiModeRef.current;
    if (prev === 'flight' && uiMode === 'hyperspace') {
      setFlashPhase('entry');
    } else if (prev === 'hyperspace' && uiMode === 'landing') {
      setFlashPhase('exit');
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

  const handleNewGame = () => {
    gameRef.current?.newGame();
  };

  const handleResume = () => {
    setUIMode('flight');
  };

  const handleToggleInvertControls = () => {
    setInvertControls(!invertControls);
  };

  const isLandscapePlayable = !runtimeProfile?.isMobile || runtimeProfile.isLandscape;
  const showRotateOverlay = Boolean(runtimeProfile?.isMobile && !runtimeProfile.isLandscape);

  useEffect(() => {
    if (uiMode !== 'flight' || !isLandscapePlayable) {
      gameRef.current?.clearTouchFlightInput();
    }
  }, [uiMode, isLandscapePlayable]);

  const handleTouchFlightInput = useCallback((input: { pitch: number; yaw: number; thrust: number; boost: boolean }) => {
    if (uiMode !== 'flight' || !isLandscapePlayable) {
      gameRef.current?.clearTouchFlightInput();
      return;
    }
    gameRef.current?.setTouchFlightInput(input);
  }, [uiMode, isLandscapePlayable]);

  const handleTouchDock = () => gameRef.current?.requestDock();
  const handleTouchHail = () => gameRef.current?.requestHail();
  const handleTouchTargetCycle = () => gameRef.current?.requestCycleTarget();
  const handleTouchClusterMap = () => gameRef.current?.requestClusterMapToggle();
  const handleTouchSystemMap = () => gameRef.current?.requestSystemMapToggle();
  const handleTouchJump = () => gameRef.current?.requestJump();

  return (
    <>
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
          onTargetCycle={handleTouchTargetCycle}
          onClusterMap={handleTouchClusterMap}
          onSystemMap={handleTouchSystemMap}
          onJump={handleTouchJump}
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
          HYPERSPACE
        </div>
      )}

      {/* Hyperspace charge glow — pulses during countdown */}
      {hyperspaceCountdown > 0 && (
        <div className="hyperChargeGlow" />
      )}

      {/* Entry / exit flash */}
      {flashPhase !== 'none' && (
        <div
          className={flashPhase === 'entry' ? 'flashEntry' : 'flashExit'}
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
          invertControls={invertControls}
          onToggleInvertControls={handleToggleInvertControls}
        />
      )}

      {uiMode === 'dead' && <DeathScreen onRespawn={handleRespawn} onNewGame={handleNewGame} />}

      {runtimeProfile && showRotateOverlay && (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 200,
          pointerEvents: 'all',
          background: 'rgba(2, 4, 8, 0.96)',
          color: 'var(--color-hud)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: 'calc(24px + env(safe-area-inset-top)) calc(20px + env(safe-area-inset-right)) calc(24px + env(safe-area-inset-bottom)) calc(20px + env(safe-area-inset-left))',
        }}>
          <div style={{ maxWidth: 420, lineHeight: 1.6 }}>
            <div style={{ fontSize: 20, letterSpacing: 3, marginBottom: 8 }}>ROTATE DEVICE</div>
            <div style={{ opacity: 0.8, fontSize: 13 }}>
              Mobile support in this build is landscape-first. Rotate to continue.
            </div>
          </div>
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
    </>
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
