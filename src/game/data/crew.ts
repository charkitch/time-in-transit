export interface CrewDisplayData {
  name: string;
  role: string;
  bonus: string;
}

export const CREW_DISPLAY: Record<string, CrewDisplayData> = {
  Enne: {
    name: 'Enne',
    role: 'Historian',
    bonus: '+2 scan range, -10% jump fuel',
  },
  TessalyVane: {
    name: 'Tessaly Vane',
    role: 'Diplomat',
    bonus: '+3 cargo capacity',
  },
  Renn: {
    name: 'Renn',
    role: 'Gunner',
    bonus: '+3 cooling rate, -10% jump fuel',
  },
  TheListener: {
    name: 'The Listener',
    role: 'Signals Officer',
    bonus: '+3 scan range, +20% harvest efficiency',
  },
  IceMonksAbbot: {
    name: 'The Abbot',
    role: 'Engineer',
    bonus: '+3 shield regen, +2 cooling rate',
  },
};
