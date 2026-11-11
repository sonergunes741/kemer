/**
 * The background input layer: everything the player does on the picture itself rather than on a
 * control. Depending on the moment it reports 'canvas' pointer events (keystone, wedges, the mark,
 * the sun), 'look' for drags, wheel and pinch, and taps (adding a pier on the riverbed).
 *
 * Conventions: dYaw and dPitch are radians in the sense of an orbit (drag right turns the view
 * left, drag down raises the camera, as three.js OrbitControls); dZoom > 0 means move closer.
 */
import type { UiContext } from './context';
import { toggleClass } from './dom';

export interface InputMode {
  /** Drags turn the view; wheel and pinch zoom. */
  readonly look: boolean;
  /** Report raw pointer events on the picture. */
  readonly canvas: boolean;
  /** Also report pointer moves with no button held (the hanging keystone follows the pointer). */
  readonly hover: boolean;
  /** Taps without a drag; return true when the tap was used. */
  readonly tap: ((x: number, y: number) => boolean) | null;
}

export interface InputLayer {
  readonly el: HTMLElement;
  setMode(mode: InputMode | null): void;
  cancel(): void;
  dispose(): void;
}

const YAW_PER_PX = 0.0032;
const PITCH_PER_PX = 0.0024;
const TAP_SLOP = 7;

interface Track {
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
}

export function createInputLayer(ctx: UiContext): InputLayer {
  const el = document.createElement('div');
  el.className = 'k-input';
  let mode: InputMode | null = null;
  const tracks = new Map<number, Track>();
  let pinch: number | null = null;

  const pinchDistance = (): number => {
    const [a, b] = [...tracks.values()];
    return a && b ? Math.hypot(a.lastX - b.lastX, a.lastY - b.lastY) : 0;
  };

  function onDown(ev: PointerEvent): void {
    if (!mode) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    const p = ctx.local(ev.clientX, ev.clientY);
    tracks.set(ev.pointerId, { startX: p.x, startY: p.y, lastX: p.x, lastY: p.y, moved: false });
    try {
      el.setPointerCapture(ev.pointerId);
    } catch {
      /* without capture a drag that leaves the window simply ends there */
    }
    if (tracks.size === 2) pinch = pinchDistance();
    if (mode.canvas) ctx.emit({ type: 'canvas', phase: 'down', x: p.x, y: p.y, id: ev.pointerId });
    el.classList.add('is-active');
  }

  function onMove(ev: PointerEvent): void {
    if (!mode) return;
    const p = ctx.local(ev.clientX, ev.clientY);
    const tr = tracks.get(ev.pointerId);
    if (!tr) {
      if (mode.canvas && mode.hover && ev.pointerType === 'mouse') ctx.emit({ type: 'canvas', phase: 'move', x: p.x, y: p.y, id: ev.pointerId });
      return;
    }
    const dx = p.x - tr.lastX;
    const dy = p.y - tr.lastY;
    tr.lastX = p.x;
    tr.lastY = p.y;
    if (!tr.moved && Math.hypot(p.x - tr.startX, p.y - tr.startY) > TAP_SLOP) tr.moved = true;
    if (mode.canvas) ctx.emit({ type: 'canvas', phase: 'move', x: p.x, y: p.y, id: ev.pointerId });
    if (!mode.look) return;
    if (tracks.size >= 2 && pinch !== null) {
      const d = pinchDistance();
      if (pinch > 0 && d > 0) ctx.emit({ type: 'look', dYaw: 0, dPitch: 0, dZoom: Math.log(d / pinch) });
      pinch = d;
      return;
    }
    if (tr.moved && (dx !== 0 || dy !== 0)) {
      ctx.emit({ type: 'look', dYaw: -dx * YAW_PER_PX, dPitch: dy * PITCH_PER_PX, dZoom: 0 });
    }
  }

  function finish(ev: PointerEvent, cancelled: boolean): void {
    const tr = tracks.get(ev.pointerId);
    if (!tr) return;
    tracks.delete(ev.pointerId);
    if (tracks.size < 2) pinch = null;
    toggleClass(el, 'is-active', tracks.size > 0);
    if (!mode) return;
    const p = ctx.local(ev.clientX, ev.clientY);
    if (mode.canvas) ctx.emit({ type: 'canvas', phase: cancelled ? 'cancel' : 'up', x: p.x, y: p.y, id: ev.pointerId });
    if (!cancelled && !tr.moved && mode.tap && tracks.size === 0) mode.tap(p.x, p.y);
  }

  function onWheel(ev: WheelEvent): void {
    if (!mode?.look) return;
    ev.preventDefault();
    const unit = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 400 : 1;
    const dz = Math.max(-0.3, Math.min(0.3, -ev.deltaY * unit * 0.0015));
    if (dz !== 0) ctx.emit({ type: 'look', dYaw: 0, dPitch: 0, dZoom: dz });
  }

  const up = (ev: PointerEvent): void => finish(ev, false);
  const cancel = (ev: PointerEvent): void => finish(ev, true);
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('lostpointercapture', cancel);
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('contextmenu', (ev) => ev.preventDefault());

  return {
    el,
    setMode(next) {
      if (!next) tracks.clear();
      mode = next;
      toggleClass(el, 'is-on', next !== null);
      toggleClass(el, 'is-look', !!next?.look);
    },
    cancel() {
      tracks.clear();
      pinch = null;
    },
    dispose() {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      el.removeEventListener('lostpointercapture', cancel);
      el.removeEventListener('wheel', onWheel);
    },
  };
}
