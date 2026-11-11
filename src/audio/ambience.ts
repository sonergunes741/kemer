/**
 * The bed of everything: the river (layered filtered noise with slow random modulation, babble
 * and bubbles), wind with gusts, rain, birds by day, crickets on summer nights, and the soft rush
 * that everything thins into as time-lapse rises. Continuous layers are looping noise buffers
 * through native filters; JavaScript only moves their targets a few times a second.
 */
import type { AmbienceState } from '../core/contracts';
import { clamp01 } from '../core/math';
import { birdTarget, cricketPresence, lapseDetail, lapseRush, riverMix } from './ambience-model';
import type { Bank, SoundName } from './bank';
import { Birds } from './birds';
import { rr, type Random } from './dsp';
import { Glide } from './envelope';

/** Calibrated in the harness: river murmur about -36 LUFS, flood roar about -23 LUFS. */
const LEVEL = { river: 0.5, wind: 0.32, whistle: 0.05, rainHiss: 0.12, rainDrops: 0.2, crickets: 0.05, rush: 0.16, bubble: 0.05, babble: 0.5 };

interface Layer {
  readonly name: SoundName;
  readonly gain: GainNode;
  readonly filter: BiquadFilterNode;
  readonly level: Glide;
  readonly freq: Glide;
  /** The looping source while the layer is audible; stopped after a while at zero to save work. */
  src: AudioBufferSourceNode | null;
  idleSince: number;
}

/** Seconds a layer stays silent before its source is stopped. */
const IDLE_STOP = 4;

export const DEFAULT_AMBIENCE: Readonly<AmbienceState> = { river: 0.3, wind: 0.1, birds: 1, rain: 0, night: 0, season: 0.4, lapse: 0 };

export class Ambience {
  readonly birds: Birds;
  private readonly state: AmbienceState = { ...DEFAULT_AMBIENCE };
  private readonly river: GainNode;
  private readonly riverLevel: Glide;
  private readonly bubbles: GainNode;
  private readonly bubblePans: StereoPannerNode[] = [];
  private layers: Record<'rumble' | 'body' | 'hiss' | 'babble' | 'babble2' | 'wind' | 'whistle' | 'rainHiss' | 'rainDrops' | 'crickets' | 'rush', Layer> | null = null;
  private readonly mod = { rumble: 1, body: 1, hiss: 1, bodyHz: 1 };
  private gust = 0.8;
  private nextMod = 0;
  private nextBabble = 0;
  private nextBubble = 0;
  private nextGust = 0;
  bubblesPlayed = 0;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly bank: Bank,
    private readonly out: AudioNode,
    wet: AudioNode,
    private readonly duck: AudioParam,
    private readonly rnd: Random,
  ) {
    this.river = ctx.createGain();
    this.river.gain.value = 0;
    this.river.connect(out);
    this.riverLevel = new Glide(this.river.gain);
    this.bubbles = ctx.createGain();
    this.bubbles.gain.value = LEVEL.bubble;
    this.bubbles.connect(this.river);
    for (const p of [-0.55, 0, 0.55]) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = p;
      pan.connect(this.bubbles);
      this.bubblePans.push(pan);
    }
    this.birds = new Birds(ctx, out, wet, rnd);
  }

  get started(): boolean {
    return this.layers !== null;
  }

  /** Builds the looping layers once the noise buffers exist. Returns false if not yet possible. */
  start(now: number): boolean {
    if (this.layers) return true;
    if (!this.bank.has('pink') || !this.bank.has('brown') || !this.bank.has('rain') || !this.bank.has('crickets')) return false;
    const L = (name: SoundName, type: BiquadFilterType, freq: number, q: number, dest: AudioNode, extra?: BiquadFilterNode): Layer => {
      const filter = this.ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      if (extra) filter.connect(extra).connect(gain);
      else filter.connect(gain);
      gain.connect(dest);
      return { name, gain, filter, level: new Glide(gain.gain), freq: new Glide(filter.frequency), src: null, idleSince: -1 };
    };
    const lp = (f: number): BiquadFilterNode => {
      const n = this.ctx.createBiquadFilter();
      n.type = 'lowpass';
      n.frequency.value = f;
      return n;
    };
    const hp = (f: number): BiquadFilterNode => {
      const n = this.ctx.createBiquadFilter();
      n.type = 'highpass';
      n.frequency.value = f;
      return n;
    };
    this.layers = {
      rumble: L('brown', 'lowpass', 200, 0.6, this.river),
      body: L('pink', 'bandpass', 600, 0.7, this.river),
      hiss: L('pink', 'highpass', 2200, 0.5, this.river, lp(11000)),
      babble: L('pink', 'bandpass', 1150, 2.6, this.river),
      babble2: L('pink', 'bandpass', 1900, 3.2, this.river),
      wind: L('pink', 'bandpass', 500, 0.9, this.out),
      whistle: L('pink', 'bandpass', 1300, 9, this.out),
      rainHiss: L('pink', 'highpass', 2600, 0.5, this.out, lp(12000)),
      rainDrops: L('rain', 'highpass', 300, 0.5, this.out),
      crickets: L('crickets', 'highpass', 2500, 0.5, this.out),
      rush: L('pink', 'lowpass', 1000, 0.5, this.out, hp(140)),
    };
    this.apply(now, 2.5);
    return true;
  }

  set(patch: Partial<AmbienceState>): void {
    for (const key of Object.keys(patch) as (keyof AmbienceState)[]) {
      const v = patch[key];
      if (typeof v === 'number' && Number.isFinite(v)) this.state[key] = key === 'season' ? v - Math.floor(v) : clamp01(v);
    }
  }

  get current(): Readonly<AmbienceState> {
    return this.state;
  }

  /**
   * Real silence for a moment, then the river returns: the ambience fades out `after` seconds from
   * now, stays down for `hold`, and comes back over `rise`.
   */
  silence(now: number, after: number, hold: number, rise: number, floor = 0.04): void {
    const p = this.duck;
    if (typeof p.cancelAndHoldAtTime === 'function') p.cancelAndHoldAtTime(now);
    p.setTargetAtTime(floor, now + after, 0.25);
    p.setTargetAtTime(1, now + after + 0.8 + hold, rise / 3);
  }

  tick(now: number): void {
    if (!this.layers) return;
    const s = this.state;
    const detail = lapseDetail(s.lapse);
    // Slow random wandering of the river, flattened as time-lapse averages it out.
    if (now >= this.nextMod) {
      this.nextMod = now + rr(this.rnd, 1.2, 3.5);
      const depth = 0.45 * detail + 0.05;
      this.mod.rumble = 1 + (this.rnd() - 0.5) * depth;
      this.mod.body = 1 + (this.rnd() - 0.5) * depth * 0.8;
      this.mod.hiss = 1 + (this.rnd() - 0.5) * depth;
      this.mod.bodyHz = 1 + (this.rnd() - 0.5) * depth * 0.5;
    }
    if (now >= this.nextGust) {
      this.nextGust = now + rr(this.rnd, 1.5, 5);
      this.gust = rr(this.rnd, 0.35, 1.15);
    }
    this.apply(now, 0.9);
    this.babble(now, detail);
    this.bubble(now, detail);
    this.birds.setTarget(birdTarget(s.birds, s.season, s.night, s.lapse, 4), now, s.birds < 0.02);
    this.birds.tick(now);
  }

  /** Sets a layer's level and starts or (after a while at zero) stops its source. */
  private level(layer: Layer, value: number, now: number, tau: number): void {
    layer.level.to(value, now, tau);
    this.run(layer, value > 1e-4, now);
  }

  private run(layer: Layer, on: boolean, now: number): void {
    if (on) {
      layer.idleSince = -1;
      if (layer.src) return;
      const buffer = this.bank.get(layer.name);
      if (!buffer) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(layer.filter);
      src.start(now, this.rnd() * buffer.duration);
      layer.src = src;
    } else if (layer.src) {
      if (layer.idleSince < 0) layer.idleSince = now;
      else if (now - layer.idleSince > IDLE_STOP) this.stop(layer);
    }
  }

  private stop(layer: Layer): void {
    if (!layer.src) return;
    try {
      layer.src.stop();
    } catch {
      // Already stopped.
    }
    layer.src.disconnect();
    layer.src = null;
    layer.idleSince = -1;
  }

  private apply(now: number, tau: number): void {
    const l = this.layers;
    if (!l) return;
    const s = this.state;
    const detail = lapseDetail(s.lapse);
    const rush = lapseRush(s.lapse);
    const m = riverMix(s.river);
    this.riverLevel.to(LEVEL.river * (1 - 0.55 * rush), now, tau);
    this.level(l.rumble, m.rumble * this.mod.rumble, now, 1.2);
    l.rumble.freq.to(m.rumbleHz, now, 1.2);
    this.level(l.body, m.body * this.mod.body, now, 1.2);
    l.body.freq.to(m.bodyHz * this.mod.bodyHz, now, 1.5);
    this.level(l.hiss, m.hiss * this.mod.hiss, now, 1.2);
    l.hiss.freq.to(m.hissHz, now, 1.2);
    const w = s.wind * (1 - 0.5 * rush);
    this.level(l.wind, LEVEL.wind * w * (0.4 + 0.6 * this.gust * (0.4 + 0.6 * detail)), now, 1.1);
    l.wind.freq.to(300 + 600 * s.wind * this.gust, now, 1.4);
    this.level(l.whistle, LEVEL.whistle * s.wind * s.wind * this.gust * detail, now, 1.4);
    l.whistle.freq.to(1100 + 500 * this.gust, now, 1.6);
    this.level(l.rainHiss, LEVEL.rainHiss * s.rain * (1 - 0.6 * rush), now, tau);
    this.level(l.rainDrops, LEVEL.rainDrops * s.rain * detail, now, tau);
    this.level(l.crickets, LEVEL.crickets * cricketPresence(s.night, s.season) * detail, now, tau * 1.5);
    this.level(l.rush, LEVEL.rush * rush * (0.6 + 0.4 * s.river), now, tau);
  }

  /** Babble: two narrow water bands flickering at a few hertz, strongest at low flow. */
  private babble(now: number, detail: number): void {
    const l = this.layers;
    if (!l || now < this.nextBabble) return;
    this.nextBabble = now + rr(this.rnd, 0.06, 0.16);
    const m = riverMix(this.state.river);
    const b = LEVEL.babble * m.babble * (0.3 + 0.7 * detail);
    l.babble.gain.gain.setTargetAtTime(b * rr(this.rnd, 0.15, 1.3), now, 0.035);
    l.babble2.gain.gain.setTargetAtTime(b * 0.6 * rr(this.rnd, 0.1, 1.3), now, 0.03);
    this.run(l.babble, b > 1e-4, now);
    this.run(l.babble2, b > 1e-4, now);
  }

  /** Bubbles: a Poisson stream of tiny rising sines (cavities collapsing in the current). */
  private bubble(now: number, detail: number): void {
    const rate = riverMix(this.state.river).bubbles * detail;
    if (rate <= 0.01) {
      this.nextBubble = now + 0.5;
      return;
    }
    if (this.nextBubble < now) this.nextBubble = now;
    while (this.nextBubble < now + 0.12) {
      const t = this.nextBubble;
      const f0 = rr(this.rnd, 420, 1350);
      const o = this.ctx.createOscillator();
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * rr(this.rnd, 1.25, 1.8), t + 0.07);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(rr(this.rnd, 0.25, 1), t + 0.003);
      g.gain.setTargetAtTime(0, t + 0.003, rr(this.rnd, 0.01, 0.028));
      o.connect(g);
      g.connect(this.bubblePans[Math.floor(this.rnd() * this.bubblePans.length)] as StereoPannerNode);
      o.onended = () => {
        o.disconnect();
        g.disconnect();
      };
      o.start(t);
      o.stop(t + 0.16);
      this.bubblesPlayed++;
      this.nextBubble += -Math.log(1 - this.rnd() * 0.999) / rate;
    }
  }

  dispose(): void {
    if (this.layers) for (const layer of Object.values(this.layers)) this.stop(layer);
    this.layers = null;
  }
}
