import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../core/types';
import { acrossJoint, classifyThrust, classNear, classOf, crownIndex, NEAR, OK, OUT, thrustRuns } from './thrust';

/** A flat "ring" of five vertical joints from y=0 (intrados) to y=1 (extrados). */
const joints = [0, 1, 2, 3, 4].map((x) => [{ x, y: 0 }, { x, y: 1 }] as const);

describe('thrust', () => {
  it('projects a point across its joint', () => {
    expect(acrossJoint({ x: 0, y: 0.5 }, { x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(0.5);
    expect(acrossJoint({ x: 3, y: 0.25 }, { x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(0.25);
    expect(acrossJoint({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 1 })).toBe(0.5);
  });

  it('classes the middle, the edges and the outside', () => {
    expect(classOf(0.5)).toBe(OK);
    expect(classOf(0.1)).toBe(NEAR);
    expect(classOf(0.9)).toBe(NEAR);
    expect(classOf(1)).toBe(NEAR);
    expect(classOf(1.003)).toBe(NEAR);
    expect(classOf(1.05)).toBe(OUT);
    expect(classOf(-0.05)).toBe(OUT);
  });

  it('reads each thrust point against its joint', () => {
    const line: Vec2[] = [0.5, 0.5, 0.92, 1.2, 0.5].map((y, x) => ({ x, y }));
    expect(classifyThrust({ thrustLine: line, joints })).toEqual([OK, OK, NEAR, OUT, OK]);
  });

  it('falls back to the nearest joint when the counts differ', () => {
    const line: Vec2[] = [{ x: 0.1, y: 0.5 }, { x: 2.9, y: -0.2 }];
    expect(classifyThrust({ thrustLine: line, joints })).toEqual([OK, OUT]);
  });

  it('colours a segment by its worse end and merges runs', () => {
    expect(thrustRuns([OK, OK, NEAR, OK, OK])).toEqual([
      { cls: OK, from: 0, to: 1 },
      { cls: NEAR, from: 1, to: 3 },
      { cls: OK, from: 3, to: 4 },
    ]);
    expect(thrustRuns([OK])).toEqual([]);
  });

  it('finds the crown and the class near a hinge', () => {
    const line: Vec2[] = [{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 1 }];
    expect(crownIndex(line)).toBe(2);
    expect(classNear(line, [OK, NEAR, OUT, OK], { x: 2.1, y: 2.9 })).toBe(OUT);
  });
});
