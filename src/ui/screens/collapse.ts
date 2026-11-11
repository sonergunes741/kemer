/**
 * The fall: the epitaph in large type and the years it stood, then "Neden?": a drawing of the
 * player's own bridge (from the last design the interface saw) with the line of thrust leaving
 * the stone, the hinges marked and the greatest flood drawn; one sentence of why and one of
 * advice in the family's voice; and the way back to the drawing board.
 */
import type { DesignModel, UiScreen } from '../../core/contracts';
import type { Vec2 } from '../../core/types';
import { t } from '../../i18n';
import type { UiContext } from '../context';
import { h, s, setAttrs } from '../dom';
import { drawSketch, polyPath, project, shapeFromModel } from '../sketch';
import { classifyThrust, thrustRuns } from '../thrust';
import { action, screenShell, type ScreenView } from './common';

type CollapseScreen = Extract<UiScreen, { id: 'collapse' }>;

const W = 560;
const H = 200;
const CLS = ['ok', 'near', 'out'] as const;

/** The diagram of the fallen design. Null when no design was seen (nothing honest to draw). */
export function collapseDiagram(model: DesignModel | null): SVGSVGElement | null {
  if (!model || model.spans.length === 0) return null;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': t('collapse.diagram') }, 'k-sketch k-why__svg');
  const g = s('g');
  svg.appendChild(g);
  const flood = model.floodMarks.length > 0 ? Math.max(...model.floodMarks.map((f) => f.stage)) : null;
  const extra: Vec2[] = flood !== null ? [{ x: 0, y: flood }] : [];
  for (const sp of model.spans) extra.push(...sp.thrustLine);
  const fit = drawSketch(g, shapeFromModel(model), W, H, 18, extra);
  if (!fit) return null;

  if (flood !== null) {
    const left = project({ x: -1e9, y: flood }, fit);
    const y = left.y.toFixed(1);
    g.appendChild(s('line', { x1: 4, y1: y, x2: W - 4, y2: y }, 'k-why__flood'));
    g.appendChild(s('text', { x: W - 6, y: (left.y - 6).toFixed(1), 'text-anchor': 'end' }, 'k-why__floodtext')).textContent = t('collapse.flood');
  }
  for (const sp of model.spans) {
    if (sp.thrustLine.length < 2) continue;
    const runs = thrustRuns(classifyThrust(sp));
    for (const run of runs) {
      const d = polyPath(sp.thrustLine.slice(run.from, run.to + 1), fit);
      g.appendChild(s('path', { d }, `k-why__thrust k-thrust--${CLS[run.cls]}`));
    }
    for (const hinge of sp.hinges) {
      const q = project(hinge.at, fit);
      g.appendChild(s('circle', { cx: q.x.toFixed(1), cy: q.y.toFixed(1), r: 5.5 }, 'k-why__hinge'));
    }
  }
  return svg;
}

export function renderCollapse(screen: CollapseScreen, ctx: UiContext, model: DesignModel | null, years: number | null): ScreenView {
  const el = screenShell('k-collapse', screen.epitaph);
  const inner = h('div', 'k-collapse__inner');
  inner.appendChild(h('p', 'k-collapse__epitaph', screen.epitaph));
  if (years !== null && years > 0) inner.appendChild(h('p', 'k-collapse__stood', t('collapse.stood', { n: years })));

  const why = h('div', 'k-why');
  why.hidden = true;
  why.id = 'k-why';
  const diagram = collapseDiagram(model);
  if (diagram) why.appendChild(diagram);
  if (screen.why) why.appendChild(h('p', 'k-why__text', screen.why));
  if (screen.hint) why.appendChild(h('p', 'k-why__hint', screen.hint));

  const actions = h('div', 'k-collapse__actions');
  const whyBtn = action(t('collapse.why'), () => {
    why.hidden = false;
    whyBtn.hidden = true;
    el.classList.add('is-why');
    retry.focus();
  });
  setAttrs(whyBtn, { 'aria-controls': 'k-why', 'aria-expanded': 'false' });
  const retry = action(t('collapse.retry'), () => ctx.emit({ type: 'retry' }), true);
  actions.append(whyBtn, retry);
  // A bridge that fell only after outliving its builder still opened the next river.
  if (screen.hasNext) actions.appendChild(action(t('result.next'), () => ctx.emit({ type: 'next' })));
  // With no river ahead (a fall on a river not yet passed, the endless modes) the way out is the title.
  else actions.appendChild(action(t('result.title'), () => ctx.emit({ type: 'open', screen: 'title' })));
  inner.append(why, actions);
  el.appendChild(inner);
  return { el };
}
