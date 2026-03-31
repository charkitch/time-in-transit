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
  makeAsteroidBase, makeOortCloudBase, makeMaximumSpaceBase,
  makeTexturedPlanet, makeTexturedGasGiant, makeTexturedRing,
  makeRingSystem,
  addCityLights, addSunAtmosphere, addLightning, addCloudLayer,
} from './meshFactory';
import { selectSkin } from './planetSkins';
import { disposeAll as disposeTextureCache } from './textureCache';
import type { SolarSystemData, SystemFactionState } from '../engine';
import { generateNPCShips } from '../mechanics/NPCSystem';
import type { NPCShipState } from '../mechanics/NPCSystem';
import { generateFleetBattle } from '../mechanics/FleetBattleSystem';
import type { FleetBattle } from '../mechanics/FleetBattleSystem';
import { getFaction } from '../data/factions';
import { PRNG } from '../generation/prng';
import { CLUSTER_SEED, RENDER_CONFIG } from '../constants';

const _npcCollisionVec = new THREE.Vector3();

export interface SceneEntity {
  id: string;
  group: THREE.Object3D;
  orbitRadius: number;
  orbitSpeed: number;
  orbitPhase: number;
  parentId?: string;
  type: 'planet' | 'station' | 'star' | 'moon' | 'npc_ship' | 'fleet_ship';
  worldPos: THREE.Vector3; // updated each frame
  collisionRadius: number;
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
  private lightningMaterials: THREE.ShaderMaterial[] = [];
  private battleProjectiles: THREE.Points | null = null;
  private battleExplosions: BattleExplosions | null = null;
  private fleetBattleData: FleetBattle | null = null;
  private collidables: SceneEntity[] = [];

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

  loadSystem(
    data: SolarSystemData,
    systemId: number,
    galaxyYear = 0,
    systemName = '',
    factionState?: SystemFactionState,
  ): void {
    // Remove old system objects
    this.systemObjects.forEach(o => this.scene.remove(o));
    this.systemObjects = [];
    this.lightningMaterials = [];
    this.entities.clear();
    this.npcShips.clear();
    this.battleProjectiles = null;
    this.battleExplosions = null;
    this.fleetBattleData = null;

    // Star
    const starColor = STAR_COLORS[data.starType] ?? PALETTE.starG;
    const isBlackHole = data.starType === 'BH' || data.starType === 'SBH';
    const isIntense = data.starType === 'NS' || data.starType === 'PU' || data.starType === 'MG';
    const starGroup = new THREE.Group();
    let starOrbitRadius = 0;
    let starOrbitSpeed = 0;
    let starOrbitPhase = 0;

    if (isBlackHole) {
      // Black sphere core
      const bhGeo = new THREE.SphereGeometry(data.starRadius, 16, 16);
      const bhMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      starGroup.add(new THREE.Mesh(bhGeo, bhMat));

      // Accretion disk(s)
      const diskColor = 0xFF6622;
      const diskMat = new THREE.MeshBasicMaterial({
        color: diskColor,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const innerR = data.starRadius * 1.4;
      const outerR = data.starRadius * 2.2;
      const diskGeo = new THREE.TorusGeometry((innerR + outerR) / 2, (outerR - innerR) / 2, 8, 48);
      const disk = new THREE.Mesh(diskGeo, diskMat);
      disk.rotation.x = Math.PI / 2;
      starGroup.add(disk);

      if (data.starType === 'SBH') {
        // Second larger ring
        const outerR2 = data.starRadius * 3.0;
        const diskGeo2 = new THREE.TorusGeometry((outerR + outerR2) / 2, (outerR2 - outerR) / 2, 8, 48);
        const diskMat2 = diskMat.clone();
        diskMat2.opacity = 0.35;
        const disk2 = new THREE.Mesh(diskGeo2, diskMat2);
        disk2.rotation.x = Math.PI / 2;
        disk2.rotation.z = 0.3;
        starGroup.add(disk2);
      }

      // Dim purple point light for black holes
      if (this.starLight) this.scene.remove(this.starLight);
      this.starLight = new THREE.PointLight(0x6622AA, 0.5, 60000);
      this.scene.add(this.starLight);
      this.systemObjects.push(this.starLight);
    } else if (data.starType === 'XB' && data.companion) {
      const companion = data.companion;

      // Compact object (neutron star / X-ray source) — built into starGroup
      starGroup.add(new THREE.Mesh(
        new THREE.SphereGeometry(data.starRadius, 8, 8),
        new THREE.MeshBasicMaterial({ color: starColor }),
      ));
      starGroup.add(makeGlowSprite(starColor, data.starRadius * 10));

      // Accretion disk around compact object
      const diskInnerR = data.starRadius * 1.5;
      const diskOuterR = data.starRadius * 3.5;
      const diskGeo = new THREE.TorusGeometry((diskInnerR + diskOuterR) / 2, (diskOuterR - diskInnerR) / 2, 8, 48);
      const diskMat = new THREE.MeshBasicMaterial({
        color: 0xFF4466,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const disk = new THREE.Mesh(diskGeo, diskMat);
      disk.rotation.x = Math.PI / 2;
      starGroup.add(disk);

      // Light travels with the compact object group (no static starLight needed)
      if (this.starLight) this.scene.remove(this.starLight);
      this.starLight = null;
      starGroup.add(new THREE.PointLight(starColor, 2, 60000));

      // Compact object orbits opposite the companion, closer to CoM
      starOrbitRadius = companion.orbitRadius * 0.4;
      starOrbitSpeed = companion.orbitSpeed;
      starOrbitPhase = companion.orbitPhase + Math.PI;
      starGroup.position.set(
        Math.cos(starOrbitPhase) * starOrbitRadius, 0,
        Math.sin(starOrbitPhase) * starOrbitRadius,
      );

      // Companion star
      const companionGroup = new THREE.Group();
      companionGroup.add(new THREE.Mesh(
        new THREE.SphereGeometry(companion.radius, 8, 8),
        new THREE.MeshBasicMaterial({ color: companion.color }),
      ));
      companionGroup.add(makeGlowSprite(companion.color, companion.radius * 6));
      companionGroup.add(new THREE.PointLight(companion.color, 1.5, 60000));
      companionGroup.position.set(
        Math.cos(companion.orbitPhase) * companion.orbitRadius, 0,
        Math.sin(companion.orbitPhase) * companion.orbitRadius,
      );
      this.scene.add(companionGroup);
      this.systemObjects.push(companionGroup);

      this.entities.set('companion-star', {
        id: 'companion-star',
        group: companionGroup,
        orbitRadius: companion.orbitRadius,
        orbitSpeed: companion.orbitSpeed,
        orbitPhase: companion.orbitPhase,
        type: 'star',
        worldPos: new THREE.Vector3(
          Math.cos(companion.orbitPhase) * companion.orbitRadius, 0,
          Math.sin(companion.orbitPhase) * companion.orbitRadius,
        ),
        collisionRadius: companion.radius,
      });
    } else {
      // Normal/exotic star sphere
      const starGeo = new THREE.SphereGeometry(data.starRadius, 8, 8);
      const starMat = new THREE.MeshBasicMaterial({ color: starColor });
      starGroup.add(new THREE.Mesh(starGeo, starMat));

      // Glow sprite — larger for intense objects, slightly larger for WD
      const glowMul = isIntense ? 12
        : data.starType === 'WD' ? 8
        : 6;
      const glow = makeGlowSprite(starColor, data.starRadius * glowMul);
      starGroup.add(glow);

      // Pulsar beam jets — tapered cones anchored at the star surface
      if (data.starType === 'PU') {
        const beamColor = 0x44AAFF;
        const beamLen = data.starRadius * 12;
        const baseWidth = data.starRadius * 0.6;
        const tipWidth = data.starRadius * 0.05;
        const beamMat = new THREE.MeshBasicMaterial({
          color: beamColor,
          transparent: true,
          opacity: 0.45,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        for (const sign of [1, -1]) {
          const beamGeo = new THREE.CylinderGeometry(tipWidth, baseWidth, beamLen, 8, 1, true);
          const beam = new THREE.Mesh(beamGeo, beamMat);
          // Position so the wide base sits at the star surface
          beam.position.set(0, sign * (data.starRadius + beamLen / 2), 0);
          if (sign < 0) beam.rotation.x = Math.PI;
          starGroup.add(beam);
          // Inner brighter core
          const coreGeo = new THREE.CylinderGeometry(tipWidth * 0.3, baseWidth * 0.3, beamLen, 6, 1, true);
          const coreMat = beamMat.clone();
          coreMat.opacity = 0.7;
          const core = new THREE.Mesh(coreGeo, coreMat);
          core.position.copy(beam.position);
          if (sign < 0) core.rotation.x = Math.PI;
          starGroup.add(core);
        }
      }

      // Point light
      const lightIntensity = isIntense ? 3 : 2;
      if (this.starLight) this.scene.remove(this.starLight);
      this.starLight = new THREE.PointLight(starColor, lightIntensity, 60000);
      this.scene.add(this.starLight);
      this.systemObjects.push(this.starLight);
    }

    this.scene.add(starGroup);
    this.systemObjects.push(starGroup);

    this.entities.set('star', {
      id: 'star',
      group: starGroup,
      orbitRadius: starOrbitRadius,
      orbitSpeed: starOrbitSpeed,
      orbitPhase: starOrbitPhase,
      type: 'star',
      worldPos: new THREE.Vector3(
        Math.cos(starOrbitPhase) * starOrbitRadius, 0,
        Math.sin(starOrbitPhase) * starOrbitRadius,
      ),
      collisionRadius: data.starRadius,
    });

    const rng = PRNG.fromIndex(CLUSTER_SEED, systemId * 97 + 13);
    // Fork an isolated PRNG for skin selection — parent rng stream is unaffected
    // by how many skins are picked, and determinism holds whether textures are on or off.
    const skinRng = rng.fork();
    const texturesEnabled = RENDER_CONFIG.planetTexturesEnabled;
    const wireOverlay = RENDER_CONFIG.planetWireOverlayEnabled;

    // Planets
    for (const planet of data.planets) {
      let planetGroup: THREE.Group;
      // Stable seed per planet — shared between continent shader and city lights
      const planetSeed = rng.next() * 100;
      if (texturesEnabled) {
        const category = planet.type === 'gas_giant' ? 'gas' : 'rocky';
        const skin = selectSkin(category, skinRng);
        planetGroup = planet.type === 'gas_giant'
          ? makeTexturedGasGiant(planet.radius, planet.color, skin, wireOverlay, planetSeed, planet.gasType)
          : makeTexturedPlanet(planet.radius, planet.color, skin, wireOverlay, planetSeed, planet.surfaceType);
      } else {
        planetGroup = planet.type === 'gas_giant'
          ? makeGasGiant(planet.radius, planet.color, () => rng.next(), planetSeed, planet.gasType,
              planet.greatSpot, planet.greatSpotLat, planet.greatSpotSize)
          : makePlanet(planet.radius, planet.color, 1, planetSeed, planet.surfaceType);
      }
      // Cloud layer for rocky planets
      if (planet.hasClouds && planet.type !== 'gas_giant') {
        addCloudLayer(planetGroup, planet.radius, planetSeed, planet.cloudDensity, planet.surfaceType);
      }
      // City lights + sun atmosphere for non-gas-giant planets
      if (planet.type !== 'gas_giant') {
        addCityLights(planetGroup, planet.radius, planetSeed, planet.surfaceType);
        addSunAtmosphere(planetGroup, planet.radius);
      }
      if (rng.next() < 0.05) {
        this.lightningMaterials.push(addLightning(planetGroup, planet.radius, planetSeed));
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
        collisionRadius: planet.radius,
      });

      // Rings
      if (planet.hasRings) {
        const ringSeed = Math.floor(rng.next() * 0xFFFFFF);
        const ringGroup = makeRingSystem(
          planet.radius,
          planet.ringCount,
          planet.ringInclination,
          ringSeed,
          planet.gasType,
        );
        planetGroup.add(ringGroup);
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
          collisionRadius: 0,
        });
      }

      // Moons
      for (const moon of planet.moons) {
        const moonSeed = rng.next() * 100;
        let moonGroup: THREE.Group;
        if (texturesEnabled) {
          const skin = selectSkin('moon', skinRng);
          moonGroup = makeTexturedPlanet(moon.radius, moon.color, skin, wireOverlay, moonSeed, moon.surfaceType);
        } else {
          moonGroup = makePlanet(moon.radius, moon.color, 0, moonSeed, moon.surfaceType);
        }
        if (moon.hasClouds) {
          addCloudLayer(moonGroup, moon.radius, moonSeed, moon.cloudDensity, moon.surfaceType);
        }
        addCityLights(moonGroup, moon.radius, moonSeed, moon.surfaceType);
        addSunAtmosphere(moonGroup, moon.radius);
        if (rng.next() < 0.05) {
          this.lightningMaterials.push(addLightning(moonGroup, moon.radius, moonSeed));
        }
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
          collisionRadius: moon.radius,
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

    // Secret bases
    for (const base of data.secretBases) {
      let baseGroup: THREE.Group;
      switch (base.type) {
        case 'asteroid':
          baseGroup = makeAsteroidBase(35);
          break;
        case 'oort_cloud':
          baseGroup = makeOortCloudBase(45);
          break;
        case 'maximum_space':
          baseGroup = makeMaximumSpaceBase(55);
          break;
      }
      baseGroup.position.set(
        Math.cos(base.orbitPhase) * base.orbitRadius,
        0,
        Math.sin(base.orbitPhase) * base.orbitRadius,
      );
      this.scene.add(baseGroup);
      this.systemObjects.push(baseGroup);

      this.entities.set(base.id, {
        id: base.id,
        group: baseGroup,
        orbitRadius: base.orbitRadius,
        orbitSpeed: base.orbitSpeed,
        orbitPhase: base.orbitPhase,
        type: 'station', // reuse station type so docking works
        worldPos: new THREE.Vector3(),
        collisionRadius: 0,
      });

      // Ambient particles around secret bases
      if (base.type === 'oort_cloud') {
        // Sparse icy debris cloud
        const iceGeo = new THREE.BufferGeometry();
        const iceCount = 120;
        const icePositions = new Float32Array(iceCount * 3);
        for (let i = 0; i < iceCount; i++) {
          const angle2 = rng.next() * Math.PI * 2;
          const dist = base.orbitRadius + (rng.next() - 0.5) * 2000;
          const y2 = (rng.next() - 0.5) * 600;
          icePositions[i * 3] = Math.cos(angle2) * dist;
          icePositions[i * 3 + 1] = y2;
          icePositions[i * 3 + 2] = Math.sin(angle2) * dist;
        }
        iceGeo.setAttribute('position', new THREE.BufferAttribute(icePositions, 3));
        const iceMat = new THREE.PointsMaterial({ color: 0x88BBDD, size: 15, transparent: true, opacity: 0.3 });
        const icePoints = new THREE.Points(iceGeo, iceMat);
        this.scene.add(icePoints);
        this.systemObjects.push(icePoints);
      } else if (base.type === 'maximum_space') {
        // Faint void motes — strange purple specks at the edge of nothing
        const voidGeo = new THREE.BufferGeometry();
        const voidCount = 60;
        const voidPositions = new Float32Array(voidCount * 3);
        for (let i = 0; i < voidCount; i++) {
          const angle2 = rng.next() * Math.PI * 2;
          const dist = base.orbitRadius + (rng.next() - 0.5) * 3000;
          const y2 = (rng.next() - 0.5) * 1000;
          voidPositions[i * 3] = Math.cos(angle2) * dist;
          voidPositions[i * 3 + 1] = y2;
          voidPositions[i * 3 + 2] = Math.sin(angle2) * dist;
        }
        voidGeo.setAttribute('position', new THREE.BufferAttribute(voidPositions, 3));
        const voidMat = new THREE.PointsMaterial({ color: 0x6622CC, size: 20, transparent: true, opacity: 0.2 });
        const voidPoints = new THREE.Points(voidGeo, voidMat);
        this.scene.add(voidPoints);
        this.systemObjects.push(voidPoints);
      }
    }

    // NPC trade ships — waypoints derived from planet initial positions
    const planetIds = data.planets.map(p => p.id);
    const planetPositions = data.planets.map(p =>
      new THREE.Vector3(
        Math.cos(p.orbitPhase) * p.orbitRadius,
        0,
        Math.sin(p.orbitPhase) * p.orbitRadius,
      )
    );

    const npcData = generateNPCShips(data, systemId, galaxyYear, systemName, planetPositions, planetIds, data.mainStationPlanetId);
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
        collisionRadius: 0,
      });

      this.npcShips.set(shipData.id, {
        id: shipData.id,
        name: shipData.name,
        originSystemName: shipData.originSystemName,
        waypointA: shipData.waypointA,
        waypointB: shipData.waypointB,
        planetIdA: shipData.planetIdA,
        planetIdB: shipData.planetIdB,
        t: shipData.t,
        direction: shipData.direction,
        speed: shipData.speed,
        cargo: shipData.cargo,
        commLines: shipData.commLines,
        factionTag: shipData.factionTag,
      });
    }

    // Fleet battle
    if (factionState) {
      const battle = generateFleetBattle(data, systemId, galaxyYear, factionState);
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
            collisionRadius: 0,
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
            collisionRadius: 0,
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

    this.rebuildCollidables();
  }

  private rebuildCollidables(): void {
    this.collidables = [];
    for (const [, entity] of this.entities) {
      if (entity.collisionRadius > 0) {
        this.collidables.push(entity);
      }
    }
  }

  getCollidables(): SceneEntity[] {
    return this.collidables;
  }

  updateOrbits(time: number, dt = 0): void {
    for (const [, entity] of this.entities) {
      if (entity.type === 'star' && entity.orbitRadius === 0) continue;
      if (entity.type === 'npc_ship' || entity.type === 'fleet_ship') continue;

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

    // Fleet ships are children of the battle group, so their local position is
    // not their world position. Keep scanner/targeting coordinates in world
    // space and avoid the generic orbit code snapping them back to the origin.
    for (const [, entity] of this.entities) {
      if (entity.type !== 'fleet_ship') continue;
      entity.group.getWorldPosition(entity.worldPos);
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

        // Keep waypoints tracking orbiting planets
        const pa = this.entities.get(npcState.planetIdA);
        const pb = this.entities.get(npcState.planetIdB);
        if (pa) npcState.waypointA.copy(pa.worldPos);
        if (pb) npcState.waypointB.copy(pb.worldPos);

        const dist = npcState.waypointA.distanceTo(npcState.waypointB);
        if (dist < 1) continue;

        npcState.t += (npcState.speed * dt / dist) * npcState.direction;
        if (npcState.t >= 1) { npcState.t = 1; npcState.direction = -1; }
        if (npcState.t <= 0) { npcState.t = 0; npcState.direction = 1; }

        entity.group.position.lerpVectors(npcState.waypointA, npcState.waypointB, npcState.t);

        // Push NPC out of any collidable body
        for (const body of this.collidables) {
          const diff = _npcCollisionVec.copy(entity.group.position).sub(body.worldPos);
          const dist = diff.length();
          const minDist = body.collisionRadius + 10;
          if (dist < minDist && dist > 0.001) {
            const normal = diff.normalize();
            entity.group.position.copy(body.worldPos).addScaledVector(normal, minDist);
          }
        }

        // Separate NPC ships from each other
        const NPC_SEPARATION = 30;
        for (const [otherId, otherState] of this.npcShips) {
          if (otherId === npcState.id) continue;
          const otherEntity = this.entities.get(otherState.id);
          if (!otherEntity) continue;
          const diff = entity.group.position.clone().sub(otherEntity.worldPos);
          const d = diff.length();
          if (d < NPC_SEPARATION && d > 0.001) {
            entity.group.position.addScaledVector(diff.normalize(), (NPC_SEPARATION - d) * 0.5);
          }
        }

        entity.worldPos.copy(entity.group.position);
      }
    }

    // Tick lightning shaders
    for (const mat of this.lightningMaterials) {
      mat.uniforms.uTime.value = time;
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
    disposeTextureCache();
    this.renderer.dispose();
  }
}
