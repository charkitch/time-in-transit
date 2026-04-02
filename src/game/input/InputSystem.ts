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

  read(): InputState {
    const down = isDown('KeyS') || isDown('ArrowDown');
    const up = isDown('KeyW') || isDown('ArrowUp');
    const left = isDown('KeyA') || isDown('ArrowLeft');
    const right = isDown('KeyD') || isDown('ArrowRight');

    return {
      pitch:       (down ? 1 : 0) - (up ? 1 : 0),
      yaw:         (isDown('KeyE') ? 1 : 0) - (isDown('KeyQ') ? 1 : 0),
      roll:        (right ? 1 : 0) - (left ? 1 : 0),
      thrust:      isDown('Space') ? 1 : 0,
      boost:       isDown('ShiftLeft') || isDown('ShiftRight'),
      dockRequest: false,
      clusterMap:  false,
      systemMap:   false,
      cycleTarget: false,
      jumpRequest: false,
      confirmJump: isDown('KeyJ'),
    };
  }

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
  }
}
