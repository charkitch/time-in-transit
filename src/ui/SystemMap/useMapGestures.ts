import { useRef, useState, useCallback } from 'react';
import { W, H, MOBILE_PAN_THRESHOLD } from './types';
import type { WorldBounds, ViewportState, MobileGestureState, PointerMap, SystemData } from './types';
import { canvasCoordsFromClient, clampRange, clampCenter, toWorld } from './viewport';

interface UseMapGesturesOptions {
  isMobile: boolean;
  currentSystem: SystemData | null;
  defaultRange: number;
  getWorldBounds: () => WorldBounds | null;
  onTap: (mx: number, my: number) => void;
  initialViewport: ViewportState;
}

interface UseMapGesturesResult {
  viewport: ViewportState;
  applyViewport: (centerX: number, centerZ: number, range: number) => void;
  handlers: {
    onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => void;
    onPointerCancel: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  };
  zoom: (multiplier: number) => void;
}

export function useMapGestures({
  isMobile,
  currentSystem,
  defaultRange,
  getWorldBounds,
  onTap,
  initialViewport,
}: UseMapGesturesOptions): UseMapGesturesResult {
  const [viewport, setViewport] = useState<ViewportState>(initialViewport);
  const activePointersRef = useRef<PointerMap>({});
  const mobileGestureRef = useRef<MobileGestureState>({
    mode: 'idle',
    startCenterX: 0,
    startCenterZ: 0,
    startRange: 0,
    startX: 0,
    startY: 0,
    startMidX: 0,
    startMidY: 0,
    startDistance: 0,
    didMove: false,
  });

  const applyViewport = useCallback((centerX: number, centerZ: number, range: number) => {
    if (!currentSystem) return;
    const bounds = getWorldBounds();
    const clampedRange = clampRange(range, defaultRange, currentSystem);
    if (!bounds) {
      setViewport({ centerX, centerZ, range: clampedRange });
      return;
    }
    const nextCenter = clampCenter(centerX, centerZ, clampedRange, bounds);
    setViewport({ centerX: nextCenter.x, centerZ: nextCenter.z, range: clampedRange });
  }, [currentSystem, defaultRange, getWorldBounds]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isMobile) return;
    const canvas = e.currentTarget as HTMLCanvasElement;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = canvasCoordsFromClient(e.clientX, e.clientY, canvas);
    activePointersRef.current[e.pointerId] = { x, y };

    const pointers = Object.values(activePointersRef.current);
    if (pointers.length === 1) {
      mobileGestureRef.current = {
        mode: 'pending',
        startCenterX: viewport.centerX,
        startCenterZ: viewport.centerZ,
        startRange: viewport.range,
        startX: x,
        startY: y,
        startMidX: x,
        startMidY: y,
        startDistance: 0,
        didMove: false,
      };
      return;
    }

    if (pointers.length >= 2) {
      const [a, b] = pointers;
      mobileGestureRef.current = {
        mode: 'pinch',
        startCenterX: viewport.centerX,
        startCenterZ: viewport.centerZ,
        startRange: viewport.range,
        startX: a.x,
        startY: a.y,
        startMidX: (a.x + b.x) * 0.5,
        startMidY: (a.y + b.y) * 0.5,
        startDistance: Math.max(8, Math.hypot(a.x - b.x, a.y - b.y)),
        didMove: true,
      };
    }
  }, [isMobile, viewport.centerX, viewport.centerZ, viewport.range]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isMobile) return;
    if (!(e.pointerId in activePointersRef.current)) return;
    e.preventDefault();
    const canvas = e.currentTarget as HTMLCanvasElement;
    const [x, y] = canvasCoordsFromClient(e.clientX, e.clientY, canvas);
    activePointersRef.current[e.pointerId] = { x, y };
    const pointers = Object.values(activePointersRef.current);
    const gesture = mobileGestureRef.current;

    if (pointers.length >= 2) {
      const [a, b] = pointers;
      const distance = Math.max(8, Math.hypot(a.x - b.x, a.y - b.y));
      const midX = (a.x + b.x) * 0.5;
      const midY = (a.y + b.y) * 0.5;
      const nextRange = gesture.startRange * (gesture.startDistance / distance);
      const startViewport: ViewportState = {
        centerX: gesture.startCenterX,
        centerZ: gesture.startCenterZ,
        range: gesture.startRange,
      };
      const [worldMidX, worldMidZ] = toWorld(gesture.startMidX, gesture.startMidY, startViewport);
      const worldPerPixelX = ((gesture.startRange * 2) * (W / H)) / W;
      const worldPerPixelZ = (gesture.startRange * 2) / H;
      const panCenterX = gesture.startCenterX - (midX - gesture.startMidX) * worldPerPixelX;
      const panCenterZ = gesture.startCenterZ - (midY - gesture.startMidY) * worldPerPixelZ;
      const tempViewport: ViewportState = {
        centerX: panCenterX,
        centerZ: panCenterZ,
        range: clampRange(nextRange, defaultRange, currentSystem!),
      };
      const [currentMidX, currentMidZ] = toWorld(midX, midY, tempViewport);
      applyViewport(
        panCenterX + (worldMidX - currentMidX),
        panCenterZ + (worldMidZ - currentMidZ),
        nextRange,
      );
      return;
    }

    const dx = x - gesture.startX;
    const dy = y - gesture.startY;
    if (Math.hypot(dx, dy) > MOBILE_PAN_THRESHOLD) {
      mobileGestureRef.current.mode = 'pan';
      mobileGestureRef.current.didMove = true;
    }
    const worldPerPixelX = ((gesture.startRange * 2) * (W / H)) / W;
    const worldPerPixelZ = (gesture.startRange * 2) / H;
    applyViewport(
      gesture.startCenterX - dx * worldPerPixelX,
      gesture.startCenterZ - dy * worldPerPixelZ,
      gesture.startRange,
    );
  }, [applyViewport, currentSystem, defaultRange, isMobile]);

  const finishPointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget as HTMLCanvasElement;
    if (!(e.pointerId in activePointersRef.current)) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    const gesture = mobileGestureRef.current;
    const wasTap = Object.keys(activePointersRef.current).length === 1 && !gesture.didMove;
    const [mx, my] = canvasCoordsFromClient(e.clientX, e.clientY, canvas);
    delete activePointersRef.current[e.pointerId];

    const remainingPointers = Object.values(activePointersRef.current);
    if (remainingPointers.length >= 1) {
      const [remaining] = remainingPointers;
      mobileGestureRef.current = {
        mode: 'pending',
        startCenterX: viewport.centerX,
        startCenterZ: viewport.centerZ,
        startRange: viewport.range,
        startX: remaining.x,
        startY: remaining.y,
        startMidX: remaining.x,
        startMidY: remaining.y,
        startDistance: 0,
        didMove: true,
      };
    } else {
      mobileGestureRef.current = {
        mode: 'idle',
        startCenterX: viewport.centerX,
        startCenterZ: viewport.centerZ,
        startRange: viewport.range,
        startX: 0,
        startY: 0,
        startMidX: 0,
        startMidY: 0,
        startDistance: 0,
        didMove: false,
      };
    }

    if (isMobile && wasTap) onTap(mx, my);
  }, [isMobile, onTap, viewport.centerX, viewport.centerZ, viewport.range]);

  const zoom = useCallback((multiplier: number) => {
    if (!currentSystem) return;
    applyViewport(viewport.centerX, viewport.centerZ, viewport.range * multiplier);
  }, [applyViewport, currentSystem, viewport.centerX, viewport.centerZ, viewport.range]);

  return {
    viewport,
    applyViewport,
    handlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: finishPointer,
      onPointerCancel: finishPointer,
    },
    zoom,
  };
}
