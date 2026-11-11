/**
 * Boot and wiring: fonts and the asset manifest, the WebGL 2 check, the save, every module created
 * and joined, the frame loop exactly as docs/ARCHITECTURE.md describes it (the game owns the clock),
 * resize, the pause when the tab is hidden, and the service worker in production.
 */
import './app.css';
import { loadManifest } from '../core/assets';
import { Bus } from '../core/bus';
import type { KeyValueStorage } from '../core/contracts';
import { isLowEndHardware } from '../core/device';
import { detectLang } from '../core/i18n';
import { log } from '../core/log';
import type { QualityId } from '../core/types';
import { createAudio } from '../audio';
import { createContent } from '../content';
import { createGame, type Game } from '../game';
import { createSaveStore } from '../game/save';
import { createBridgeView } from '../render/bridge';
import { createWorld } from '../render/world';
import { createSim } from '../sim';
import { createUi } from '../ui';
import { showFatal } from './fatal';
import { loadFonts } from './fonts';
import { createStorage, hasWebGL2 } from './platform';

export interface BootOptions {
  /** Where the save lives (the harness passes its own). */
  readonly storage?: KeyValueStorage;
}

export interface AppHandle {
  readonly game: Game;
  readonly bus: Bus;
}

/** The longest step the simulation of a frame may take (a stalled tab must not leap). */
const MAX_DT = 1 / 20;

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function createCurtain(host: HTMLElement, before: Element): (opacity: number, seconds: number) => void {
  const el = document.createElement('div');
  el.className = 'k-curtain';
  el.setAttribute('aria-hidden', 'true');
  host.insertBefore(el, before);
  return (opacity, seconds) => {
    el.style.transition = seconds > 0 ? `opacity ${seconds.toFixed(2)}s ease-in-out` : 'none';
    // A cut must not animate from the last fade: flush the style before the new value.
    if (seconds <= 0) void el.offsetWidth;
    el.style.opacity = String(Math.max(0, Math.min(1, opacity)));
  };
}

function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) return;
  // Inside a portal's iframe the host owns caching; only a top-level page installs for offline play.
  if (window.top !== window.self) return;
  navigator.serviceWorker.register('./sw.js').catch((err: unknown) => log.warn('app', 'service worker not registered', err));
}

export async function boot(options: BootOptions = {}): Promise<AppHandle | null> {
  if (!hasWebGL2()) {
    showFatal('webgl');
    return null;
  }
  const canvas = document.getElementById('scene');
  const uiRoot = document.getElementById('ui');
  const app = document.getElementById('app');
  if (!(canvas instanceof HTMLCanvasElement) || !uiRoot || !app) {
    showFatal('crash', 'missing #scene, #ui or #app');
    return null;
  }
  const curtain = createCurtain(app, uiRoot);
  await Promise.all([loadFonts(), loadManifest()]);

  const storage = options.storage ?? createStorage();
  const store = createSaveStore(storage, detectLang());
  const save = store.load();
  const settings = save.settings;
  document.documentElement.lang = settings.lang;
  const lowEnd = isLowEndHardware();
  const startQuality: QualityId = settings.quality === 'auto' ? (lowEnd ? 'low' : 'medium') : settings.quality;

  const bus = new Bus();
  const sim = createSim();
  const content = createContent(sim);
  const world = createWorld(canvas, bus, { quality: startQuality });
  const bridge = createBridgeView(world, bus, { quality: startQuality });
  world.scene.add(bridge.object);
  const audio = createAudio(bus);
  const ui = createUi(uiRoot, world, { lang: settings.lang, settings: { ...settings } });

  const viewport = (): { width: number; height: number } => ({ width: canvas.clientWidth || window.innerWidth, height: canvas.clientHeight || window.innerHeight });
  const resize = (): void => {
    const { width, height } = viewport();
    world.resize(width, height, window.devicePixelRatio || 1);
  };
  resize();
  window.addEventListener('resize', resize);
  if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(canvas);

  const game = createGame({ sim, content, world, bridge, audio, ui, bus, store, viewport, prefersReducedMotion, lowEnd, curtain, canvas }, save, startQuality);

  // A lost WebGL context (a driver reset, the GPU reclaimed on a phone) blanks the picture: hold
  // the game and stop drawing until the browser hands the context back, then redraw at full size.
  let contextLost = false;
  canvas.addEventListener('webglcontextlost', (ev) => {
    ev.preventDefault();
    contextLost = true;
    game.setContextLost(true);
    log.warn('app', 'WebGL context lost; waiting for it to come back');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    resize();
    game.setContextLost(false);
    log.info('app', 'WebGL context restored');
  });

  // The first gesture anywhere wakes the sound (browsers keep audio asleep until then).
  const wake = (): void => {
    void audio.unlock();
    document.removeEventListener('pointerdown', wake, true);
    document.removeEventListener('keydown', wake, true);
  };
  document.addEventListener('pointerdown', wake, true);
  document.addEventListener('keydown', wake, true);
  document.addEventListener('visibilitychange', () => game.setHidden(document.hidden));

  let last = performance.now();
  const frame = (now: number): void => {
    const real = Math.max(0, (now - last) / 1000);
    last = now;
    const dt = Math.min(real, MAX_DT);
    try {
      const gameDt = game.update(dt, real);
      bridge.update(gameDt);
      world.update(gameDt);
      audio.update(dt);
      if (!contextLost) {
        world.render();
        game.afterRender();
      }
      ui.frame(dt);
    } catch (err) {
      log.once('app:frame', 'app', 'frame failed', err);
    }
    requestAnimationFrame(frame);
  };

  game.start();
  requestAnimationFrame(frame);
  registerServiceWorker();
  return { game, bus };
}
