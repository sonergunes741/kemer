import { describe, expect, it } from 'vitest';
import { createSim } from '../../sim';
import { FIXTURES, longBridge } from '../../sim/testing/fixtures';
import { crackPath } from './crack';
import { buildLayout, mainSpanOf } from './layout';

const sim = createSim();
const cases = [
  ['a', FIXTURES.a, false],
  ['c with reliefs', FIXTURES.c, true],
  ['d', FIXTURES.d, false],
  ['ten spans', longBridge(10), false],
] as const;

describe('stone layout', () => {
  for (const [name, level, reliefs] of cases) {
    for (const split of [0, 2] as const) {
      it(`${name}, detail ${split}: every stone is whole and every voussoir is laid`, () => {
        const g = sim.geometry(level, { ...level.starter, reliefs });
        const layout = buildLayout(level, g, split);
        expect(layout.stones.length).toBeGreaterThan(0);
        expect(layout.phase).toHaveLength(layout.stones.length);
        for (const s of layout.stones) {
          expect(Number.isFinite(s.pivot.x) && Number.isFinite(s.pivot.y) && Number.isFinite(s.pivot.z)).toBe(true);
          expect(s.volume).toBeGreaterThan(0);
          expect(s.shape.poly.length).toBeGreaterThanOrEqual(3);
          expect(s.shape.w1).toBeGreaterThan(s.shape.w0);
        }
        g.spans.forEach((span, si) => {
          const ring = layout.stones.filter((s) => (s.kind === 'voussoir' || s.kind === 'keystone') && s.span === si && !s.arcade);
          // Every course of the ring is there, and the keystone is one stone across the width.
          expect(new Set(ring.map((s) => s.voussoir)).size).toBe(span.voussoirs.length);
          expect(ring.filter((s) => s.kind === 'keystone')).toHaveLength(1);
          // Courses split across the width still add up to the full width.
          const course = ring.filter((s) => s.voussoir === 0);
          const across = course.reduce((sum, s) => sum + (s.shape.w1 - s.shape.w0), 0);
          expect(across).toBeCloseTo(g.width, 6);
        });
        // A wall stone that rides on the ring names a course that exists.
        for (const s of layout.stones) {
          if (s.follow[0] < 0 || s.arcade || s.follow[0] >= g.spans.length) continue;
          expect(s.follow[1]).toBeGreaterThanOrEqual(0);
          expect(s.follow[1]).toBeLessThan(g.spans[s.follow[0]]!.voussoirs.length);
        }
        expect(layout.mainSpan).toBe(mainSpanOf(g));
      });
    }
  }

  it('is deterministic', () => {
    const level = FIXTURES.c;
    const g = sim.geometry(level, level.starter);
    const a = buildLayout(level, g, 2);
    const b = buildLayout(level, g, 2);
    expect(b.stones.length).toBe(a.stones.length);
    expect(b.stones[100]!.pivot).toEqual(a.stones[100]!.pivot);
  });

  it('cracks run from the open end of the joint, and up through the wall for an intrados hinge', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 0.2, y: 0.8 };
    const up = crackPath(a, b, 'intrados', () => 0.5);
    expect(up.points[up.open]).toEqual(b);
    expect(Math.max(...up.points.map((p) => p.y))).toBeGreaterThan(b.y + 0.5);
    const down = crackPath(a, b, 'extrados', () => 0.5);
    expect(down.points[down.open]).toEqual(a);
    expect(down.points).toHaveLength(2);
  });
});
