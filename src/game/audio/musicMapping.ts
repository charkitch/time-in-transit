import type { MusicEnvironment, MusicalParams } from './types';

const NEUTRAL_KEY = 0;

/**
 * Translate raw game state into musical parameters. Pure and side-effect free
 * so it can be unit-tested independently of the audio engine.
 *
 * Phase 1 derives only the station comms layer; star/politics/system seeding
 * land here in later phases (see plans/procedural-music.md).
 */
export function deriveParams(env: MusicEnvironment): MusicalParams {
  return {
    key: NEUTRAL_KEY,
    voiceActive: env.stationActive,
  };
}
