/**
 * Kemer's audio: every sound synthesized with the Web Audio API, no sample files.
 *
 * `createAudio(bus)` returns the AudioApi. Nothing is created until the first `unlock()` (a user
 * gesture); settings, ambience and mood given before that are kept and applied then. Without Web
 * Audio (or if the context cannot be created) it becomes a silent implementation and never throws.
 */
import type { AmbienceState, AudioApi, MusicMood, SfxId } from '../core/contracts';
import type { Bus } from '../core/bus';
import { clamp, finiteOr } from '../core/math';
import { log } from '../core/log';
import { Engine } from './engine';

export { Engine } from './engine';
export type { EngineStats } from './engine';

/**
 * The contract plus what the contract does not carry yet (see the module report): the makam
 * colour of the region, and a look inside for the harness.
 */
export interface KemerAudio extends AudioApi {
  /** Level index (1..12 rivers, 13 epilogue, 0 generated): picks the makam of regional moods. */
  setRegion(levelIndex: number): void;
  /** The live context and engine once unlocked (harness and diagnostics only). */
  inspect(): { readonly context: AudioContext; readonly engine: Engine } | null;
}

type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext;

function findContext(): AudioContextCtor | null {
  const g = globalThis as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

export function createAudio(bus: Bus): KemerAudio {
  let ctx: AudioContext | null = null;
  let engine: Engine | null = null;
  let detach: (() => void) | null = null;
  let failed = false;
  let disposed = false;
  let unlocked = false;
  let held = false;
  let holdToken = 0;
  const volumes = { master: 0.9, music: 0.6, effects: 0.9 };
  let muted = false;
  const ambience: Partial<AmbienceState> = {};
  let mood: MusicMood = 'none';
  let moodFade = 2.5;
  let region = 1;
  const listener = { x: 0, distance: 30 };

  const guard = (key: string, fn: () => void): void => {
    try {
      fn();
    } catch (err) {
      log.once(`audio:${key}`, 'audio', `${key} failed`, err);
    }
  };

  function boot(): Engine | null {
    if (engine || failed || disposed) return engine;
    const Ctor = findContext();
    if (!Ctor) {
      failed = true;
      log.warn('audio', 'Web Audio is not available; the game runs silent');
      return null;
    }
    try {
      ctx = new Ctor({ latencyHint: 'interactive' });
      const e = new Engine(ctx, { seed: Math.floor(Math.random() * 2 ** 31) });
      const now = ctx.currentTime;
      e.mixer.setVolumes(volumes, now);
      e.mixer.setMuted(muted, now);
      e.ambience.set(ambience);
      e.music.setRegion(region, now);
      e.music.setMood(mood, moodFade, now);
      e.physical.listener = listener;
      detach = e.attach(bus);
      engine = e;
    } catch (err) {
      failed = true;
      log.warn('audio', 'could not start Web Audio; the game runs silent', err);
      void ctx?.close().catch(() => undefined);
      ctx = null;
      engine = null;
    }
    return engine;
  }

  const api: KemerAudio = {
    async unlock(): Promise<void> {
      try {
        if (!boot() || !ctx || held) return;
        if (ctx.state !== 'running') await ctx.resume();
        unlocked = ctx.state === 'running';
      } catch (err) {
        log.once('audio:unlock', 'audio', 'unlock failed', err);
      }
    },

    get unlocked(): boolean {
      return unlocked;
    },

    setVolumes(master: number, music: number, effects: number): void {
      volumes.master = clamp(finiteOr(master, volumes.master), 0, 1);
      volumes.music = clamp(finiteOr(music, volumes.music), 0, 1);
      volumes.effects = clamp(finiteOr(effects, volumes.effects), 0, 1);
      if (engine && ctx) guard('volumes', () => engine?.mixer.setVolumes(volumes, ctx?.currentTime ?? 0));
    },

    setMuted(on: boolean): void {
      muted = on === true;
      if (engine && ctx) guard('mute', () => engine?.mixer.setMuted(muted, ctx?.currentTime ?? 0));
    },

    setAmbience(state: Partial<AmbienceState>): void {
      if (!state || typeof state !== 'object') return;
      Object.assign(ambience, state);
      guard('ambience', () => engine?.ambience.set(state));
    },

    setMood(next: MusicMood, fadeSeconds?: number): void {
      mood = next;
      moodFade = clamp(finiteOr(fadeSeconds ?? 2.5, 2.5), 0.05, 30);
      if (engine && ctx) guard('mood', () => engine?.music.setMood(mood, moodFade, ctx?.currentTime ?? 0));
    },

    play(id: SfxId, options?: { gain?: number; pitch?: number; pan?: number }): void {
      if (!engine || !unlocked || held) return;
      guard('play', () => engine?.ui.play(id, options));
    },

    setListener(x: number, distance: number): void {
      listener.x = finiteOr(x, listener.x);
      listener.distance = clamp(finiteOr(distance, listener.distance), 1, 5000);
    },

    setRegion(levelIndex: number): void {
      region = Math.round(finiteOr(levelIndex, region));
      if (engine && ctx) guard('region', () => engine?.music.setRegion(region, ctx?.currentTime ?? 0));
    },

    suspend(): void {
      if (held) return;
      held = true;
      const token = ++holdToken;
      if (!ctx || !engine) return;
      const c = ctx;
      // Fade before freezing the clock, so pausing never clicks.
      guard('suspend', () => engine?.mixer.setMuted(true, c.currentTime));
      setTimeout(() => {
        if (token === holdToken && held) void c.suspend().catch(() => undefined);
      }, 90);
    },

    resume(): void {
      if (!held) return;
      held = false;
      holdToken++;
      if (!ctx || !engine) return;
      const c = ctx;
      void c
        .resume()
        .then(() => {
          unlocked = c.state === 'running' || unlocked;
          engine?.mixer.setMuted(muted, c.currentTime);
        })
        .catch((err: unknown) => log.once('audio:resume', 'audio', 'resume failed', err));
    },

    update(dt: number): void {
      if (!engine || held || !unlocked) return;
      guard('update', () => engine?.update(clamp(finiteOr(dt, 0), 0, 0.25)));
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      detach?.();
      detach = null;
      guard('dispose', () => engine?.dispose());
      engine = null;
      void ctx?.close().catch(() => undefined);
      ctx = null;
      unlocked = false;
    },

    inspect() {
      return ctx && engine ? { context: ctx, engine } : null;
    },
  };
  return api;
}
