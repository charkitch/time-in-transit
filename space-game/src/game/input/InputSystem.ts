export interface InputState {
  pitch: number;   // -1 to 1  (S=+1 pitch down, W=-1 pitch up)
  yaw: number;     // -1 to 1  (Q=-1, E=+1)
  roll: number;    // -1 to 1  (A=-1, D=+1)
  thrust: number;  // 0 or 1
  boost: boolean;
  dockRequest: boolean;
  galaxyMap: boolean;
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
  private onGalaxyMap?: () => void;
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
    if (e.code === 'KeyG' && !e.repeat) this.onGalaxyMap?.();
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
    return {
      pitch:       (isDown('KeyS') ? 1 : 0) - (isDown('KeyW') ? 1 : 0),
      yaw:         (isDown('KeyE') ? 1 : 0) - (isDown('KeyQ') ? 1 : 0),
      roll:        (isDown('KeyD') ? 1 : 0) - (isDown('KeyA') ? 1 : 0),
      thrust:      isDown('ArrowUp') || isDown('Space') ? 1 : 0,
      boost:       isDown('ShiftLeft') || isDown('ShiftRight'),
      dockRequest: false,
      galaxyMap:   false,
      systemMap:   false,
      cycleTarget: false,
      jumpRequest: false,
      confirmJump: isDown('KeyJ'),
    };
  }

  onDockRequest(fn: () => void) { this.onDock = fn; }
  onGalaxyMapToggle(fn: () => void) { this.onGalaxyMap = fn; }
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
