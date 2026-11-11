import { describe, expect, it } from 'vitest';
import type { UpcomingEvent } from '../../core/contracts';
import { LEVELS } from '../../content';
import { STOP_PACE, planBeats, type Beat } from './beats';
import { Director, basePace } from './director';
import { SunHold } from './sun';

const level = LEVELS[0]!;

function flood(year: number, drama: number): UpcomingEvent {
  return { kind: 'flood', year, drama };
}

describe('beats', () => {
  it('stops for the greatest flood and the end, and only dips for ordinary ones', () => {
    const upcoming = [flood(1200, 0.5), flood(1300, 0.55), flood(1400, 0.6), flood(1500, 0.62), flood(1550, 0.64), flood(1600, 0.66), flood(1683, 0.7)];
    const beats = planBeats(level, upcoming, 1683);
    const floods = beats.filter((b) => b.kind === 'flood');
    expect(floods.find((b) => b.whole === 1683)?.stop).toBe(true);
    expect(floods.filter((b) => b.stop).length).toBeLessThan(floods.length);
    expect(beats[beats.length - 1]).toMatchObject({ kind: 'end', stop: true, year: level.endYear });
    for (let i = 1; i < beats.length; i++) expect(beats[i]!.year).toBeGreaterThanOrEqual(beats[i - 1]!.year);
  });

  it('merges beats too close to tell apart, keeping the stronger', () => {
    const beats = planBeats(level, [flood(1300, 0.5), flood(1301, 0.9)], 1301);
    expect(beats.filter((b) => b.kind === 'flood').map((b) => b.whole)).toEqual([1301]);
  });
});

describe('director', () => {
  const stop: Beat = { year: 1250.4, whole: 1250, kind: 'flood', stop: true, pace: STOP_PACE, drama: 0.8 };
  const end: Beat = { year: level.endYear, whole: level.endYear, kind: 'end', stop: true, pace: STOP_PACE, drama: 0 };

  it('climbs from a creep, eases onto a stop without passing it, and goes on when released', () => {
    const d = new Director([stop, end], level.year, level.endYear);
    d.launch();
    let reached: Beat | null = null;
    let peak = 0;
    for (let i = 0; i < 4000 && !reached; i++) {
      reached = d.step(1 / 60);
      peak = Math.max(peak, d.pace);
      expect(d.year).toBeLessThanOrEqual(stop.year);
    }
    expect(reached).toBe(stop);
    expect(peak).toBeGreaterThan(4);
    expect(peak).toBeLessThanOrEqual(basePace(level.year, level.year, 1) + 1e-9);
    expect(d.pace).toBe(STOP_PACE);
    d.release(stop);
    for (let i = 0; i < 60; i++) d.step(1 / 60);
    expect(d.year).toBeGreaterThan(stop.year);
  });

  it('keeps under an outside cap and runs faster at a higher speed', () => {
    const slow = new Director([end], level.year, level.endYear);
    slow.cap = 0.8;
    const fast = new Director([end], level.year, level.endYear);
    fast.speed = 4;
    for (let i = 0; i < 600; i++) {
      slow.step(1 / 60);
      fast.step(1 / 60);
    }
    expect(slow.pace).toBeLessThanOrEqual(0.8);
    expect(fast.year - level.year).toBeGreaterThan(10 * (slow.year - level.year));
  });
});

describe('sun hold', () => {
  it('follows a drag across the sky and lets time go only on a long enough one', () => {
    const sun = new SunHold();
    const at = (phase: 'down' | 'move' | 'up', x: number) => ({ type: 'canvas' as const, phase, x, y: 100, id: 1 });
    expect(sun.gesture(at('down', 100), 1000, 7.4)).toEqual({ hour: 7.4, go: false });
    expect(sun.holding).toBe(true);
    expect(sun.gesture(at('move', 600), 1000, 7.4).hour).toBeCloseTo(12.4);
    expect(sun.gesture(at('up', 600), 1000, 12.4).go).toBe(true);
    sun.release();
    sun.gesture(at('down', 100), 1000, 7.4);
    expect(sun.gesture(at('up', 110), 1000, 7.4).go).toBe(false);
    expect(sun.holding).toBe(false);
  });
});
