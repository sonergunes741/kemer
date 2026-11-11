import { describe, expect, it } from 'vitest';
import { bankCrossings, gripReach, handleKey, keySteps } from './geometry';

describe('design geometry', () => {
  // A V-shaped valley: banks at y=10 at x=±10, bed at y=-2 at x=0.
  const ground = [
    { x: -20, y: 10 },
    { x: -10, y: 10 },
    { x: 0, y: -2 },
    { x: 10, y: 10 },
    { x: 20, y: 10 },
  ];

  it('finds where a flood stage meets both banks', () => {
    const c = bankCrossings(ground, 4);
    expect(c.left).toBeCloseTo(-5);
    expect(c.right).toBeCloseTo(5);
  });

  it('gives null on a side the stage never meets', () => {
    expect(bankCrossings(ground, 12)).toEqual({ left: null, right: null });
    expect(bankCrossings([{ x: 0, y: 0 }], 1)).toEqual({ left: null, right: null });
  });

  it('keeps grips from overlapping their neighbours', () => {
    expect(gripReach([{ x: 0, y: 0 }, { x: 100, y: 0 }])).toEqual([22, 22]);
    expect(gripReach([{ x: 0, y: 0 }, { x: 30, y: 0 }])).toEqual([15, 15]);
    expect(gripReach([{ x: 0, y: 0 }, { x: 4, y: 0 }])).toEqual([12, 12]);
  });

  it('maps every arrow onto the handle axis', () => {
    const up = { x: 0, y: 1 };
    expect(keySteps('ArrowUp', up, false)).toBe(1);
    expect(keySteps('ArrowDown', up, true)).toBe(-5);
    // Across the axis: right still moves forward, left back.
    expect(keySteps('ArrowRight', up, false)).toBe(1);
    expect(keySteps('ArrowLeft', up, false)).toBe(-1);
    // An axis pointing left: the right arrow pulls back.
    expect(keySteps('ArrowRight', { x: -1, y: 0 }, false)).toBe(-1);
    expect(keySteps('a', up, false)).toBe(0);
  });

  it('keys handles by kind and index', () => {
    expect(handleKey({ kind: 'pier', index: 2 })).toBe('pier:2');
  });
});
