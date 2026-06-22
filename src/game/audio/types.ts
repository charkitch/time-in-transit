import type { StarType } from '../engine';

// Raw game inputs handed to the music system (App -> MusicDirector).
export interface MusicEnvironment {
  currentSystemId: number; // seeds the system's tonal center
  starType: StarType | null; // drives brightness
  contested: boolean; // drives mode
  stationActive: boolean; // drives the comms layer
}

export type MusicMode = 'calm' | 'tense';

// Derived musical parameters the synth renders (MusicDirector -> MusicEngine).
// Grows one field at a time as the engine learns to apply each; see
// plans/procedural-music.md for the full intended palette.
export interface MusicalParams {
  key: number; // semitone transpose from the base palette; 0 = neutral
  mode: MusicMode; // selects the chord pool
  brightness: number; // 0..1 -> low-pass cutoff
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
