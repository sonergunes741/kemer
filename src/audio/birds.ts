/**
 * The birds of the valley: up to four individuals, each a species with its own pitch, tempo and
 * place, singing sparse songs of synthesized syllables. When the birds return (presence rising
 * from 0) they come back one at a time; when presence drops to 0 they fall silent at once.
 */
import { birdSong, songLength, SPECIES, SPECIES_GAIN, type Species, type Syllable } from './birdsong';
import { rr, type Random } from './dsp';

/** Overall level of the birds (calibrated in the harness: a spring morning about -36 LUFS). */
const BIRD_LEVEL = 0.06;

interface Bird {
  readonly species: Species;
  readonly pitch: number;
  readonly tempo: number;
  readonly gain: GainNode;
  readonly pan: StereoPannerNode;
  next: number;
}

export class Birds {
  readonly out: GainNode;
  private readonly wet: GainNode;
  private birds: Bird[] = [];
  private target = 0;
  private nextArrival = 0;
  private hush = false;
  /** Songs started, for the harness. */
  songs = 0;

  constructor(
    private readonly ctx: BaseAudioContext,
    out: AudioNode,
    wet: AudioNode,
    private readonly rnd: Random,
  ) {
    this.out = ctx.createGain();
    this.out.connect(out);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.45;
    this.wet.connect(wet);
  }

  get count(): number {
    return this.birds.length;
  }

  /** How many birds should sing; `silent` cuts any song in progress (the centering has fallen). */
  setTarget(count: number, now: number, silent: boolean): void {
    const n = Math.max(0, Math.min(4, Math.round(count)));
    if (silent && !this.hush) {
      this.hush = true;
      this.out.gain.setTargetAtTime(0, now, 0.05);
    } else if (!silent && this.hush) {
      this.hush = false;
      this.out.gain.setTargetAtTime(1, now, 0.05);
    }
    if (this.target === 0 && n > 0) this.nextArrival = Math.max(this.nextArrival, now + rr(this.rnd, 0.4, 1.2));
    this.target = n;
    while (this.birds.length > n) {
      const gone = this.birds.pop() as Bird;
      gone.gain.gain.setTargetAtTime(0, now, 0.1);
      setTimeoutSafe(() => gone.pan.disconnect(), 3000);
    }
  }

  tick(now: number): void {
    if (this.birds.length < this.target && now >= this.nextArrival) {
      this.arrive(now);
      this.nextArrival = now + rr(this.rnd, 2.5, 5.5);
    }
    for (const b of this.birds) {
      if (now + 0.15 >= b.next) b.next = this.sing(b, Math.max(now + 0.05, b.next));
    }
  }

  private arrive(now: number): void {
    const present = new Set(this.birds.map((b) => b.species));
    const free = SPECIES.filter((s) => !present.has(s));
    const pool = free.length > 0 ? free : SPECIES;
    const species = pool[Math.floor(this.rnd() * pool.length)] as Species;
    const gain = this.ctx.createGain();
    // Distance: some birds are close, most are across the water.
    gain.gain.value = BIRD_LEVEL * SPECIES_GAIN[species] * rr(this.rnd, 0.45, 1);
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = rr(this.rnd, -0.85, 0.85);
    gain.connect(pan);
    pan.connect(this.out);
    pan.connect(this.wet);
    this.birds.push({
      species,
      pitch: rr(this.rnd, 0.94, 1.06),
      tempo: rr(this.rnd, 0.9, 1.1),
      gain,
      pan,
      // The first bird back sings soon; later ones after a breath.
      next: now + rr(this.rnd, 0.2, this.birds.length === 0 ? 0.8 : 2.5),
    });
  }

  /** Schedules one song from time t and returns when the next should start. */
  private sing(b: Bird, t: number): number {
    const song = birdSong(b.species, this.rnd, b.pitch, b.tempo);
    for (const s of song) this.syllable(b.gain, t + s.t, s);
    this.songs++;
    const repeatGap = b.species === 'hoopoe' ? rr(this.rnd, 1.5, 4) : rr(this.rnd, 4, 11);
    return t + songLength(song) + repeatGap;
  }

  private syllable(out: AudioNode, t0: number, s: Syllable): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const f = o.frequency;
    f.setValueAtTime(s.f0, t0);
    f.exponentialRampToValueAtTime(s.fMid, t0 + s.dur * 0.5);
    f.exponentialRampToValueAtTime(s.f1, t0 + s.dur);
    const g = ctx.createGain();
    const a = Math.min(0.012, s.dur * 0.25);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(s.amp, t0 + a);
    g.gain.setValueAtTime(s.amp, t0 + s.dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t0 + s.dur);
    o.connect(g);
    g.connect(out);
    const end = t0 + s.dur + 0.02;
    let lfo: OscillatorNode | null = null;
    let depth: GainNode | null = null;
    if (s.fm > 0 && s.fmDepth > 0) {
      lfo = ctx.createOscillator();
      lfo.frequency.value = s.fm;
      depth = ctx.createGain();
      depth.gain.value = s.fMid * s.fmDepth;
      lfo.connect(depth);
      depth.connect(f);
      lfo.start(t0);
      lfo.stop(end);
    }
    o.onended = () => {
      o.disconnect();
      g.disconnect();
      lfo?.disconnect();
      depth?.disconnect();
    };
    o.start(t0);
    o.stop(end);
  }
}

/** Offline contexts and tests have no timers worth waiting for; a missing setTimeout is fine. */
function setTimeoutSafe(fn: () => void, ms: number): void {
  if (typeof setTimeout === 'function') setTimeout(fn, ms);
}
