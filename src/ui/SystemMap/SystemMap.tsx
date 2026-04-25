import { useRef, useEffect, useCallback, useState } from 'react';
import { useGameState } from '../../game/GameState';
import { STAR_COLORS } from '../../game/constants';
import { BATTLE_DANGER_RANGE } from '../../game/mechanics/FleetBattleSystem';
import type { SceneEntity } from '../../game/rendering/scene/types';
import type { FleetBattle } from '../../game/mechanics/FleetBattleSystem';
import * as THREE from 'three';
import { drawMagnetar, drawBlackHole, drawPlanetRings, drawTooltip, drawHighlight } from './drawHelpers';
import styles from './SystemMap.module.css';

const W = 540;
const H = 400;
const MOBILE_BREAKPOINT = 820;
const DESKTOP_PICK_RADIUS = 14;
const MOBILE_PICK_RADIUS = 22;
const MOBILE_PAN_THRESHOLD = 6;
const MOBILE_DEFAULT_RANGE_MULTIPLIER = 0.55;
const MOBILE_DETAIL_LABEL_RANGE_MULTIPLIER = 0.34;

interface PickTarget {
  id: string;
  x: number;
  y: number;
  r: number;
  tooltip: string;
}

interface ViewportState {
  centerX: number;
  centerZ: number;
  range: number;
}

interface WorldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface SelectedInfo {
  title: string;
  subtitle: string;
  accent: string;
}

interface MobileLabel {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  priority: number;
}

interface SystemMapProps {
  onClose: () => void;
  getEntities: () => Map<string, SceneEntity>;
  getFleetBattle: () => FleetBattle | null;
  onTarget: (id: string) => void;
}

interface PointerMap {
  [pointerId: number]: { x: number; y: number };
}

interface MobileGestureState {
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

const STAR_TYPE_LABELS: Record<string, string> = {
  G: 'Yellow dwarf', K: 'Orange dwarf', M: 'Red dwarf', F: 'White star',
  A: 'Blue-white star', WD: 'White dwarf', HE: 'Helium star', NS: 'Neutron star',
  PU: 'Pulsar', XB: 'X-ray binary', MG: 'Magnetar', BH: 'Black hole',
  XBB: 'X-ray binary', MQ: 'Microquasar', IRON: 'Iron star',
};

const NPC_COLOR_HUMAN = '#AADDFF';
const NPC_COLOR_ALIEN = '#DDAAFF';
const FLEET_BATTLE_COLOR = '#FF4444';
const STATION_COLOR = '#44CCFF';
const MOON_COLOR = '#99AABB';
const PLAYER_COLOR = '#66E6FF';
const DYSON_COLOR = '#B9C2CF';
const SECRET_BASE_COLOR = '#8844FF';
const PLANET_COLOR = '#33FF88';

function canvasCoordsFromClient(clientX: number, clientY: number, canvas: HTMLCanvasElement): [number, number] {
  const rect = canvas.getBoundingClientRect();
  return [
    (clientX - rect.left) * (W / rect.width),
    (clientY - rect.top) * (H / rect.height),
  ];
}

function findNearest(
  mx: number,
  my: number,
  targets: PickTarget[],
  baseRadius: number,
): PickTarget | null {
  let best: PickTarget | null = null;
  let bestDist = Infinity;
  for (const t of targets) {
    const dx = mx - t.x;
    const dy = my - t.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const threshold = Math.max(baseRadius, t.r);
    if (dist <= threshold && dist < bestDist) {
      bestDist = dist;
      best = t;
    }
  }
  return best;
}

function isAlienShipName(name: string): boolean {
  return ['Ixh', 'Qel', 'Ruum', 'Nyth', 'Tza', 'Vorr', 'Khir', 'Saa']
    .some(prefix => name.startsWith(prefix));
}

function getPlanetLabel(planet: { type: string }): string {
  return planet.type === 'gas_giant' ? 'Gas giant' : 'Rocky planet';
}

function clampRange(nextRange: number, defaultRange: number, currentSystem: NonNullable<ReturnType<typeof useGameState.getState>['currentSystem']>): number {
  const maxOrbit = Math.max(
    ...currentSystem.planets.map(planet => planet.orbitRadius),
    ...currentSystem.dysonShells.map(shell => shell.orbitRadius),
    ...currentSystem.secretBases.map(base => base.orbitRadius),
    currentSystem.asteroidBelt?.outerRadius ?? 0,
    currentSystem.starRadius * 8,
    defaultRange,
  );
  const minRange = Math.max(42, defaultRange * 0.18);
  const maxRange = Math.max(minRange * 1.5, maxOrbit * 1.3, defaultRange * 2.3);
  return Math.min(maxRange, Math.max(minRange, nextRange));
}

function getViewportBounds(viewport: ViewportState): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const halfWidth = viewport.range * (W / H);
  return {
    minX: viewport.centerX - halfWidth,
    maxX: viewport.centerX + halfWidth,
    minZ: viewport.centerZ - viewport.range,
    maxZ: viewport.centerZ + viewport.range,
  };
}

function toMap(wx: number, wz: number, viewport: ViewportState): [number, number] {
  const bounds = getViewportBounds(viewport);
  return [
    ((wx - bounds.minX) / (bounds.maxX - bounds.minX)) * W,
    ((wz - bounds.minZ) / (bounds.maxZ - bounds.minZ)) * H,
  ];
}

function toWorld(mx: number, my: number, viewport: ViewportState): [number, number] {
  const bounds = getViewportBounds(viewport);
  return [
    bounds.minX + (mx / W) * (bounds.maxX - bounds.minX),
    bounds.minZ + (my / H) * (bounds.maxZ - bounds.minZ),
  ];
}

function clampCenter(centerX: number, centerZ: number, range: number, bounds: WorldBounds): { x: number; z: number } {
  const halfWidth = range * (W / H);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxZ - bounds.minZ;

  const clampedX = width <= halfWidth * 2
    ? (bounds.minX + bounds.maxX) * 0.5
    : Math.min(bounds.maxX - halfWidth, Math.max(bounds.minX + halfWidth, centerX));
  const clampedZ = height <= range * 2
    ? (bounds.minZ + bounds.maxZ) * 0.5
    : Math.min(bounds.maxZ - range, Math.max(bounds.minZ + range, centerZ));

  return { x: clampedX, z: clampedZ };
}

function computeDefaultRange(currentSystem: NonNullable<ReturnType<typeof useGameState.getState>['currentSystem']>, playerPos: { x: number; z: number }): number {
  const mainPlanet = currentSystem.planets.find(p => p.id === currentSystem.mainStationPlanetId) ?? null;
  const spawnDistanceFromMainPlanet = mainPlanet ? (mainPlanet.radius * 2.2 + 45) : 0;
  const spawnLateralOffset = 20;
  const initialSpawnToStarDistance = mainPlanet
    ? Math.hypot(mainPlanet.orbitRadius + spawnDistanceFromMainPlanet, spawnLateralOffset)
    : Math.hypot(playerPos.x, playerPos.z);
  const localMapRange = Math.max(initialSpawnToStarDistance * 2, currentSystem.starRadius * 8, 200) * 3;
  return localMapRange;
}

function computeWorldBounds(
  currentSystem: NonNullable<ReturnType<typeof useGameState.getState>['currentSystem']>,
  entities: Map<string, SceneEntity>,
  battle: FleetBattle | null,
  playerPos: { x: number; z: number },
): WorldBounds {
  const maxOrbit = Math.max(
    ...currentSystem.planets.map(planet => planet.orbitRadius),
    ...currentSystem.dysonShells.map(shell => shell.orbitRadius),
    ...currentSystem.secretBases.map(base => base.orbitRadius),
    currentSystem.asteroidBelt?.outerRadius ?? 0,
    currentSystem.starRadius * 8,
    160,
  );
  const bounds: WorldBounds = {
    minX: -maxOrbit,
    maxX: maxOrbit,
    minZ: -maxOrbit,
    maxZ: maxOrbit,
  };

  const expand = (x: number, z: number, margin = 0) => {
    bounds.minX = Math.min(bounds.minX, x - margin);
    bounds.maxX = Math.max(bounds.maxX, x + margin);
    bounds.minZ = Math.min(bounds.minZ, z - margin);
    bounds.maxZ = Math.max(bounds.maxZ, z + margin);
  };

  expand(playerPos.x, playerPos.z, 30);
  if (battle) expand(battle.position.x, battle.position.z, BATTLE_DANGER_RANGE);

  for (const [, entity] of entities) {
    if (entity.type === 'npc_ship' || entity.type === 'fleet_ship' || entity.type === 'planet' || entity.type === 'moon' || entity.type === 'station') {
      expand(entity.worldPos.x, entity.worldPos.z, entity.collisionRadius ?? 12);
    }
  }

  return bounds;
}

function getSelectedInfo(
  id: string | null,
  currentSystem: NonNullable<ReturnType<typeof useGameState.getState>['currentSystem']>,
  starName: string | undefined,
  entities: Map<string, SceneEntity>,
): SelectedInfo | null {
  if (!id) return null;
  if (id === 'star') {
    return {
      title: starName ?? 'Star',
      subtitle: STAR_TYPE_LABELS[currentSystem.starType] ?? 'Star',
      accent: '#' + new THREE.Color(STAR_COLORS[currentSystem.starType] ?? 0xFFEE88).getHexString(),
    };
  }

  const planet = currentSystem.planets.find(entry => entry.id === id);
  if (planet) {
    return {
      title: planet.name,
      subtitle: getPlanetLabel(planet),
      accent: '#' + new THREE.Color(planet.color).getHexString(),
    };
  }

  const stationPlanet = currentSystem.planets.find(entry => `station-${entry.id}` === id);
  if (stationPlanet) {
    const archLabel = stationPlanet.stationArchetype?.replace(/_/g, ' ') ?? 'station';
    return {
      title: `Station at ${stationPlanet.name}`,
      subtitle: archLabel,
      accent: STATION_COLOR,
    };
  }

  for (const planetEntry of currentSystem.planets) {
    const moon = planetEntry.moons.find(entry => entry.id === id);
    if (moon) {
      return {
        title: `${planetEntry.name} moon`,
        subtitle: 'Moon',
        accent: MOON_COLOR,
      };
    }
  }

  const shell = currentSystem.dysonShells.find(entry => entry.id === id);
  if (shell) {
    return {
      title: shell.name,
      subtitle: 'Dyson shell',
      accent: '#' + new THREE.Color(shell.color).getHexString(),
    };
  }

  const base = currentSystem.secretBases.find(entry => entry.id === id);
  if (base) {
    const baseLabels: Record<string, string> = {
      asteroid: 'Asteroid base',
      oort_cloud: 'Oort cloud base',
      maximum_space: 'Deep space base',
    };
    return {
      title: base.name,
      subtitle: baseLabels[base.type] ?? 'Base',
      accent: SECRET_BASE_COLOR,
    };
  }

  const entity = entities.get(id);
  if (!entity) return null;
  if (entity.type === 'npc_ship') {
    const isAlien = isAlienShipName(entity.name);
    return {
      title: entity.name,
      subtitle: isAlien ? 'Alien vessel' : 'Freighter',
      accent: isAlien ? NPC_COLOR_ALIEN : NPC_COLOR_HUMAN,
    };
  }
  if (entity.type === 'fleet_ship') {
    return {
      title: entity.name,
      subtitle: 'Fleet contact',
      accent: FLEET_BATTLE_COLOR,
    };
  }

  return {
    title: entity.name,
    subtitle: entity.type.replace(/_/g, ' '),
    accent: PLAYER_COLOR,
  };
}

function drawMobileLabels(ctx: CanvasRenderingContext2D, labels: MobileLabel[]): void {
  const placed: Array<{ left: number; top: number; right: number; bottom: number }> = [];
  const sorted = [...labels].sort((a, b) => b.priority - a.priority);
  ctx.font = '10px Courier New';
  ctx.textBaseline = 'top';

  for (const label of sorted) {
    const text = label.text.trim();
    if (!text) continue;
    const metrics = ctx.measureText(text);
    const width = metrics.width;
    const left = Math.max(4, Math.min(W - width - 4, label.x + 8));
    const top = Math.max(4, Math.min(H - 14, label.y - 5));
    const bounds = {
      left: left - 2,
      top: top - 1,
      right: left + width + 2,
      bottom: top + 11,
    };
    const overlaps = placed.some(box =>
      !(bounds.right < box.left || bounds.left > box.right || bounds.bottom < box.top || bounds.top > box.bottom),
    );
    if (overlaps) continue;

    ctx.fillStyle = 'rgba(1, 4, 8, 0.76)';
    ctx.fillRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
    ctx.fillStyle = label.color;
    ctx.fillText(text, left, top);
    placed.push(bounds);
  }
}

export function SystemMap({ onClose, getEntities, getFleetBattle, onTarget }: SystemMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pickTargetsRef = useRef<PickTarget[]>([]);
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

  const [hoverPos, setHoverPos] = useState<[number, number] | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hasNpcShips, setHasNpcShips] = useState(false);
  const [hasBattle, setHasBattle] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const currentSystem = useGameState(s => s.currentSystem);
  const currentSystemId = useGameState(s => s.currentSystemId);
  const cluster = useGameState(s => s.cluster);
  const starData = cluster[currentSystemId];
  const time = useGameState(s => s.time);
  const targetId = useGameState(s => s.player.targetId);
  const playerPos = useGameState(s => s.player.position);

  const defaultRange = currentSystem ? computeDefaultRange(currentSystem, playerPos) : 400;
  const [mobileViewport, setMobileViewport] = useState<ViewportState>({
    centerX: playerPos.x,
    centerZ: playerPos.z,
    range: defaultRange * MOBILE_DEFAULT_RANGE_MULTIPLIER,
  });

  useEffect(() => {
    const media = window.matchMedia(
      `(max-width: ${MOBILE_BREAKPOINT}px), (hover: none) and (pointer: coarse)`,
    );
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!currentSystem) return;
    const nextRange = clampRange(defaultRange * MOBILE_DEFAULT_RANGE_MULTIPLIER, defaultRange, currentSystem);
    setMobileViewport({
      centerX: playerPos.x,
      centerZ: playerPos.z,
      range: nextRange,
    });
    setSelectedId(targetId ?? null);
    setHoverPos(null);
    setHoveredId(null);
  }, [currentSystemId]); // Reset when entering a new system.

  useEffect(() => {
    if (!isMobile) {
      setSelectedId(null);
    } else if (targetId) {
      setSelectedId(prev => prev ?? targetId);
    }
  }, [isMobile, targetId]);

  const getViewport = useCallback((): ViewportState => {
    if (isMobile) return mobileViewport;
    return {
      centerX: playerPos.x,
      centerZ: playerPos.z,
      range: defaultRange,
    };
  }, [defaultRange, isMobile, mobileViewport, playerPos.x, playerPos.z]);

  const getWorldBounds = useCallback((): WorldBounds | null => {
    if (!currentSystem) return null;
    return computeWorldBounds(currentSystem, getEntities(), getFleetBattle(), playerPos);
  }, [currentSystem, getEntities, getFleetBattle, playerPos]);

  const applyMobileViewport = useCallback((centerX: number, centerZ: number, range: number) => {
    if (!currentSystem) return;
    const bounds = getWorldBounds();
    const clampedRange = clampRange(range, defaultRange, currentSystem);
    if (!bounds) {
      setMobileViewport({ centerX, centerZ, range: clampedRange });
      return;
    }
    const nextCenter = clampCenter(centerX, centerZ, clampedRange, bounds);
    setMobileViewport({
      centerX: nextCenter.x,
      centerZ: nextCenter.z,
      range: clampedRange,
    });
  }, [currentSystem, defaultRange, getWorldBounds]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentSystem) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#010206';
    ctx.fillRect(0, 0, W, H);

    const pickTargets: PickTarget[] = [];
    const mobileLabels: MobileLabel[] = [];
    const entities = getEntities();
    const battle = getFleetBattle();
    const mouseX = hoverPos?.[0] ?? -999;
    const mouseY = hoverPos?.[1] ?? -999;
    const viewport = getViewport();
    const showDetailLabels = isMobile && viewport.range <= defaultRange * MOBILE_DETAIL_LABEL_RANGE_MULTIPLIER;
    const starColor = '#' + new THREE.Color(STAR_COLORS[currentSystem.starType] ?? 0xFFEE88).getHexString();
    const starR = Math.max(isMobile ? 7 : 6, currentSystem.starRadius * (Math.min(W, H) * 0.45 / defaultRange));
    const starLabel = STAR_TYPE_LABELS[currentSystem.starType] ?? 'Star';

    const [starX, starY] = toMap(0, 0, viewport);

    if (selectedId === 'star' || hoveredId === 'star' || targetId === 'star') {
      drawHighlight(ctx, starX, starY, starR + 8, targetId === 'star', starColor);
    }
    if (currentSystem.starType === 'MQ') {
      drawMagnetar(ctx, starX, starY, starR);
    } else if (currentSystem.starType === 'BH') {
      drawBlackHole(ctx, starX, starY, starR);
    } else {
      const grad = ctx.createRadialGradient(starX, starY, 0, starX, starY, starR * 2);
      grad.addColorStop(0, starColor);
      grad.addColorStop(0.5, starColor + '88');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(starX, starY, starR * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = starColor;
      ctx.beginPath();
      ctx.arc(starX, starY, starR, 0, Math.PI * 2);
      ctx.fill();
    }
    pickTargets.push({ id: 'star', x: starX, y: starY, r: Math.max(starR, 10), tooltip: starLabel });

    if (battle) {
      const [bx, by] = toMap(battle.position.x, battle.position.z, viewport);
      const worldBounds = getViewportBounds(viewport);
      const dangerR = BATTLE_DANGER_RANGE * (W / (worldBounds.maxX - worldBounds.minX));
      const pulse = 0.12 + Math.sin(time * 2) * 0.06;

      const dangerGrad = ctx.createRadialGradient(bx, by, 0, bx, by, dangerR);
      dangerGrad.addColorStop(0, `rgba(255, 40, 40, ${pulse * 1.5})`);
      dangerGrad.addColorStop(0.7, `rgba(255, 40, 40, ${pulse})`);
      dangerGrad.addColorStop(1, 'rgba(255, 40, 40, 0)');
      ctx.fillStyle = dangerGrad;
      ctx.beginPath();
      ctx.arc(bx, by, dangerR, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `rgba(255, 60, 60, ${0.3 + Math.sin(time * 2) * 0.15})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(bx, by, dangerR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = FLEET_BATTLE_COLOR;
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const r = i % 2 === 0 ? 5 : 2.5;
        const a = (i * Math.PI) / 6 - Math.PI / 2;
        ctx[i === 0 ? 'moveTo' : 'lineTo'](bx + Math.cos(a) * r, by + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();

      if (!isMobile) {
        ctx.fillStyle = FLEET_BATTLE_COLOR;
        ctx.font = '8px Courier New';
        ctx.fillText('FLEET BATTLE', bx + 8, by + 3);
      } else {
        mobileLabels.push({
          id: 'fleet-battle',
          text: 'FLEET BATTLE',
          x: bx,
          y: by,
          color: FLEET_BATTLE_COLOR,
          priority: 10,
        });
      }
    }

    for (const planet of currentSystem.planets) {
      const [orbitRightX] = toMap(planet.orbitRadius, 0, viewport);
      const orbitPx = Math.abs(orbitRightX - starX);

      ctx.strokeStyle = 'rgba(51,255,136,0.15)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(starX, starY, orbitPx, 0, Math.PI * 2);
      ctx.stroke();

      const angle = planet.orbitPhase + time * planet.orbitSpeed;
      const worldPx = Math.cos(angle) * planet.orbitRadius;
      const worldPy = Math.sin(angle) * planet.orbitRadius;
      const [px, py] = toMap(worldPx, worldPy, viewport);
      const pColor = '#' + new THREE.Color(planet.color).getHexString();
      const pR = Math.max(isMobile ? 4 : 3, Math.abs(toMap(planet.radius * 0.5, 0, viewport)[0] - starX));
      const planetTip = getPlanetLabel(planet);
      const isEmphasized = selectedId === planet.id || hoveredId === planet.id || targetId === planet.id;

      if (isEmphasized) {
        drawHighlight(ctx, px, py, pR + 6, targetId === planet.id, PLANET_COLOR);
      }

      ctx.fillStyle = pColor;
      ctx.beginPath();
      ctx.arc(px, py, pR, 0, Math.PI * 2);
      ctx.fill();

      if (planet.hasRings) {
        drawPlanetRings(ctx, px, py, pR, planet.ringCount, planet.ringInclination);
      }

      if (!isMobile) {
        ctx.fillStyle = PLANET_COLOR;
        ctx.font = '9px Courier New';
        ctx.fillText(planet.name, px + pR + 3, py + 3);
      } else {
        mobileLabels.push({
          id: planet.id,
          text: planet.name,
          x: px + pR,
          y: py,
          color: PLANET_COLOR,
          priority: selectedId === planet.id || targetId === planet.id ? 9 : 6,
        });
      }
      pickTargets.push({ id: planet.id, x: px, y: py, r: Math.max(pR + (isMobile ? 8 : 4), 8), tooltip: planetTip });

      if (planet.hasStation) {
        const stationId = `station-${planet.id}`;
        const stationEntity = entities.get(stationId);
        if (stationEntity) {
          const [stx, sty] = toMap(stationEntity.worldPos.x, stationEntity.worldPos.z, viewport);
          if (selectedId === stationId || hoveredId === stationId || targetId === stationId) {
            drawHighlight(ctx, stx, sty, 7, targetId === stationId, STATION_COLOR);
          }
          ctx.fillStyle = STATION_COLOR;
          ctx.fillRect(stx - 2.5, sty - 2.5, 5, 5);
          const archLabel = planet.stationArchetype?.replace(/_/g, ' ') ?? 'station';
          if (isMobile) {
            mobileLabels.push({
              id: stationId,
              text: `${planet.name} Station`,
              x: stx + 4,
              y: sty - 8,
              color: STATION_COLOR,
              priority: selectedId === stationId || targetId === stationId ? 8 : 5,
            });
          }
          pickTargets.push({ id: stationId, x: stx, y: sty, r: isMobile ? 12 : 8, tooltip: `Station (${archLabel})` });
        } else {
          ctx.strokeStyle = STATION_COLOR;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(px, py, pR + 4, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      planet.moons.forEach(moon => {
        const moonEntity = entities.get(moon.id);
        if (!moonEntity) return;
        const [mx2, my2] = toMap(moonEntity.worldPos.x, moonEntity.worldPos.z, viewport);
        const mR = Math.max(isMobile ? 2.5 : 1.5, Math.abs(toMap(moon.radius * 0.5, 0, viewport)[0] - starX));

        if (selectedId === moon.id || hoveredId === moon.id || targetId === moon.id) {
          drawHighlight(ctx, mx2, my2, mR + 4, targetId === moon.id, MOON_COLOR);
        }

        ctx.fillStyle = MOON_COLOR;
        ctx.beginPath();
        ctx.arc(mx2, my2, mR, 0, Math.PI * 2);
        ctx.fill();
        if (showDetailLabels) {
          mobileLabels.push({
            id: moon.id,
            text: `${planet.name} Moon`,
            x: mx2 + mR,
            y: my2,
            color: MOON_COLOR,
            priority: selectedId === moon.id || targetId === moon.id ? 8 : 5,
          });
        }
        pickTargets.push({ id: moon.id, x: mx2, y: my2, r: Math.max(mR + (isMobile ? 7 : 2), 6), tooltip: 'Moon' });
      });
    }

    for (const shell of currentSystem.dysonShells) {
      const shellEntity = entities.get(shell.id);
      if (!shellEntity) continue;

      const [orbitRightX] = toMap(shell.orbitRadius, 0, viewport);
      const orbitPx = Math.abs(orbitRightX - starX);
      const shellColor = '#' + new THREE.Color(shell.color).getHexString();

      ctx.strokeStyle = shellColor + '55';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.arc(starX, starY, orbitPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      const [sx, sy] = toMap(shellEntity.group.position.x, shellEntity.group.position.z, viewport);
      const mapAngle = Math.atan2(sy - starY, sx - starX);
      const arcAngle = Math.max(0.16, Math.min(0.55, shell.arcWidth / shell.curveRadius));
      ctx.strokeStyle = shellColor;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(starX, starY, orbitPx, mapAngle - arcAngle * 0.5, mapAngle + arcAngle * 0.5);
      ctx.stroke();

      if (selectedId === shell.id || hoveredId === shell.id || targetId === shell.id) {
        drawHighlight(ctx, sx, sy, 8, targetId === shell.id, shellColor);
      }

      if (isMobile) {
        mobileLabels.push({
          id: shell.id,
          text: shell.name,
          x: sx + 4,
          y: sy - 8,
          color: shellColor,
          priority: selectedId === shell.id || targetId === shell.id ? 8 : 4,
        });
      }
      pickTargets.push({ id: shell.id, x: sx, y: sy, r: isMobile ? 13 : 10, tooltip: `Dyson shell — ${shell.name}` });
    }

    if (currentSystem.asteroidBelt) {
      const { innerRadius, outerRadius } = currentSystem.asteroidBelt;
      const [innerRightX] = toMap(innerRadius, 0, viewport);
      const [outerRightX] = toMap(outerRadius, 0, viewport);
      const ir = Math.abs(innerRightX - starX);
      const or = Math.abs(outerRightX - starX);
      const beltGrad = ctx.createRadialGradient(starX, starY, ir, starX, starY, or);
      beltGrad.addColorStop(0, 'rgba(136,136,119,0.0)');
      beltGrad.addColorStop(0.3, 'rgba(136,136,119,0.15)');
      beltGrad.addColorStop(1, 'rgba(136,136,119,0.0)');
      ctx.fillStyle = beltGrad;
      ctx.beginPath();
      ctx.arc(starX, starY, or, 0, Math.PI * 2);
      ctx.arc(starX, starY, ir, 0, Math.PI * 2, true);
      ctx.fill();
    }

    for (const base of currentSystem.secretBases) {
      const [orbitRightX] = toMap(base.orbitRadius, 0, viewport);
      const orbitPx = Math.abs(orbitRightX - starX);
      ctx.strokeStyle = 'rgba(136,68,255,0.08)';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 6]);
      ctx.beginPath();
      ctx.arc(starX, starY, orbitPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      const angle = base.orbitPhase + time * base.orbitSpeed;
      const worldBx = Math.cos(angle) * base.orbitRadius;
      const worldBy = Math.sin(angle) * base.orbitRadius;
      const [bx, by] = toMap(worldBx, worldBy, viewport);
      const baseColors: Record<string, string> = {
        asteroid: '#AA7744', oort_cloud: '#4488CC', maximum_space: SECRET_BASE_COLOR,
      };
      const color = baseColors[base.type] ?? SECRET_BASE_COLOR;
      const baseLabels: Record<string, string> = {
        asteroid: 'Asteroid base', oort_cloud: 'Oort cloud base', maximum_space: 'Deep space base',
      };
      const baseTip = baseLabels[base.type] ?? 'Base';

      if (selectedId === base.id || hoveredId === base.id || targetId === base.id) {
        drawHighlight(ctx, bx, by, 9, targetId === base.id, color);
      }

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(bx, by - 4);
      ctx.lineTo(bx + 3, by);
      ctx.lineTo(bx, by + 4);
      ctx.lineTo(bx - 3, by);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = color + '66';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(bx, by, 6, 0, Math.PI * 2);
      ctx.stroke();

      if (!isMobile) {
        ctx.fillStyle = color;
        ctx.font = '8px Courier New';
        ctx.fillText(base.name, bx + 8, by + 3);
      } else {
        mobileLabels.push({
          id: base.id,
          text: base.name,
          x: bx + 4,
          y: by - 8,
          color,
          priority: selectedId === base.id || targetId === base.id ? 8 : 5,
        });
      }
      pickTargets.push({ id: base.id, x: bx, y: by, r: isMobile ? 12 : 8, tooltip: baseTip });
    }

    for (const [id, entity] of entities) {
      if (entity.type !== 'npc_ship') continue;
      const [sx, sy] = toMap(entity.worldPos.x, entity.worldPos.z, viewport);
      const isAlien = isAlienShipName(entity.name);
      const shipColor = isAlien ? NPC_COLOR_ALIEN : NPC_COLOR_HUMAN;

      if (selectedId === id || hoveredId === id || targetId === id) {
        drawHighlight(ctx, sx, sy, 8, targetId === id, shipColor);
      }

      ctx.fillStyle = shipColor;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 3);
      ctx.lineTo(sx + 2.5, sy + 2);
      ctx.lineTo(sx - 2.5, sy + 2);
      ctx.closePath();
      ctx.fill();

      const tipLabel = isAlien ? 'Alien vessel' : 'Freighter';
      if (showDetailLabels) {
        mobileLabels.push({
          id,
          text: entity.name,
          x: sx + 4,
          y: sy - 8,
          color: shipColor,
          priority: selectedId === id || targetId === id ? 9 : 4,
        });
      }
      pickTargets.push({ id, x: sx, y: sy, r: isMobile ? 12 : 8, tooltip: `${entity.name} — ${tipLabel}` });
    }

    for (const [id, entity] of entities) {
      if (entity.type !== 'fleet_ship') continue;
      const [sx, sy] = toMap(entity.worldPos.x, entity.worldPos.z, viewport);

      if (selectedId === id || hoveredId === id || targetId === id) {
        drawHighlight(ctx, sx, sy, 5, targetId === id, FLEET_BATTLE_COLOR);
      }

      ctx.fillStyle = FLEET_BATTLE_COLOR + 'AA';
      ctx.beginPath();
      ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
      ctx.fill();
      if (showDetailLabels) {
        mobileLabels.push({
          id,
          text: entity.name,
          x: sx + 4,
          y: sy - 8,
          color: FLEET_BATTLE_COLOR,
          priority: selectedId === id || targetId === id ? 8 : 3,
        });
      }
      pickTargets.push({ id, x: sx, y: sy, r: isMobile ? 10 : 6, tooltip: entity.name });
    }

    const [playerX, playerY] = toMap(playerPos.x, playerPos.z, viewport);
    ctx.strokeStyle = `${PLAYER_COLOR}AA`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(playerX, playerY, 8, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = PLAYER_COLOR;
    ctx.beginPath();
    ctx.moveTo(playerX, playerY - 5);
    ctx.lineTo(playerX + 4, playerY + 4);
    ctx.lineTo(playerX - 4, playerY + 4);
    ctx.closePath();
    ctx.fill();

    const nearest = !isMobile && hoverPos
      ? findNearest(mouseX, mouseY, pickTargets, DESKTOP_PICK_RADIUS)
      : null;
    if (!isMobile && nearest !== hoveredId) {
      setHoveredId(nearest?.id ?? null);
    }

    if (!isMobile && nearest && hoverPos) {
      drawTooltip(ctx, nearest.tooltip, hoverPos[0], hoverPos[1]);
    }

    if (isMobile) {
      drawMobileLabels(ctx, mobileLabels);
    }

    const npcFound = pickTargets.some(t => t.id.startsWith('npc-'));
    const battleFound = battle !== null;
    setHasNpcShips(prev => prev !== npcFound ? npcFound : prev);
    setHasBattle(prev => prev !== battleFound ? battleFound : prev);

    pickTargetsRef.current = pickTargets;
  }, [currentSystem, defaultRange, getEntities, getFleetBattle, getViewport, hoverPos, hoveredId, isMobile, playerPos.x, playerPos.z, selectedId, targetId, time]);

  const selectAtCanvasPoint = useCallback((mx: number, my: number) => {
    const hit = findNearest(mx, my, pickTargetsRef.current, isMobile ? MOBILE_PICK_RADIUS : DESKTOP_PICK_RADIUS);
    if (!hit) {
      if (isMobile) setSelectedId(null);
      return;
    }
    setSelectedId(hit.id);
    onTarget(hit.id);
  }, [isMobile, onTarget]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isMobile) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const [mx, my] = canvasCoordsFromClient(e.clientX, e.clientY, canvas);
    selectAtCanvasPoint(mx, my);
  }, [isMobile, selectAtCanvasPoint]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isMobile) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = canvasCoordsFromClient(e.clientX, e.clientY, canvas);
    activePointersRef.current[e.pointerId] = { x, y };

    const pointers = Object.values(activePointersRef.current);
    if (pointers.length === 1) {
      mobileGestureRef.current = {
        mode: 'pending',
        startCenterX: mobileViewport.centerX,
        startCenterZ: mobileViewport.centerZ,
        startRange: mobileViewport.range,
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
        startCenterX: mobileViewport.centerX,
        startCenterZ: mobileViewport.centerZ,
        startRange: mobileViewport.range,
        startX: a.x,
        startY: a.y,
        startMidX: (a.x + b.x) * 0.5,
        startMidY: (a.y + b.y) * 0.5,
        startDistance: Math.max(8, Math.hypot(a.x - b.x, a.y - b.y)),
        didMove: true,
      };
    }
  }, [isMobile, mobileViewport.centerX, mobileViewport.centerZ, mobileViewport.range]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!isMobile) {
      setHoverPos(canvasCoordsFromClient(e.clientX, e.clientY, canvas));
      return;
    }

    if (!(e.pointerId in activePointersRef.current)) return;
    e.preventDefault();
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
      applyMobileViewport(
        panCenterX + (worldMidX - currentMidX),
        panCenterZ + (worldMidZ - currentMidZ),
        nextRange,
      );
      return;
    }

    const dx = x - gesture.startX;
    const dy = y - gesture.startY;
    const moved = Math.hypot(dx, dy);
    if (moved > MOBILE_PAN_THRESHOLD) {
      mobileGestureRef.current.mode = 'pan';
      mobileGestureRef.current.didMove = true;
    }
    const worldPerPixelX = ((gesture.startRange * 2) * (W / H)) / W;
    const worldPerPixelZ = (gesture.startRange * 2) / H;
    applyMobileViewport(
      gesture.startCenterX - dx * worldPerPixelX,
      gesture.startCenterZ - dy * worldPerPixelZ,
      gesture.startRange,
    );
  }, [applyMobileViewport, currentSystem, defaultRange, isMobile]);

  const finishPointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !(e.pointerId in activePointersRef.current)) return;
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
        startCenterX: mobileViewport.centerX,
        startCenterZ: mobileViewport.centerZ,
        startRange: mobileViewport.range,
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
        startCenterX: mobileViewport.centerX,
        startCenterZ: mobileViewport.centerZ,
        startRange: mobileViewport.range,
        startX: 0,
        startY: 0,
        startMidX: 0,
        startMidY: 0,
        startDistance: 0,
        didMove: false,
      };
    }

    if (isMobile && wasTap) {
      selectAtCanvasPoint(mx, my);
    }
  }, [isMobile, mobileViewport.centerX, mobileViewport.centerZ, mobileViewport.range, selectAtCanvasPoint]);

  const handlePointerLeave = useCallback(() => {
    if (isMobile) return;
    setHoverPos(null);
    setHoveredId(null);
  }, [isMobile]);

  const handleZoom = useCallback((multiplier: number) => {
    if (!currentSystem) return;
    applyMobileViewport(mobileViewport.centerX, mobileViewport.centerZ, mobileViewport.range * multiplier);
  }, [applyMobileViewport, currentSystem, mobileViewport.centerX, mobileViewport.centerZ, mobileViewport.range]);

  const selectedInfo = currentSystem
    ? getSelectedInfo(selectedId ?? (isMobile ? targetId : null), currentSystem, starData?.name, getEntities())
    : null;

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.title}>{starData?.name.toUpperCase()} SYSTEM</div>
          {isMobile ? (
            <div className={styles.mobileActions}>
              <button type="button" className={styles.utilityBtn} onClick={() => handleZoom(0.82)} aria-label="Zoom in">+</button>
              <button type="button" className={styles.utilityBtn} onClick={() => handleZoom(1.22)} aria-label="Zoom out">-</button>
              <button type="button" className={styles.utilityBtn} onClick={onClose} aria-label="Close">&times;</button>
            </div>
          ) : null}
        </div>
        <div className={styles.content}>
          <div className={styles.mapViewport}>
            <canvas
              ref={canvasRef}
              width={W}
              height={H}
              data-testid="system-map-canvas"
              className={styles.canvas}
              style={{ cursor: !isMobile && hoveredId ? 'pointer' : 'default' }}
              onClick={handleCanvasClick}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishPointer}
              onPointerCancel={finishPointer}
              onMouseLeave={handlePointerLeave}
            />
          </div>
          {isMobile ? (
            <div className={styles.selectionCard} data-testid="system-map-selection-card">
              {selectedInfo ? (
                <>
                  <div className={styles.selectionHeader}>
                    <span className={styles.selectionAccent} style={{ background: selectedInfo.accent }} />
                    <span className={styles.selectionTitle}>{selectedInfo.title}</span>
                    {targetId === (selectedId ?? targetId) ? (
                      <span className={styles.selectionBadge}>TARGET</span>
                    ) : null}
                  </div>
                  <div className={styles.selectionSubtitle}>{selectedInfo.subtitle}</div>
                </>
              ) : (
                <>
                  <div className={styles.selectionTitle}>Local chart</div>
                  <div className={styles.selectionSubtitle}>Tap a body to target it. Drag to pan. Pinch or use +/- to zoom.</div>
                </>
              )}
            </div>
          ) : null}
          <div className={styles.legend}>
            <span><span className={styles.dot} style={{ background: PLAYER_COLOR }} />You</span>
            <span><span className={styles.dot} style={{ background: PLANET_COLOR }} />Planet</span>
            <span><span className={styles.dot} style={{ background: MOON_COLOR }} />Moon</span>
            <span><span className={styles.dot} style={{ background: STATION_COLOR }} />Station</span>
            <span><span className={styles.dot} style={{ background: '#888877' }} />Asteroids</span>
            {currentSystem && currentSystem.dysonShells.length > 0 && (
              <span><span className={styles.dot} style={{ background: DYSON_COLOR }} />Dyson Shell</span>
            )}
            {currentSystem && currentSystem.secretBases.length > 0 && (
              <span><span className={styles.dot} style={{ background: SECRET_BASE_COLOR }} />Transmission Ghost</span>
            )}
            {hasNpcShips && (
              <span><span className={styles.dot} style={{ background: NPC_COLOR_HUMAN }} />Ship</span>
            )}
            {hasBattle && (
              <span><span className={styles.dot} style={{ background: FLEET_BATTLE_COLOR }} />Fleet Battle</span>
            )}
          </div>
        </div>
        {!isMobile ? (
          <button className={styles.closeBtn} onClick={onClose}>CLOSE</button>
        ) : null}
      </div>
    </div>
  );
}
