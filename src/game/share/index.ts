/**
 * Sharing a river that reached 2026 (DESIGN 3), from the result: the line as text, a still with
 * its quiet caption, or the twelve-second time-lapse. Each says what happened in one short toast
 * and fails quietly; the game goes on whatever the browser allows.
 */
import { formatNumber } from '../../core/format';
import { lt } from '../../core/i18n';
import { log } from '../../core/log';
import type { BridgeDesign, BridgeGeometry, FamilyMark, LevelDef } from '../../core/types';
import type { GameContext } from '../phases/base';
import { say } from '../text';
import { annualWater } from '../time/water';
import { drawCaption, SHARE_H, SHARE_W } from './compose';
import { deliverFile, deliverText, download, type Delivery } from './deliver';
import { TimeLapse, videoType } from './video';

export type ShareWhat = 'video' | 'image' | 'text';

/** What the last share handed over (the harness reads it). */
export interface ShareReport {
  readonly what: ShareWhat;
  readonly delivery: Delivery;
  readonly file: { readonly name: string; readonly type: string; readonly size: number } | null;
}

interface Facts {
  readonly level: LevelDef;
  readonly design: BridgeDesign;
  readonly geometry: BridgeGeometry;
  readonly years: number;
  readonly lastYear: number;
  readonly stones: number;
  readonly river: string;
  readonly mark: FamilyMark | null;
  /** "Benimki 879 yıl dayandı. Seninki?" */
  readonly line: string;
  /** "Koramaz Deresi, 1147 · 2 140 taş" */
  readonly where: string;
}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type));
}

/** The game's address when it is served for real (never a local or harness address). */
function gameUrl(): string {
  if (typeof location === 'undefined' || location.protocol !== 'https:') return '';
  return `${location.origin}${location.pathname.replace(/[^/]*$/, '')}`;
}

export class Sharer {
  last: ShareReport | null = null;
  private lapse: TimeLapse | null = null;
  /** A recorded video the browser would only share from a fresh press. */
  private ready: { file: File; text: string } | null = null;
  private stillBusy = false;
  private leaving = false;

  constructor(private readonly g: GameContext) {}

  get recording(): boolean {
    return this.lapse !== null;
  }

  private facts(): Facts | null {
    const { session } = this.g;
    const level = session.level;
    const built = session.built;
    const run = session.run;
    if (!level || !built || !run) return null;
    const summary = run.summary();
    const n = (v: number): string => formatNumber(v, 0);
    const river = lt(level.river);
    return {
      level,
      design: built.design,
      geometry: built.geometry,
      years: summary.years,
      lastYear: summary.lastYear,
      stones: summary.stones,
      river,
      mark: session.save.mark,
      line: say('shareLine', { n: n(summary.years) }),
      where: say('shareWhere', { river, year: level.year, stones: n(summary.stones) }),
    };
  }

  share(what: ShareWhat): void {
    const f = this.facts();
    if (!f) return;
    if (this.lapse) {
      this.g.deps.ui.toast(say('shareBusy'));
      return;
    }
    if (what === 'text') void this.text(f);
    else if (what === 'image') void this.image(f);
    else this.video(f);
  }

  private text(f: Facts): Promise<void> {
    const url = gameUrl();
    return deliverText([f.line, f.where, url].filter(Boolean).join('\n')).then((d) => this.told('text', d, null));
  }

  private async image(f: Facts): Promise<void> {
    if (this.stillBusy) return;
    this.stillBusy = true;
    try {
      const shot = await this.g.deps.world.capture(SHARE_W, SHARE_H);
      const canvas = document.createElement('canvas');
      canvas.width = SHARE_W;
      canvas.height = SHARE_H;
      const ctx = canvas.getContext('2d');
      if (!shot || !ctx) return this.told('image', 'failed', null);
      const picture = await createImageBitmap(shot);
      ctx.drawImage(picture, 0, 0, SHARE_W, SHARE_H);
      picture.close();
      const n = (v: number): string => formatNumber(v, 0);
      drawCaption(ctx, {
        years: say('yearsN', { n: n(f.years) }),
        river: f.river,
        line: `${f.level.year} – ${Math.floor(f.lastYear)} · ${say('stonesN', { n: n(f.stones) })}`,
        mark: f.mark,
      });
      const blob = await toBlob(canvas, 'image/png');
      if (!blob) return this.told('image', 'failed', null);
      const file = new File([blob], `kemer-${f.level.id}-${f.years}.png`, { type: 'image/png' });
      this.told('image', await deliverFile(file, f.line), file);
    } catch (err) {
      log.warn('share', 'the still could not be made', err);
      this.told('image', 'failed', null);
    } finally {
      this.stillBusy = false;
    }
  }

  private video(f: Facts): void {
    const { deps, scene, cam } = this.g;
    const waiting = this.ready;
    if (waiting) {
      // This press is the fresh gesture the browser asked for.
      this.ready = null;
      void deliverFile(waiting.file, waiting.text).then((d) => this.told('video', d, waiting.file));
      return;
    }
    const type = videoType();
    const canvas = deps.canvas;
    if (!type || !canvas || typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
      deps.ui.toast(say('shareNoVideo'));
      this.last = { what: 'video', delivery: 'failed', file: null };
      return;
    }
    const sub = `${f.river} · ${f.level.year} – ${Math.floor(f.lastYear)}`;
    let lapse: TimeLapse;
    try {
      lapse = new TimeLapse(deps, scene, {
        level: f.level,
        design: f.design,
        geometry: f.geometry,
        repairs: this.g.session.repairYears,
        lastYear: f.lastYear,
        line: f.line,
        sub,
        river: f.river,
        mark: f.mark,
        source: canvas,
        type,
      });
    } catch (err) {
      log.warn('share', 'the recorder would not start', err);
      deps.ui.toast(say('shareNoVideo'));
      this.last = { what: 'video', delivery: 'failed', file: null };
      return;
    }
    this.lapse = lapse;
    deps.ui.setVisible(false);
    deps.bridge.setTraffic(null, 0);
    cam.recentre();
    cam.set(cam.time(f.geometry));
    void lapse.done.then((blob) => this.recorded(f, type, blob));
  }

  private async recorded(f: Facts, type: string, blob: Blob | null): Promise<void> {
    this.lapse = null;
    if (!this.leaving) this.restore(f);
    this.leaving = false;
    if (!blob) {
      this.last = { what: 'video', delivery: 'cancelled', file: null };
      return;
    }
    const ext = type.startsWith('video/mp4') ? 'mp4' : 'webm';
    const file = new File([blob], `kemer-${f.level.id}-${f.years}.${ext}`, { type: blob.type || type.split(';')[0] });
    // The press that started the recording is long past: the browser may refuse to share without
    // a new one, and then the video waits for the next press of Video.
    const d = await deliverFile(file, f.line, false);
    if (d === 'needs-gesture') {
      this.ready = { file, text: f.line };
      this.g.deps.ui.toast(say('shareVideoReady'), 'good');
      this.last = { what: 'video', delivery: d, file: { name: file.name, type: file.type, size: file.size } };
      return;
    }
    this.told('video', d === 'failed' ? download(file) : d, file);
  }

  /** The river as the result left it: 2026, the spring afternoon, the bridge as it now stands. */
  private restore(f: Facts): void {
    const { deps, scene, cam, session } = this.g;
    const run = session.run;
    if (session.level !== f.level || !run) return;
    deps.ui.setVisible(true);
    scene.time = { year: f.level.endYear + 0.35, season: 0.35, hour: 16.4, lapse: 0 };
    scene.setWater(annualWater(f.level, f.level.endYear, 0.35, 0));
    deps.bridge.apply(run.state);
    deps.world.setBridge(f.geometry, run.state.piers.map((p) => p.scour));
    void cam.to(cam.title(f.geometry), 2.5, 'in-out');
  }

  private told(what: ShareWhat, delivery: Delivery, file: File | null): void {
    this.last = { what, delivery, file: file ? { name: file.name, type: file.type, size: file.size } : null };
    const { ui } = this.g.deps;
    if (delivery === 'copied') ui.toast(say('shareCopied'), 'good');
    else if (delivery === 'saved') ui.toast(say('shareSaved'), 'good');
    else if (delivery === 'failed' || delivery === 'needs-gesture') ui.toast(say('shareFailed'));
  }

  update(realDt: number): void {
    this.lapse?.update(realDt);
  }

  /** Right after the scene is drawn: the time-lapse takes its frame. */
  afterRender(): void {
    this.lapse?.afterRender();
  }

  setHidden(on: boolean): void {
    this.lapse?.pause(on);
  }

  /**
   * The player skipped the recording (the river comes back as the result left it), or the game is
   * leaving the result (`leaving`: the next phase sets the scene, so only the interface returns).
   */
  cancel(leaving = false): void {
    if (leaving) {
      this.ready = null;
      if (!this.lapse) return;
      this.leaving = true;
      this.g.deps.ui.setVisible(true);
    }
    this.lapse?.cancel();
  }
}
