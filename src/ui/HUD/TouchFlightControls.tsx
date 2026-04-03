import { useEffect, useRef, useState } from 'react';
import styles from './TouchFlightControls.module.css';

interface TouchFlightInput {
  pitch: number;
  yaw: number;
  thrust: number;
  boost: boolean;
}

interface TouchFlightControlsProps {
  enabled: boolean;
  onInputChange: (input: TouchFlightInput) => void;
  onDock: () => void;
  onHail: () => void;
  onTargetCycle: () => void;
  onClusterMap: () => void;
  onSystemMap: () => void;
  onJump: () => void;
}

const STICK_RADIUS = 48;
const STICK_DEADZONE = 0.14;

export function TouchFlightControls({
  enabled,
  onInputChange,
  onDock,
  onHail,
  onTargetCycle,
  onClusterMap,
  onSystemMap,
  onJump,
}: TouchFlightControlsProps) {
  const stickRef = useRef<HTMLDivElement>(null);
  const [stickActive, setStickActive] = useState(false);
  const [stickPointerId, setStickPointerId] = useState<number | null>(null);
  const [stickX, setStickX] = useState(0);
  const [stickY, setStickY] = useState(0);
  const [thrustHeld, setThrustHeld] = useState(false);
  const [boostHeld, setBoostHeld] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setStickActive(false);
      setStickPointerId(null);
      setStickX(0);
      setStickY(0);
      setThrustHeld(false);
      setBoostHeld(false);
      onInputChange({ pitch: 0, yaw: 0, thrust: 0, boost: false });
      return;
    }

    onInputChange({
      pitch: stickY,
      yaw: stickX,
      thrust: thrustHeld ? 1 : 0,
      boost: boostHeld,
    });
  }, [enabled, stickX, stickY, thrustHeld, boostHeld, onInputChange]);

  const updateStickFromPointer = (clientX: number, clientY: number) => {
    const root = stickRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, STICK_RADIUS);
    const nx = dist > 0 ? (dx / dist) * (clamped / STICK_RADIUS) : 0;
    const ny = dist > 0 ? (dy / dist) * (clamped / STICK_RADIUS) : 0;
    const finalX = Math.abs(nx) < STICK_DEADZONE ? 0 : nx;
    const finalY = Math.abs(ny) < STICK_DEADZONE ? 0 : ny;
    setStickX(finalX);
    setStickY(finalY);
  };

  const handleStickDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setStickActive(true);
    setStickPointerId(e.pointerId);
    updateStickFromPointer(e.clientX, e.clientY);
  };

  const handleStickMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled || !stickActive || e.pointerId !== stickPointerId) return;
    e.preventDefault();
    updateStickFromPointer(e.clientX, e.clientY);
  };

  const resetStick = () => {
    setStickActive(false);
    setStickPointerId(null);
    setStickX(0);
    setStickY(0);
  };

  const handleStickUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== stickPointerId) return;
    e.preventDefault();
    resetStick();
  };

  const makeHoldHandlers = (setValue: (held: boolean) => void) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!enabled) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setValue(true);
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      setValue(false);
    },
    onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      setValue(false);
    },
    onPointerLeave: () => {
      setValue(false);
    },
  });

  const thrustHandlers = makeHoldHandlers(setThrustHeld);
  const boostHandlers = makeHoldHandlers(setBoostHeld);

  return (
    <div className={styles.root}>
      <div
        ref={stickRef}
        className={styles.stickZone}
        onPointerDown={handleStickDown}
        onPointerMove={handleStickMove}
        onPointerUp={handleStickUp}
        onPointerCancel={handleStickUp}
      >
        <div className={styles.stickRing} />
        <div
          className={styles.stickKnob}
          style={{
            transform: `translate(${stickX * STICK_RADIUS}px, ${stickY * STICK_RADIUS}px)`,
          }}
        />
      </div>

      <div className={styles.rightControls}>
        <button
          type="button"
          className={`${styles.holdButton} ${thrustHeld ? styles.pressed : ''}`}
          {...thrustHandlers}
        >
          THRUST
        </button>
        <button
          type="button"
          className={`${styles.holdButton} ${boostHeld ? styles.pressed : ''}`}
          {...boostHandlers}
        >
          BOOST
        </button>
      </div>

      <div className={styles.actionRail}>
        <button type="button" className={styles.actionButton} onClick={onDock}>DOCK</button>
        <button type="button" className={styles.actionButton} onClick={onHail}>HAIL</button>
        <button type="button" className={styles.actionButton} onClick={onTargetCycle}>TARGET</button>
        <button type="button" className={styles.actionButton} onClick={onClusterMap}>CLUSTER</button>
        <button type="button" className={styles.actionButton} onClick={onSystemMap}>SYSTEM</button>
        <button type="button" className={styles.actionButton} onClick={onJump}>JUMP</button>
      </div>
    </div>
  );
}
