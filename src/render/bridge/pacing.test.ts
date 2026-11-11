import { describe, expect, it } from 'vitest';
import { FIRST_COUNT, FIRST_GAP, stepPace, targetSeconds, type Pace } from './pacing';

function holdUntilDone(total: number): { seconds: number; starts: number[] } {
  const p: Pace = { laid: 0, momentum: 0 };
  const dt = 1 / 60;
  const starts: number[] = [];
  let t = 0;
  while (p.laid < total && t < 120) {
    const n = stepPace(p, dt, true, total);
    for (let i = 0; i < n; i++) starts.push(t);
    t += dt;
  }
  return { seconds: t, starts };
}

describe('laying pace', () => {
  it('lays any bridge in about 20 to 30 seconds of holding', () => {
    for (const total of [21, 68, 150, 470, 1034, 2749, 6000]) {
      const { seconds } = holdUntilDone(total);
      expect(seconds).toBeGreaterThan(17);
      expect(seconds).toBeLessThan(32);
    }
  });

  it('keeps the first ten stones single and distinct, starting at once', () => {
    const { starts } = holdUntilDone(1000);
    expect(starts[0]).toBeLessThan(0.05);
    for (let i = 1; i < FIRST_COUNT; i++) expect(starts[i]! - starts[i - 1]!).toBeGreaterThan(FIRST_GAP * 0.9);
  });

  it('quickens the longer the control is held', () => {
    const { starts } = holdUntilDone(2000);
    const early = starts[60]! - starts[50]!;
    const late = starts[1960]! - starts[1950]!;
    expect(late).toBeLessThan(early);
  });

  it('pauses on release and lets the momentum ebb', () => {
    const p: Pace = { laid: 0, momentum: 0 };
    for (let i = 0; i < 600; i++) stepPace(p, 1 / 60, true, 3000);
    const laid = p.laid;
    const m = p.momentum;
    expect(stepPace(p, 0.5, false, 3000)).toBe(0);
    expect(p.laid).toBe(laid);
    expect(p.momentum).toBeLessThan(m);
  });

  it('never targets less than 20 or more than 30 seconds', () => {
    expect(targetSeconds(5)).toBe(20);
    expect(targetSeconds(1e6)).toBe(30);
  });
});
