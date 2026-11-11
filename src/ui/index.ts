/**
 * Kemer's interface: plain DOM and one SVG layer over the scene, passive by design. It renders
 * the models the game gives it and reports what the player does as UiIntents.
 *
 * Layers, bottom to top: background input, design overlay, HUD (design, build, time, primary
 * control, menu), the current screen, the overlay card, the coach, captions and toasts.
 */
import './styles/index';
import type { BuildHud, CoachStep, DesignModel, Projector, TimeHud, UiApi, UiIntent, UiScreen } from '../core/contracts';
import type { Lang, LevelDef, Settings } from '../core/types';
import { setLang as setCoreLang } from '../core/i18n';
import { log } from '../core/log';
import { registerUiStrings, t } from '../i18n';
import { createCoach, type CoachTarget } from './coach';
import type { UiContext } from './context';
import { createDesignBar } from './design/bar';
import { createDesignOverlay } from './design/overlay';
import { button, focusables, h, icon, ICONS, toggleClass } from './dom';
import { createBuildHud, stepUsesPrimary } from './hud/build';
import { createPrimary } from './hud/primary';
import { createTimeHud } from './hud/time';
import { createInputLayer, type InputMode } from './input';
import { attachKeyboard } from './keyboard';
import { createNotices } from './notices';
import type { ScreenView } from './screens/common';
import { isGameplay, renderScreen, sameScreen } from './screens/index';

export interface UiOptions {
  lang: Lang;
  settings: Settings;
}

export function createUi(host: HTMLElement, projector: Projector, options: UiOptions): UiApi {
  registerUiStrings();
  setCoreLang(options.lang);

  const listeners = new Set<(intent: UiIntent) => void>();
  const settings: Settings = { ...options.settings, lang: options.lang };
  const root = h('div', 'kemer-ui');
  root.lang = options.lang;
  host.appendChild(root);

  let screen: UiScreen = { id: 'none' };
  let overlayScreen: UiScreen | null = null;
  let level: LevelDef | null = null;
  let design: DesignModel | null = null;
  let lastDesign: DesignModel | null = null;
  let build: BuildHud | null = null;
  let time: TimeHud | null = null;
  let timeSeen = false;
  let visible = true;
  let disposed = false;
  let rootRect: DOMRect | null = null;

  const emit = (intent: UiIntent): void => {
    // While faded out for a cinematic, the only thing the player can do is skip it.
    if (disposed || (!visible && intent.type !== 'skip')) return;
    for (const fn of listeners) {
      try {
        fn(intent);
      } catch (err) {
        log.once(`ui:listener:${intent.type}`, 'ui', 'intent listener threw', err);
      }
    }
  };

  const ctx: UiContext = {
    emit,
    projector,
    settings,
    root,
    level: () => level,
    local(clientX, clientY) {
      const r = rootRect ?? (rootRect = root.getBoundingClientRect());
      return { x: clientX - r.left, y: clientY - r.top };
    },
    reducedMotion: () => settings.reducedMotion || prefersReducedMotion(),
  };

  // Layers
  const input = createInputLayer(ctx);
  const overlay = createDesignOverlay(ctx);
  const hud = h('div', 'k-hud');
  const designBar = createDesignBar(ctx);
  const buildHud = createBuildHud(ctx);
  const timeHud = createTimeHud(ctx);
  const primary = createPrimary(ctx);
  const menu = button('k-iconbtn k-menu', '', () => emit({ type: 'menu' }));
  menu.appendChild(icon(ICONS.menu));
  hud.append(designBar.el, buildHud.el, timeHud.el, primary.el, menu);
  const screenLayer = h('div', 'k-screens');
  const overlayLayer = h('div', 'k-overlays');
  const coach = createCoach(resolveTarget);
  const notices = createNotices();
  root.append(input.el, overlay.svg, hud, screenLayer, overlayLayer, coach.el, notices.caption, notices.toasts);

  let screenView: ScreenView | null = null;
  let overlayView: ScreenView | null = null;
  let restoreFocus: HTMLElement | null = null;

  function prefersReducedMotion(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function applyLook(): void {
    root.style.setProperty('--k-scale', String(settings.textScale || 1));
    root.style.setProperty('--text-scale', String(settings.textScale || 1));
    toggleClass(root, 'k-reduced', settings.reducedMotion);
    toggleClass(root, 'k-hc', settings.highContrast);
    root.lang = settings.lang;
  }

  function applySettings(patch: Partial<Settings>): void {
    const langChanged = patch.lang !== undefined && patch.lang !== settings.lang;
    const unitsChanged = patch.units !== undefined && patch.units !== settings.units;
    Object.assign(settings, patch);
    applyLook();
    if (langChanged && patch.lang) api.setLang(patch.lang);
    else if (unitsChanged) renderHud();
  }

  function resolveTarget(target: CoachStep['target']): CoachTarget | null {
    switch (target.kind) {
      case 'none':
        return null;
      case 'handle':
        return overlay.handlePosition(target.id);
      case 'elevation': {
        const p = projector.toScreen(target.at);
        return { x: p.x, y: p.y };
      }
      case 'control': {
        const id = target.id;
        const el: Element | null =
          id === 'primary'
            ? primary.visible
              ? primary.button
              : null
            : id === 'repair' || id === 'speed'
              ? timeHud.control(id)
              : id === 'add-pier'
                ? overlay.addPierElement()
                : designBar.control(id);
        if (!el || (el instanceof HTMLElement && el.hidden)) return null;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return null;
        const o = root.getBoundingClientRect();
        return { x: r.left + r.width / 2 - o.left, y: r.top + r.height / 2 - o.top };
      }
    }
  }

  function inputMode(): InputMode | null {
    if (!visible || overlayScreen) return null;
    switch (screen.id) {
      case 'design':
        return { look: true, canvas: false, hover: false, tap: (x, y) => overlay.tap(x, y) };
      case 'build': {
        const gesture = screen.step === 'keystone' || screen.step === 'wedges' || screen.step === 'mark';
        return { look: !gesture, canvas: true, hover: gesture, tap: null };
      }
      case 'time':
        return { look: true, canvas: true, hover: false, tap: null };
      default:
        return null;
    }
  }

  /** Bring every HUD piece in line with the current screen and models. */
  function syncHud(): void {
    const id = screen.id;
    const showDesign = id === 'design' && design !== null;
    overlay.setVisible(showDesign);
    designBar.set(showDesign ? design : null);
    const step = screen.id === 'build' ? screen.step : null;
    buildHud.set(step ? build : null, step);
    timeHud.set(id === 'time' ? time : null);
    toggleClass(menu, 'is-on', isGameplay(screen) && !overlayScreen);
    menu.setAttribute('aria-label', t('ui.menu'));
    menu.title = `${t('ui.menu')} (Esc)`;

    const restore = screen.id === 'design' ? screen.restore : undefined;
    toggleClass(root, 'k-restoring', !!restore);
    if (showDesign && design && restore) {
      primary.show({ label: restore.action, hold: false, tone: 'plain', disabled: restore.selected < 0, progress: null, count: null });
    } else if (showDesign && design) {
      const unsafe = design.safety < 1;
      primary.show({ label: t(unsafe ? 'design.buildAnyway' : 'design.build'), hold: false, tone: unsafe ? 'rust' : 'plain', disabled: !design.canBuild, progress: null, count: null });
    } else if (step && build && stepUsesPrimary(step)) {
      const progress = build.total > 0 ? build.laid / build.total : 0;
      primary.show({ label: build.action || t('build.stones'), hold: build.hold, tone: 'plain', disabled: false, progress, count: `${build.laid} / ${build.total}` });
    } else {
      primary.show(null);
    }
    for (const g of ['design', 'build', 'time'] as const) toggleClass(root, `k-mode-${g}`, id === g);
    // Outside play the HUD is faded out but still in the page: keep Tab from stopping on it.
    hud.inert = overlayScreen !== null || !isGameplay(screen);
    toggleClass(root, 'has-primary', primary.visible);
    buildHud.quiet(coach.active);
    input.setMode(inputMode());
  }

  function renderHud(): void {
    designBar.render();
    buildHud.render();
    timeHud.render();
    overlay.render();
    syncHud();
  }

  function mount(layer: HTMLElement, prev: ScreenView | null, next: ScreenView | null): void {
    if (prev) {
      prev.dispose?.();
      const old = prev.el;
      old.classList.add('is-leaving');
      old.setAttribute('aria-hidden', 'true');
      old.inert = true;
      window.setTimeout(() => old.remove(), ctx.reducedMotion() ? 0 : 240);
    }
    if (next) layer.appendChild(next.el);
  }

  function extras() {
    const yearsStood = timeSeen && timeHud.lastYear !== null && level ? Math.max(0, timeHud.lastYear - level.year) : null;
    return { lastDesign, yearsStood, applySettings };
  }

  function showScreen(next: UiScreen, force: boolean): void {
    const keep = !force && sameScreen(screen, next);
    if (next.id === 'settings') Object.assign(settings, next.settings);
    if ('level' in next) {
      if (next.id === 'design' && (!level || next.level.id !== level.id || screen.id !== 'design')) timeSeen = false;
      level = next.level;
    }
    screen = next;
    root.dataset.screen = next.id;
    if (!keep) {
      const view = renderScreen(next, ctx, extras());
      mount(screenLayer, screenView, view);
      screenView = view;
      if (view && !overlayScreen) focusFirst(view.el);
    } else {
      screenView?.update?.(next);
    }
    applyLook();
    syncHud();
  }

  function showOverlay(next: UiScreen | null, force: boolean): void {
    const keep = !force && next !== null && sameScreen(overlayScreen, next);
    if (next?.id === 'settings') Object.assign(settings, next.settings);
    if (!overlayScreen && next) restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    overlayScreen = next;
    if (!keep) {
      const view = next ? renderScreen(next, ctx, extras()) : null;
      mount(overlayLayer, overlayView, view);
      overlayView = view;
      if (view) focusFirst(view.el);
    }
    const open = overlayScreen !== null;
    toggleClass(root, 'has-overlay', open);
    // Everything under an open card is out of reach for Tab and pointer alike (the HUD in syncHud).
    screenLayer.inert = open;
    overlay.svg.toggleAttribute('inert', open);
    if (!open && restoreFocus) {
      if (restoreFocus.isConnected) restoreFocus.focus({ preventScroll: true });
      restoreFocus = null;
    }
    applyLook();
    syncHud();
  }

  function focusFirst(el: HTMLElement): void {
    // Wait a frame so the element is laid out and visible before taking focus.
    requestAnimationFrame(() => {
      if (!el.isConnected) return;
      // A keyboard player lands on the first control; a pointer player gets the screen itself,
      // so Tab still starts inside it but no focus ring appears on a button nobody pressed.
      const first = keyboardUser ? focusables(el)[0] : undefined;
      if (first) {
        first.focus({ preventScroll: true });
      } else {
        el.tabIndex = -1;
        el.focus({ preventScroll: true });
      }
    });
  }

  let keyboardUser = false;
  const onKeyModality = (ev: KeyboardEvent): void => {
    if (ev.key === 'Tab' || ev.key.startsWith('Arrow') || ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Escape') keyboardUser = true;
  };
  const onPointerModality = (): void => {
    keyboardUser = false;
  };
  document.addEventListener('keydown', onKeyModality, true);
  document.addEventListener('pointerdown', onPointerModality, true);

  const detachKeys = attachKeyboard(document, {
    screen: () => screen,
    overlay: () => overlayScreen,
    enabled: () => !disposed,
    hidden: () => !visible,
    time: () => time,
    emit,
    primary,
  });

  const resize = (): void => {
    rootRect = null;
  };
  window.addEventListener('resize', resize);
  window.addEventListener('scroll', resize, true);
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  observer?.observe(root);

  const api: UiApi = {
    onIntent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setScreen(next) {
      showScreen(next, false);
    },
    setOverlay(next) {
      showOverlay(next, false);
    },
    setDesign(model) {
      design = model;
      if (model) lastDesign = model;
      overlay.set(model);
      syncHud();
    },
    setBuild(next) {
      build = next;
      syncHud();
    },
    setTime(next) {
      time = next;
      if (next) timeSeen = true;
      timeHud.set(screen.id === 'time' ? next : null);
    },
    coach(step) {
      coach.set(step);
      buildHud.quiet(step !== null);
      toggleClass(root, 'has-coach', step !== null);
    },
    toast(text, tone = 'plain') {
      notices.toast(text, tone);
    },
    caption(text, sub = null) {
      notices.setCaption(text, sub);
    },
    setLang(lang) {
      settings.lang = lang;
      setCoreLang(lang);
      applyLook();
      renderHud();
      showScreen(screen, true);
      if (overlayScreen) showOverlay(overlayScreen, true);
    },
    setVisible(on) {
      visible = on;
      toggleClass(root, 'is-hidden', !on);
      root.inert = !on;
      if (!on) primary.press(false);
      syncHud();
    },
    frame(dt) {
      if (disposed) return;
      const step = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.1) : 0;
      try {
        overlay.frame(step);
        designBar.frame(step);
        timeHud.frame(step);
        coach.frame(step, ctx.reducedMotion());
        notices.frame(step);
        screenView?.frame?.(step);
        overlayView?.frame?.(step);
      } catch (err) {
        log.once('ui:frame', 'ui', 'frame failed', err);
      }
    },
    dispose() {
      disposed = true;
      detachKeys();
      input.dispose();
      notices.dispose();
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', resize, true);
      document.removeEventListener('keydown', onKeyModality, true);
      document.removeEventListener('pointerdown', onPointerModality, true);
      screenView?.dispose?.();
      overlayView?.dispose?.();
      listeners.clear();
      root.remove();
    },
  };

  applyLook();
  renderHud();
  return api;
}
