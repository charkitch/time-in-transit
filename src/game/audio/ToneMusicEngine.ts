import * as Tone from 'tone';
import type { MusicEngine, MusicMode, MusicalParams } from './types';

const DEFAULT_VOLUME = 0.35;

// Chord pools per mode. 'calm' is the open, no-third palette; 'tense' grounds a
// perfect fifth under a semitone/tritone tension for contested space.
const CHORD_POOLS: Record<MusicMode, string[][]> = {
  calm: [
    ['G2', 'D3', 'C4'], // open quintal stack
    ['Bb2', 'F3', 'D4'], // Bb major
    ['D3', 'A3', 'F4'], // D minor
    ['F2', 'C3', 'A3'], // F major
  ],
  tense: [
    ['D3', 'A3', 'Eb4'], // hollow fifth + tritone above
    ['Bb2', 'Db3', 'F3'], // Bb minor — dark but stable
    ['F2', 'C3', 'Gb3'], // hollow fifth + tritone above
    ['D3', 'F3', 'Ab3'], // D diminished — dread
  ],
};
const BELL_SCALE = ['G4', 'Bb4', 'C5', 'D5', 'F5', 'G5', 'A5'];
// A small vocabulary of "words" (short note motifs). Phrases string these
// together so motifs recur — reading as an alien language rather than noise.
const VOICE_WORDS: string[][] = [
  ['C4', 'Db4'],
  ['F3', 'Ab3', 'F3'],
  ['Ab3', 'C4'],
  ['Db4', 'C4', 'Ab3'],
  ['F4', 'Db4'],
  ['C4', 'F3'],
  ['Ab3', 'Db4', 'C4'],
];

// Per-phrase pitch shifts (semitones) so each utterance reads as a different speaker.
const VOICE_REGISTERS = [-12, -7, -5, 0, 0, 4, 7];
// Overlapping "speakers" that make up the docked crowd din, and how loud the bed sits.
const VOICE_SPEAKERS = 5;
const VOICE_BED_LEVEL = 0.75;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_VOLUME;
  return Math.max(0, Math.min(1, value));
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function decibelsFromVolume(volume: number): number {
  if (volume <= 0) return -60;
  return -30 + volume * 30;
}

// Map 0..1 brightness to a low-pass cutoff: dark ~400 Hz, brilliant ~12.8 kHz.
function brightnessToFrequency(brightness: number): number {
  return 400 * 2 ** (clamp01(brightness) * 5);
}

export class ToneMusicEngine implements MusicEngine {
  private initialized = false;
  private enabled = false;
  private volume = DEFAULT_VOLUME;
  private params: MusicalParams = { key: 0, mode: 'calm', brightness: 0.85, voiceActive: false };
  private chordPool = CHORD_POOLS.calm;

  private master: Tone.Volume | null = null;
  private ambientBus: Tone.Gain | null = null;
  private ambientTone: Tone.Filter | null = null;
  private voiceBus: Tone.Gain | null = null;
  private pad: Tone.PolySynth<Tone.FMSynth> | null = null;
  private bell: Tone.FMSynth | null = null;
  private pulse: Tone.MembraneSynth | null = null;
  private voice: Tone.PolySynth<Tone.FMSynth> | null = null;
  private voiceNoise: Tone.NoiseSynth | null = null;
  private timers: number[] = [];
  private effects: Array<{ dispose(): unknown }> = [];
  private hasPlayedStartupCue = false;

  async start(): Promise<void> {
    await Tone.start();
    await this.ensureInitialized();
    if (this.enabled) {
      this.startLoops();
      this.applyVolume();
      this.applyParams();
      if (!this.hasPlayedStartupCue) {
        this.triggerStartupCue();
        this.hasPlayedStartupCue = true;
      }
    }
  }

  stop(): void {
    this.enabled = false;
    this.stopLoops();
    this.releaseAll();
    this.master?.volume.rampTo(-60, 1.2);
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled;
    if (!enabled) {
      this.stop();
      return;
    }
    await this.start();
  }

  setVolume(volume: number): void {
    this.volume = clamp01(volume);
    if (this.initialized && this.enabled) {
      this.applyVolume();
    }
  }

  setParams(params: MusicalParams): void {
    const enteringStation = !this.params.voiceActive && params.voiceActive;
    const poolChanged = params.key !== this.params.key || params.mode !== this.params.mode;
    this.params = params;
    if (poolChanged) {
      this.rebuildChordPool();
    }
    if (this.initialized && this.enabled) {
      this.applyParams();
      if (enteringStation) {
        window.setTimeout(() => this.triggerStationPhrase(), 120);
      }
    }
  }

  dispose(): void {
    this.stopLoops();
    this.releaseAll();
    for (const effect of this.effects) {
      effect.dispose();
    }
    this.effects = [];
    this.pad?.dispose();
    this.bell?.dispose();
    this.pulse?.dispose();
    this.voice?.dispose();
    this.voiceNoise?.dispose();
    this.ambientBus?.dispose();
    this.ambientTone?.dispose();
    this.voiceBus?.dispose();
    this.master?.dispose();
    this.initialized = false;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    this.master = new Tone.Volume(-60).toDestination();
    this.ambientTone = new Tone.Filter({
      type: 'lowpass',
      frequency: brightnessToFrequency(this.params.brightness),
      rolloff: -12,
    }).connect(this.master);
    this.ambientBus = new Tone.Gain(1).connect(this.ambientTone);
    this.voiceBus = new Tone.Gain(0).connect(this.master);

    const reverb = new Tone.Reverb({ decay: 8, preDelay: 0.08, wet: 0.45 }).connect(this.ambientBus);
    const padHighpass = new Tone.Filter({ frequency: 90, type: 'highpass', rolloff: -12 }).connect(reverb);
    const delay = new Tone.FeedbackDelay('4n.', 0.38).connect(reverb);
    // A room reverb smears the overlapping speakers into a crowd wash (SimTower-style din).
    const voiceReverb = new Tone.Reverb({ decay: 3.5, preDelay: 0.02, wet: 0.5 }).connect(this.voiceBus);
    const voiceDelay = new Tone.FeedbackDelay({ delayTime: '8n.', feedback: 0.35, wet: 0.28 }).connect(voiceReverb);
    // Shift every partial by a fixed Hz so the spectrum goes inharmonic — metallic and alien, not human speech.
    const voiceShifter = new Tone.FrequencyShifter(34).connect(voiceDelay);
    // A vowel-like pair of vocal formants the voice/noise energy actually lands in.
    const formantLow = new Tone.Filter({ frequency: 500, type: 'bandpass', Q: 1.8 }).connect(voiceShifter);
    const formantHigh = new Tone.Filter({ frequency: 1100, type: 'bandpass', Q: 2.4 }).connect(voiceShifter);
    this.effects = [reverb, padHighpass, delay, voiceReverb, voiceDelay, voiceShifter, formantLow, formantHigh];

    this.pad = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 0.35,
      modulationIndex: 2,
      envelope: { attack: 1.2, decay: 1.8, sustain: 0.48, release: 8 },
      modulationEnvelope: { attack: 0.8, decay: 1, sustain: 0.25, release: 5 },
    }).connect(padHighpass);
    this.pad.maxPolyphony = 6;

    this.bell = new Tone.FMSynth({
      harmonicity: 1.5,
      modulationIndex: 8,
      envelope: { attack: 0.02, decay: 2.4, sustain: 0.05, release: 5 },
      modulationEnvelope: { attack: 0.01, decay: 0.8, sustain: 0.1, release: 2 },
    }).connect(delay);

    this.pulse = new Tone.MembraneSynth({
      pitchDecay: 0.08,
      octaves: 1.6,
      envelope: { attack: 0.02, decay: 1.6, sustain: 0.02, release: 4 },
    }).connect(this.ambientBus);

    this.voice = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 0.72,
      modulationIndex: 12,
      envelope: { attack: 0.06, decay: 0.35, sustain: 0.24, release: 0.6 },
      modulationEnvelope: { attack: 0.03, decay: 0.22, sustain: 0.6, release: 0.5 },
    });
    this.voice.maxPolyphony = 24;
    this.voice.connect(formantLow);
    this.voice.connect(formantHigh);

    this.voiceNoise = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.03, decay: 0.22, sustain: 0.04, release: 0.55 },
    });
    this.voiceNoise.connect(formantLow);
    this.voiceNoise.connect(formantHigh);

    await Promise.all([reverb.ready, voiceReverb.ready]);
    this.initialized = true;
  }

  private scheduledNow(offset = 0.05): number {
    return Math.max(Tone.now() + offset, offset);
  }

  private triggerPad(): void {
    if (!this.enabled || !this.pad) return;
    this.pad.triggerAttackRelease(pick(this.chordPool), '12s', this.scheduledNow(), 0.2);
  }

  private triggerBell(): void {
    if (!this.enabled || !this.bell || Math.random() < 0.35) return;
    this.bell.triggerAttackRelease(pick(BELL_SCALE), '8s', this.scheduledNow(), 0.22);
  }

  private triggerPulse(): void {
    if (!this.enabled || !this.pulse || Math.random() < 0.45) return;
    this.pulse.triggerAttackRelease(pick(['C1', 'G1', 'Bb1']), '2.5s', this.scheduledNow(), 0.1);
  }

  private triggerStartupCue(): void {
    const time = this.scheduledNow(0.08);
    this.bell?.triggerAttackRelease('G4', '2s', time, 0.28);
    this.bell?.triggerAttackRelease('D5', '2s', time + 0.18, 0.2);
    this.pulse?.triggerAttackRelease('C1', '2s', time + 0.05, 0.16);
  }

  private triggerStationPhrase(): void {
    const { voice, voiceNoise } = this;
    if (!this.enabled || !this.params.voiceActive || !voice || !voiceNoise) return;
    const time = this.scheduledNow();
    const register = pick(VOICE_REGISTERS);
    const words = Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => pick(VOICE_WORDS));
    let cursor = 0;
    const syllables = words.flatMap((word, wordIndex) => word.map((note, noteIndex) => {
      if (wordIndex > 0 && noteIndex === 0) cursor += 0.18 + Math.random() * 0.22; // gap between words
      const at = cursor;
      cursor += 0.14 + Math.random() * 0.12; // spacing within a word
      return { note: Tone.Frequency(note).transpose(register).toNote(), at };
    }));
    syllables.forEach(({ note, at }) => {
      const duration = 0.18 + Math.random() * 0.3;
      voice.triggerAttackRelease(note, `${duration}s`, time + at, 0.22);
      if (Math.random() > 0.7) {
        voiceNoise.triggerAttackRelease('0.16s', time + at + 0.04, 0.18);
      }
    });
  }

  private startLoops(): void {
    if (this.timers.length > 0) return;

    this.triggerPad();
    this.triggerBell();
    if (this.params.voiceActive) {
      this.triggerStationPhrase();
    }

    this.scheduleLayer(() => this.triggerPad(), 14_000, 24_000);
    this.scheduleLayer(() => this.triggerBell(), 7_000, 16_000);
    this.scheduleLayer(() => this.triggerPulse(), 12_000, 26_000);
    Array.from({ length: VOICE_SPEAKERS }).forEach(() =>
      this.scheduleLayer(() => this.triggerStationPhrase(), 1_200, 3_200));
  }

  private stopLoops(): void {
    for (const timer of this.timers) {
      window.clearInterval(timer);
    }
    this.timers = [];
  }

  private applyVolume(): void {
    this.master?.volume.rampTo(decibelsFromVolume(this.volume), 0.8);
  }

  private applyParams(): void {
    const voiceTarget = this.params.voiceActive ? VOICE_BED_LEVEL : 0;
    this.voiceBus?.gain.rampTo(voiceTarget, voiceTarget > 0 ? 0.08 : 1.2);
    this.ambientTone?.frequency.rampTo(brightnessToFrequency(this.params.brightness), 2.5);
  }

  private rebuildChordPool(): void {
    const base = CHORD_POOLS[this.params.mode];
    this.chordPool = this.params.key === 0
      ? base
      : base.map(chord =>
          chord.map(note => Tone.Frequency(note).transpose(this.params.key).toNote()));
  }

  private releaseAll(): void {
    this.pad?.releaseAll();
  }

  private scheduleLayer(callback: () => void, minMs: number, maxMs: number): void {
    const scheduleNext = () => {
      if (!this.enabled) return;
      const delay = minMs + Math.random() * (maxMs - minMs);
      const timer = window.setTimeout(() => {
        callback();
        scheduleNext();
      }, delay);
      this.timers.push(timer);
    };
    scheduleNext();
  }
}
