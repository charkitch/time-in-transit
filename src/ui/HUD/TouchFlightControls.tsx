import { useEffect, useRef, useState } from 'react';
import styles from './TouchFlightControls.module.css';

interface TouchFlightInput {
  pitch: number;
  yaw: number;
  roll: number;
  thrust: number;
  boost: boolean;
}

interface TouchFlightControlsProps {
  enabled: boolean;
  isInMotion: boolean;
  canDockNow: boolean;
  canLandNow: boolean;
  canScanNow: boolean;
  canHailNow: boolean;
  onInputChange: (input: TouchFlightInput) => void;
  onDock: () => void;
  onHail: () => void;
  onLand: () => void;
  onScan: () => void;
  onTargetCycle: () => void;
  onClusterMap: () => void;
  onSystemMap: () => void;
  onMenu: () => void;
}

const STICK_RADIUS_FRACTION = 48 / 112; // knob travel as fraction of zone size
const STICK_DEADZONE = 0.14;
const ROLL_EDGE_THRESHOLD = 0.5;

export function TouchFlightControls({
  enabled,
  isInMotion,
  canDockNow,
  canLandNow,
  canScanNow,
  canHailNow,
  onInputChange,
  onDock,
  onHail,
  onLand,
  onScan,
  onTargetCycle,
  onClusterMap,
  onSystemMap,
  onMenu,
}: TouchFlightControlsProps) {
  const leftStickRef = useRef<HTMLDivElement>(null);
  const rightStickRef = useRef<HTMLDivElement>(null);
  const leftRadiusRef = useRef(48);
  const rightRadiusRef = useRef(48);

  const [leftActive, setLeftActive] = useState(false);
  const [leftPointerId, setLeftPointerId] = useState<number | null>(null);
  const [leftX, setLeftX] = useState(0);
  const [leftY, setLeftY] = useState(0);

  const [rightActive, setRightActive] = useState(false);
  const [rightPointerId, setRightPointerId] = useState<number | null>(null);
  const [rightX, setRightX] = useState(0);
  const [rightY, setRightY] = useState(0);
  const [rightRawX, setRightRawX] = useState(0);
  const [rightRawY, setRightRawY] = useState(0);
  const [boostPressed, setBoostPressed] = useState(false);

  const [actionsOpen, setActionsOpen] = useState(false);

  const forwardThrust = Math.max(0, -rightRawY);
  const boostActive = boostPressed && isInMotion;
  const thrust = rightActive ? forwardThrust : 0;
  const roll = Math.abs(rightX) < ROLL_EDGE_THRESHOLD
    ? 0
    : Math.sign(rightX) * ((Math.abs(rightX) - ROLL_EDGE_THRESHOLD) / (1 - ROLL_EDGE_THRESHOLD));

  useEffect(() => {
    if (!isInMotion) {
      setBoostPressed(false);
    }
  }, [isInMotion]);

  useEffect(() => {
    if (!enabled) {
      setLeftActive(false);
      setLeftPointerId(null);
      setLeftX(0);
      setLeftY(0);
      setRightActive(false);
      setRightPointerId(null);
      setRightX(0);
      setRightY(0);
      setRightRawX(0);
      setRightRawY(0);
      setBoostPressed(false);
      setActionsOpen(false);
      onInputChange({ pitch: 0, yaw: 0, roll: 0, thrust: 0, boost: false });
      return;
    }

    onInputChange({
      pitch: leftY,
      yaw: leftX,
      roll,
      thrust,
      boost: boostActive,
    });
  }, [enabled, leftX, leftY, roll, thrust, boostActive, onInputChange]);

  const updateStickFromPointer = (
    stickRef: React.RefObject<HTMLDivElement | null>,
    radiusRef: { current: number },
    clientX: number,
    clientY: number,
    setX: (x: number) => void,
    setY: (y: number) => void,
    setRawX?: (x: number) => void,
    setRawY?: (y: number) => void,
  ) => {
    const root = stickRef.current;
    if (!root) return;

    const rect = root.getBoundingClientRect();
    const radius = rect.width * STICK_RADIUS_FRACTION;
    radiusRef.current = radius;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, radius);
    const nx = dist > 0 ? (dx / dist) * (clamped / radius) : 0;
    const ny = dist > 0 ? (dy / dist) * (clamped / radius) : 0;
    setRawX?.(nx);
    setRawY?.(ny);

    const finalX = Math.abs(nx) < STICK_DEADZONE ? 0 : nx;
    const finalY = Math.abs(ny) < STICK_DEADZONE ? 0 : ny;
    setX(finalX);
    setY(finalY);
  };

  const handleLeftDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setLeftActive(true);
    setLeftPointerId(e.pointerId);
    updateStickFromPointer(leftStickRef, leftRadiusRef, e.clientX, e.clientY, setLeftX, setLeftY);
  };

  const handleLeftMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled || !leftActive || e.pointerId !== leftPointerId) return;
    e.preventDefault();
    updateStickFromPointer(leftStickRef, leftRadiusRef, e.clientX, e.clientY, setLeftX, setLeftY);
  };

  const handleLeftUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== leftPointerId) return;
    e.preventDefault();
    setLeftActive(false);
    setLeftPointerId(null);
    setLeftX(0);
    setLeftY(0);
  };

  const handleRightDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setRightActive(true);
    setRightPointerId(e.pointerId);
    updateStickFromPointer(rightStickRef, rightRadiusRef, e.clientX, e.clientY, setRightX, setRightY, setRightRawX, setRightRawY);
  };

  const handleRightMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled || !rightActive || e.pointerId !== rightPointerId) return;
    e.preventDefault();
    updateStickFromPointer(rightStickRef, rightRadiusRef, e.clientX, e.clientY, setRightX, setRightY, setRightRawX, setRightRawY);
  };

  const handleRightUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== rightPointerId) return;
    e.preventDefault();
    setRightActive(false);
    setRightPointerId(null);
    setRightX(0);
    setRightY(0);
    setRightRawX(0);
    setRightRawY(0);
  };

  const runAction = (action: () => void) => {
    if (!enabled) return;
    action();
    setActionsOpen(false);
  };

  return (
    <div className={styles.root}>
      <div
        ref={leftStickRef}
        className={styles.stickZone}
        onPointerDown={handleLeftDown}
        onPointerMove={handleLeftMove}
        onPointerUp={handleLeftUp}
        onPointerCancel={handleLeftUp}
      >
        <div className={styles.stickRing} />
        <div
          className={styles.stickKnob}
          style={{
            transform: `translate(${leftX * leftRadiusRef.current}px, ${leftY * leftRadiusRef.current}px)`,
          }}
        />
      </div>

      <div
        ref={rightStickRef}
        className={styles.rightStickZone}
        onPointerDown={handleRightDown}
        onPointerMove={handleRightMove}
        onPointerUp={handleRightUp}
        onPointerCancel={handleRightUp}
      >
        <div className={styles.stickRing} />
        <div
          className={styles.stickKnob}
          style={{
            transform: `translate(${rightX * rightRadiusRef.current}px, ${rightY * rightRadiusRef.current}px)`,
          }}
        />
      </div>
      <button
        type="button"
        className={`${styles.boostButton} ${boostActive ? styles.boostButtonActive : ''}`}
        disabled={!enabled || !isInMotion}
        onPointerDown={(e) => {
          if (!enabled || !isInMotion) return;
          e.preventDefault();
          setBoostPressed(true);
        }}
        onPointerUp={() => setBoostPressed(false)}
        onPointerCancel={() => setBoostPressed(false)}
        onPointerLeave={() => setBoostPressed(false)}
      >
        BOOST
      </button>

      {enabled && canDockNow && (
        <button
          type="button"
          className={styles.quickDockButton}
          onClick={onDock}
        >
          DOCK
        </button>
      )}
      {enabled && canLandNow && !canDockNow && (
        <button
          type="button"
          className={styles.quickLandButton}
          onClick={onLand}
        >
          LAND
        </button>
      )}
      {enabled && canHailNow && (
        <button
          type="button"
          className={styles.quickHailButton}
          onClick={onHail}
        >
          HAIL
        </button>
      )}
      {enabled && canScanNow && (
        <button
          type="button"
          className={styles.quickScanButton}
          onClick={onScan}
        >
          SCAN
        </button>
      )}

      <div className={styles.menuWrap}>
        <button
          type="button"
          className={styles.targetButton}
          onClick={() => enabled && onTargetCycle()}
          disabled={!enabled}
        >
          TARGET
        </button>
        <div className={styles.actionsWrap}>
          <button
            type="button"
            className={`${styles.menuButton} ${actionsOpen ? styles.menuButtonOpen : ''}`}
            onClick={() => enabled && setActionsOpen(v => !v)}
            disabled={!enabled}
          >
            ACTIONS
          </button>
          {actionsOpen && enabled && (
            <div className={styles.actionMenu}>
              <button type="button" className={styles.actionButton} onClick={() => runAction(onClusterMap)}>CLUSTER</button>
              <button type="button" className={styles.actionButton} onClick={() => runAction(onSystemMap)}>SYSTEM</button>
              <button type="button" className={styles.actionButton} onClick={() => runAction(onMenu)}>MENU</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
