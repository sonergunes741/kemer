/**
 * The one primary control, bottom centre: Kur, lay the stones, and so on. Every press sends
 * 'primary' down and up; whether that is a tap or a hold is the game's reading. Space works from
 * anywhere through press(), so a held key lays stones exactly like a held finger.
 */
import type { UiContext } from '../context';
import { h, setText, toggleClass } from '../dom';

export interface PrimaryOptions {
  readonly label: string;
  readonly hold: boolean;
  readonly tone: 'plain' | 'rust';
  readonly disabled: boolean;
  /** 0..1 progress hairline under the control (stones laid), or null for none. */
  readonly progress: number | null;
  readonly count: string | null;
}

export interface PrimaryControl {
  readonly el: HTMLElement;
  readonly button: HTMLButtonElement;
  show(options: PrimaryOptions | null): void;
  /** Keyboard press from the global handler. Returns true when it was taken. */
  press(down: boolean): boolean;
  readonly visible: boolean;
}

export function createPrimary(ctx: UiContext): PrimaryControl {
  const el = h('div', 'k-primary');
  const btn = h('button', 'k-primary__btn');
  btn.type = 'button';
  const text = h('span', 'k-primary__text');
  btn.appendChild(text);
  const meter = h('div', 'k-primary__meter');
  const fill = h('div', 'k-primary__fill');
  meter.appendChild(fill);
  const count = h('div', 'k-primary__count k-num');
  el.append(btn, meter, count);

  let options: PrimaryOptions | null = null;
  let down = false;
  let pointerId: number | null = null;

  function setDown(next: boolean): void {
    if (next === down) return;
    if (next && (!options || options.disabled)) return;
    down = next;
    toggleClass(btn, 'is-down', down);
    ctx.emit({ type: 'primary', phase: down ? 'down' : 'up' });
  }

  btn.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 && ev.pointerType === 'mouse') return;
    ev.preventDefault();
    ev.stopPropagation();
    pointerId = ev.pointerId;
    try {
      btn.setPointerCapture(ev.pointerId);
    } catch {
      /* capture only keeps the hold alive when the finger slides off */
    }
    btn.focus({ preventScroll: true });
    setDown(true);
  });
  const lift = (ev: PointerEvent): void => {
    if (pointerId !== ev.pointerId) return;
    pointerId = null;
    setDown(false);
  };
  btn.addEventListener('pointerup', lift);
  btn.addEventListener('pointercancel', lift);
  btn.addEventListener('lostpointercapture', lift);
  btn.addEventListener('keydown', (ev) => {
    if (ev.key !== ' ' && ev.key !== 'Enter') return;
    ev.preventDefault();
    ev.stopPropagation();
    if (!ev.repeat) setDown(true);
  });
  btn.addEventListener('keyup', (ev) => {
    if (ev.key !== ' ' && ev.key !== 'Enter') return;
    ev.preventDefault();
    ev.stopPropagation();
    setDown(false);
  });
  // Clicks are fully handled by pointer and key events; a synthetic click must not repeat them.
  btn.addEventListener('click', (ev) => ev.preventDefault());
  btn.addEventListener('blur', () => {
    if (pointerId === null) setDown(false);
  });

  return {
    el,
    button: btn,
    show(next) {
      options = next;
      toggleClass(el, 'is-on', next !== null);
      if (!next) {
        setDown(false);
        return;
      }
      setText(text, next.label);
      toggleClass(btn, 'is-rust', next.tone === 'rust');
      toggleClass(btn, 'is-hold', next.hold);
      btn.setAttribute('aria-disabled', String(next.disabled));
      toggleClass(btn, 'is-disabled', next.disabled);
      if (next.disabled) setDown(false);
      toggleClass(meter, 'is-on', next.progress !== null);
      fill.style.transform = `scaleX(${Math.max(0, Math.min(1, next.progress ?? 0)).toFixed(4)})`;
      setText(count, next.count ?? '');
    },
    press(isDown) {
      if (!options || options.disabled) return false;
      setDown(isDown);
      return true;
    },
    get visible() {
      return options !== null;
    },
  };
}
