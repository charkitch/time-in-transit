export const MAP_W = 520;
export const MAP_H = 420;
export const MOBILE_BREAKPOINT = 820;
const MOBILE_CLUSTER_ZOOM = 2.8;

export interface MapViewport {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  zoom: number;
}

export interface OffscreenIndicator {
  id: string;
  x: number;
  y: number;
  color: string;
  label: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clampMobileCenter(x: number, y: number): { x: number; y: number } {
  const spanX = 100 / MOBILE_CLUSTER_ZOOM;
  const spanY = 100 / MOBILE_CLUSTER_ZOOM;
  const halfX = spanX / 2;
  const halfY = spanY / 2;
  return {
    x: clamp(x, halfX, 100 - halfX),
    y: clamp(y, halfY, 100 - halfY),
  };
}

export function getViewport(centerX: number, centerY: number, isMobile: boolean): MapViewport {
  if (!isMobile) {
    return { minX: 0, maxX: 100, minY: 0, maxY: 100, zoom: 1 };
  }

  const { x, y } = clampMobileCenter(centerX, centerY);
  const spanX = 100 / MOBILE_CLUSTER_ZOOM;
  const spanY = 100 / MOBILE_CLUSTER_ZOOM;
  const halfX = spanX / 2;
  const halfY = spanY / 2;

  return {
    minX: x - halfX,
    maxX: x + halfX,
    minY: y - halfY,
    maxY: y + halfY,
    zoom: MOBILE_CLUSTER_ZOOM,
  };
}

export function toCanvas(x: number, y: number, viewport: MapViewport): [number, number] {
  const nx = (x - viewport.minX) / (viewport.maxX - viewport.minX);
  const ny = (y - viewport.minY) / (viewport.maxY - viewport.minY);
  return [nx * MAP_W, ny * MAP_H];
}

export function toWorld(px: number, py: number, viewport: MapViewport): [number, number] {
  return [
    viewport.minX + px * (viewport.maxX - viewport.minX),
    viewport.minY + py * (viewport.maxY - viewport.minY),
  ];
}

export function isOnCanvas(x: number, y: number, pad = 10): boolean {
  return x >= pad && x <= MAP_W - pad && y >= pad && y <= MAP_H - pad;
}

export function edgePointForOffscreen(x: number, y: number, pad = 16): [number, number] {
  const cx = MAP_W / 2;
  const cy = MAP_H / 2;
  const dx = x - cx;
  const dy = y - cy;

  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) {
    return [cx, cy];
  }

  const tx = dx > 0 ? (MAP_W - pad - cx) / dx : (pad - cx) / dx;
  const ty = dy > 0 ? (MAP_H - pad - cy) / dy : (pad - cy) / dy;
  const t = Math.min(Math.abs(tx), Math.abs(ty));

  return [cx + dx * t, cy + dy * t];
}

export const STAR_TYPE_COLOR: Record<string, string> = {
  G: '#FFEE88', K: '#FFAA44', M: '#FF6633', F: '#FFFFFF', A: '#AABBFF',
  WD: '#F0F0FF', HE: '#88CCAA', NS: '#CCDDFF', PU: '#44AAFF', XB: '#FF6688',
  MG: '#DD44FF', BH: '#220022', XBB: '#FF4466', MQ: '#67D8FF',
};

export function applyAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return `${hex}${a}`;
}
