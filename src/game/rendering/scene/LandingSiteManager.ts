import * as THREE from 'three';
import type { SceneEntity } from './types';
import type { InteractionFieldData } from '../../engine';
import { makeLandingSiteMarker } from '../meshFactory';
import { sampleAndClassifyByUV } from '../../systems/interactionField';
import { PRNG } from '../../generation/prng';
import { CLUSTER_SEED } from '../../constants';

const LANDING_SITE_CLEARANCE_PLANET = 3;
const LANDING_SITE_OFFSET_DYSON_INTERIOR = -8;
const LANDING_SITE_OFFSET_DYSON_EXTERIOR = 8;

function hashString32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function sphereUvToLocal(radius: number, u: number, v: number): THREE.Vector3 {
  const lon = u * Math.PI * 2 - Math.PI;
  const lat = v * Math.PI - Math.PI * 0.5;
  const cosLat = Math.cos(lat);
  return new THREE.Vector3(
    Math.cos(lon) * cosLat * radius,
    Math.sin(lat) * radius,
    Math.sin(lon) * cosLat * radius,
  );
}

function dysonPatchUvToLocal(
  curveRadius: number,
  arcWidth: number,
  arcHeight: number,
  u: number,
  v: number,
  offset = 0,
): THREE.Vector3 {
  const phiLength = THREE.MathUtils.clamp(arcWidth / curveRadius, 0.55, 1.6);
  const thetaLength = THREE.MathUtils.clamp(arcHeight / curveRadius, 0.22, 0.72);
  const phiStart = Math.PI - phiLength * 0.5;
  const thetaStart = Math.PI * 0.5 - thetaLength * 0.5;
  const phi = phiStart + u * phiLength;
  const theta = thetaStart + v * thetaLength;
  const r = curveRadius + offset;
  const sinTheta = Math.sin(theta);
  // Match THREE.js SphereGeometry convention (negative cos(phi) on X axis)
  return new THREE.Vector3(
    -r * Math.cos(phi) * sinTheta,
    r * Math.cos(theta),
    r * Math.sin(phi) * sinTheta,
  );
}

export class LandingSiteManager {
  private counter = 0;

  constructor(private entities: Map<string, SceneEntity>) {}

  resetCounter(): void {
    this.counter = 0;
  }

  addPlanetSites(params: {
    hostId: string;
    hostLabel: string;
    hostGroup: THREE.Group;
    hostCollisionRadius: number;
    field: InteractionFieldData;
    bodyKind: 'rocky' | 'gas_giant';
  }): Set<string> {
    const { hostId, hostLabel, hostGroup, hostCollisionRadius, field, bodyKind } = params;
    const siteRng = PRNG.fromIndex(CLUSTER_SEED ^ 0x51A17E, hashString32(hostId));
    const desired = bodyKind === 'gas_giant' ? 2 : 3;
    const spawnRadius = hostCollisionRadius + LANDING_SITE_CLEARANCE_PLANET;
    const acceptedNormals: THREE.Vector3[] = [];
    const classifications = new Set<string>();
    let created = 0;
    let attempts = 0;

    while (created < desired && attempts < desired * 28) {
      attempts++;
      const u = siteRng.next();
      const v = siteRng.next();
      const sampled = sampleAndClassifyByUV(field, u, v);
      const cls = sampled.classification;
      const allowed = bodyKind === 'gas_giant'
        ? cls === 'gas_stable' || cls === 'gas_volatile'
        : cls === 'rocky_landable';
      if (!allowed) continue;

      const pos = sphereUvToLocal(spawnRadius, u, v);
      const normal = pos.clone().normalize();
      if (acceptedNormals.some(n => n.dot(normal) > 0.9)) continue;
      acceptedNormals.push(normal);

      const marker = makeLandingSiteMarker(cls);
      marker.position.copy(pos);
      marker.lookAt(pos.clone().multiplyScalar(2));
      marker.visible = false;
      hostGroup.add(marker);

      const idx = ++this.counter;
      const id = `site-${hostId}-${idx}`;
      const siteLabel = `${hostLabel} ${bodyKind === 'gas_giant' ? 'BAND' : 'SITE'} ${created + 1}`;
      this.entities.set(id, {
        id,
        name: siteLabel,
        group: marker,
        orbitRadius: 0,
        orbitSpeed: 0,
        orbitPhase: 0,
        type: 'landing_site',
        worldPos: new THREE.Vector3(),
        collisionRadius: 0,
        siteLabel,
        siteClassification: cls,
        siteHostLabel: hostLabel,
        siteHostId: hostId,
        siteDiscovered: false,
      });
      classifications.add(cls);
      created++;
    }
    return classifications;
  }

  addDysonSites(params: {
    hostId: string;
    hostLabel: string;
    hostGroup: THREE.Group;
    curveRadius: number;
    arcWidth: number;
    arcHeight: number;
    field: InteractionFieldData;
  }): void {
    const { hostId, hostLabel, hostGroup, curveRadius, arcWidth, arcHeight, field } = params;
    const siteRng = PRNG.fromIndex(CLUSTER_SEED ^ 0xD1505E, hashString32(hostId));
    const desired = 1;
    let created = 0;

    // ~85% interior (populated side facing mini-star), ~15% exterior
    const isInterior = siteRng.next() < 0.85;
    const sideOffset = isInterior
      ? LANDING_SITE_OFFSET_DYSON_INTERIOR
      : LANDING_SITE_OFFSET_DYSON_EXTERIOR;

    while (created < desired) {
      let attempts = 0;
      let best: {
        score: number;
        position: THREE.Vector3;
        classification: string;
      } | null = null;

      while (attempts < 96) {
        attempts++;
        const u = 0.36 + siteRng.next() * 0.28;
        const v = 0.36 + siteRng.next() * 0.28;
        const sampled = sampleAndClassifyByUV(field, u, v);
        const cls = sampled.classification;
        if (!(cls === 'shell_accessible' || cls === 'shell_weathered')) continue;

        const pos = dysonPatchUvToLocal(curveRadius, arcWidth, arcHeight, u, v, sideOffset);
        const centerDist = Math.hypot(u - 0.5, v - 0.5);
        const centerBias = Math.max(0, 1 - centerDist / 0.20);
        const classBase = cls === 'shell_accessible' ? 100 : 45;
        const calmness = 1 - sampled.value;
        const score = classBase + calmness * 30 + centerBias * 20;
        if (!best || score > best.score) {
          best = {
            score,
            position: pos.clone(),
            classification: cls,
          };
        }
      }
      if (!best) break;

      const marker = makeLandingSiteMarker(best.classification);
      marker.position.copy(best.position);
      // Interior sites face inward (toward mini-star), exterior face outward
      if (isInterior) {
        marker.lookAt(0, 0, 0);
      } else {
        marker.lookAt(best.position.clone().multiplyScalar(1.8));
      }
      marker.visible = false;
      hostGroup.add(marker);

      const idx = ++this.counter;
      const id = `site-${hostId}-${idx}`;
      const siteLabel = `${hostLabel} ZONE ${created + 1}`;
      this.entities.set(id, {
        id,
        name: siteLabel,
        group: marker,
        orbitRadius: 0,
        orbitSpeed: 0,
        orbitPhase: 0,
        type: 'landing_site',
        worldPos: new THREE.Vector3(),
        collisionRadius: 0,
        siteLabel,
        siteClassification: best.classification,
        siteHostLabel: hostLabel,
        siteHostId: hostId,
        siteDiscovered: false,
      });
      created++;
    }
  }

  addTopopolisSites(params: {
    hostId: string;
    hostLabel: string;
    hostGroup: THREE.Group;
    curve: THREE.Curve<THREE.Vector3>;
    tubeRadius: number;
    field: InteractionFieldData;
    biomeSequence: string[];
  }): void {
    const { hostId, hostLabel, hostGroup, curve, tubeRadius, biomeSequence } = params;

    const addSite = (
      pos: THREE.Vector3,
      lookTarget: THREE.Vector3,
      classification: string,
      label: string,
      biome?: string,
      curveT?: number,
    ) => {
      const marker = makeLandingSiteMarker(classification);
      marker.position.copy(pos);
      marker.lookAt(lookTarget);
      marker.visible = false;
      hostGroup.add(marker);

      const idx = ++this.counter;
      const id = `site-${hostId}-${idx}`;
      this.entities.set(id, {
        id,
        name: label,
        group: marker,
        orbitRadius: 0,
        orbitSpeed: 0,
        orbitPhase: 0,
        type: 'landing_site',
        worldPos: new THREE.Vector3(),
        collisionRadius: 0,
        siteLabel: label,
        siteClassification: classification,
        siteHostLabel: hostLabel,
        siteHostId: hostId,
        siteDiscovered: false,
        siteBiome: biome,
        siteCurveT: curveT,
      });
    };

    // ── Entrance sites at each tube endpoint ────────────────────────────────
    const entranceNames = ['APPROACH GATE', 'FAR GATE'];
    [0, 1].forEach((endIdx) => {
      const t = endIdx === 0 ? 0.01 : 0.99;
      const center = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t).normalize();
      // Position just inside the tube opening
      const pos = center.clone().add(tangent.clone().multiplyScalar(endIdx === 0 ? tubeRadius * 0.3 : -tubeRadius * 0.3));
      const lookTarget = center.clone().add(tangent.clone().multiplyScalar(endIdx === 0 ? tubeRadius : -tubeRadius));
      addSite(pos, lookTarget, 'topopolis_entrance', `${hostLabel} ${entranceNames[endIdx]}`, 'entrance', t);
    });

    // ── Interior habitat sites along the tube ───────────────────────────────
    const siteRng = PRNG.fromIndex(CLUSTER_SEED ^ 0xC011_51E7, hashString32(hostId));
    const desired = 3;
    let created = 0;

    while (created < desired) {
      // Place interior sites in the middle 80% of the tube (avoid endpoints)
      const u = 0.1 + siteRng.next() * 0.8;
      const circumAngle = siteRng.next() * Math.PI * 2;

      // Look up biome at this position along the tube
      const biomeIdx = Math.min(
        biomeSequence.length - 1,
        Math.floor(u * biomeSequence.length),
      );
      const biome = biomeSequence[biomeIdx] ?? 'continental';
      const biomeLabel = biome.toUpperCase().replace('_', ' ');

      const centerPoint = curve.getPointAt(u);
      const tangent = curve.getTangentAt(u).normalize();
      const up = Math.abs(tangent.y) < 0.9
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(1, 0, 0);
      const radial1 = new THREE.Vector3().crossVectors(tangent, up).normalize();
      const radial2 = new THREE.Vector3().crossVectors(tangent, radial1).normalize();
      const offset = radial1.clone().multiplyScalar(Math.cos(circumAngle))
        .add(radial2.clone().multiplyScalar(Math.sin(circumAngle)))
        .multiplyScalar(tubeRadius * 0.92);
      const pos = centerPoint.clone().add(offset);

      addSite(pos, centerPoint, 'topopolis_interior', `THE LONG BAZAAR · ${biomeLabel} ${['PORT', 'MARKET', 'EXCHANGE'][created]}`, biome, u);
      created++;
    }
  }

  getStatsForHost(hostId: string): { total: number; discovered: number } {
    let total = 0;
    let discovered = 0;
    for (const [, entity] of this.entities) {
      if (entity.type !== 'landing_site') continue;
      if (entity.siteHostId !== hostId) continue;
      total++;
      if (entity.siteDiscovered) discovered++;
    }
    return { total, discovered };
  }

  revealForHost(hostId: string): number {
    let revealed = 0;
    for (const [, entity] of this.entities) {
      if (entity.type !== 'landing_site') continue;
      if (entity.siteHostId !== hostId) continue;
      if (entity.siteDiscovered) continue;
      entity.siteDiscovered = true;
      entity.group.visible = true;
      revealed++;
    }
    return revealed;
  }

  revealForHosts(hostIds: Set<string>): number {
    let total = 0;
    for (const hostId of hostIds) {
      total += this.revealForHost(hostId);
    }
    return total;
  }

  remove(id: string): void {
    const entity = this.entities.get(id);
    if (!entity || entity.type !== 'landing_site') return;
    entity.group.removeFromParent();
    this.entities.delete(id);
  }
}
