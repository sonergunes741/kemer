/**
 * Design handles: grips drawn through the projector, grabbed and dragged with any pointer, moved
 * with arrow keys when focused. The UI is passive: it reports where the player wants the grip
 * ('handle' and 'nudge' intents) and draws the grip wherever the next model puts it.
 */
import type { DesignModel, HandleId, HandleModel } from '../../core/contracts';
import type { Vec2 } from '../../core/types';
import { t, type UiKey } from '../../i18n';
import type { UiContext } from '../context';
import { s, setAttrs, toggleClass } from '../dom';
import { formatLength } from '../units';
import { gripReach, handleKey, keySteps } from './geometry';

interface HandleView {
  model: HandleModel;
  readonly g: SVGGElement;
  readonly hit: SVGCircleElement;
  readonly axisG: SVGGElement;
  readonly stopMin: SVGPathElement;
  readonly stopMax: SVGPathElement;
  readonly chevMin: SVGPathElement;
  readonly chevMax: SVGPathElement;
  screen: { x: number; y: number };
  dir: { x: number; y: number };
  hover: boolean;
  focus: boolean;
}

interface Grab {
  readonly key: string;
  readonly pointerId: number;
  /** Grip position minus the pointer's elevation position at grab, so the grip does not jump. */
  readonly offset: Vec2;
  last: Vec2;
}

export interface HandleLayer {
  readonly guides: SVGGElement;
  readonly group: SVGGElement;
  update(model: DesignModel): void;
  frame(): void;
  render(): void;
  /** Screen position of a handle (for the coach's ghost hand), or null. */
  position(id: HandleId): { x: number; y: number; dir: { x: number; y: number } } | null;
  readonly dragging: boolean;
  cancel(): void;
}

export function createHandleLayer(ctx: UiContext): HandleLayer {
  const guides = s('g', {}, 'k-guides');
  const guide = s('line', {}, 'k-guide');
  const valueText = s('text', {}, 'k-value');
  guides.append(guide, valueText);
  const group = s('g', {}, 'k-handles');
  const views = new Map<string, HandleView>();
  let model: DesignModel | null = null;
  let grab: Grab | null = null;
  let spanCount = 0;
  let pierCount = 0;

  function name(id: HandleId): string {
    const base = t(`handle.${id.kind}` as UiKey);
    if ((id.kind === 'pier' || id.kind === 'pier-side' || id.kind === 'foundation') && pierCount > 1) {
      return t('handle.pierIndexed', { name: base, n: id.index + 1 });
    }
    if ((id.kind === 'crown' || id.kind === 'haunch' || id.kind === 'ring') && spanCount > 1) {
      return t('handle.indexed', { name: base, n: id.index + 1 });
    }
    return base;
  }

  function create(h: HandleModel): HandleView {
    const g = s('g', { tabindex: 0, role: 'slider', 'data-handle': handleKey(h.id) }, `k-handle k-handle--${h.id.kind}`);
    const hit = s('circle', { r: 22 }, 'k-handle__hit');
    const body = s('g', {}, 'k-handle__body');
    const axisG = s('g', {}, 'k-handle__axis');
    const chevMax = s('path', { d: 'M14 -4.5L18.5 0L14 4.5' }, 'k-handle__chev k-handle__chev--max');
    const chevMin = s('path', { d: 'M-14 -4.5L-18.5 0L-14 4.5' }, 'k-handle__chev k-handle__chev--min');
    const stopMax = s('path', { d: 'M13 -7V7' }, 'k-handle__stop k-handle__stop--max');
    const stopMin = s('path', { d: 'M-13 -7V7' }, 'k-handle__stop k-handle__stop--min');
    axisG.append(chevMin, chevMax, stopMin, stopMax);
    body.append(
      s('circle', { r: 15 }, 'k-handle__focus'),
      axisG,
      s('circle', { r: 8 }, 'k-handle__ring'),
      s('circle', { r: 2.6 }, 'k-handle__dot'),
    );
    g.append(hit, body);
    const view: HandleView = { model: h, g, hit, axisG, stopMin, stopMax, chevMin, chevMax, screen: { x: -999, y: -999 }, dir: { x: 0, y: -1 }, hover: false, focus: false };
    const key = handleKey(h.id);

    g.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0 && ev.pointerType === 'mouse') return;
      ev.preventDefault();
      ev.stopPropagation();
      const p = ctx.local(ev.clientX, ev.clientY);
      const at = ctx.projector.fromScreen(p.x, p.y);
      const cur = view.model.at;
      const offset = at ? { x: cur.x - at.x, y: cur.y - at.y } : { x: 0, y: 0 };
      grab = { key, pointerId: ev.pointerId, offset, last: { x: cur.x, y: cur.y } };
      try {
        g.setPointerCapture(ev.pointerId);
      } catch {
        /* capture is a nicety; dragging still works while the pointer stays over the grip */
      }
      g.focus({ preventScroll: true });
      refreshClasses();
      ctx.emit({ type: 'handle', id: view.model.id, phase: 'grab', to: { x: cur.x, y: cur.y } });
    });
    g.addEventListener('pointermove', (ev) => {
      if (!grab || grab.key !== key || grab.pointerId !== ev.pointerId) return;
      const p = ctx.local(ev.clientX, ev.clientY);
      const at = ctx.projector.fromScreen(p.x, p.y);
      if (!at) return;
      grab.last = { x: at.x + grab.offset.x, y: at.y + grab.offset.y };
      ctx.emit({ type: 'handle', id: view.model.id, phase: 'drag', to: { x: grab.last.x, y: grab.last.y } });
    });
    const release = (ev: PointerEvent): void => {
      if (!grab || grab.key !== key || grab.pointerId !== ev.pointerId) return;
      const to = grab.last;
      grab = null;
      refreshClasses();
      ctx.emit({ type: 'handle', id: view.model.id, phase: 'release', to: { x: to.x, y: to.y } });
    };
    g.addEventListener('pointerup', release);
    g.addEventListener('pointercancel', release);
    g.addEventListener('lostpointercapture', release);
    g.addEventListener('pointerenter', () => {
      view.hover = true;
      refreshClasses();
    });
    g.addEventListener('pointerleave', () => {
      view.hover = false;
      refreshClasses();
    });
    g.addEventListener('focus', () => {
      view.focus = true;
      refreshClasses();
    });
    g.addEventListener('blur', () => {
      view.focus = false;
      refreshClasses();
    });
    g.addEventListener('keydown', (ev) => {
      const steps = keySteps(ev.key, view.model.axis, ev.shiftKey);
      if (steps !== 0) {
        ev.preventDefault();
        ev.stopPropagation();
        ctx.emit({ type: 'nudge', id: view.model.id, steps });
      } else if (ev.key === 'Escape') {
        g.blur();
      }
    });
    group.appendChild(g);
    return view;
  }

  /** The handle whose value is shown: the one held, else focused, else hovered. */
  function active(): HandleView | null {
    if (grab) return views.get(grab.key) ?? null;
    for (const v of views.values()) if (v.focus) return v;
    for (const v of views.values()) if (v.hover) return v;
    return null;
  }

  function refreshClasses(): void {
    for (const [key, v] of views) {
      toggleClass(v.g, 'is-grabbed', grab?.key === key);
      toggleClass(v.g, 'is-hover', v.hover || v.focus);
    }
    toggleClass(group, 'is-dragging', grab !== null);
    toggleClass(guides, 'is-dragging', grab !== null);
  }

  function updateAria(v: HandleView): void {
    const units = ctx.settings.units;
    setAttrs(v.g, {
      'aria-label': name(v.model.id),
      'aria-valuetext': formatLength(v.model.value, units),
      'aria-valuenow': Math.round(v.model.value * 100) / 100,
    });
  }

  function update(next: DesignModel): void {
    model = next;
    spanCount = next.spans.length;
    pierCount = next.piers.length;
    const seen = new Set<string>();
    for (const hm of next.handles) {
      const key = handleKey(hm.id);
      seen.add(key);
      let v = views.get(key);
      if (!v) {
        v = create(hm);
        views.set(key, v);
        v.g.classList.add('is-new');
      }
      v.model = hm;
      toggleClass(v.g, 'at-min', hm.atMin);
      toggleClass(v.g, 'at-max', hm.atMax);
      updateAria(v);
    }
    for (const [key, v] of views) {
      if (seen.has(key)) continue;
      if (grab?.key === key) grab = null;
      v.g.remove();
      views.delete(key);
    }
  }

  function frame(): void {
    if (!model) return;
    const list = [...views.values()];
    for (const v of list) {
      const a = ctx.projector.toScreen(v.model.at);
      const ax = a.x;
      const ay = a.y;
      const b = ctx.projector.toScreen({ x: v.model.at.x + v.model.axis.x, y: v.model.at.y + v.model.axis.y });
      const dx = b.x - ax;
      const dy = b.y - ay;
      const len = Math.hypot(dx, dy) || 1;
      v.screen = { x: ax, y: ay };
      v.dir = { x: dx / len, y: dy / len };
      v.g.setAttribute('transform', `translate(${ax.toFixed(1)} ${ay.toFixed(1)})`);
      v.axisG.setAttribute('transform', `rotate(${((Math.atan2(v.dir.y, v.dir.x) * 180) / Math.PI).toFixed(1)})`);
    }
    const reach = gripReach(list.map((v) => v.screen));
    list.forEach((v, i) => v.hit.setAttribute('r', String(reach[i]!.toFixed(1))));

    const act = active();
    if (grab && act) {
      const { x, y } = act.screen;
      const { x: dx, y: dy } = act.dir;
      setAttrs(guide, { x1: x - dx * 2400, y1: y - dy * 2400, x2: x + dx * 2400, y2: y + dy * 2400 });
    }
    if (act) {
      let px = -act.dir.y;
      let py = act.dir.x;
      if (px < -0.01 || (Math.abs(px) <= 0.01 && py > 0)) {
        px = -px;
        py = -py;
      }
      const gap = act.g.classList.contains('is-grabbed') ? 26 : 22;
      setAttrs(valueText, {
        x: (act.screen.x + px * gap).toFixed(1),
        y: (act.screen.y + py * gap).toFixed(1),
        'text-anchor': px > 0.3 ? 'start' : 'middle',
      });
      const text = formatLength(act.model.value, ctx.settings.units);
      if (valueText.textContent !== text) valueText.textContent = text;
      valueText.classList.add('is-on');
    } else {
      valueText.classList.remove('is-on');
    }
  }

  return {
    guides,
    group,
    update,
    frame,
    render() {
      for (const v of views.values()) updateAria(v);
    },
    position(id) {
      const v = views.get(handleKey(id));
      return v ? { x: v.screen.x, y: v.screen.y, dir: v.dir } : null;
    },
    get dragging() {
      return grab !== null;
    },
    cancel() {
      grab = null;
      refreshClasses();
    },
  };
}
