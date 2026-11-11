/** Toasts (a brief line that fades by itself) and the large quiet caption in the middle. */
import { h, setText, toggleClass } from './dom';

export interface Notices {
  readonly toasts: HTMLElement;
  readonly caption: HTMLElement;
  toast(text: string, tone: 'plain' | 'good' | 'warn'): void;
  setCaption(text: string | null, sub: string | null): void;
  frame(dt: number): void;
  dispose(): void;
}

const TOAST_SECONDS = 2.8;
const MAX_TOASTS = 3;

export function createNotices(): Notices {
  const toasts = h('div', 'k-toasts');
  toasts.setAttribute('role', 'status');
  toasts.setAttribute('aria-live', 'polite');
  const caption = h('div', 'k-caption');
  const capMain = h('div', 'k-caption__main');
  const capSub = h('div', 'k-caption__sub');
  caption.append(capMain, capSub);

  const live: { el: HTMLElement; age: number; leaving: boolean }[] = [];

  function leave(item: { el: HTMLElement; leaving: boolean }): void {
    if (item.leaving) return;
    item.leaving = true;
    item.el.classList.remove('is-on');
    // Removal waits for the fade; a timer keeps it independent of transitionend firing.
    window.setTimeout(() => item.el.remove(), 360);
  }

  return {
    toasts,
    caption,
    toast(text, tone) {
      const el = h('div', `k-toast k-toast--${tone}`, text);
      toasts.appendChild(el);
      const item = { el, age: 0, leaving: false };
      live.push(item);
      requestAnimationFrame(() => el.classList.add('is-on'));
      while (live.filter((i) => !i.leaving).length > MAX_TOASTS) {
        const oldest = live.find((i) => !i.leaving);
        if (oldest) leave(oldest);
      }
    },
    setCaption(text, sub) {
      setText(capMain, text ?? '');
      setText(capSub, sub ?? '');
      toggleClass(capSub, 'is-empty', !sub);
      toggleClass(caption, 'is-on', !!text);
    },
    frame(dt) {
      for (let i = live.length - 1; i >= 0; i--) {
        const item = live[i]!;
        item.age += dt;
        if (item.age > TOAST_SECONDS) leave(item);
        if (item.age > TOAST_SECONDS + 1) live.splice(i, 1);
      }
    },
    dispose() {
      live.length = 0;
    },
  };
}
