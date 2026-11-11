import { describe, expect, it } from 'vitest';
import { createPlumbState, plumbDrive, stepPlumb } from './plumb';

/** Largest angle (radians) the bob reaches over `seconds` at 60 fps. */
function maxAngle(safety: number, seconds: number, reduced = false): number {
  const st = createPlumbState();
  let max = 0;
  for (let i = 0; i < seconds * 60; i++) max = Math.max(max, Math.abs(stepPlumb(st, safety, 1 / 60, reduced)));
  return max;
}

describe('plumb', () => {
  it('is calm when sound, trembles near 1, swings below it', () => {
    expect(plumbDrive(2)).toEqual({ tremble: 0, swing: 0 });
    expect(plumbDrive(1.1).tremble).toBeCloseTo(0.6);
    expect(plumbDrive(1.1).swing).toBe(0);
    expect(plumbDrive(0.8).swing).toBeCloseTo(0.5);
    expect(plumbDrive(Number.NaN)).toEqual({ tremble: 1, swing: 1 });
  });

  it('hangs still on a sound bridge', () => {
    expect(maxAngle(1.8, 3)).toBe(0);
  });

  it('moves more the less safe the bridge is', () => {
    const narrow = maxAngle(1.05, 3);
    const falling = maxAngle(0.7, 3);
    expect(narrow).toBeGreaterThan(0.001);
    expect(falling).toBeGreaterThan(narrow * 3);
  });

  it('leans without swinging under reduced motion', () => {
    const st = createPlumbState();
    const angles: number[] = [];
    for (let i = 0; i < 600; i++) angles.push(stepPlumb(st, 0.7, 1 / 60, true));
    const tail = angles.slice(-60);
    expect(Math.min(...tail)).toBeGreaterThan(0.05);
    // Settled: no oscillation left at the end.
    expect(Math.max(...tail) - Math.min(...tail)).toBeLessThan(1e-3);
  });
});
