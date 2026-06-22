import type { UIMode } from '../GameStateTypes';

export interface MusicEnvironment {
  uiMode: UIMode;
  currentSystemId: number;
  systemName: string | null;
  stationActive: boolean;
}

export interface MusicEngine {
  start(): Promise<void>;
  stop(): void;
  setEnabled(enabled: boolean): Promise<void>;
  setVolume(volume: number): void;
  setEnvironment(environment: MusicEnvironment): void;
  dispose(): void;
}
