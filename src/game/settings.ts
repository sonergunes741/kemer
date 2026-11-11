/**
 * Settings applied live (DESIGN 9). The interface applies its own part of a patch (language of
 * its strings, text size, contrast, units on screen) before it reports it; here the rest of the
 * game follows: sound levels, the render preset (with an automatic step-down when frames stay
 * over budget), reduced motion and ambient life, and the coach's language.
 */
import { FRAME_BUDGET_MS } from '../core/config';
import { setLang } from '../core/i18n';
import { log } from '../core/log';
import type { QualityId, SaveData, Settings } from '../core/types';
import type { GameDeps } from './types';

/** Seconds of frames over budget before the automatic preset steps down. */
const SLOW_SECONDS = 4;
/** Frames longer than this are a hitch (a shader compile, a tab switch), not a slow device. */
const HITCH_MS = 120;
const DOWN: Record<QualityId, QualityId> = { high: 'medium', medium: 'low', low: 'low' };

export class SettingsHub {
  private auto: QualityId;
  private effective: QualityId;
  private slow = 0;
  private window = 0;
  private sum = 0;
  private frames = 0;
  /** Set by the game to re-send localised text (the coach, captions) after a language change. */
  onLang: () => void = () => undefined;

  constructor(
    private readonly deps: GameDeps,
    private readonly save: () => SaveData,
    private readonly persist: () => void,
    startQuality: QualityId,
  ) {
    this.auto = startQuality;
    this.effective = startQuality;
  }

  get current(): Settings {
    return this.save().settings;
  }

  get quality(): QualityId {
    return this.effective;
  }

  get reducedMotion(): boolean {
    return this.current.reducedMotion || this.deps.prefersReducedMotion();
  }

  /** Apply everything once at start (the renderer was already built on the starting preset). */
  applyAll(): void {
    const s = this.current;
    this.deps.audio.setVolumes(s.master, s.music, s.effects);
    this.deps.world.setReducedMotion(this.reducedMotion);
    this.deps.world.setAmbientLife(s.ambientLife);
    this.setQuality(s.quality === 'auto' ? this.auto : s.quality);
  }

  /** A patch from the settings card (already applied by the interface) or from the game itself. */
  apply(patch: Partial<Settings>, fromUi: boolean): void {
    const s = this.current;
    const langChanged = patch.lang !== undefined && patch.lang !== s.lang;
    Object.assign(s, patch);
    if (patch.master !== undefined || patch.music !== undefined || patch.effects !== undefined) this.deps.audio.setVolumes(s.master, s.music, s.effects);
    if (patch.quality !== undefined) {
      this.slow = 0;
      this.setQuality(patch.quality === 'auto' ? this.auto : patch.quality);
    }
    if (patch.reducedMotion !== undefined) this.deps.world.setReducedMotion(this.reducedMotion);
    if (patch.ambientLife !== undefined) this.deps.world.setAmbientLife(s.ambientLife);
    if (langChanged) {
      if (!fromUi) this.deps.ui.setLang(s.lang);
      else setLang(s.lang);
      this.onLang();
    }
    this.persist();
  }

  private setQuality(q: QualityId): void {
    if (q === this.effective) return;
    this.effective = q;
    this.deps.world.setQuality(q);
    this.deps.bridge.setQuality(q);
  }

  /** Watch real (unclamped) frame times; on 'auto', step down a preset when they stay over budget. */
  monitor(realDt: number): void {
    if (this.current.quality !== 'auto') return;
    const ms = realDt * 1000;
    if (ms > HITCH_MS) return;
    this.sum += ms;
    this.frames++;
    this.window += realDt;
    if (this.window < 1) return;
    const mean = this.sum / Math.max(1, this.frames);
    this.window = 0;
    this.sum = 0;
    this.frames = 0;
    this.slow = mean > FRAME_BUDGET_MS ? this.slow + 1 : 0;
    if (this.slow >= SLOW_SECONDS && this.effective !== 'low') {
      this.slow = 0;
      this.auto = DOWN[this.effective];
      log.info('settings', `frames over budget; quality steps down to ${this.auto}`);
      this.setQuality(this.auto);
    }
  }
}
