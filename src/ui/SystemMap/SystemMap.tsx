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
const PICK_RADIUS = 14;

interface PickTarget {
  id: string;
  x: number;
  y: number;
  r: number;
  tooltip: string;
}

interface SystemMapProps {
  onClose: () => void;
  getEntities: () => Map<string, SceneEntity>;
  getFleetBattle: () => FleetBattle | null;
  onTarget: (id: string) => void;
}

const STAR_TYPE_LABELS: Record<string, string> = {
  G: 'Yellow dwarf', K: 'Orange dwarf', M: 'Red dwarf', F: 'White star',
  A: 'Blue-white star', WD: 'White dwarf', HE: 'Helium star', NS: 'Neutron star',
  PU: 'Pulsar', XB: 'X-ray binary', MG: 'Magnetar', BH: 'Black hole',
  XBB: 'X-ray binary', MQ: 'Microquasar', SGR: 'Subgiant', IRON: 'Iron star',
};

const NPC_COLOR_HUMAN = '#AADDFF';
const NPC_COLOR_ALIEN = '#DDAAFF';
const FLEET_BATTLE_COLOR = '#FF4444';
const STATION_COLOR = '#44CCFF';
const MOON_COLOR = '#99AABB';
const PLAYER_COLOR = '#66E6FF';

function canvasCoords(e: React.MouseEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement): [number, number] {
  const rect = canvas.getBoundingClientRect();
  return [
    (e.clientX - rect.left) * (W / rect.width),
    (e.clientY - rect.top) * (H / rect.height),
  ];
}

function findNearest(mx: number, my: number, targets: PickTarget[]): PickTarget | null {
  let best: PickTarget | null = null;
  let bestDist = PICK_RADIUS;
  for (const t of targets) {
    const dx = mx - t.x;
    const dy = my - t.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDist) {
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

export function SystemMap({ onClose, getEntities, getFleetBattle, onTarget }: SystemMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pickTargetsRef = useRef<PickTarget[]>([]);
  const [hoverPos, setHoverPos] = useState<[number, number] | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hasNpcShips, setHasNpcShips] = useState(false);
  const [hasBattle, setHasBattle] = useState(false);
  const currentSystem = useGameState(s => s.currentSystem);
  const currentSystemId = useGameState(s => s.currentSystemId);
  const cluster = useGameState(s => s.cluster);
  const starData = cluster[currentSystemId];
  const time = useGameState(s => s.time);
  const targetId = useGameState(s => s.player.targetId);
  const playerPos = useGameState(s => s.player.position);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentSystem) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#010206';
    ctx.fillRect(0, 0, W, H);

    const cx = W / 2;
    const cy = H / 2;
    const mapOriginX = playerPos.x;
    const mapOriginZ = playerPos.z;
    const pickTargets: PickTarget[] = [];
    const entities = getEntities();
    const battle = getFleetBattle();
    const mouseX = hoverPos?.[0] ?? -999;
    const mouseY = hoverPos?.[1] ?? -999;

    // ---------- Scaling ----------
    // Keep the system map focused near the player ship, with a stable local range
    // tied to the new-game spawn-to-star distance (about 2x that distance).
    const mainPlanet = currentSystem.planets.find(p => p.id === currentSystem.mainStationPlanetId) ?? null;
    const spawnDistanceFromMainPlanet = mainPlanet ? (mainPlanet.radius * 2.2 + 45) : 0;
    const spawnLateralOffset = 20;
    const initialSpawnToStarDistance = mainPlanet
      ? Math.hypot(mainPlanet.orbitRadius + spawnDistanceFromMainPlanet, spawnLateralOffset)
      : Math.hypot(mapOriginX, mapOriginZ);
    const localMapRange = Math.max(initialSpawnToStarDistance * 2, currentSystem.starRadius * 8, 200) * 3;
    const scale = (Math.min(W, H) * 0.45) / localMapRange;

    const toMap = (wx: number, wz: number): [number, number] => ([
      cx + (wx - mapOriginX) * scale,
      cy + (wz - mapOriginZ) * scale,
    ]);

    // ---------- Star ----------
    const starColor = '#' + new THREE.Color(STAR_COLORS[currentSystem.starType] ?? 0xFFEE88).getHexString();
    const starR = Math.max(6, currentSystem.starRadius * scale);
    const starLabel = STAR_TYPE_LABELS[currentSystem.starType] ?? 'Star';

    const [starX, starY] = toMap(0, 0);

    if (hoveredId === 'star' || targetId === 'star') {
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

    // ---------- Fleet battle danger zone ----------
    if (battle) {
      const [bx, by] = toMap(battle.position.x, battle.position.z);
      const dangerR = BATTLE_DANGER_RANGE * scale;
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

      // Starburst icon
      ctx.fillStyle = FLEET_BATTLE_COLOR;
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const r = i % 2 === 0 ? 5 : 2.5;
        const a = (i * Math.PI) / 6 - Math.PI / 2;
        ctx[i === 0 ? 'moveTo' : 'lineTo'](bx + Math.cos(a) * r, by + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = FLEET_BATTLE_COLOR;
      ctx.font = '8px Courier New';
      ctx.fillText('FLEET BATTLE', bx + 8, by + 3);
    }

    // ---------- Planets, moons, stations ----------
    for (const planet of currentSystem.planets) {
      const orbitPx = planet.orbitRadius * scale;

      ctx.strokeStyle = 'rgba(51,255,136,0.15)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(starX, starY, orbitPx, 0, Math.PI * 2);
      ctx.stroke();

      const angle = planet.orbitPhase + time * planet.orbitSpeed;
      const worldPx = Math.cos(angle) * planet.orbitRadius;
      const worldPy = Math.sin(angle) * planet.orbitRadius;
      const [px, py] = toMap(worldPx, worldPy);
      const pColor = '#' + new THREE.Color(planet.color).getHexString();
      const pR = Math.max(3, planet.radius * scale * 0.5);
      const planetTip = planet.type === 'gas_giant' ? 'Gas giant' : 'Rocky planet';

      if (hoveredId === planet.id || targetId === planet.id) {
        drawHighlight(ctx, px, py, pR + 6, targetId === planet.id, '#33FF88');
      }

      ctx.fillStyle = pColor;
      ctx.beginPath();
      ctx.arc(px, py, pR, 0, Math.PI * 2);
      ctx.fill();

      if (planet.hasRings) {
        drawPlanetRings(ctx, px, py, pR, planet.ringCount, planet.ringInclination);
      }

      ctx.fillStyle = '#33FF88';
      ctx.font = '9px Courier New';
      ctx.fillText(planet.name, px + pR + 3, py + 3);
      pickTargets.push({ id: planet.id, x: px, y: py, r: Math.max(pR + 4, 8), tooltip: planetTip });

      // Station (separate targetable entity orbiting the planet)
      if (planet.hasStation) {
        const stationId = `station-${planet.id}`;
        const stationEntity = entities.get(stationId);
        if (stationEntity) {
          const [stx, sty] = toMap(stationEntity.worldPos.x, stationEntity.worldPos.z);
          if (hoveredId === stationId || targetId === stationId) {
            drawHighlight(ctx, stx, sty, 7, targetId === stationId, STATION_COLOR);
          }
          // Station marker — small square
          ctx.fillStyle = STATION_COLOR;
          ctx.fillRect(stx - 2, sty - 2, 4, 4);
          const archLabel = planet.stationArchetype?.replace(/_/g, ' ') ?? 'station';
          pickTargets.push({ id: stationId, x: stx, y: sty, r: 8, tooltip: `Station (${archLabel})` });
        } else {
          // Fallback: draw indicator ring on planet like before
          ctx.strokeStyle = STATION_COLOR;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(px, py, pR + 4, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Moons
      planet.moons.forEach(moon => {
        const moonEntity = entities.get(moon.id);
        if (!moonEntity) return;
        const [mx2, my2] = toMap(moonEntity.worldPos.x, moonEntity.worldPos.z);
        const mR = Math.max(1.5, moon.radius * scale * 0.5);

        if (hoveredId === moon.id || targetId === moon.id) {
          drawHighlight(ctx, mx2, my2, mR + 4, targetId === moon.id, MOON_COLOR);
        }

        ctx.fillStyle = MOON_COLOR;
        ctx.beginPath();
        ctx.arc(mx2, my2, mR, 0, Math.PI * 2);
        ctx.fill();
        pickTargets.push({ id: moon.id, x: mx2, y: my2, r: Math.max(mR + 2, 6), tooltip: 'Moon' });
      });
    }

    // ---------- Dyson shells ----------
    for (const shell of currentSystem.dysonShells) {
      const shellEntity = entities.get(shell.id);
      if (!shellEntity) continue;

      const orbitPx = shell.orbitRadius * scale;
      const shellColor = '#' + new THREE.Color(shell.color).getHexString();

      // Orbit ring (projected as circle — approximation for inclined orbits)
      ctx.strokeStyle = shellColor + '55';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.arc(starX, starY, orbitPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Use group.position (orbital center), not worldPos (surface patch center)
      const [sx, sy] = toMap(shellEntity.group.position.x, shellEntity.group.position.z);

      // Arc indicator at the shell's actual position
      const mapAngle = Math.atan2(sy - starY, sx - starX);
      const arcAngle = Math.max(0.16, Math.min(0.55, shell.arcWidth / shell.curveRadius));
      ctx.strokeStyle = shellColor;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(starX, starY, orbitPx, mapAngle - arcAngle * 0.5, mapAngle + arcAngle * 0.5);
      ctx.stroke();

      if (hoveredId === shell.id || targetId === shell.id) {
        drawHighlight(ctx, sx, sy, 8, targetId === shell.id, shellColor);
      }

      pickTargets.push({ id: shell.id, x: sx, y: sy, r: 10, tooltip: `Dyson shell — ${shell.name}` });
    }

    // ---------- Asteroid belt ----------
    if (currentSystem.asteroidBelt) {
      const { innerRadius, outerRadius } = currentSystem.asteroidBelt;
      const ir = innerRadius * scale;
      const or = outerRadius * scale;
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

    // ---------- Secret bases ----------
    for (const base of currentSystem.secretBases) {
      const orbitPx = base.orbitRadius * scale;
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
      const [bx, by] = toMap(worldBx, worldBy);
      const baseColors: Record<string, string> = {
        asteroid: '#AA7744', oort_cloud: '#4488CC', maximum_space: '#8844FF',
      };
      const color = baseColors[base.type] ?? '#8844FF';
      const baseLabels: Record<string, string> = {
        asteroid: 'Asteroid base', oort_cloud: 'Oort cloud base', maximum_space: 'Deep space base',
      };
      const baseTip = baseLabels[base.type] ?? 'Base';

      if (hoveredId === base.id || targetId === base.id) {
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

      ctx.fillStyle = color;
      ctx.font = '8px Courier New';
      ctx.fillText(base.name, bx + 8, by + 3);
      pickTargets.push({ id: base.id, x: bx, y: by, r: 8, tooltip: baseTip });
    }

    // ---------- NPC ships ----------
    for (const [id, entity] of entities) {
      if (entity.type !== 'npc_ship') continue;
      const [sx, sy] = toMap(entity.worldPos.x, entity.worldPos.z);
      const isAlien = isAlienShipName(entity.name);
      const shipColor = isAlien ? NPC_COLOR_ALIEN : NPC_COLOR_HUMAN;

      if (hoveredId === id || targetId === id) {
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
      pickTargets.push({ id, x: sx, y: sy, r: 8, tooltip: `${entity.name} — ${tipLabel}` });
    }

    // ---------- Fleet ships ----------
    for (const [id, entity] of entities) {
      if (entity.type !== 'fleet_ship') continue;
      const [sx, sy] = toMap(entity.worldPos.x, entity.worldPos.z);

      if (hoveredId === id || targetId === id) {
        drawHighlight(ctx, sx, sy, 5, targetId === id, FLEET_BATTLE_COLOR);
      }

      ctx.fillStyle = FLEET_BATTLE_COLOR + 'AA';
      ctx.beginPath();
      ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
      ctx.fill();
      pickTargets.push({ id, x: sx, y: sy, r: 6, tooltip: entity.name });
    }

    // ---------- Player ship marker ----------
    ctx.strokeStyle = `${PLAYER_COLOR}AA`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = PLAYER_COLOR;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 5);
    ctx.lineTo(cx + 4, cy + 4);
    ctx.lineTo(cx - 4, cy + 4);
    ctx.closePath();
    ctx.fill();

    // ---------- Hover detection + tooltip ----------
    const nearest = findNearest(mouseX, mouseY, pickTargets);
    setHoveredId(nearest?.id ?? null);

    if (nearest && hoverPos) {
      drawTooltip(ctx, nearest.tooltip, hoverPos[0], hoverPos[1]);
    }

    // Legend flags
    const npcFound = pickTargets.some(t => t.id.startsWith('npc-'));
    const battleFound = battle !== null;
    setHasNpcShips(prev => prev !== npcFound ? npcFound : prev);
    setHasBattle(prev => prev !== battleFound ? battleFound : prev);

    pickTargetsRef.current = pickTargets;
  }, [currentSystem, playerPos.x, playerPos.z, time, hoverPos, hoveredId, targetId, getEntities, getFleetBattle]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const [mx, my] = canvasCoords(e, canvas);
    const hit = findNearest(mx, my, pickTargetsRef.current);
    if (hit) onTarget(hit.id);
  }, [onTarget]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setHoverPos(canvasCoords(e, canvas));
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoverPos(null);
    setHoveredId(null);
  }, []);

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.panel}>
        <div className={styles.title}>{starData?.name.toUpperCase()} SYSTEM</div>
        <div className={styles.content}>
          <div className={styles.mapViewport}>
            <canvas
              ref={canvasRef} width={W} height={H}
              className={styles.canvas}
              style={{ cursor: hoveredId ? 'pointer' : 'default' }}
              onClick={handleClick}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            />
          </div>
          <div className={styles.legend}>
            <span><span className={styles.dot} style={{ background: PLAYER_COLOR }} />You</span>
            <span><span className={styles.dot} style={{ background: '#33FF88' }} />Planet</span>
            <span><span className={styles.dot} style={{ background: MOON_COLOR }} />Moon</span>
            <span><span className={styles.dot} style={{ background: STATION_COLOR }} />Station</span>
            <span><span className={styles.dot} style={{ background: '#888877' }} />Asteroids</span>
            {currentSystem && currentSystem.dysonShells.length > 0 && (
              <span><span className={styles.dot} style={{ background: '#B9C2CF' }} />Dyson Shell</span>
            )}
            {currentSystem && currentSystem.secretBases.length > 0 && (
              <span><span className={styles.dot} style={{ background: '#8844FF' }} />Transmission Ghost</span>
            )}
            {hasNpcShips && (
              <span><span className={styles.dot} style={{ background: NPC_COLOR_HUMAN }} />Ship</span>
            )}
            {hasBattle && (
              <span><span className={styles.dot} style={{ background: FLEET_BATTLE_COLOR }} />Fleet Battle</span>
            )}
          </div>
        </div>
        <button className={styles.closeBtn} onClick={onClose}>CLOSE</button>
      </div>
    </div>
  );
}
