/**
 * Plays bank buffers as one-shot voices: positioned by the listener (pan by x, level and air
 * absorption by distance, more reverb when far), limited by a voice pool, and thinned by a crowd
 * gain when many sound at once.
 */
import { clamp } from '../core/math';
import { crowdGain, type VoicePool } from './voices';

export interface Listener {
  /** Camera position along the bridge axis, metres. */
  x: number;
  /** Camera distance from what it looks at, metres. */
  distance: number;
}

export interface Placement {
  readonly gain: number;
  readonly pan: number;
  readonly send: number;
  /** Low-pass corner for air absorption, or null when near. */
  readonly lowpass: number | null;
}

/** Distance at which a physical sound plays at its nominal level, metres. */
export const REFERENCE_DISTANCE = 30;

/** Where a sound at elevation x sits for this listener. Pure. */
export function place(x: number, listener: Listener): Placement {
  const dx = (Number.isFinite(x) ? x : 0) - listener.x;
  const d = Math.hypot(dx, Math.max(2, listener.distance));
  const ref = REFERENCE_DISTANCE;
  const gain = d <= ref ? Math.min(1.25, Math.pow(ref / d, 0.3)) : Math.pow(ref / d, 0.75);
  return {
    gain,
    pan: clamp(dx / d, -1, 1) * 0.8,
    send: clamp(0.16 + 0.5 * (1 - Math.min(1, gain)), 0.16, 0.7),
    lowpass: d > 80 ? clamp(18000 * Math.pow(80 / d, 0.9), 1800, 18000) : null,
  };
}

export interface ShotOptions {
  readonly when?: number;
  readonly gain: number;
  readonly rate?: number;
  readonly pan?: number;
  readonly send?: number;
  readonly lowpass?: number | null;
  /** Importance when voices run out (defaults to the gain). */
  readonly priority?: number;
}

interface Voice {
  readonly src: AudioBufferSourceNode;
  readonly gain: GainNode;
}

export class ShotPlayer {
  private readonly voices = new Map<number, Voice>();
  private nextLocal = -1;
  played = 0;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly dry: AudioNode,
    private readonly wet: AudioNode,
    private readonly clock: () => number,
    private readonly pool: VoicePool | null,
    /** Voices that sound together at full level before the crowd gain starts thinning them. */
    private readonly comfortable = 10,
  ) {}

  /** Returns false when the sound was dropped (no voice free for something this quiet). */
  play(buffer: AudioBuffer | null, o: ShotOptions): boolean {
    if (!buffer) return false;
    const now = this.clock();
    const t = Math.max(now, o.when ?? now);
    const rate = clamp(Number.isFinite(o.rate) ? (o.rate as number) : 1, 0.25, 4);
    let gain = Number.isFinite(o.gain) ? Math.max(0, o.gain) : 0;
    if (gain < 1e-4) return false;
    let id: number;
    if (this.pool) {
      const active = this.pool.active(t);
      const grant = this.pool.acquire(o.priority ?? gain, t, buffer.duration / rate);
      if (!grant) return false;
      if (grant.steal !== null) this.silence(grant.steal, t);
      gain *= crowdGain(active, this.comfortable);
      id = grant.id;
    } else {
      id = this.nextLocal--;
    }

    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const nodes: AudioNode[] = [src];
    let head: AudioNode = src;
    if (o.lowpass && o.lowpass < 18000) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lowpass;
      f.Q.value = 0.5;
      head.connect(f);
      head = f;
      nodes.push(f);
    }
    const g = ctx.createGain();
    g.gain.value = gain;
    head.connect(g);
    nodes.push(g);
    let out: AudioNode = g;
    if (o.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(o.pan, -1, 1);
      g.connect(p);
      out = p;
      nodes.push(p);
    }
    out.connect(this.dry);
    if (o.send && o.send > 0) {
      const s = ctx.createGain();
      s.gain.value = o.send;
      out.connect(s);
      s.connect(this.wet);
      nodes.push(s);
    }
    src.onended = () => {
      for (const n of nodes) n.disconnect();
      this.voices.delete(id);
      this.pool?.release(id);
    };
    src.start(t);
    this.voices.set(id, { src, gain: g });
    this.played++;
    return true;
  }

  private silence(id: number, t: number): void {
    const v = this.voices.get(id);
    if (!v) return;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setTargetAtTime(0, t, 0.012);
    try {
      v.src.stop(t + 0.08);
    } catch {
      // Already stopped.
    }
  }

  stopAll(): void {
    const t = this.clock();
    for (const id of [...this.voices.keys()]) this.silence(id, t);
  }
}
