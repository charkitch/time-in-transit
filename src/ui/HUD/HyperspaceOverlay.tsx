import { useState, useEffect, useRef } from 'react';
import { useGameState } from '../../game/GameState';
import { HYPERSPACE, TRAVEL_TERMS } from '../../game/constants';

function formatDuration(years: number): string {
  const wholeYears = Math.floor(years);
  if (wholeYears > 0) return `${wholeYears} YEARS`;
  const totalDays = Math.floor(years * 365.25);
  const m = Math.floor(totalDays / 30);
  const d = totalDays % 30;
  if (m === 0) return `${d} DAYS`;
  if (d === 0) return `${m} MONTHS`;
  return `${m} MONTHS ${d} DAYS`;
}

/** Animated overlay shown during nearlight passage with velocity ramp and transit years. */
export function HyperspaceOverlay() {
  const transitYears = useGameState(s => s.pendingTransitYears);
  const shipYears = useGameState(s => s.pendingShipYears);
  const [velocity, setVelocity] = useState(0);
  const startRef = useRef(performance.now());

  useEffect(() => {
    startRef.current = performance.now();
    let raf: number;

    const tick = () => {
      const elapsed = (performance.now() - startRef.current) / 1000;
      const duration = HYPERSPACE.duration;
      const t = Math.min(elapsed / duration, 1);

      // Accel in first 40%, cruise 40-80%, decel last 20%
      let v: number;
      if (t < 0.4) {
        v = HYPERSPACE.cruiseVelocity * (t / 0.4);
      } else if (t < 0.8) {
        v = HYPERSPACE.cruiseVelocity;
      } else {
        v = HYPERSPACE.cruiseVelocity * (1 - (t - 0.8) / 0.2);
      }
      setVelocity(v);

      if (t < 0.99) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      {/* Black background */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: '#000',
        pointerEvents: 'none',
        zIndex: 20,
      }} />

      {/* Content */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 21,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
      }}>
        <div style={{
          color: 'var(--color-hyperspace-bright)',
          fontSize: '24px',
          letterSpacing: '8px',
          textShadow: '0 0 20px #8866FF',
        }}>
          {TRAVEL_TERMS.modeNameUpper}
        </div>

        <div style={{
          color: 'var(--color-hyperspace-bright)',
          fontSize: '40px',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '4px',
          textShadow: '0 0 30px #8866FF',
          opacity: 0.9,
        }}>
          {velocity.toFixed(2)}c
        </div>

        {transitYears !== null && (
          <div style={{
            color: 'var(--color-hyperspace-bright)',
            fontSize: '14px',
            letterSpacing: '6px',
            opacity: 0.6,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
          }}>
            <span>+{transitYears.toLocaleString()} YEARS IN TRANSIT</span>
            {shipYears !== null && <span>{formatDuration(shipYears)} SHIP TIME</span>}
          </div>
        )}
      </div>
    </>
  );
}
