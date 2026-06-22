import * as Tone from 'tone';
import type { MusicEngine, MusicalParams } from './types';

const DEFAULT_VOLUME = 0.35;
const PAD_CHORDS = [
  ['G2', 'D3', 'C4'], // open quintal stack
  ['Bb2', 'F3', 'D4'], // Bb major
  ['D3', 'A3', 'F4'], // D minor
  ['F2', 'C3', 'A3'], // F major
];
const BELL_SCALE = ['G4', 'Bb4', 'C5', 'D5', 'F5', 'G5', 'A5'];
const VOICE_NOTES = ['F2', 'Ab2', 'C3', 'Db3', 'F3'];

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

export class ToneMusicEngine implements MusicEngine {
  private initialized = false;
  private enabled = false;
  private volume = DEFAULT_VOLUME;
  private params: MusicalParams = { key: 0, voiceActive: false };
  private chordPool = PAD_CHORDS;

  private master: Tone.Volume | null = null;
  private ambientBus: Tone.Gain | null = null;
  private voiceBus: Tone.Gain | null = null;
  private pad: Tone.PolySynth<Tone.FMSynth> | null = null;
  private bell: Tone.FMSynth | null = null;
  private pulse: Tone.MembraneSynth | null = null;
  private voice: Tone.FMSynth | null = null;
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
    const keyChanged = params.key !== this.params.key;
    this.params = params;
    if (keyChanged) {
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
    this.voiceBus?.dispose();
    this.master?.dispose();
    this.initialized = false;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    this.master = new Tone.Volume(-60).toDestination();
    this.ambientBus = new Tone.Gain(1).connect(this.master);
    this.voiceBus = new Tone.Gain(0).connect(this.master);

    const reverb = new Tone.Reverb({ decay: 8, preDelay: 0.08, wet: 0.45 }).connect(this.ambientBus);
    const padHighpass = new Tone.Filter({ frequency: 90, type: 'highpass', rolloff: -12 }).connect(reverb);
    const delay = new Tone.FeedbackDelay('4n.', 0.38).connect(reverb);
    const voiceDelay = new Tone.FeedbackDelay('8n.', 0.48).connect(this.voiceBus);
    const voiceFilter = new Tone.Filter({ frequency: 980, type: 'bandpass', Q: 5 }).connect(voiceDelay);
    this.effects = [reverb, padHighpass, delay, voiceDelay, voiceFilter];

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

    this.voice = new Tone.FMSynth({
      harmonicity: 0.72,
      modulationIndex: 14,
      envelope: { attack: 0.06, decay: 0.35, sustain: 0.24, release: 1.4 },
      modulationEnvelope: { attack: 0.03, decay: 0.22, sustain: 0.4, release: 0.8 },
    }).connect(voiceFilter);

    this.voiceNoise = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.03, decay: 0.22, sustain: 0.04, release: 0.55 },
    }).connect(voiceFilter);

    await reverb.ready;
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

  private triggerVoice(): void {
    if (Math.random() < 0.4) return;
    this.triggerStationPhrase();
  }

  private triggerStationPhrase(): void {
    if (!this.enabled || !this.params.voiceActive || !this.voice || !this.voiceNoise) return;
    const time = this.scheduledNow();
    const syllables = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < syllables; i += 1) {
      const offset = i * (0.16 + Math.random() * 0.16);
      const duration = 0.22 + Math.random() * 0.42;
      this.voice.triggerAttackRelease(pick(VOICE_NOTES), `${duration}s`, time + offset, 0.42);
      if (Math.random() > 0.25) {
        this.voiceNoise.triggerAttackRelease('0.16s', time + offset + 0.04, 0.22);
      }
    }
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
    this.scheduleLayer(() => this.triggerVoice(), 6_000, 14_000);
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
    const target = this.params.voiceActive ? 1 : 0;
    this.voiceBus?.gain.rampTo(target, target > 0 ? 0.08 : 1.2);
  }

  private rebuildChordPool(): void {
    this.chordPool = this.params.key === 0
      ? PAD_CHORDS
      : PAD_CHORDS.map(chord =>
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
