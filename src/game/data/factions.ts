export interface Faction {
  id: string;
  name: string;
  color: number;
}

export const ALL_FACTIONS: readonly Faction[] = [
  { id: 'faction-0', name: 'Korathi', color: 0xFF4444 },
  { id: 'faction-1', name: 'Veleron', color: 0xFF8833 },
  { id: 'faction-2', name: 'Ashundi', color: 0x4488FF },
  { id: 'faction-3', name: 'Draimar', color: 0xAA44FF },
  { id: 'faction-4', name: 'Solossa', color: 0x44DDAA },
  { id: 'faction-5', name: 'Nyxenth', color: 0xFFCC22 },
];

export function getFaction(id: string): Faction | undefined {
  return ALL_FACTIONS.find(faction => faction.id === id);
}
