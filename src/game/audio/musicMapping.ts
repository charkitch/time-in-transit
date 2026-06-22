import type { StarType } from '../engine';
import type { MusicEnvironment, MusicalParams } from './types';

// Perceived brightness per star class (0 = dark/dim, 1 = brilliant), feeding the
// low-pass cutoff. Hot main-sequence stars sing bright; cool dwarves, iron stars
// and black holes sit dark. Tunable — these are deliberate aesthetic choices.
const STAR_BRIGHTNESS: Record<StarType, number> = {
  A: 1, // hot blue-white
  F: 0.9,
  G: 0.85, // sun-like; near fully open
  K: 0.6,
  M: 0.4, // cool red dwarf
  WD: 0.7, // white dwarf — small but hot
  NS: 0.5, // neutron star
  PU: 0.55, // pulsar
  XB: 0.6, // X-ray binary
  MG: 0.45, // magnetar
  BH: 0.12, // black hole — darkest
  XBB: 0.6, // X-ray bright binary
  MQ: 0.65, // microquasar
  IRON: 0.18, // iron star — cold, dead-universe
};

const NEUTRAL_BRIGHTNESS = 0.7;

// Consonant transpositions (semitones): unison, M2, m3, P4, P5, and their
// gentle descents. Bounded to keep the low end out of the mud we high-pass at.
const SYSTEM_TRANSPOSE = [0, 2, 3, 5, 7, -2, -3];

/**
 * Translate raw game state into musical parameters. Pure and side-effect free
 * so it can be unit-tested independently of the audio engine.
 *
 * Phase 2: the system seeds a stable tonal center, the star sets brightness, and
 * contested space darkens the mode. Per-faction motifs and ship-state intensity
 * land in later phases (see plans/procedural-music.md).
 */
export function deriveParams(env: MusicEnvironment): MusicalParams {
  return {
    key: SYSTEM_TRANSPOSE[env.currentSystemId % SYSTEM_TRANSPOSE.length],
    mode: env.contested ? 'tense' : 'calm',
    brightness: env.starType ? STAR_BRIGHTNESS[env.starType] : NEUTRAL_BRIGHTNESS,
    voiceActive: env.stationActive,
  };
}
