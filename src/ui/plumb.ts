/**
 * The şakül (plumb bob): the safety gauge. It hangs still when the bridge is sound, trembles as
 * safety nears 1 and swings wide below it. The motion is a pure stepper (tested) driving a small
 * SVG drawing; the number and the word sit beside it.
 */
import { clamp01, damp, DEG2RAD } from '../core/math';
import { s, h, setText, toggleClass } from './dom';
import { formatSafety, safetyLevel, safetyWord, SAFETY_NARROW } from './units';

export interface PlumbState {
  /** Radians from the vertical. */
  angle: number;
  /** Seconds of motion so far (phase of the oscillators). */
  time: number;
  /** Smoothed drive, so the bob eases between moods instead of jumping. */
  tremble: number;
  swing: number;
}

export function createPlumbState(): PlumbState {
  return { angle: 0, time: 0, tremble: 0, swing: 0 };
}

/** How restless the bob should be: tremble rises from 1.25 down to 1, swing from 1 down to 0.6. */
export function plumbDrive(safety: number): { tremble: number; swing: number } {
  const s0 = Number.isFinite(safety) ? safety : 0;
  return {
    tremble: clamp01((SAFETY_NARROW - s0) / (SAFETY_NARROW - 1)),
    swing: clamp01((1 - s0) / 0.4),
  };
}

/**
 * Advance the bob. With reduced motion it does not oscillate: it leans by the same measure and
 * stays there, so the reading survives without movement.
 */
export function stepPlumb(state: PlumbState, safety: number, dt: number, reduced: boolean): number {
  const drive = plumbDrive(safety);
  state.tremble = damp(state.tremble, drive.tremble, 4, dt);
  state.swing = damp(state.swing, drive.swing, 2.5, dt);
  state.time += dt;
  let target: number;
  if (reduced) {
    target = (3 * state.tremble + 14 * state.swing) * DEG2RAD;
  } else {
    const t = state.time;
    // A pendulum's slow sway once the arch cannot stand, widening as safety falls.
    const sway = state.swing > 0.001 ? (7 + 24 * state.swing) * Math.sin(t * 4.4) * state.swing ** 0.5 : 0;
    // Tremble: two incommensurate fast sines read as nervous, not as a rhythm.
    const shiver = 1.8 * state.tremble * (Math.sin(t * 61) * 0.6 + Math.sin(t * 97 + 1.3) * 0.4);
    target = (sway + shiver * (1 - state.swing * 0.6)) * DEG2RAD;
  }
  state.angle = damp(state.angle, target, reduced ? 6 : 30, dt);
  return state.angle;
}

export interface PlumbGauge {
  readonly el: HTMLElement;
  /** The bob alone, for the coach to point at. */
  set(safety: number | null): void;
  frame(dt: number, reduced: boolean): void;
  render(): void;
}

/**
 * The gauge: string hanging from a hairline bracket, a turned brass-less bob in paper colour,
 * the number in Cormorant and the word in small capitals.
 */
export function createPlumbGauge(size: 'large' | 'small'): PlumbGauge {
  const length = size === 'large' ? 58 : 34;
  const width = 36;
  const el = h('div', `k-plumb k-plumb--${size}`);
  el.setAttribute('role', 'meter');
  el.setAttribute('aria-valuemin', '0');
  el.setAttribute('aria-valuemax', '4');

  const reading = h('div', 'k-plumb__reading');
  const num = h('span', 'k-plumb__num k-num');
  const word = h('span', 'k-plumb__word k-label');
  reading.append(num, word);

  const svg = s('svg', { width, height: length + 22, viewBox: `0 0 ${width} ${length + 22}`, 'aria-hidden': 'true' }, 'k-plumb__svg');
  const bracket = s('path', { d: `M${width / 2 - 9} 0.75H${width / 2 + 9}`, class: 'k-plumb__bracket' });
  const swing = s('g', {}, 'k-plumb__swing');
  const line = s('line', { x1: width / 2, y1: 0, x2: width / 2, y2: length, class: 'k-plumb__string' });
  // The bob: a short cylinder cap tapering to a point, the classic mason's plumb.
  const cx = width / 2;
  const y0 = length;
  const bob = s('path', {
    d: `M${cx - 2} ${y0}h4l3.4 3.2v4.6L${cx} ${y0 + 19}l-${5.4} -${11.2}v-4.6z`,
    class: 'k-plumb__bob',
  });
  swing.append(line, bob);
  svg.append(bracket, swing);
  el.append(reading, svg);

  const state = createPlumbState();
  let safety: number | null = null;

  function render(): void {
    if (safety === null) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const level = safetyLevel(safety);
    setText(num, formatSafety(safety));
    setText(word, safetyWord(safety));
    for (const l of ['falls', 'narrow', 'sound', 'heavy'] as const) toggleClass(el, `is-${l}`, l === level);
    el.setAttribute('aria-valuenow', String(Math.round(safety * 100) / 100));
    el.setAttribute('aria-valuetext', `${formatSafety(safety)} ${safetyWord(safety)}`);
  }

  return {
    el,
    set(value) {
      const changed = value !== safety;
      safety = value;
      if (changed) render();
    },
    frame(dt, reduced) {
      if (safety === null) return;
      const a = stepPlumb(state, safety, dt, reduced);
      swing.setAttribute('transform', `rotate(${(a / DEG2RAD).toFixed(2)} ${cx} 0)`);
    },
    render,
  };
}
