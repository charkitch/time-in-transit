import * as THREE from 'three';
import { STAR_COLORS } from '../../game/constants';
import type { SceneEntity } from '../../game/rendering/scene/types';
import {
  STAR_TYPE_LABELS, NPC_COLOR_HUMAN, NPC_COLOR_ALIEN, FLEET_BATTLE_COLOR,
  STATION_COLOR, MOON_COLOR, PLAYER_COLOR, SECRET_BASE_COLOR,
  type SelectedInfo, type SystemData,
} from './types';

export function isAlienShipName(name: string): boolean {
  return ['Ixh', 'Qel', 'Ruum', 'Nyth', 'Tza', 'Vorr', 'Khir', 'Saa']
    .some(prefix => name.startsWith(prefix));
}

export function getPlanetLabel(planet: { type: string }): string {
  return planet.type === 'gas_giant' ? 'Gas giant' : 'Rocky planet';
}

export function getSelectedInfo(
  id: string | null,
  currentSystem: SystemData,
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
    return {
      title: `Station at ${stationPlanet.name}`,
      subtitle: stationPlanet.stationArchetype?.replace(/_/g, ' ') ?? 'station',
      accent: STATION_COLOR,
    };
  }

  for (const planetEntry of currentSystem.planets) {
    const moon = planetEntry.moons.find(entry => entry.id === id);
    if (moon) {
      return { title: `${planetEntry.name} moon`, subtitle: 'Moon', accent: MOON_COLOR };
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
    return { title: base.name, subtitle: baseLabels[base.type] ?? 'Base', accent: SECRET_BASE_COLOR };
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
    return { title: entity.name, subtitle: 'Fleet contact', accent: FLEET_BATTLE_COLOR };
  }

  return {
    title: entity.name,
    subtitle: entity.type.replace(/_/g, ' '),
    accent: PLAYER_COLOR,
  };
}
