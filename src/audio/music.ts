/**
 * Live, sparse, modal music. Each mood is a player that schedules a phrase a little ahead of time,
 * then rests; changing mood cross-fades the old player out while the new one fades in. The makam
 * follows the mood, or the region for moods that take the local colour.
 */
import type { MusicMood } from '../core/contracts';
import type { Bank } from './bank';
import { rr, type Random } from './dsp';
import { Drone, playNey, playPluck } from './instruments';
import type { Mixer } from './mixer';
import { hasPhrases, MOODS, type Instrument, type MoodProfile } from './moods';
import { makeChord, makePhrase, type Note } from './phrase';
import { degreeFreq, MAKAMS, regionMakam, type Makam } from './tuning';

/** Output levels of the instruments (calibrated in the harness). */
const LEVEL: Readonly<Record<Instrument | 'drone', number>> = { ud: 1, kanun: 0.85, ney: 0.5, drone: 0.2 };
/** Each instrument's octave above the mood's register (ney and kanun sit an octave above the ud). */
const OCTAVE: Readonly<Record<Instrument, number>> = { ud: 0, kanun: 7, ney: 7 };
const LOOKAHEAD = 0.6;
/** Music sits far under the scene (calibrated in the harness: about -29 LUFS momentary at full fader). */
const TRIM = 0.17;

function filter(ctx: BaseAudioContext, type: BiquadFilterType, freq: number, q = 0.7, gain = 0): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  f.gain.value = gain;
  return f;
}

class MoodPlayer {
  private readonly fade: GainNode;
  private readonly send: GainNode;
  private readonly buses: Record<Instrument, AudioNode>;
  private readonly drone: Drone | null = null;
  private readonly nodes: AudioNode[] = [];
  private nextAt: number;
  private chordDone = false;
  private endAt = Infinity;

  constructor(
    private readonly ctx: BaseAudioContext,
    mixer: Mixer,
    private readonly bank: Bank,
    readonly mood: MusicMood,
    private readonly profile: MoodProfile,
    readonly makam: Makam,
    private readonly rnd: Random,
    now: number,
    fadeIn: number,
  ) {
    this.fade = ctx.createGain();
    this.fade.gain.setValueAtTime(0, now);
    this.fade.gain.setTargetAtTime(profile.level * TRIM, now, Math.max(0.05, fadeIn / 3));
    this.fade.connect(mixer.music);
    this.send = ctx.createGain();
    this.send.gain.value = profile.wet;
    this.fade.connect(this.send);
    this.send.connect(mixer.musicWet);
    const chain = (...nodes: AudioNode[]): AudioNode => {
      nodes.reduce((a, b) => a.connect(b));
      (nodes[nodes.length - 1] as AudioNode).connect(this.fade);
      this.nodes.push(...nodes);
      return nodes[0] as AudioNode;
    };
    // A little body for the ud's bowl, air for the kanun, softness for the reed.
    this.buses = {
      ud: chain(filter(ctx, 'peaking', 210, 1.2, 3), filter(ctx, 'lowpass', 3800)),
      kanun: chain(filter(ctx, 'highpass', 160), filter(ctx, 'lowpass', 6500)),
      ney: chain(filter(ctx, 'lowpass', 4200)),
    };
    if (profile.drone > 0) {
      const freqs = [degreeFreq(makam, -7), degreeFreq(makam, 0)];
      if (profile.droneFifth) freqs.push(degreeFreq(makam, makam.guclu - 7));
      this.drone = new Drone(ctx, this.fade, freqs, profile.drone * LEVEL.drone, now, Math.max(1.5, fadeIn));
    }
    this.nextAt = now + rr(rnd, profile.firstDelay[0], profile.firstDelay[1]);
    if (profile.chord) this.nextAt = now + 0.35;
  }

  pump(now: number): number {
    if (now >= this.endAt || !hasPhrases(this.profile)) return 0;
    let scheduled = 0;
    while (this.nextAt < now + LOOKAHEAD) {
      const chord = this.profile.chord === true && !this.chordDone;
      const phrase = chord ? makeChord(this.makam) : makePhrase(this.rnd, this.profile, this.makam);
      this.chordDone = true;
      const start = Math.max(now, this.nextAt);
      for (const n of phrase.notes) this.note(start + n.t, n);
      scheduled += phrase.notes.length;
      const rest = chord ? rr(this.rnd, this.profile.firstDelay[0], this.profile.firstDelay[1]) : rr(this.rnd, this.profile.rest[0], this.profile.rest[1]);
      this.nextAt = start + phrase.length + rest;
    }
    return scheduled;
  }

  private note(t: number, n: Note): void {
    const freq = degreeFreq(this.makam, n.degree + OCTAVE[n.inst]);
    const out = this.buses[n.inst];
    if (n.inst === 'ney') playNey(this.ctx, this.bank, out, freq, t, n.dur, n.vel * LEVEL.ney, this.rnd);
    else playPluck(this.ctx, this.bank, out, n.inst, freq, t, n.vel * LEVEL[n.inst], this.rnd);
  }

  release(now: number, seconds: number): void {
    if (this.endAt !== Infinity) return;
    const s = Math.max(0.05, seconds);
    this.fade.gain.cancelScheduledValues(now);
    this.fade.gain.setTargetAtTime(0, now, s / 3);
    this.drone?.stop(now, s);
    this.endAt = now + s * 2.5 + 4;
  }

  finished(now: number): boolean {
    return now > this.endAt;
  }

  dispose(): void {
    this.fade.disconnect();
    this.send.disconnect();
    for (const n of this.nodes) n.disconnect();
  }
}

export class Music {
  private current: MoodPlayer | null = null;
  private leaving: MoodPlayer[] = [];
  private mood: MusicMood = 'none';
  private region = 1;
  notes = 0;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly mixer: Mixer,
    private readonly bank: Bank,
    private readonly rnd: Random,
  ) {}

  get currentMood(): MusicMood {
    return this.mood;
  }

  /** The makam a mood would use now. */
  makamFor(mood: MusicMood): Makam {
    const m = MOODS[mood].makam;
    return MAKAMS[m === 'region' ? regionMakam(this.region) : m];
  }

  /** The makam of the music playing now (interface notes are tuned to it). */
  get makam(): Makam {
    return this.current?.makam ?? this.makamFor(this.mood === 'none' ? 'survey' : this.mood);
  }

  setRegion(index: number, now: number): void {
    if (!Number.isFinite(index) || Math.round(index) === this.region) return;
    this.region = Math.round(index);
    // A mood in the local colour restarts in the new makam; fixed-makam moods carry on.
    if (this.current && MOODS[this.mood].makam === 'region') this.start(this.mood, 3, now, true);
  }

  setMood(mood: MusicMood, fade: number, now: number): void {
    if (!(mood in MOODS) || mood === this.mood) return;
    this.start(mood, fade, now, false);
  }

  private start(mood: MusicMood, fade: number, now: number, force: boolean): void {
    if (!force && mood === this.mood) return;
    this.mood = mood;
    const f = Number.isFinite(fade) ? Math.max(0.05, fade) : 2.5;
    if (this.current) {
      this.current.release(now, f);
      this.leaving.push(this.current);
      this.current = null;
    }
    const profile = MOODS[mood];
    if (mood === 'none' || profile.level <= 0) return;
    this.current = new MoodPlayer(this.ctx, this.mixer, this.bank, mood, profile, this.makamFor(mood), this.rnd, now, f);
  }

  pump(now: number): void {
    if (this.current) this.notes += this.current.pump(now);
    if (this.leaving.length > 0) {
      const done = this.leaving.filter((p) => p.finished(now));
      for (const p of done) p.dispose();
      this.leaving = this.leaving.filter((p) => !p.finished(now));
    }
  }

  dispose(now: number): void {
    this.current?.release(now, 0.2);
    this.current = null;
  }
}
