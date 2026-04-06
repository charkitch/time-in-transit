export type NPCShipArchetype =
  | 'human_freighter'
  | 'human_patrol'
  | 'pilgrim_caravan'
  | 'alien_biolattice'
  | 'alien_crystal_spine'
  | 'alien_void_weaver';

export type NPCShipSizeClass = 'small' | 'medium' | 'large';

export type StationArchetype =
  | 'trade_hub'
  | 'refinery_spindle'
  | 'citadel_bastion'
  | 'alien_lattice_hive'
  | 'alien_orrery_reliquary'
  | 'alien_graveloom';

export function stationHostTypeToken(archetype: StationArchetype): string {
  return `station_${archetype}`;
}

export const NPC_ARCHETYPE_LABEL: Record<NPCShipArchetype, string> = {
  human_freighter: 'Human Freighter',
  human_patrol: 'Human Patrol',
  pilgrim_caravan: 'Pilgrim Caravan',
  alien_biolattice: 'Alien Biolattice',
  alien_crystal_spine: 'Alien Crystal Spine',
  alien_void_weaver: 'Alien Void Weaver',
};
