import { describe, expect, it } from 'vitest';
import { RAD2DEG } from '../core/math';
import type { BridgeDesign, Hinge, LevelDef } from '../core/types';
import { BridgeModel } from './bridge';
import { normalize } from './design';
import { buildLayout } from './geometry';
import { createSim } from './index';
import { completeMechanism, mechanismMoves, supportMechanism } from './mechanism';
import { hingeList, solveMovement } from './movement';
import { Workspace, solveAlpha } from './ring';
import { hingesOf } from './rows';
import { RIGID } from './span';
import { FIXTURES, fixtureC, fixtureD, longBridge } from './testing/fixtures';
import { withSpans } from './testing/helpers';
import { bareRing } from './testing/rings';

const sim = createSim();
const ws = new Workspace();
const text = (hinges: readonly Hinge[]): string => hinges.map((h) => `${h.joint}${h.side[0]}`).join(' ');

/** At least four hinges, at joints of the span, strictly left to right. */
function expectOrdered(hinges: readonly Hinge[], courses: number): void {
  expect(hinges.length).toBeGreaterThanOrEqual(4);
  for (let k = 0; k < hinges.length; k++) {
    expect(hinges[k]!.joint).toBeGreaterThanOrEqual(0);
    expect(hinges[k]!.joint).toBeLessThanOrEqual(courses);
    if (k > 0) expect(hinges[k]!.joint).toBeGreaterThan(hinges[k - 1]!.joint);
  }
}

describe('the mechanism a falling span is given', () => {
  it('a semicircle under its minimum thickness: the five textbook hinges, from nothing', () => {
    const sp = bareRing(90, 0.1);
    expect(solveAlpha(ws, sp, RIGID)).toBeGreaterThan(1);
    const hinges = completeMechanism(ws, sp, RIGID, []);
    expect(text(hinges)).toMatch(/^0e \d+i \d+e \d+i 81e$/);
    expect(hinges[2]!.joint === 40 || hinges[2]!.joint === 41).toBe(true);
    // Intrados hinges 54.5 degrees from the crown (Milankovitch), within the benchmark's 3 degrees.
    for (const h of [hinges[1]!, hinges[3]!]) expect(Math.abs(Math.atan2(Math.abs(h.at.x), h.at.y) * RAD2DEG - 54.5)).toBeLessThan(3);
    expect(mechanismMoves(sp, hinges)).toBe(true);
    expect(mechanismMoves(sp, hinges.slice(1))).toBe(true);
  });

  it('a line held by friction touches two joints; the mechanism still has four that can move', () => {
    // Tall, nearly straight-sided rings: the reported line slides before it hinges.
    const level = fixtureC;
    const d = normalize(
      level,
      withSpans(level, (x) => {
        x.spans.forEach((s) => {
          s.rise = 8.43;
          s.fullness = 0.044;
          s.thickness = 0.7;
        });
      }),
    );
    const model = new BridgeModel(buildLayout(level, d));
    const sp = model.spans[0]!;
    const alpha = solveAlpha(model.ws, sp, model.law);
    const touching = hingesOf(sp, sp.sol[0]!, sp.sol[1]!, sp.sol[2]!, 0, alpha, model.law);
    expect(touching.length).toBeLessThan(4);
    const hinges = completeMechanism(model.ws, sp, model.law, touching);
    expectOrdered(hinges, sp.n);
    expect(mechanismMoves(sp, hinges)).toBe(true);
    // And the strike that fells it hands the same kind of list to the bridge view.
    for (const s of sim.strike(level, d).collapse!.spans) expectOrdered(s.hinges, model.spans[s.span]!.n);
  });

  it('a span that follows a moving support: its open hinges are kept when they can work, and the mechanism always moves', () => {
    const level = fixtureD;
    // Hinges inside the ring: a fourth beyond them completes the mechanism.
    const tall = new BridgeModel(buildLayout(level, normalize(level, withSpans(level, (x) => void (x.spans[0]!.rise = 9)))));
    // Hinges at both springings and the crown cannot all work between fixed supports.
    const flat = new BridgeModel(buildLayout(level, normalize(level, level.starter)));
    let kept = 0;
    for (const model of [tall, flat]) {
      const sp = model.spans[0]!;
      for (const u of [0.05, 0.2, 0.4]) {
        const moved = solveMovement(model.ws, sp, model.law, u, 0, false);
        const open = hingeList(sp, moved.hinges);
        expect(open.length).toBe(3);
        const hinges = completeMechanism(model.ws, sp, model.law, open);
        expectOrdered(hinges, sp.n);
        expect(mechanismMoves(sp, hinges)).toBe(true);
        if (open.every((h) => hinges.some((x) => x.joint === h.joint && x.side === h.side))) kept++;
        // Hinge points are where the stones now are, not where they were built.
        for (const h of hinges) {
          const at = h.side === 'intrados' ? { x: sp.ax[h.joint]!, y: sp.ay[h.joint]! } : { x: sp.bx[h.joint]!, y: sp.by[h.joint]! };
          expect(h.at).toEqual(at);
        }
      }
    }
    expect(kept).toBeGreaterThan(0);
  });

  it('a span whose pier has gone opens at its minimum-thrust hinges, with one more towards that pier', () => {
    const level = fixtureC;
    const model = new BridgeModel(buildLayout(level, normalize(level, level.starter)));
    for (let i = 0; i < model.count; i++) {
      const sp = model.spans[i]!;
      const right = supportMechanism(model.ws, sp, model.law, 1);
      const left = supportMechanism(model.ws, sp, model.law, -1);
      for (const hinges of [left, right]) {
        expectOrdered(hinges, sp.n);
        expect(hinges.length).toBe(4);
        expect(mechanismMoves(sp, hinges)).toBe(true);
      }
    }
    // An inner span of the starter: three hinges are the same either way (the keystone may hinge
    // on either face), and the fourth is the springing on the side that gives.
    const sp = model.spans[1]!;
    const right = supportMechanism(model.ws, sp, model.law, 1);
    const left = supportMechanism(model.ws, sp, model.law, -1);
    expect(text(right.slice(0, 3))).toBe(text(left.slice(1)));
    expect(text(right.slice(3))).toBe(`${sp.n}e`);
    expect(text(left.slice(0, 1))).toBe('0e');
  });

  it('every span of every collapse comes with at least four hinges at different joints, left to right', () => {
    const seen = new Set<string>();
    const cases: [LevelDef, (x: BridgeDesign) => void][] = [
      [FIXTURES.a, (x) => void (x.spans[0]!.thickness = 0.25)],
      [
        FIXTURES.a,
        (x) => {
          x.spans[0]!.rise = 6.3;
          x.spans[0]!.fullness = 0.1;
        },
      ],
      [FIXTURES.b, () => undefined],
      [
        FIXTURES.b,
        (x) => {
          x.spans[0]!.rise = 6.75;
          x.spans[0]!.thickness = 0.5;
        },
      ],
      [FIXTURES.c, () => undefined],
      [
        FIXTURES.c,
        (x) => {
          x.piers[0]!.x = 9;
          x.linked = false;
        },
      ],
      [FIXTURES.d, (x) => void (x.spans[0]!.rise = 2.2)],
      [
        longBridge(5),
        (x) => {
          x.piers.forEach((p) => (p.width = 2));
          x.spans.forEach((s) => (s.rise = 2));
          x.springLevel = 2.5;
          x.spans[2]!.thickness = 0.2;
        },
      ],
    ];
    for (const [level, change] of cases) {
      const run = sim.run(level, withSpans(level, change));
      const events = run.advance(level.endYear);
      const collapse = run.summary().collapse;
      if (!collapse) continue;
      seen.add(collapse.cause);
      expect(events[events.length - 1]!.kind).toBe('collapse');
      for (const s of collapse.spans) {
        if (collapse.cause === 'flood-wash' && s.hinges.length === 0) continue;
        expectOrdered(s.hinges, run.geometry.spans[s.span]!.voussoirs.length);
        expect(s.sense).toBe(s.hinges[0]!.side === 'intrados' ? 1 : -1);
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });
});
