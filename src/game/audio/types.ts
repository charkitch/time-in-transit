import type { UIMode } from '../GameStateTypes';

// Raw game inputs handed to the music system (App -> MusicDirector).
export interface MusicEnvironment {
  uiMode: UIMode;
  currentSystemId: number;
  systemName: string | null;
  stationActive: boolean;
}

// Derived musical parameters the synth renders (MusicDirector -> MusicEngine).
// Grows one field at a time as the engine learns to apply each; see
// plans/procedural-music.md for the full intended palette.
export interface MusicalParams {
  key: number; // semitone transpose from the base palette; 0 = neutral
  voiceActive: boolean; // station comms layer
}

export interface MusicEngine {
  start(): Promise<void>;
  stop(): void;
  setEnabled(enabled: boolean): Promise<void>;
  setVolume(volume: number): void;
  setParams(params: MusicalParams): void;
  dispose(): void;
}
