export interface InputState {
  pitch: number;   // -1 to 1  (S=+1 pitch down, W=-1 pitch up)
  yaw: number;     // -1 to 1  (Q=-1, E=+1)
  roll: number;    // -1 to 1  (A=-1, D=+1)
  thrust: number;  // 0 or 1
  boost: boolean;
  dockRequest: boolean;
  clusterMap: boolean;
  systemMap: boolean;
  cycleTarget: boolean;
  jumpRequest: boolean;
  confirmJump: boolean;
}

const KEYS = new Set<string>();

function isDown(key: string): boolean {
  return KEYS.has(key);
}

export class InputSystem {
  private touchPitch = 0;
  private touchYaw = 0;
  private touchThrust = 0;
  private touchBoost = false;
  private onDock?: () => void;
  private onClusterMap?: () => void;
  private onSystemMap?: () => void;
  private onCycleTarget?: () => void;
  private onJumpRequest?: () => void;
  private onHail?: () => void;
  private onEscape?: () => void;

  constructor() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    KEYS.add(e.code);
    // one-shot actions
    if (e.code === 'KeyF' && !e.repeat) this.onDock?.();
    if (e.code === 'KeyG' && !e.repeat) this.onClusterMap?.();
    if (e.code === 'Digit1' && !e.repeat) this.onSystemMap?.();
    if (e.code === 'Tab') { e.preventDefault(); if (!e.repeat) this.onCycleTarget?.(); }
    if (e.code === 'KeyJ' && !e.repeat) this.onJumpRequest?.();
    if (e.code === 'KeyH' && !e.repeat) this.onHail?.();
    if (e.code === 'Escape' && !e.repeat) this.onEscape?.();
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    KEYS.delete(e.code);
  };

  private handleBlur = () => {
    KEYS.clear();
    this.resetTouchFlightInput();
  };

  read(invertControls = false): InputState {
    const down = isDown('KeyS') || isDown('ArrowDown');
    const up = isDown('KeyW') || isDown('ArrowUp');
    const left = isDown('KeyA') || isDown('ArrowLeft');
    const right = isDown('KeyD') || isDown('ArrowRight');
    const keyboardPitch = (down ? 1 : 0) - (up ? 1 : 0);
    const pitchCombined = keyboardPitch + this.touchPitch;
    const yawCombined = ((isDown('KeyE') ? 1 : 0) - (isDown('KeyQ') ? 1 : 0)) + this.touchYaw;
    const pitch = Math.max(-1, Math.min(1, pitchCombined));
    const yaw = Math.max(-1, Math.min(1, yawCombined));

    return {
      pitch:       invertControls ? -pitch : pitch,
      yaw,
      roll:        (right ? 1 : 0) - (left ? 1 : 0),
      thrust:      Math.max(isDown('Space') ? 1 : 0, this.touchThrust),
      boost:       isDown('ShiftLeft') || isDown('ShiftRight') || this.touchBoost,
      dockRequest: false,
      clusterMap:  false,
      systemMap:   false,
      cycleTarget: false,
      jumpRequest: false,
      confirmJump: isDown('KeyJ'),
    };
  }

  setTouchFlightInput(input: { pitch: number; yaw: number; thrust: number; boost: boolean }) {
    this.touchPitch = Math.max(-1, Math.min(1, input.pitch));
    this.touchYaw = Math.max(-1, Math.min(1, input.yaw));
    this.touchThrust = Math.max(0, Math.min(1, input.thrust));
    this.touchBoost = input.boost;
  }

  resetTouchFlightInput() {
    this.touchPitch = 0;
    this.touchYaw = 0;
    this.touchThrust = 0;
    this.touchBoost = false;
  }

  triggerDockRequest() { this.onDock?.(); }
  triggerClusterMapToggle() { this.onClusterMap?.(); }
  triggerSystemMapToggle() { this.onSystemMap?.(); }
  triggerCycleTargetEvent() { this.onCycleTarget?.(); }
  triggerJumpRequestEvent() { this.onJumpRequest?.(); }
  triggerHailRequest() { this.onHail?.(); }
  triggerEscapeEvent() { this.onEscape?.(); }

  onDockRequest(fn: () => void) { this.onDock = fn; }
  onClusterMapToggle(fn: () => void) { this.onClusterMap = fn; }
  onSystemMapToggle(fn: () => void) { this.onSystemMap = fn; }
  onCycleTargetEvent(fn: () => void) { this.onCycleTarget = fn; }
  onJumpRequestEvent(fn: () => void) { this.onJumpRequest = fn; }
  onHailRequest(fn: () => void) { this.onHail = fn; }
  onEscapeEvent(fn: () => void) { this.onEscape = fn; }

  dispose() {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
  }
}
