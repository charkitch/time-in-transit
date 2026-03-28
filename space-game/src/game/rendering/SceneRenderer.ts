import * as THREE from 'three';
import { PALETTE, STAR_COLORS } from '../constants';
import {
  createStarfield, createHyperspaceTunnel, updateHyperspaceTunnel,
  createHyperspaceGrid, updateHyperspaceGrid,
  createBattleProjectiles, updateBattleProjectiles,
  createBattleExplosions, updateBattleExplosions,
  type BattleExplosions,
} from './effects';
import {
  makePlanet, makeGasGiant, makeStation, makeGlowSprite,
  makeAsteroidBelt, makeRingMesh, makeNPCShipMesh, makeFleetShipMesh,
} from './meshFactory';
import type { SolarSystemData } from '../generation/SystemGenerator';
import type { StarSystemData } from '../generation/GalaxyGenerator';
import { generateNPCShips } from '../mechanics/NPCSystem';
import type { NPCShipState } from '../mechanics/NPCSystem';
import { generateFleetBattle } from '../mechanics/FleetBattleSystem';
import type { FleetBattle } from '../mechanics/FleetBattleSystem';
import { getFaction } from '../mechanics/FactionSystem';
import { PRNG } from '../generation/prng';
import { GALAXY_SEED } from '../constants';

export interface SceneEntity {
  id: string;
  group: THREE.Object3D;
  orbitRadius: number;
  orbitSpeed: number;
  orbitPhase: number;
  parentId?: string;
  type: 'planet' | 'station' | 'star' | 'moon' | 'npc_ship' | 'fleet_ship';
  worldPos: THREE.Vector3; // updated each frame
}

export class SceneRenderer {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  shipGroup: THREE.Group;

  private starfield: THREE.Points;
  private entities: Map<string, SceneEntity> = new Map();
  private npcShips: Map<string, NPCShipState> = new Map();
  private starLight: THREE.PointLight | null = null;
  private hyperspacePoints: THREE.Points | null = null;
  private hyperspaceGrid: THREE.LineSegments | null = null;
  private systemObjects: THREE.Object3D[] = [];
  private battleProjectiles: THREE.Points | null = null;
  private battleExplosions: BattleExplosions | null = null;
  private fleetBattleData: FleetBattle | null = null;

  constructor(canvas: HTMLCanvasElement) {
    // Prefer WebGL2, with WebGL1 fallback for older environments.
    const gl2 = canvas.getContext('webgl2', { antialias: true });
    const gl1 = gl2 ? null : (canvas.getContext('webgl', { antialias: true }) ?? canvas.getContext('experimental-webgl'));
    this.renderer = gl2
      ? new THREE.WebGLRenderer({ canvas, context: gl2, antialias: true })
      : gl1
        ? new THREE.WebGLRenderer({ canvas, context: gl1 as WebGLRenderingContext, antialias: true })
        : new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(PALETTE.bg);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(PALETTE.bg, 0.000015);

    this.camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 1, 80000);

    // Ship group: camera + starfield attached here
    this.shipGroup = new THREE.Group();
    this.shipGroup.add(this.camera);
    this.scene.add(this.shipGroup);

    this.starfield = createStarfield();
    this.shipGroup.add(this.starfield); // moves with ship = infinite parallax

    // Ambient light
    this.scene.add(new THREE.AmbientLight(PALETTE.ambient, 0.3));

    this.handleResize();
    window.addEventListener('resize', this.handleResize);
  }

  private handleResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  loadSystem(data: SolarSystemData, systemId: number, galaxyYear = 0, systemName = '', starData?: StarSystemData): void {
    // Remove old system objects
    this.systemObjects.forEach(o => this.scene.remove(o));
    this.systemObjects = [];
    this.entities.clear();
    this.npcShips.clear();
    this.battleProjectiles = null;
    this.battleExplosions = null;
    this.fleetBattleData = null;

    // Star
    const starColor = STAR_COLORS[data.starType] ?? PALETTE.starG;
    const starGeo = new THREE.SphereGeometry(data.starRadius, 8, 8);
    const starMat = new THREE.MeshBasicMaterial({ color: starColor });
    const starMesh = new THREE.Mesh(starGeo, starMat);

    const glow = makeGlowSprite(starColor, data.starRadius * 6);
    const starGroup = new THREE.Group();
    starGroup.add(starMesh, glow);
    this.scene.add(starGroup);
    this.systemObjects.push(starGroup);

    if (this.starLight) this.scene.remove(this.starLight);
    this.starLight = new THREE.PointLight(starColor, 2, 60000);
    this.scene.add(this.starLight);
    this.systemObjects.push(this.starLight);

    this.entities.set('star', {
      id: 'star',
      group: starGroup,
      orbitRadius: 0,
      orbitSpeed: 0,
      orbitPhase: 0,
      type: 'star',
      worldPos: new THREE.Vector3(),
    });

    const rng = PRNG.fromIndex(GALAXY_SEED, systemId * 97 + 13);

    // Planets
    for (const planet of data.planets) {
      let planetGroup: THREE.Group;
      if (planet.type === 'gas_giant') {
        planetGroup = makeGasGiant(planet.radius, planet.color, () => rng.next());
      } else {
        planetGroup = makePlanet(planet.radius, planet.color);
      }
      planetGroup.position.set(planet.orbitRadius, 0, 0);
      this.scene.add(planetGroup);
      this.systemObjects.push(planetGroup);

      this.entities.set(planet.id, {
        id: planet.id,
        group: planetGroup,
        orbitRadius: planet.orbitRadius,
        orbitSpeed: planet.orbitSpeed,
        orbitPhase: planet.orbitPhase,
        type: 'planet',
        worldPos: new THREE.Vector3(),
      });

      // Rings
      if (planet.hasRings) {
        const ring = makeRingMesh(planet.radius * 1.4, planet.radius * 2.2);
        planetGroup.add(ring);
      }

      // Station
      if (planet.hasStation) {
        const stationGroup = makeStation(60);
        const stationId = `station-${planet.id}`;
        this.scene.add(stationGroup);
        this.systemObjects.push(stationGroup);
        this.entities.set(stationId, {
          id: stationId,
          group: stationGroup,
          orbitRadius: planet.radius * 2.5,
          orbitSpeed: planet.orbitSpeed * 2,
          orbitPhase: rng.next() * Math.PI * 2,
          parentId: planet.id,
          type: 'station',
          worldPos: new THREE.Vector3(),
        });
      }

      // Moons
      for (const moon of planet.moons) {
        const moonGroup = makePlanet(moon.radius, moon.color, 0);
        this.scene.add(moonGroup);
        this.systemObjects.push(moonGroup);
        this.entities.set(moon.id, {
          id: moon.id,
          group: moonGroup,
          orbitRadius: moon.orbitRadius,
          orbitSpeed: moon.orbitSpeed,
          orbitPhase: moon.orbitPhase,
          parentId: planet.id,
          type: 'moon',
          worldPos: new THREE.Vector3(),
        });
      }
    }

    // Asteroid belt
    if (data.asteroidBelt) {
      const ab = data.asteroidBelt;
      const belt = makeAsteroidBelt(ab.innerRadius, ab.outerRadius, ab.count, () => rng.next());
      this.scene.add(belt);
      this.systemObjects.push(belt);
    }

    // NPC trade ships — waypoints derived from planet initial positions
    const planetPositions = data.planets.map(p =>
      new THREE.Vector3(
        Math.cos(p.orbitPhase) * p.orbitRadius,
        0,
        Math.sin(p.orbitPhase) * p.orbitRadius,
      )
    );

    const npcData = generateNPCShips(data, systemId, galaxyYear, systemName, planetPositions);
    for (const shipData of npcData) {
      const mesh = makeNPCShipMesh(shipData.color);
      const startPos = shipData.waypointA.clone().lerp(shipData.waypointB, shipData.t);
      mesh.position.copy(startPos);
      this.scene.add(mesh);
      this.systemObjects.push(mesh);

      this.entities.set(shipData.id, {
        id: shipData.id,
        group: mesh,
        orbitRadius: 0,
        orbitSpeed: 0,
        orbitPhase: 0,
        type: 'npc_ship',
        worldPos: startPos.clone(),
      });

      this.npcShips.set(shipData.id, {
        id: shipData.id,
        name: shipData.name,
        originSystemName: shipData.originSystemName,
        waypointA: shipData.waypointA,
        waypointB: shipData.waypointB,
        t: shipData.t,
        direction: shipData.direction,
        speed: shipData.speed,
        cargo: shipData.cargo,
        commLines: shipData.commLines,
        factionTag: shipData.factionTag,
      });
    }

    // Fleet battle
    if (starData) {
      const battle = generateFleetBattle(data, systemId, galaxyYear, starData);
      this.fleetBattleData = battle;

      if (battle) {
        const battleGroup = new THREE.Group();
        battleGroup.position.copy(battle.position);
        this.scene.add(battleGroup);
        this.systemObjects.push(battleGroup);

        const factionA = getFaction(battle.factionA);
        const factionB = getFaction(battle.factionB);
        const colorA = factionA?.color ?? 0xFF4444;
        const colorB = factionB?.color ?? 0x4488FF;

        const shipWorldPosA: THREE.Vector3[] = [];
        const shipWorldPosB: THREE.Vector3[] = [];

        for (const ship of battle.shipsA) {
          const mesh = makeFleetShipMesh(colorA, ship.scale);
          mesh.position.copy(ship.localOffset);
          battleGroup.add(mesh);

          const worldPos = ship.localOffset.clone().add(battle.position);
          shipWorldPosA.push(worldPos);

          this.entities.set(ship.id, {
            id: ship.id,
            group: mesh,
            orbitRadius: 0,
            orbitSpeed: 0,
            orbitPhase: 0,
            type: 'fleet_ship',
            worldPos: worldPos,
          });
        }

        for (const ship of battle.shipsB) {
          const mesh = makeFleetShipMesh(colorB, ship.scale);
          mesh.position.copy(ship.localOffset);
          battleGroup.add(mesh);

          const worldPos = ship.localOffset.clone().add(battle.position);
          shipWorldPosB.push(worldPos);

          this.entities.set(ship.id, {
            id: ship.id,
            group: mesh,
            orbitRadius: 0,
            orbitSpeed: 0,
            orbitPhase: 0,
            type: 'fleet_ship',
            worldPos: worldPos,
          });
        }

        // Create projectile + explosion effects
        this.battleProjectiles = createBattleProjectiles(
          this.scene, battle.position,
          shipWorldPosA, shipWorldPosB,
          colorA, colorB,
        );
        this.systemObjects.push(this.battleProjectiles);

        this.battleExplosions = createBattleExplosions(this.scene);
        for (const s of this.battleExplosions.sprites) {
          this.systemObjects.push(s);
        }
      }
    }
  }

  updateOrbits(time: number, dt = 0): void {
    for (const [, entity] of this.entities) {
      if (entity.type === 'star' || entity.type === 'npc_ship') continue;

      const angle = entity.orbitPhase + time * entity.orbitSpeed;

      if (entity.parentId) {
        const parent = this.entities.get(entity.parentId);
        if (parent) {
          entity.group.position.set(
            parent.worldPos.x + Math.cos(angle) * entity.orbitRadius,
            parent.worldPos.y,
            parent.worldPos.z + Math.sin(angle) * entity.orbitRadius,
          );
        }
      } else {
        entity.group.position.set(
          Math.cos(angle) * entity.orbitRadius,
          0,
          Math.sin(angle) * entity.orbitRadius,
        );
      }

      entity.worldPos.copy(entity.group.position);
    }

    // Station slowly rotates
    for (const [id, entity] of this.entities) {
      if (entity.type === 'station') {
        entity.group.rotation.z += 0.001;
      }
      void id;
    }

    // NPC ship patrol movement
    if (dt > 0) {
      for (const [, npcState] of this.npcShips) {
        const entity = this.entities.get(npcState.id);
        if (!entity) continue;

        const dist = npcState.waypointA.distanceTo(npcState.waypointB);
        if (dist < 1) continue;

        npcState.t += (npcState.speed * dt / dist) * npcState.direction;
        if (npcState.t >= 1) { npcState.t = 1; npcState.direction = -1; }
        if (npcState.t <= 0) { npcState.t = 0; npcState.direction = 1; }

        entity.group.position.lerpVectors(npcState.waypointA, npcState.waypointB, npcState.t);
        entity.worldPos.copy(entity.group.position);
      }
    }

    // Battle projectile + explosion animation
    if (this.battleProjectiles && dt > 0) {
      updateBattleProjectiles(this.battleProjectiles, dt, this.battleExplosions);
    }
    if (this.battleExplosions && dt > 0) {
      updateBattleExplosions(this.battleExplosions, dt);
    }
  }

  getEntityWorldPos(id: string): THREE.Vector3 | null {
    return this.entities.get(id)?.worldPos ?? null;
  }

  getAllEntities(): Map<string, SceneEntity> {
    return this.entities;
  }

  getNPCShip(id: string): NPCShipState | undefined {
    return this.npcShips.get(id);
  }

  getFleetBattle(): FleetBattle | null {
    return this.fleetBattleData;
  }

  startHyperspace(): void {
    this.hyperspacePoints = createHyperspaceTunnel(this.scene);
    this.hyperspaceGrid = createHyperspaceGrid(this.scene);
  }

  updateHyperspace(dt: number): void {
    if (this.hyperspacePoints) updateHyperspaceTunnel(this.hyperspacePoints, dt);
    if (this.hyperspaceGrid) updateHyperspaceGrid(this.hyperspaceGrid, dt);
  }

  stopHyperspace(): void {
    if (this.hyperspacePoints) {
      this.scene.remove(this.hyperspacePoints);
      this.hyperspacePoints = null;
    }
    if (this.hyperspaceGrid) {
      this.scene.remove(this.hyperspaceGrid);
      this.hyperspaceGrid = null;
    }
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    this.renderer.dispose();
  }
}
