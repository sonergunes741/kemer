/**
 * The family mark: twelve mason's marks to choose from, or one drawn on a 3 x 3 grid of points.
 * The drawing pad always shows the current mark, so a preset can be taken and altered.
 * Drawing: drag from point to point (chains), or tap two points; drawing over a line erases it.
 */
import type { UiScreen } from '../../core/contracts';
import type { FamilyMark } from '../../core/types';
import { t } from '../../i18n';
import type { UiContext } from '../context';
import { button, h, label, s, setAttrs, toggleClass } from '../dom';
import { markPath, nearestPoint, normalizeMark, pointXY, PRESET_MARKS, sameMark, toggleStroke } from '../marks';
import { action, markGlyph, screenShell, type ScreenView } from './common';

type MarkScreen = Extract<UiScreen, { id: 'mark' }>;

const PAD = 200;
const PAD_INSET = 34;

export function renderMarkPicker(screen: MarkScreen, ctx: UiContext): ScreenView {
  let mark: FamilyMark = screen.current ? normalizeMark(screen.current) : { strokes: [] };
  const el = screenShell('k-markpick', t('mark.heading'));
  const head = h('header', 'k-markpick__head');
  head.append(h('h2', 'k-markpick__title k-label', t('mark.heading')), h('p', 'k-markpick__lead', t('mark.lead')));

  // Presets
  const presets = h('div', 'k-markpick__presets');
  presets.setAttribute('role', 'radiogroup');
  presets.setAttribute('aria-label', t('mark.presets'));
  const presetBtns = PRESET_MARKS.map((pm, i) => {
    const b = button('k-preset', '', () => {
      mark = normalizeMark(pm);
      pending = null;
      sync();
    });
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', t('mark.preset', { n: i + 1 }));
    b.appendChild(markGlyph(pm, 40));
    presets.appendChild(b);
    return b;
  });
  const presetCol = h('div', 'k-markpick__col');
  presetCol.append(label(t('mark.presets'), 'k-markpick__sub'), presets);

  // Drawing pad
  const pad = s('svg', { viewBox: `0 0 ${PAD} ${PAD}`, role: 'group', 'aria-label': t('mark.draw') }, 'k-pad');
  const strokes = s('path', {}, 'k-pad__strokes');
  const rubber = s('line', {}, 'k-pad__rubber');
  pad.append(s('rect', { x: 1, y: 1, width: PAD - 2, height: PAD - 2, rx: 2 }, 'k-pad__frame'), strokes, rubber);
  const points = Array.from({ length: 9 }, (_, i) => {
    const p = pointXY(i, PAD, PAD_INSET);
    const g = s('g', { tabindex: 0, role: 'button', 'aria-label': t('mark.point', { n: i + 1 }), transform: `translate(${p.x} ${p.y})` }, 'k-pad__point');
    g.append(s('circle', { r: 20 }, 'k-pad__hit'), s('circle', { r: 4.5 }, 'k-pad__dot'), s('circle', { r: 11 }, 'k-pad__ring'));
    g.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        tapPoint(i);
      } else {
        const move: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 };
        const d = move[ev.key];
        if (d !== undefined) {
          ev.preventDefault();
          const next = i + d;
          if (next >= 0 && next < 9 && !(Math.abs(d) === 1 && Math.floor(next / 3) !== Math.floor(i / 3))) points[next]?.focus();
        }
      }
    });
    pad.appendChild(g);
    return g;
  });
  const clearBtn = button('k-action k-action--small', t('mark.clear'), () => {
    mark = { strokes: [] };
    pending = null;
    sync();
  });
  const drawCol = h('div', 'k-markpick__col k-markpick__drawcol');
  const drawHead = h('div', 'k-markpick__drawhead');
  drawHead.append(label(t('mark.draw'), 'k-markpick__sub'), clearBtn);
  drawCol.append(drawHead, pad, h('p', 'k-markpick__hint', t('mark.drawHint')));

  const body = h('div', 'k-markpick__body');
  body.append(presetCol, drawCol);
  const confirm = action(t('mark.choose'), () => {
    if (mark.strokes.length > 0) ctx.emit({ type: 'mark', mark: normalizeMark(mark) });
  }, true);
  const foot = h('footer', 'k-markpick__foot');
  foot.appendChild(confirm);
  el.append(head, body, foot);

  // Drawing state
  let pending: number | null = null;
  let drag: { pointerId: number; from: number; moved: boolean } | null = null;

  function padPoint(ev: PointerEvent): { x: number; y: number } {
    const r = pad.getBoundingClientRect();
    return { x: ((ev.clientX - r.left) / Math.max(1, r.width)) * PAD, y: ((ev.clientY - r.top) / Math.max(1, r.height)) * PAD };
  }

  function tapPoint(i: number): void {
    if (pending === null) pending = i;
    else if (pending === i) pending = null;
    else {
      mark = toggleStroke(mark, pending, i);
      pending = i;
    }
    sync();
  }

  pad.addEventListener('pointerdown', (ev) => {
    const p = padPoint(ev);
    const i = nearestPoint(p.x, p.y, PAD, PAD_INSET, 26);
    if (i === null) return;
    ev.preventDefault();
    drag = { pointerId: ev.pointerId, from: i, moved: false };
    try {
      pad.setPointerCapture(ev.pointerId);
    } catch {
      /* a drag that leaves the pad simply ends there */
    }
    sync();
  });
  pad.addEventListener('pointermove', (ev) => {
    if (!drag || drag.pointerId !== ev.pointerId) return;
    const p = padPoint(ev);
    const from = pointXY(drag.from, PAD, PAD_INSET);
    setAttrs(rubber, { x1: from.x, y1: from.y, x2: p.x.toFixed(1), y2: p.y.toFixed(1) });
    rubber.classList.add('is-on');
    const i = nearestPoint(p.x, p.y, PAD, PAD_INSET, 18);
    if (i !== null && i !== drag.from) {
      mark = toggleStroke(mark, drag.from, i);
      drag.from = i;
      drag.moved = true;
      pending = null;
      sync();
    }
  });
  const endDrag = (ev: PointerEvent): void => {
    if (!drag || drag.pointerId !== ev.pointerId) return;
    const { from, moved } = drag;
    drag = null;
    rubber.classList.remove('is-on');
    if (!moved) tapPoint(from);
  };
  pad.addEventListener('pointerup', endDrag);
  pad.addEventListener('pointercancel', (ev) => {
    if (drag?.pointerId === ev.pointerId) drag = null;
    rubber.classList.remove('is-on');
  });

  function sync(): void {
    strokes.setAttribute('d', markPath(mark, PAD, PAD_INSET));
    points.forEach((g, i) => toggleClass(g, 'is-pending', pending === i || drag?.from === i));
    presetBtns.forEach((b, i) => {
      const on = sameMark(mark, PRESET_MARKS[i]!);
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on || (i === 0 && !presetBtns.some((_, j) => sameMark(mark, PRESET_MARKS[j]!))) ? 0 : -1;
    });
    const empty = mark.strokes.length === 0;
    confirm.setAttribute('aria-disabled', String(empty));
    toggleClass(confirm, 'is-disabled', empty);
    confirm.title = empty ? t('mark.empty') : '';
  }

  // Arrow keys move between presets as in any radio group.
  presets.addEventListener('keydown', (ev) => {
    const idx = presetBtns.indexOf(document.activeElement as HTMLButtonElement);
    if (idx < 0) return;
    const step: Record<string, number> = { ArrowRight: 1, ArrowDown: 6, ArrowLeft: -1, ArrowUp: -6 };
    const d = step[ev.key];
    if (d === undefined) return;
    ev.preventDefault();
    const next = (idx + d + presetBtns.length) % presetBtns.length;
    presetBtns[next]?.focus();
    presetBtns[next]?.click();
  });

  sync();
  return { el };
}
