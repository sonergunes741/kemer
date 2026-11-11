/**
 * Everything that makes sound, wired to one BaseAudioContext. The live game runs it on an
 * AudioContext; the harness runs the very same engine on OfflineAudioContexts (with a manual clock
 * and a shared, pre-built bank) to measure what it produces.
 */
import type { Bus } from '../core/bus';
import { Ambience } from './ambience';
import { buildBankAsync, type Bank } from './bank';
import { makeRandom } from './dsp';
import { played } from './instruments';
import { Mixer } from './mixer';
import { Music } from './music';
import { Physical } from './physical';
import { ShotPlayer } from './player';
import { Sustained } from './sustained';
import { UiSounds } from './ui-sfx';
import { VoicePool } from './voices';

export interface EngineOptions {
  readonly seed?: number;
  /** A bank rendered earlier (the harness shares one between offline renders). */
  readonly bank?: Bank;
  /** Time source; defaults to the context's clock. */
  readonly clock?: () => number;
  readonly destination?: AudioNode;
  /** Most physical voices sounding at once. */
  readonly voices?: number;
  /** The shared reverb (off saves its convolution). */
  readonly reverb?: boolean;
}

export interface EngineStats {
  readonly bankReady: boolean;
  readonly bankMs: number;
  readonly voices: number;
  readonly voicePeak: number;
  readonly stolen: number;
  readonly dropped: number;
  readonly rateLimited: number;
  readonly birds: number;
  readonly songs: number;
  readonly bubbles: number;
  readonly notes: number;
  readonly plucks: number;
  readonly neys: number;
  readonly mood: string;
  readonly makam: string;
}

export class Engine {
  readonly mixer: Mixer;
  readonly bank: Bank;
  readonly ready: Promise<Bank>;
  readonly pool: VoicePool;
  readonly shots: ShotPlayer;
  readonly ambience: Ambience;
  readonly music: Music;
  readonly ui: UiSounds;
  readonly sustained: Sustained;
  readonly physical: Physical;
  private readonly clock: () => number;
  private readonly reverb: boolean;
  private impulseSet = false;
  private musicHeldUntil = -1;
  private musicHeld = false;

  constructor(
    readonly ctx: BaseAudioContext,
    o: EngineOptions = {},
  ) {
    const seed = o.seed ?? 1;
    const rnd = makeRandom(seed);
    this.clock = o.clock ?? (() => ctx.currentTime);
    this.reverb = o.reverb ?? true;
    this.mixer = new Mixer(ctx, o.destination ?? ctx.destination);
    if (o.bank) {
      this.bank = o.bank;
      this.ready = Promise.resolve(o.bank);
    } else {
      const built = buildBankAsync(ctx.sampleRate, seed ^ 0x5bd1e995);
      this.bank = built.bank;
      this.ready = built.done;
    }
    this.pool = new VoicePool(o.voices ?? 40);
    this.shots = new ShotPlayer(ctx, this.mixer.fx, this.mixer.fxWet, this.clock, this.pool);
    this.ambience = new Ambience(ctx, this.bank, this.mixer.ambience, this.mixer.fxWet, this.mixer.ambienceDuck.gain, rnd);
    this.music = new Music(ctx, this.mixer, this.bank, rnd);
    this.ui = new UiSounds(ctx, this.bank, this.mixer, this.clock, rnd, () => this.music.makam);
    this.sustained = new Sustained(ctx, this.bank, this.mixer.fx, rnd, this.shots);
    this.physical = new Physical(this.bank, this.shots, this.sustained, this.clock, rnd, {
      silence: (after, hold, rise) => this.ambience.silence(this.clock(), after, hold, rise),
      collapse: (on) => this.holdMusic(on),
    });
    // No update here: the owner sets the ambience first, so the bed fades in from its real state.
  }

  attach(bus: Bus): () => void {
    return this.physical.attach(bus);
  }

  now(): number {
    return this.clock();
  }

  /** Nothing from the music during the fall; it may come back a few seconds after the last stone. */
  private holdMusic(on: boolean): void {
    const now = this.clock();
    if (on) {
      this.mixer.duckMusic(0, now, 0.6);
      this.musicHeld = true;
      this.musicHeldUntil = Infinity;
    } else {
      this.musicHeldUntil = now + 3;
    }
  }

  /** Called every frame (or, offline, at every step of the simulated clock). */
  update(dt: number): void {
    const now = this.clock();
    if (this.reverb && !this.impulseSet && this.bank.impulse) {
      this.mixer.setImpulse(this.bank.impulse);
      this.impulseSet = true;
    }
    if (!this.ambience.started) this.ambience.start(now);
    this.ambience.tick(now);
    this.music.pump(now);
    this.sustained.tick(now, Math.max(0, dt));
    if (this.musicHeld && now >= this.musicHeldUntil) {
      this.musicHeld = false;
      this.mixer.duckMusic(1, now, 2.5);
    }
  }

  stats(): EngineStats {
    const now = this.clock();
    return {
      bankReady: this.bank.ready,
      bankMs: Math.round(this.bank.buildMs),
      voices: this.pool.active(now),
      voicePeak: this.pool.peak,
      stolen: this.pool.stolen,
      dropped: this.pool.dropped,
      rateLimited: this.physical.limiter.limited,
      birds: this.ambience.birds.count,
      songs: this.ambience.birds.songs,
      bubbles: this.ambience.bubblesPlayed,
      notes: this.music.notes,
      plucks: played.pluck,
      neys: played.ney,
      mood: this.music.currentMood,
      makam: this.music.makam.name,
    };
  }

  dispose(): void {
    const now = this.clock();
    this.music.dispose(now);
    this.shots.stopAll();
    this.ambience.dispose();
  }
}
