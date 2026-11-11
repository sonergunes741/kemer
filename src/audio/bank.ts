/**
 * The sound bank: every sample-based sound is rendered once from the pure generators into
 * AudioBuffers. AudioBuffers are not tied to a context, so the harness shares one bank between
 * its offline renders. The live game builds it asynchronously, yielding between jobs so no single
 * task blocks a frame for long; anything asked for before it is ready is simply skipped.
 */
import { brownNoise, makeRandom, pinkNoise, seamlessLoop, whiteNoise, type Random } from './dsp';
import { cricketLoop, footstep, hoof, pad, tyre, wheel } from './gen-life';
import { KANUN, pluckBases, renderPluck, UD } from './gen-pluck';
import { archSettle, chiselTap, groundImpact, jointCrack, keystoneBoom, lithophone, rattleLoop, stoneClack, stoneThud, stoneTick } from './gen-stone';
import { rainLoop, splash } from './gen-water';
import { dullKnock, malletWedge, pageTurn, sealStamp, timberCreak, timberGroan, woodKnock, woodTick } from './gen-wood';
import { valleyImpulse } from './impulse';
import { VariantPicker } from './voices';

export type SoundName =
  | 'white'
  | 'pink'
  | 'brown'
  | 'thud-small'
  | 'thud-medium'
  | 'thud-large'
  | 'boom'
  | 'clack'
  | 'chisel'
  | 'mallet'
  | 'creak'
  | 'groan'
  | 'knock'
  | 'knock-dull'
  | 'splash-small'
  | 'splash-medium'
  | 'splash-large'
  | 'ground'
  | 'crack'
  | 'settle'
  | 'rattle'
  | 'step'
  | 'hoof'
  | 'pad'
  | 'wheel'
  | 'tyre'
  | 'rain'
  | 'crickets'
  | 'stamp'
  | 'litho'
  | 'tick-wood'
  | 'tick-stone'
  | 'page';

export type PluckInstrument = 'ud' | 'kanun';

type Channels = Float32Array | readonly Float32Array[];

interface Job {
  readonly run: (bank: Bank, sr: number, rnd: Random) => void;
}

function toBuffer(data: Channels, sr: number): AudioBuffer {
  const chans = data instanceof Float32Array ? [data] : data;
  const first = chans[0] as Float32Array;
  const buffer = new AudioBuffer({ length: first.length, numberOfChannels: chans.length, sampleRate: sr });
  chans.forEach((c, i) => buffer.copyToChannel(c as Float32Array<ArrayBuffer>, i));
  return buffer;
}

export class Bank {
  private readonly sounds = new Map<SoundName, AudioBuffer[]>();
  private readonly plucks: Record<PluckInstrument, { freq: number; buffer: AudioBuffer }[]> = { ud: [], kanun: [] };
  private readonly picker = new VariantPicker();
  impulse: AudioBuffer | null = null;
  ready = false;
  /** Milliseconds of generation work, for the harness. */
  buildMs = 0;

  constructor(
    readonly sampleRate: number,
    private readonly rnd: Random,
  ) {}

  add(name: SoundName, data: Channels): void {
    const list = this.sounds.get(name) ?? [];
    list.push(toBuffer(data, this.sampleRate));
    this.sounds.set(name, list);
  }

  addPluck(inst: PluckInstrument, freq: number, data: Float32Array): void {
    this.plucks[inst].push({ freq, buffer: toBuffer(data, this.sampleRate) });
  }

  setImpulse(data: readonly Float32Array[]): void {
    this.impulse = toBuffer(data, this.sampleRate);
  }

  has(name: SoundName): boolean {
    return (this.sounds.get(name)?.length ?? 0) > 0;
  }

  /** A variant of a sound, never the same one twice in a row; null while not rendered yet. */
  get(name: SoundName, variant?: number): AudioBuffer | null {
    const list = this.sounds.get(name);
    if (!list || list.length === 0) return null;
    const i = variant !== undefined ? Math.abs(Math.round(variant)) % list.length : this.picker.pick(name, list.length, this.rnd);
    return list[i] ?? null;
  }

  /** The rendered pluck nearest in pitch and the playback rate that tunes it exactly. */
  pluck(inst: PluckInstrument, freq: number): { buffer: AudioBuffer; rate: number } | null {
    const list = this.plucks[inst];
    let best: { freq: number; buffer: AudioBuffer } | null = null;
    let bestD = Infinity;
    for (const p of list) {
      const d = Math.abs(Math.log(freq / p.freq));
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best ? { buffer: best.buffer, rate: freq / best.freq } : null;
  }
}

const repeat = (n: number, run: Job['run']): Job[] => Array.from({ length: n }, () => ({ run }));

/** In priority order: what the first click and the river need comes first. */
function jobs(): Job[] {
  return [
    { run: (b, sr, r) => b.add('tick-wood', woodTick(sr, r)) },
    { run: (b, sr, r) => b.add('tick-stone', stoneTick(sr, r)) },
    { run: (b, sr, r) => b.add('knock-dull', dullKnock(sr, r)) },
    ...repeat(2, (b, sr, r) => b.add('page', pageTurn(sr, r))),
    { run: (b, sr, r) => b.add('white', whiteNoise(Math.round(sr * 2), r)) },
    { run: (b, sr, r) => b.add('pink', [0, 1].map(() => seamlessLoop(pinkNoise(Math.round(sr * 5.5), r), Math.round(sr * 5)))) },
    { run: (b, sr, r) => b.add('brown', [0, 1].map(() => seamlessLoop(brownNoise(Math.round(sr * 5.5), r), Math.round(sr * 5)))) },
    { run: (b, sr, r) => b.add('rain', rainLoop(sr, r)) },
    { run: (b, sr, r) => b.add('crickets', cricketLoop(sr, r)) },
    { run: (b, sr, r) => b.setImpulse(valleyImpulse(sr, r)) },
    ...pluckBases(73.42, 400).map((f) => ({ run: (b: Bank, sr: number, r: Random) => {
      const p = renderPluck(sr, f, UD, r);
      b.addPluck('ud', p.freq, p.data);
    } })),
    ...pluckBases(146.83, 1250).map((f) => ({ run: (b: Bank, sr: number, r: Random) => {
      const p = renderPluck(sr, f, KANUN, r);
      b.addPluck('kanun', p.freq, p.data);
    } })),
    ...repeat(2, (b, sr, r) => b.add('stamp', sealStamp(sr, r))),
    ...repeat(3, (b, sr, r) => b.add('thud-small', stoneThud(sr, r, 'small'))),
    ...repeat(3, (b, sr, r) => b.add('thud-medium', stoneThud(sr, r, 'medium'))),
    ...repeat(3, (b, sr, r) => b.add('thud-large', stoneThud(sr, r, 'large'))),
    ...repeat(2, (b, sr, r) => b.add('boom', keystoneBoom(sr, r))),
    ...repeat(3, (b, sr, r) => b.add('chisel', chiselTap(sr, r))),
    ...repeat(3, (b, sr, r) => b.add('mallet', malletWedge(sr, r))),
    ...repeat(4, (b, sr, r) => b.add('creak', timberCreak(sr, r))),
    ...repeat(2, (b, sr, r) => b.add('groan', timberGroan(sr, r))),
    ...repeat(4, (b, sr, r) => b.add('knock', woodKnock(sr, r))),
    ...repeat(3, (b, sr, r) => b.add('clack', stoneClack(sr, r))),
    ...repeat(3, (b, sr, r) => b.add('splash-small', splash(sr, r, 'small'))),
    ...repeat(2, (b, sr, r) => b.add('splash-medium', splash(sr, r, 'medium'))),
    ...repeat(2, (b, sr, r) => b.add('splash-large', splash(sr, r, 'large'))),
    ...repeat(3, (b, sr, r) => b.add('ground', groundImpact(sr, r))),
    ...repeat(3, (b, sr, r) => b.add('crack', jointCrack(sr, r))),
    ...repeat(2, (b, sr, r) => b.add('settle', archSettle(sr, r))),
    { run: (b, sr, r) => b.add('rattle', rattleLoop(sr, r)) },
    ...repeat(3, (b, sr, r) => b.add('step', footstep(sr, r))),
    ...repeat(3, (b, sr, r) => b.add('hoof', hoof(sr, r))),
    ...repeat(2, (b, sr, r) => b.add('pad', pad(sr, r))),
    ...repeat(3, (b, sr, r) => b.add('wheel', wheel(sr, r))),
    ...repeat(2, (b, sr, r) => b.add('tyre', tyre(sr, r))),
    { run: (b, sr, r) => b.add('litho', lithophone(sr, r)) },
  ];
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Renders everything at once (the offline harness). */
export function buildBankSync(sampleRate: number, seed: number): Bank {
  const rnd = makeRandom(seed);
  const bank = new Bank(sampleRate, makeRandom(seed ^ 0x9e3779b9));
  const t0 = now();
  for (const job of jobs()) job.run(bank, sampleRate, rnd);
  bank.buildMs = now() - t0;
  bank.ready = true;
  return bank;
}

/**
 * Renders in slices of about `sliceMs`, yielding to the page in between. `onReady` fires once all
 * is done; the bank is usable (partially) from the start.
 */
export function buildBankAsync(sampleRate: number, seed: number, sliceMs = 6): { bank: Bank; done: Promise<Bank> } {
  const rnd = makeRandom(seed);
  const bank = new Bank(sampleRate, makeRandom(seed ^ 0x9e3779b9));
  const list = jobs();
  const done = (async (): Promise<Bank> => {
    let i = 0;
    while (i < list.length) {
      const slice = now();
      while (i < list.length && now() - slice < sliceMs) {
        (list[i] as Job).run(bank, sampleRate, rnd);
        i++;
      }
      bank.buildMs += now() - slice;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    bank.ready = true;
    return bank;
  })();
  return { bank, done };
}
