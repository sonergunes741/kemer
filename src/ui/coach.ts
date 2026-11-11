/**
 * The coach: one short line at the bottom centre and a ghost fingertip that performs the gesture
 * on the real target (a handle, a control or a point of the elevation), following it every frame.
 * It never takes input: the step completes when the player does the thing.
 */
import type { CoachStep } from '../core/contracts';
import { easeInOutCubic, easeOutCubic } from '../core/math';
import { h, s, setAttrs, setText, toggleClass } from './dom';

export interface CoachTarget {
  readonly x: number;
  readonly y: number;
  /** Screen direction of the target's axis, when it has one (handles). */
  readonly dir?: { readonly x: number; readonly y: number };
}

export interface Coach {
  readonly el: HTMLElement;
  set(step: CoachStep | null): void;
  frame(dt: number, reduced: boolean): void;
  readonly active: boolean;
}

type Gesture = NonNullable<CoachStep['gesture']>;

const CYCLE = 2.2;
const DRAG_PX = 72;

/** Screen direction for a drag gesture, aligned with the target's own axis when it has one. */
export function gestureDirection(g: Gesture, axis?: { x: number; y: number }): { x: number; y: number } {
  const base = g === 'drag-up' ? { x: 0, y: -1 } : g === 'drag-down' ? { x: 0, y: 1 } : g === 'drag-side' ? { x: 1, y: 0 } : { x: 0, y: -1 };
  if (!axis) return base;
  const dot = axis.x * base.x + axis.y * base.y;
  if (g === 'drag-out') return axis;
  return Math.abs(dot) > 0.3 ? { x: axis.x * Math.sign(dot), y: axis.y * Math.sign(dot) } : base;
}

/** Position of the fingertip along the gesture at phase u (0..1 of the cycle), relative to the target. */
export function gesturePoint(g: Gesture, u: number, dir: { x: number; y: number }): { x: number; y: number; press: number; alpha: number } {
  const fadeIn = Math.min(1, u / 0.12);
  if (g === 'tap' || g === 'hold') {
    const pressEnd = g === 'tap' ? 0.45 : 0.8;
    const press = u > 0.25 && u < pressEnd ? 1 : 0;
    const alpha = u < 0.9 ? fadeIn : Math.max(0, (1 - u) / 0.1);
    return { x: 0, y: 0, press, alpha };
  }
  const move = easeInOutCubic((u - 0.25) / 0.5);
  const press = u > 0.18 && u < 0.8 ? 1 : 0;
  const alpha = u < 0.85 ? fadeIn : Math.max(0, (1 - u) / 0.15);
  if (g === 'drag-arc') {
    // The sun's path: from the target across the sky to the right, one low arc.
    const a = Math.PI * (1 - move);
    return { x: 120 + Math.cos(a) * 120, y: -Math.sin(a) * 80, press, alpha };
  }
  return { x: dir.x * DRAG_PX * move, y: dir.y * DRAG_PX * move, press, alpha };
}

function gesturePath(g: Gesture, dir: { x: number; y: number }): string {
  if (g === 'tap' || g === 'hold') return '';
  if (g === 'drag-arc') {
    let d = '';
    for (let i = 0; i <= 24; i++) {
      const p = gesturePoint(g, 0.25 + (0.5 * i) / 24, dir);
      d += `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }
    return d;
  }
  return `M0 0L${(dir.x * DRAG_PX).toFixed(1)} ${(dir.y * DRAG_PX).toFixed(1)}`;
}

export function createCoach(resolve: (target: CoachStep['target']) => CoachTarget | null): Coach {
  const el = h('div', 'k-coach');
  const svg = s('svg', { 'aria-hidden': 'true' }, 'k-coach__svg');
  const anchor = s('g', {}, 'k-coach__anchor');
  const trail = s('path', {}, 'k-coach__path');
  const ghost = s('g', {}, 'k-ghost');
  const ring = s('circle', { r: 16 }, 'k-ghost__ring');
  const tip = s('circle', { r: 11 }, 'k-ghost__tip');
  ghost.append(ring, tip);
  anchor.append(trail, ghost);
  svg.appendChild(anchor);
  const line = h('div', 'k-coach__line');
  line.setAttribute('role', 'status');
  line.setAttribute('aria-live', 'polite');
  el.append(svg, line);

  let step: CoachStep | null = null;
  let time = 0;
  let pathKey = '';

  return {
    el,
    set(next) {
      const changed = next?.text !== step?.text || next?.gesture !== step?.gesture;
      step = next;
      if (changed) time = 0;
      toggleClass(el, 'is-on', next !== null);
      setText(line, next?.text ?? '');
      toggleClass(line, 'is-on', !!next?.text);
      pathKey = '';
    },
    frame(dt, reduced) {
      if (!step || !step.gesture || step.target.kind === 'none') {
        anchor.classList.remove('is-on');
        return;
      }
      const target = resolve(step.target);
      if (!target) {
        anchor.classList.remove('is-on');
        return;
      }
      anchor.classList.add('is-on');
      time += dt;
      const g = step.gesture;
      const dir = gestureDirection(g, target.dir);
      anchor.setAttribute('transform', `translate(${target.x.toFixed(1)} ${target.y.toFixed(1)})`);
      const key = `${g}|${dir.x.toFixed(2)}|${dir.y.toFixed(2)}`;
      if (key !== pathKey) {
        pathKey = key;
        trail.setAttribute('d', gesturePath(g, dir));
      }
      // With reduced motion the fingertip rests on the target and only the drawn path shows the way.
      const u = reduced ? 0.2 : (time % CYCLE) / CYCLE;
      const p = gesturePoint(g, u, dir);
      const pressT = p.press ? 1 : 0;
      ghost.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${(1 - 0.12 * pressT).toFixed(3)})`);
      ghost.style.opacity = (reduced ? 0.8 : p.alpha).toFixed(3);
      // The ring swells while pressed (and keeps swelling for a hold).
      const ringGrow = g === 'hold' ? easeOutCubic(Math.max(0, (u - 0.25) / 0.55)) : pressT;
      setAttrs(ring, { r: (14 + 10 * ringGrow * pressT).toFixed(1) });
      ring.style.opacity = (pressT * (g === 'hold' ? 0.9 : 0.6)).toFixed(3);
    },
    get active() {
      return step !== null;
    },
  };
}
