import { ToneMusicEngine } from './ToneMusicEngine';
import { deriveParams } from './musicMapping';
import type { MusicEngine, MusicEnvironment } from './types';

export class MusicDirector {
  private readonly engine: MusicEngine;

  constructor(engine: MusicEngine = new ToneMusicEngine()) {
    this.engine = engine;
  }

  setEnvironment(environment: MusicEnvironment): void {
    this.engine.setParams(deriveParams(environment));
  }

  setVolume(volume: number): void {
    this.engine.setVolume(volume);
  }

  setEnabled(enabled: boolean): Promise<void> {
    return this.engine.setEnabled(enabled);
  }

  dispose(): void {
    this.engine.dispose();
  }
}
