import { BATTLE_DANGER_RANGE } from '../../../game/mechanics/FleetBattleSystem';
import type { FleetBattle } from '../../../game/mechanics/FleetBattleSystem';
import type { SceneEntity } from '../../../game/rendering/scene/types';
import { drawHighlight } from '../drawHelpers';
import { toMap, getViewportBounds } from '../viewport';
import {
  W, NPC_COLOR_HUMAN, NPC_COLOR_ALIEN, FLEET_BATTLE_COLOR, SECRET_BASE_COLOR, PLAYER_COLOR,
  type RenderContext, type SystemData,
} from '../types';
import { isAlienShipName } from '../selection';

export function renderFleetBattle(rc: RenderContext, battle: FleetBattle): void {
  const { ctx, viewport, isMobile, time, mobileLabels } = rc;
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
    mobileLabels.push({ id: 'fleet-battle', text: 'FLEET BATTLE', x: bx, y: by, color: FLEET_BATTLE_COLOR, priority: 10 });
  }
}

export function renderSecretBases(rc: RenderContext, currentSystem: SystemData): void {
  const { ctx, viewport, isMobile, time, selectedId, hoveredId, targetId, pickTargets, mobileLabels } = rc;
  const [starX, starY] = toMap(0, 0, viewport);

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
    const [bx, by] = toMap(Math.cos(angle) * base.orbitRadius, Math.sin(angle) * base.orbitRadius, viewport);
    const baseColors: Record<string, string> = {
      asteroid: '#AA7744', oort_cloud: '#4488CC', maximum_space: SECRET_BASE_COLOR,
    };
    const color = baseColors[base.type] ?? SECRET_BASE_COLOR;
    const baseLabels: Record<string, string> = {
      asteroid: 'Asteroid base', oort_cloud: 'Oort cloud base', maximum_space: 'Deep space base',
    };

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
        id: base.id, text: base.name, x: bx + 4, y: by - 8, color,
        priority: selectedId === base.id || targetId === base.id ? 8 : 5,
      });
    }
    pickTargets.push({ id: base.id, x: bx, y: by, r: isMobile ? 12 : 8, tooltip: baseLabels[base.type] ?? 'Base' });
  }
}

export function renderNpcShips(rc: RenderContext, entities: Map<string, SceneEntity>): void {
  const { ctx, viewport, isMobile, showDetailLabels, selectedId, hoveredId, targetId, pickTargets, mobileLabels } = rc;

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
        id, text: entity.name, x: sx + 4, y: sy - 8, color: shipColor,
        priority: selectedId === id || targetId === id ? 9 : 4,
      });
    }
    pickTargets.push({ id, x: sx, y: sy, r: isMobile ? 12 : 8, tooltip: `${entity.name} — ${tipLabel}` });
  }
}

export function renderFleetShips(rc: RenderContext, entities: Map<string, SceneEntity>): void {
  const { ctx, viewport, isMobile, showDetailLabels, selectedId, hoveredId, targetId, pickTargets, mobileLabels } = rc;

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
        id, text: entity.name, x: sx + 4, y: sy - 8, color: FLEET_BATTLE_COLOR,
        priority: selectedId === id || targetId === id ? 8 : 3,
      });
    }
    pickTargets.push({ id, x: sx, y: sy, r: isMobile ? 10 : 6, tooltip: entity.name });
  }
}

export function renderPlayer(rc: RenderContext, playerPos: { x: number; z: number }): void {
  const { ctx, viewport } = rc;
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
}
