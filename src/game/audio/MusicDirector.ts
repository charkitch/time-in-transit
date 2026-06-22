import { ToneMusicEngine } from './ToneMusicEngine';
import type { MusicEngine, MusicEnvironment } from './types';

export class MusicDirector {
  private readonly engine: MusicEngine;
  private volume = 0.35;
  private environment: MusicEnvironment = {
    uiMode: 'loading',
    currentSystemId: 0,
    systemName: null,
    stationActive: false,
  };

  constructor(engine: MusicEngine = new ToneMusicEngine()) {
    this.engine = engine;
    this.engine.setVolume(this.volume);
    this.engine.setEnvironment(this.environment);
  }

  setEnvironment(environment: MusicEnvironment): void {
    this.environment = environment;
    this.engine.setEnvironment(environment);
  }

  setVolume(volume: number): void {
    this.volume = volume;
    this.engine.setVolume(volume);
  }

  setEnabled(enabled: boolean): Promise<void> {
    return this.engine.setEnabled(enabled);
  }

  dispose(): void {
    this.engine.dispose();
  }
}
