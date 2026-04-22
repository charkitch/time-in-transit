/**
 * Type declarations for dev-mode window globals exposed by App.tsx.
 * These describe the test-facing surface of __GAME__ and __STORE__,
 * including private members that tests reach into via the window bridge.
 */

interface TestVec3 {
  x: number;
  y: number;
  z: number;
  distanceTo(other: TestVec3): number;
}

interface TestQuat {
  x: number;
  y: number;
  z: number;
  w: number;
}

interface TestRendererInfo {
  memory: { geometries: number; textures: number };
}

interface TestRenderer {
  info: TestRendererInfo;
  getContext(): WebGLRenderingContext;
}

interface TestEntity {
  id: string;
  type: string;
  siteHostId?: string;
  worldPos: TestVec3;
  collisionRadius: number;
}

interface TestSceneRenderer {
  renderer: TestRenderer;
  shipGroup: { position: TestVec3; rotation: TestVec3; quaternion: TestQuat };
  getAllEntities?(): Map<string, TestEntity>;
}

interface TestInteraction {
  prepareLanding(systemId: number, stationId?: string): void;
}

interface TestGame {
  requestJump(): void;
  requestClusterMapToggle(): void;
  requestSystemMapToggle(): void;
  triggerDeath(msg: string[]): void;
  sceneRenderer: TestSceneRenderer;
  interaction: TestInteraction;
}

interface TestGameState {
  ui: {
    mode: string;
    hyperspaceTarget: number | null;
    hyperspaceCountdown: number;
  };
  player: {
    shields: number;
    fuel: number;
    credits: number;
    cargo: Record<string, number>;
    heat: number;
  };
  currentSystemId: number;
  currentSystem?: {
    mainStationPlanetId?: string;
  };
  cluster: Array<{ x: number; y: number; name: string }>;
  invertControls: boolean;

  setHyperspaceTarget(idx: number | null): void;
  setHyperspaceCountdown(n: number): void;
  setUIMode(mode: string): void;
  setInvertControls(b: boolean): void;
  setCredits(n: number): void;
  setShields(n: number): void;
  setHeat(n: number): void;
  addCargo(name: string, qty: number, purchasePrice?: number): void;
  saveGame(): void;
  setPlayerPosition(v: { x: number; y: number; z: number }): void;
  setPlayerVelocity(v: { x: number; y: number; z: number }): void;
  setPlayerQuaternion(v: { x: number; y: number; z: number; w: number }): void;
}

interface TestGameStore {
  getState(): TestGameState;
  setState(partial: Partial<TestGameState>): void;
}

interface Window {
  __GAME__?: TestGame;
  __STORE__?: TestGameStore;
  __TEST_LOSE_CTX_EXT__?: WEBGL_lose_context;
  __SAVE_CALLS__?: number;
}
