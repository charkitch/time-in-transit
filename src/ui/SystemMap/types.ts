import type { useGameState } from '../../game/GameState';
import type { SceneEntity } from '../../game/rendering/scene/types';
import type { FleetBattle } from '../../game/mechanics/FleetBattleSystem';

export const W = 540;
export const H = 400;
export const MOBILE_BREAKPOINT = 820;
export const DESKTOP_PICK_RADIUS = 14;
export const MOBILE_PICK_RADIUS = 22;
export const MOBILE_PAN_THRESHOLD = 6;
export const MOBILE_DEFAULT_RANGE_MULTIPLIER = 0.55;
export const MOBILE_DETAIL_LABEL_RANGE_MULTIPLIER = 0.34;

export type SystemData = NonNullable<ReturnType<typeof useGameState.getState>['currentSystem']>;

export interface PickTarget {
  id: string;
  x: number;
  y: number;
  r: number;
  tooltip: string;
}

export interface ViewportState {
  centerX: number;
  centerZ: number;
  range: number;
}

export interface WorldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface SelectedInfo {
  title: string;
  subtitle: string;
  accent: string;
}

export interface MobileLabel {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  priority: number;
}

export interface PointerMap {
  [pointerId: number]: { x: number; y: number };
}

export interface MobileGestureState {
  mode: 'idle' | 'pending' | 'pan' | 'pinch';
  startCenterX: number;
  startCenterZ: number;
  startRange: number;
  startX: number;
  startY: number;
  startMidX: number;
  startMidY: number;
  startDistance: number;
  didMove: boolean;
}

export interface SystemMapProps {
  onClose: () => void;
  getEntities: () => Map<string, SceneEntity>;
  getFleetBattle: () => FleetBattle | null;
  onTarget: (id: string) => void;
}

export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  viewport: ViewportState;
  isMobile: boolean;
  showDetailLabels: boolean;
  time: number;
  selectedId: string | null;
  hoveredId: string | null;
  targetId: string | null;
  pickTargets: PickTarget[];
  mobileLabels: MobileLabel[];
}

export const STAR_TYPE_LABELS: Record<string, string> = {
  G: 'Yellow dwarf', K: 'Orange dwarf', M: 'Red dwarf', F: 'White star',
  A: 'Blue-white star', WD: 'White dwarf', HE: 'Helium star', NS: 'Neutron star',
  PU: 'Pulsar', XB: 'X-ray binary', MG: 'Magnetar', BH: 'Black hole',
  XBB: 'X-ray binary', MQ: 'Microquasar', IRON: 'Iron star',
};

export const NPC_COLOR_HUMAN = '#AADDFF';
export const NPC_COLOR_ALIEN = '#DDAAFF';
export const FLEET_BATTLE_COLOR = '#FF4444';
export const STATION_COLOR = '#44CCFF';
export const MOON_COLOR = '#99AABB';
export const PLAYER_COLOR = '#66E6FF';
export const DYSON_COLOR = '#B9C2CF';
export const SECRET_BASE_COLOR = '#8844FF';
export const PLANET_COLOR = '#33FF88';
