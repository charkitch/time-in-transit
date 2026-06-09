import * as THREE from 'three';
import { STAR_COLORS } from '../../../game/constants';
import type { SceneEntity } from '../../../game/rendering/scene/types';
import { drawMagnetar, drawBlackHole, drawPlanetRings, drawHighlight } from '../drawHelpers';
import { toMap } from '../viewport';
import { getPlanetLabel } from '../selection';
import {
  W, H, STAR_TYPE_LABELS, PLANET_COLOR, STATION_COLOR, MOON_COLOR,
  type RenderContext, type SystemData,
} from '../types';

export function renderStar(rc: RenderContext, currentSystem: SystemData, defaultRange: number): void {
  const { ctx, viewport, isMobile, selectedId, hoveredId, targetId, pickTargets } = rc;
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
}

export function renderPlanets(
  rc: RenderContext,
  currentSystem: SystemData,
  defaultRange: number,
  entities: Map<string, SceneEntity>,
): void {
  const { ctx, viewport, isMobile, showDetailLabels, selectedId, hoveredId, targetId, pickTargets, mobileLabels } = rc;
  const [starX, starY] = toMap(0, 0, viewport);

  for (const planet of currentSystem.planets) {
    const [orbitRightX] = toMap(planet.orbitRadius, 0, viewport);
    const orbitPx = Math.abs(orbitRightX - starX);

    ctx.strokeStyle = 'rgba(51,255,136,0.15)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(starX, starY, orbitPx, 0, Math.PI * 2);
    ctx.stroke();

    const angle = planet.orbitPhase + rc.time * planet.orbitSpeed;
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
}

export function renderDysonShells(rc: RenderContext, currentSystem: SystemData, entities: Map<string, SceneEntity>): void {
  const { ctx, viewport, isMobile, selectedId, hoveredId, targetId, pickTargets, mobileLabels } = rc;
  const [starX, starY] = toMap(0, 0, viewport);

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
}

export function renderAsteroidBelt(rc: RenderContext, currentSystem: SystemData): void {
  const { ctx, viewport } = rc;
  if (!currentSystem.asteroidBelt) return;

  const [starX, starY] = toMap(0, 0, viewport);
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

