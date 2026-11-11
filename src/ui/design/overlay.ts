/**
 * The design overlay: one SVG layer over the scene, redrawn through the projector whenever the
 * camera or the model moves. Draft joints and outlines, the line of thrust (gold, amber near an
 * edge, rust and dashed outside the stone, hinge circles, a shimmer flowing crown to supports),
 * flood marks on the banks, pier add/remove affordances and the handles.
 */
import type { DesignModel, HandleId } from '../../core/contracts';
import type { LevelDef, Vec2 } from '../../core/types';
import { lt } from '../../core/i18n';
import { t } from '../../i18n';
import type { UiContext } from '../context';
import { s, setAttrs, toggleClass } from '../dom';
import { classifyThrust, classNear, crownIndex, thrustRuns, NEAR, OUT, type ThrustClass, type ThrustRun } from '../thrust';
import { formatLengthShort } from '../units';
import { bankCrossings, canAddPierAt, pierSlots, removablePiers } from './geometry';
import { createHandleLayer } from './handles';

interface SpanCache {
  readonly classes: ThrustClass[];
  readonly runs: ThrustRun[];
  readonly crown: number;
}

interface FloodView {
  readonly g: SVGGElement;
  readonly line: SVGLineElement;
  readonly text: SVGTextElement;
  readonly stage: number;
  readonly label: string;
  readonly x: number;
  readonly side: -1 | 1;
}

export interface DesignOverlay {
  readonly svg: SVGSVGElement;
  set(model: DesignModel | null): void;
  setVisible(on: boolean): void;
  frame(dt: number): void;
  render(): void;
  /** A tap on empty background in design: adds a pier when it lands on the riverbed. */
  tap(x: number, y: number): boolean;
  handlePosition(id: HandleId): { x: number; y: number; dir: { x: number; y: number } } | null;
  addPierElement(): Element | null;
  readonly dragging: boolean;
}

const CLASS_NAMES = ['ok', 'near', 'out'] as const;

export function createDesignOverlay(ctx: UiContext): DesignOverlay {
  const svg = s('svg', { 'aria-hidden': 'false', role: 'group' }, 'k-overlay');
  const floods = s('g', {}, 'k-floods');
  const draft = s('g', {}, 'k-draft');
  const pierPath = s('path', {}, 'k-draft__piers');
  const ringPath = s('path', {}, 'k-draft__rings');
  const jointPath = s('path', {}, 'k-draft__joints');
  const deckPath = s('path', {}, 'k-draft__deck');
  draft.append(pierPath, ringPath, jointPath, deckPath);
  const thrust = s('g', {}, 'k-thrust');
  const casing = s('path', {}, 'k-thrust__casing');
  const classPaths = CLASS_NAMES.map((n) => s('path', {}, `k-thrust__line k-thrust--${n}`));
  const shimmer = s('path', {}, 'k-thrust__shimmer');
  const hingeGroup = s('g', {}, 'k-hinges');
  thrust.append(casing, ...classPaths, shimmer, hingeGroup);
  const affordances = s('g', {}, 'k-afford');
  const handles = createHandleLayer(ctx);
  svg.append(floods, draft, thrust, handles.guides, affordances, handles.group);

  let model: DesignModel | null = null;
  let level: LevelDef | null = null;
  let caches: SpanCache[] = [];
  let floodViews: FloodView[] = [];
  let addButtons: { g: SVGGElement; x: number }[] = [];
  let removeButtons: { g: SVGGElement; index: number; x: number }[] = [];
  let lastSafety: number | null = null;
  let dirty = true;
  let signature = '';
  let bloomTimer = 0;

  const P = (p: Vec2): { x: number; y: number } => {
    const q = ctx.projector.toScreen(p);
    return { x: q.x, y: q.y };
  };

  function path(points: readonly Vec2[], from = 0, to = points.length - 1, close = false): string {
    let d = '';
    for (let i = from; i <= to; i++) {
      const q = P(points[i]!);
      d += `${i === from ? 'M' : 'L'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
    }
    return close && d ? `${d}Z` : d;
  }

  function affordButton(kind: 'add' | 'remove', labelText: string, onPress: () => void): SVGGElement {
    const g = s('g', { tabindex: 0, role: 'button', 'aria-label': labelText }, `k-afford__btn k-afford--${kind}`);
    g.append(
      s('circle', { r: 22 }, 'k-afford__hit'),
      s('circle', { r: 10 }, 'k-afford__ring'),
      s('path', { d: kind === 'add' ? 'M-4.5 0H4.5M0 -4.5V4.5' : 'M-3.5 -3.5L3.5 3.5M3.5 -3.5L-3.5 3.5' }, 'k-afford__glyph'),
    );
    g.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    g.addEventListener('click', (ev) => {
      ev.stopPropagation();
      onPress();
    });
    g.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        ev.stopPropagation();
        onPress();
      }
    });
    return g;
  }

  function rebuildAffordances(m: DesignModel): void {
    const slots = pierSlots(m, level);
    const removable = removablePiers(m, level);
    const same =
      slots.length === addButtons.length &&
      removable.length === removeButtons.length &&
      slots.every((x, i) => Math.abs(x - addButtons[i]!.x) < 1e-3) &&
      removable.every((idx, i) => removeButtons[i]!.index === idx && Math.abs(m.piers[idx]!.x - removeButtons[i]!.x) < 1e-3);
    if (same) return;
    // Keep keyboard focus on the same kind of button after a rebuild, so tabbing is not lost.
    const focusedAdd = addButtons.findIndex((b) => b.g === document.activeElement);
    for (const b of addButtons) b.g.remove();
    for (const b of removeButtons) b.g.remove();
    addButtons = slots.map((x) => {
      const g = affordButton('add', t('design.addPier'), () => ctx.emit({ type: 'add-pier', x }));
      affordances.appendChild(g);
      return { g, x };
    });
    removeButtons = removable.map((index) => {
      const g = affordButton('remove', `${t('design.removePier')} ${index + 1}`, () => ctx.emit({ type: 'remove-pier', index }));
      affordances.appendChild(g);
      return { g, index, x: m.piers[index]!.x };
    });
    if (focusedAdd >= 0) addButtons[Math.min(focusedAdd, addButtons.length - 1)]?.g.focus();
  }

  function rebuildFloods(m: DesignModel): void {
    for (const f of floodViews) f.g.remove();
    floodViews = [];
    const ground = level?.site.ground ?? [];
    const first = m.spans[0]?.intrados[0];
    const lastSpan = m.spans[m.spans.length - 1];
    const lastPt = lastSpan?.intrados[lastSpan.intrados.length - 1];
    for (const mark of m.floodMarks) {
      const banks = bankCrossings(ground, mark.stage);
      const sides: { x: number; side: -1 | 1 }[] = [];
      const left = banks.left ?? first?.x ?? null;
      const right = banks.right ?? lastPt?.x ?? null;
      if (left !== null) sides.push({ x: left, side: -1 });
      if (right !== null) sides.push({ x: right, side: 1 });
      for (const side of sides) {
        const g = s('g', {}, 'k-flood');
        const line = s('line', {}, 'k-flood__line');
        const text = s('text', {}, 'k-flood__text');
        g.append(line, text);
        floods.appendChild(g);
        floodViews.push({ g, line, text, stage: mark.stage, label: lt(mark.label), x: side.x, side: side.side });
      }
    }
    renderFloodText();
  }

  function renderFloodText(): void {
    for (const f of floodViews) {
      // Only the left bank carries words; the right bank repeats the line alone.
      f.text.textContent = f.side < 0 ? `${f.label} · ${formatLengthShort(f.stage, ctx.settings.units)}` : '';
    }
  }

  function drawFloods(): void {
    for (const f of floodViews) {
      const q = P({ x: f.x, y: f.stage });
      // A short high-water line cut into the bank, reaching back from the water's edge.
      const x0 = q.x + (f.side < 0 ? -34 : 34);
      setAttrs(f.line, { x1: x0.toFixed(1), y1: q.y.toFixed(1), x2: (q.x + (f.side < 0 ? 6 : -6)).toFixed(1), y2: q.y.toFixed(1) });
      setAttrs(f.text, { x: (x0 - 6).toFixed(1), y: (q.y + 4).toFixed(1), 'text-anchor': 'end' });
    }
  }

  function drawStructure(m: DesignModel): void {
    let rings = '';
    let joints = '';
    for (const sp of m.spans) {
      if (sp.extrados.length > 1 && sp.intrados.length > 1) {
        rings += path(sp.extrados) + path(sp.intrados);
        const a = P(sp.intrados[0]!);
        const b = P(sp.extrados[0]!);
        const c = P(sp.intrados[sp.intrados.length - 1]!);
        const d = P(sp.extrados[sp.extrados.length - 1]!);
        rings += `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}M${c.x.toFixed(1)} ${c.y.toFixed(1)}L${d.x.toFixed(1)} ${d.y.toFixed(1)}`;
      }
      for (const [ja, jb] of sp.joints) {
        const a = P(ja);
        const b = P(jb);
        joints += `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
      }
    }
    let piers = '';
    for (const p of m.piers) {
      const x0 = p.x - p.width / 2;
      const x1 = p.x + p.width / 2;
      piers += path([
        { x: x0, y: p.top },
        { x: x0, y: p.base },
        { x: x1, y: p.base },
        { x: x1, y: p.top },
      ]);
    }
    ringPath.setAttribute('d', rings);
    jointPath.setAttribute('d', joints);
    pierPath.setAttribute('d', piers);
    deckPath.setAttribute('d', m.deck.length > 1 ? path(m.deck) : '');
  }

  function drawThrust(m: DesignModel): void {
    const byClass = ['', '', ''];
    let all = '';
    let shim = '';
    m.spans.forEach((sp, i) => {
      const cache = caches[i];
      const line = sp.thrustLine;
      if (!cache || line.length < 2) return;
      for (const run of cache.runs) byClass[run.cls] += path(line, run.from, run.to);
      all += path(line);
      // The shimmer runs outwards from the crown: one subpath to each support.
      const c = cache.crown;
      if (c > 0) shim += path([...line.slice(0, c + 1)].reverse());
      if (c < line.length - 1) shim += path(line, c, line.length - 1);
    });
    classPaths.forEach((p, i) => p.setAttribute('d', byClass[i]!));
    casing.setAttribute('d', all);
    shimmer.setAttribute('d', shim);

    let n = 0;
    m.spans.forEach((sp, i) => {
      const classes = caches[i]?.classes ?? [];
      for (const hinge of sp.hinges) {
        let c = hingeGroup.children[n] as SVGCircleElement | undefined;
        if (!c) {
          c = s('circle', { r: 5 }, 'k-hinge');
          hingeGroup.appendChild(c);
        }
        const q = P(hinge.at);
        const cls = classNear(sp.thrustLine, classes, hinge.at);
        setAttrs(c, { cx: q.x.toFixed(1), cy: q.y.toFixed(1), class: `k-hinge k-hinge--${CLASS_NAMES[cls]}` });
        n++;
      }
    });
    while (hingeGroup.children.length > n) hingeGroup.lastChild?.remove();
  }

  function drawAffordances(m: DesignModel): void {
    for (const b of addButtons) {
      const q = P({ x: b.x, y: 0 });
      b.g.setAttribute('transform', `translate(${q.x.toFixed(1)} ${(q.y + 30).toFixed(1)})`);
    }
    for (const b of removeButtons) {
      const pier = m.piers[b.index];
      if (!pier) continue;
      const q = P({ x: pier.x, y: 0 });
      b.g.setAttribute('transform', `translate(${q.x.toFixed(1)} ${(q.y + 30).toFixed(1)})`);
    }
  }

  function set(next: DesignModel | null): void {
    const prev = model;
    model = next;
    level = ctx.level();
    dirty = true;
    if (!next) {
      svg.classList.remove('is-on');
      handles.cancel();
      lastSafety = null;
      return;
    }
    caches = next.spans.map((sp) => {
      const classes = classifyThrust(sp);
      return { classes, runs: thrustRuns(classes), crown: crownIndex(sp.thrustLine) };
    });
    handles.update(next);
    rebuildAffordances(next);
    if (!prev || prev.floodMarks !== next.floodMarks || floodViews.length === 0) rebuildFloods(next);
    // The line blooms gold the moment the bridge can stand again.
    if (lastSafety !== null && lastSafety < 1 && next.safety >= 1) {
      thrust.classList.remove('is-bloom');
      void thrust.getBoundingClientRect();
      thrust.classList.add('is-bloom');
      bloomTimer = 0.9;
    }
    lastSafety = next.safety;
    const worst = Math.max(0, ...caches.flatMap((c) => c.classes));
    toggleClass(thrust, 'is-near', worst === NEAR);
    toggleClass(thrust, 'is-out', worst === OUT);
  }

  return {
    svg,
    set,
    setVisible(on) {
      toggleClass(svg, 'is-on', on && model !== null);
      if (!on) handles.cancel();
    },
    frame(dt) {
      if (bloomTimer > 0) {
        bloomTimer -= dt;
        if (bloomTimer <= 0) thrust.classList.remove('is-bloom');
      }
      if (!model || !svg.classList.contains('is-on')) return;
      toggleClass(svg, 'k-hc', ctx.settings.highContrast);
      const a = ctx.projector.toScreen({ x: 0, y: 0 });
      const ax = a.x;
      const ay = a.y;
      const b = ctx.projector.toScreen({ x: 10, y: 10 });
      const sig = `${ax.toFixed(2)},${ay.toFixed(2)},${b.x.toFixed(2)},${b.y.toFixed(2)}`;
      // Path strings are rebuilt only when the camera or the model moved; grips are cheap and
      // also follow hover and focus, so they update every frame.
      if (dirty || sig !== signature) {
        signature = sig;
        dirty = false;
        drawFloods();
        drawStructure(model);
        drawThrust(model);
        drawAffordances(model);
      }
      handles.frame();
    },
    render() {
      handles.render();
      renderFloodText();
      for (const b of addButtons) b.g.setAttribute('aria-label', t('design.addPier'));
      for (const b of removeButtons) b.g.setAttribute('aria-label', `${t('design.removePier')} ${b.index + 1}`);
      dirty = true;
    },
    tap(x, y) {
      if (!model) return false;
      const p = ctx.projector.fromScreen(x, y);
      if (!p || !canAddPierAt(p, model, level)) return false;
      ctx.emit({ type: 'add-pier', x: p.x });
      return true;
    },
    handlePosition: (id) => handles.position(id),
    addPierElement: () => addButtons[0]?.g ?? null,
    get dragging() {
      return handles.dragging;
    },
  };
}
