import * as THREE from 'three';
import { RENDER_CONFIG } from '../../constants';
import {
  makePlanet, makeGasGiant, makeStation,
  makeTexturedPlanet, makeTexturedGasGiant,
  makeRingSystem,
  addCityLights, addSunAtmosphere, addLightning, addCloudLayer,
} from '../meshFactory';
import { selectSkin } from '../planetSkins';
import type { MoonData, SolarSystemData } from '../../engine';
import { PRNG } from '../../generation/prng';
import type { SceneEntity } from './types';
import { LandingSiteManager } from './LandingSiteManager';
import { hashString32, stationSpinAxisForArchetype, computeStationCollisionSamples, PLANET_COLLISION_SCALE } from './buildSystemSceneUtils';

export function buildPlanets(params: {
  scene: THREE.Scene;
  entities: Map<string, SceneEntity>;
  systemObjects: THREE.Object3D[];
  lightningMaterials: THREE.ShaderMaterial[];
  landingSites: LandingSiteManager;
  data: SolarSystemData;
  systemId: number;
  rng: PRNG;
}): void {
  const { scene, entities, systemObjects, lightningMaterials, landingSites, data, systemId, rng } = params;

  // Fork an isolated PRNG for skin selection — parent rng stream is unaffected
  // by how many skins are picked, and determinism holds whether textures are on or off.
  const skinRng = rng.fork();
  const texturesEnabled = RENDER_CONFIG.planetTexturesEnabled;
  const wireOverlay = RENDER_CONFIG.planetWireOverlayEnabled;

  const addMoon = (
    moon: MoonData,
    index: number,
    planet: { id: string; name: string },
  ): void => {
    const moonSeed = rng.next() * 100;
    const suffix = String.fromCharCode(97 + index); // a, b, c, ...
    const { planetTexturesEnabled: textured, planetWireOverlayEnabled: wireOvl } = RENDER_CONFIG;
    const moonGroup = textured
      ? makeTexturedPlanet(moon.radius, moon.color, selectSkin('moon', skinRng), wireOvl, moonSeed, moon.surfaceType,
          moon.polarCapSize, moon.climateState)
      : makePlanet(moon.radius, moon.color, 0, moonSeed, moon.surfaceType,
          undefined, moon.polarCapSize, moon.climateState);
    if (moon.hasClouds) {
      addCloudLayer(moonGroup, moon.radius, moonSeed, moon.cloudDensity, moon.surfaceType);
    }
    addCityLights(moonGroup, moon.radius, moonSeed, moon.surfaceType, moon.polarCapSize);
    addSunAtmosphere(moonGroup, moon.radius);
    if (rng.next() < 0.05) {
      lightningMaterials.push(addLightning(moonGroup, moon.radius, moonSeed));
    }
    scene.add(moonGroup);
    systemObjects.push(moonGroup);
    entities.set(moon.id, {
      id: moon.id,
      name: `${planet.name}-${suffix}`,
      group: moonGroup,
      orbitRadius: moon.orbitRadius,
      orbitSpeed: moon.orbitSpeed,
      orbitPhase: moon.orbitPhase,
      parentId: planet.id,
      type: 'moon',
      worldPos: new THREE.Vector3(),
      collisionRadius: moon.radius,
    });
  };

  for (const planet of data.planets) {
    const isCrownRetreat = data.topopolisCoils.length > 0 && planet.id === data.planets[0]?.id;
    let planetGroup: THREE.Group;
    // Stable seed per planet — shared between continent shader and city lights
    const planetSeed = rng.next() * 100;
    if (texturesEnabled) {
      const category = planet.type === 'gas_giant' ? 'gas' : 'rocky';
      const skin = selectSkin(category, skinRng);
      planetGroup = planet.type === 'gas_giant'
        ? makeTexturedGasGiant(planet.radius, planet.color, skin, wireOverlay, planetSeed, planet.gasType)
        : makeTexturedPlanet(planet.radius, planet.color, skin, wireOverlay, planetSeed, planet.surfaceType,
            planet.polarCapSize, planet.climateState);
    } else {
      planetGroup = planet.type === 'gas_giant'
        ? makeGasGiant(planet.radius, planet.color, () => rng.next(), planetSeed, planet.gasType,
            planet.greatSpot, planet.greatSpotLat, planet.greatSpotSize, planet.interactionField)
        : makePlanet(planet.radius, planet.color, 1, planetSeed, planet.surfaceType, planet.interactionField,
            planet.polarCapSize, planet.climateState);
    }
    // Cloud layer for rocky planets
    if (planet.hasClouds && planet.type !== 'gas_giant') {
      addCloudLayer(planetGroup, planet.radius, planetSeed, planet.cloudDensity, planet.surfaceType);
    }
    // City lights + sun atmosphere for non-gas-giant planets
    if (planet.type !== 'gas_giant') {
      if (!isCrownRetreat) {
        addCityLights(planetGroup, planet.radius, planetSeed, planet.surfaceType, planet.polarCapSize);
      }
      addSunAtmosphere(planetGroup, planet.radius);
    }

    planetGroup.position.set(planet.orbitRadius, 0, 0);
    if (planet.axialTilt) {
      planetGroup.rotation.z = planet.axialTilt;
    }
    scene.add(planetGroup);
    systemObjects.push(planetGroup);

    entities.set(planet.id, {
      id: planet.id,
      name: planet.name,
      group: planetGroup,
      orbitRadius: planet.orbitRadius,
      orbitSpeed: planet.orbitSpeed,
      orbitPhase: planet.orbitPhase,
      type: 'planet',
      worldPos: new THREE.Vector3(),
      collisionRadius: planet.radius * PLANET_COLLISION_SCALE,
      axialTilt: planet.axialTilt || undefined,
    });
    const siteClasses = landingSites.addPlanetSites({
      hostId: planet.id,
      hostLabel: planet.name,
      hostGroup: planetGroup,
      hostCollisionRadius: planet.radius * PLANET_COLLISION_SCALE,
      field: planet.interactionField,
      bodyKind: planet.type,
      specialLayout: isCrownRetreat ? 'crown_retreat' : undefined,
    });
    const lightningRoll = rng.next();
    const forceStormLightning = planet.type === 'gas_giant' && siteClasses.has('gas_volatile');
    if (forceStormLightning || lightningRoll < 0.05) {
      lightningMaterials.push(addLightning(planetGroup, planet.radius, planetSeed));
    }

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
      const stationSeed = hashString32(`${systemId}:${planet.id}:station`);
      const stationArchetype = planet.stationArchetype ?? 'trade_hub';
      const stationScale = stationArchetype === 'alien_graveloom' ? 1.35 : stationArchetype.startsWith('alien_') ? 1.15 : 1.0;
      const stationSize = 60 * stationScale;
      const stationCollisionRadius = stationSize * 1.25;
      const ringCollision = computeStationCollisionSamples(stationArchetype, stationSize);
      const stationGroup = makeStation({
        size: stationSize,
        archetype: stationArchetype,
        seed: stationSeed,
      });
      const stationId = `station-${planet.id}`;
      scene.add(stationGroup);
      systemObjects.push(stationGroup);
      entities.set(stationId, {
        id: stationId,
        name: `${planet.name} Station`,
        group: stationGroup,
        orbitRadius: planet.radius * 2.5,
        orbitSpeed: planet.orbitSpeed * 2,
        orbitPhase: rng.next() * Math.PI * 2,
        parentId: planet.id,
        type: 'station',
        worldPos: new THREE.Vector3(),
        collisionRadius: stationCollisionRadius,
        interactionRadius: stationSize,
        collisionSpheresLocal: ringCollision.local,
        collisionSpheresWorld: ringCollision.local.map(sphere => ({
          center: sphere.center.clone(),
          radius: sphere.radius,
        })),
        collisionSampleOnly: true,
        stationSpinAxis: stationSpinAxisForArchetype(stationArchetype),
      });
    }

    // Moons
    planet.moons.forEach((moon, mi) =>
      addMoon(moon, mi, planet),
    );
  }
}
