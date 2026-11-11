/**
 * The twelve-second time-lapse (DESIGN 3): the finished run's chronicle replayed at a fixed pace
 * (the same repairs in the same years, so it lives the same life), the interface hidden, every
 * frame of the scene composited with the turning year and then the closing line onto a 1280 x 720
 * canvas and recorded with MediaRecorder.
 */
import type { ChronicleRun } from '../../core/contracts';
import { log } from '../../core/log';
import { clamp01, damp, fract, smoothstep } from '../../core/math';
import type { BridgeDesign, BridgeGeometry, FamilyMark, LevelDef } from '../../core/types';
import type { SceneState } from '../scene';
import { annualWater } from '../time/water';
import type { GameDeps } from '../types';
import { drawClosing, drawScene, drawYear, SHARE_H, SHARE_W } from './compose';

/** Seconds: a breath on the build year, the centuries, then the closing line held. */
const HOLD = 0.6;
const YEARS = 9;
const TOTAL = 12;
const FPS = 30;
const APPLY_EVERY = 0.08;

/** The first recording type the browser supports: MP4 where it can, else WebM. */
export function videoType(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return null;
  const types = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

export interface TimeLapseInput {
  readonly level: LevelDef;
  readonly design: BridgeDesign;
  readonly geometry: BridgeGeometry;
  readonly repairs: readonly number[];
  readonly lastYear: number;
  readonly line: string;
  readonly sub: string;
  readonly river: string;
  readonly mark: FamilyMark | null;
  readonly source: HTMLCanvasElement;
  readonly type: string;
}

export class TimeLapse {
  readonly done: Promise<Blob | null>;
  private readonly out = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly recorder: MediaRecorder;
  private readonly chunks: Blob[] = [];
  private readonly run: ChronicleRun;
  private readonly repairs: number[];
  private t = 0;
  private applyClock = 0;
  private lapse = 1;
  private finished = false;
  private cancelled = false;

  constructor(
    private readonly deps: GameDeps,
    private readonly scene: SceneState,
    private readonly input: TimeLapseInput,
  ) {
    this.out.width = SHARE_W;
    this.out.height = SHARE_H;
    const ctx = this.out.getContext('2d');
    if (!ctx) throw new Error('no 2D canvas');
    this.ctx = ctx;
    this.run = deps.sim.run(input.level, input.design);
    this.repairs = [...input.repairs].sort((a, b) => a - b);
    const stream = this.out.captureStream(FPS);
    // 5 Mbit/s keeps twelve seconds of 720p near 7 MB: clean enough for a phone screen and small
    // enough for any messenger's video limit.
    this.recorder = new MediaRecorder(stream, { mimeType: input.type, videoBitsPerSecond: 5_000_000 });
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.done = new Promise((resolve) => {
      this.recorder.onstop = () => {
        for (const track of stream.getTracks()) track.stop();
        resolve(this.cancelled || this.chunks.length === 0 ? null : new Blob(this.chunks, { type: input.type.split(';')[0] }));
      };
      this.recorder.onerror = (e) => {
        log.warn('share', 'recording failed', e);
        resolve(null);
      };
    });
    // A first frame before recording starts, so the video never opens on black.
    drawScene(this.ctx, input.source);
    this.recorder.start(250);
  }

  /** The replay's calendar for the moment `t` seconds in. */
  private yearAt(t: number): number {
    const { level } = this.input;
    const k = smoothstep(0, 1, clamp01((t - HOLD) / YEARS));
    return level.year + (this.input.lastYear - level.year) * k;
  }

  update(dt: number): void {
    if (this.finished) return;
    this.t += dt;
    const { level, geometry } = this.input;
    const year = Math.min(this.yearAt(this.t), level.endYear - 1e-6);
    // The player's repairs, in their years: the replay lives the life the player gave it.
    while (this.repairs.length > 0 && (this.repairs[0] as number) <= year) {
      const at = this.repairs.shift() as number;
      if (at > this.run.year) this.run.advance(at);
      this.run.repair();
    }
    if (year > this.run.year) this.run.advance(year);
    const ending = this.t > HOLD + YEARS;
    this.lapse = damp(this.lapse, ending ? 0 : 1, 2.2, dt);
    const hour = ending ? 16.4 : 13;
    this.scene.time = { year, season: ending ? 0.35 : fract(year), hour, lapse: this.lapse };
    this.scene.setWater(annualWater(level, year, ending ? 0.35 : fract(year), this.lapse));
    this.applyClock -= dt;
    if (this.applyClock <= 0) {
      this.applyClock = APPLY_EVERY;
      this.deps.bridge.apply(this.run.state);
      this.deps.world.setBridge(geometry, this.run.state.piers.map((p) => p.scour));
    }
    if (this.t >= TOTAL) this.stop();
  }

  /** Called right after the scene is rendered, while its drawing buffer is still whole. */
  afterRender(): void {
    if (this.finished) return;
    const ctx = this.ctx;
    try {
      drawScene(ctx, this.input.source);
      const year = this.yearAt(this.t);
      const closing = smoothstep(HOLD + YEARS, HOLD + YEARS + 0.9, this.t);
      drawYear(ctx, year, this.input.river, 1 - closing);
      drawClosing(ctx, this.input.line, this.input.sub, this.input.mark, closing);
    } catch (err) {
      log.once('share:frame', 'share', 'time-lapse frame failed', err);
    }
  }

  /** The tab was hidden: hold the recording (and the replay, which only runs on frames). */
  pause(on: boolean): void {
    try {
      if (on && this.recorder.state === 'recording') this.recorder.pause();
      else if (!on && this.recorder.state === 'paused') this.recorder.resume();
    } catch (err) {
      log.once('share:pause', 'share', 'could not pause the recording', err);
    }
  }

  cancel(): void {
    this.cancelled = true;
    this.stop();
  }

  private stop(): void {
    if (this.finished) return;
    this.finished = true;
    try {
      if (this.recorder.state !== 'inactive') this.recorder.stop();
    } catch (err) {
      log.warn('share', 'could not stop the recording', err);
    }
  }
}
