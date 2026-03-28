import { useRef, useEffect, useCallback, useState } from 'react';
import { useGameState } from '../game/GameState';
import type { UIMode } from '../game/GameState';
import { Game } from '../game/Game';
import { HUD } from './HUD/HUD';
import { SystemEntryText } from './HUD/SystemEntryText';
import { GalaxyMap } from './GalaxyMap/GalaxyMap';
import { SystemMap } from './SystemMap/SystemMap';
import { StationUI } from './StationUI/StationUI';
import { LandingDialog } from './LandingDialog/LandingDialog';
import { CommDialog } from './CommDialog/CommDialog';
import type { SceneEntity } from '../game/rendering/SceneRenderer';
import type { GoodName } from '../game/constants';
import * as THREE from 'three';

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);

  const uiMode = useGameState(s => s.ui.mode);
  const hyperspaceCountdown = useGameState(s => s.ui.hyperspaceCountdown);
  const setUIMode = useGameState(s => s.setUIMode);

  const prevUiModeRef = useRef<UIMode>('flight');
  const [flashPhase, setFlashPhase] = useState<'none' | 'entry' | 'exit'>('none');

  useEffect(() => {
    if (!canvasRef.current || gameRef.current) return;
    const game = new Game(canvasRef.current);
    gameRef.current = game;
    game.start();

    return () => {
      game.dispose();
      gameRef.current = null;
    };
  }, []);

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

  const handleCloseGalaxyMap = () => setUIMode('flight');
  const handleCloseSystemMap = () => setUIMode('flight');
  const handleGalaxyMapJump = () => {
    gameRef.current?.requestJump();
  };

  const handleNPCTrade = (action: 'buy' | 'sell', good: GoodName) => {
    gameRef.current?.tradeWithNPC(action, good);
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

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />

      {(uiMode === 'flight' || uiMode === 'comms') && (
        <HUD getEntities={getEntities} getShipPos={getShipPos} getCamera={getCamera} />
      )}

      {uiMode === 'flight' && <SystemEntryText />}

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

      {uiMode === 'galaxy_map' && (
        <GalaxyMap onClose={handleCloseGalaxyMap} onJump={handleGalaxyMapJump} />
      )}
      {uiMode === 'system_map' && <SystemMap onClose={handleCloseSystemMap} />}
      {uiMode === 'landing' && <LandingDialog onChoice={handleLandingChoice} />}
      {uiMode === 'docked' && <StationUI onUndock={handleUndock} />}

      {uiMode === 'dead' && <DeathScreen onRespawn={handleRespawn} onNewGame={handleNewGame} />}

      {(uiMode === 'flight' || uiMode === 'docked') && (
        <button
          onClick={handleNewGame}
          style={{
            position: 'absolute', bottom: 16, right: 16,
            padding: '6px 14px', fontSize: 11, letterSpacing: 2,
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(0,0,0,0.5)', color: 'rgba(255,255,255,0.35)',
            fontFamily: 'Courier New, monospace', cursor: 'pointer',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
        >
          NEW GAME
        </button>
      )}
    </>
  );
}

function DeathScreen({ onRespawn, onNewGame }: { onRespawn: () => void; onNewGame: () => void }) {
  const credits = useGameState(s => s.player.credits);
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
          Hull integrity failed. Emergency beacon triggered.<br />
          Rescue vessel recovered pilot and cargo.<br />
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
