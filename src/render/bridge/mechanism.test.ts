import { describe, expect, it } from 'vitest';
import { applyXf, mechanism } from './mechanism';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);

describe('collapse mechanism', () => {
  // A semicircular ring of radius 5 with the classic four hinges.
  const hinges = [
    { x: -5, y: 0 },
    { x: -3.5, y: 3.57 },
    { x: 3.5, y: 3.57 },
    { x: 5, y: 0 },
  ];

  it('keeps the four-bar links rigid and the hinges joined', () => {
    for (const theta of [0.01, 0.05, 0.1]) {
      const m = mechanism(hinges, 1, theta)!;
      expect(m).toHaveLength(3);
      const h1a = applyXf(m[0]!, hinges[1]!);
      const h1b = applyXf(m[1]!, hinges[1]!);
      const h2b = applyXf(m[1]!, hinges[2]!);
      const h2c = applyXf(m[2]!, hinges[2]!);
      expect(dist(h1a, h1b)).toBeLessThan(1e-9);
      expect(dist(h2b, h2c)).toBeLessThan(1e-6);
      expect(dist(h1b, h2b)).toBeCloseTo(dist(hinges[1]!, hinges[2]!), 9);
      // The outer hinges stay put: they are on the supports.
      expect(dist(applyXf(m[0]!, hinges[0]!), hinges[0]!)).toBeLessThan(1e-9);
      expect(dist(applyXf(m[2]!, hinges[3]!), hinges[3]!)).toBeLessThan(1e-9);
    }
  });

  it('turns the first bar clockwise for sense +1', () => {
    const m = mechanism(hinges, 1, 0.05)!;
    expect(m[0]!.angle).toBeLessThan(0);
    // Clockwise about the left springing moves the left haunch hinge outward and up or in and down:
    // either way the crown bar must move, not stay.
    expect(dist(applyXf(m[1]!, { x: 0, y: 5 }), { x: 0, y: 5 })).toBeGreaterThan(1e-3);
  });

  it('three hinges: the last one slides along its bed', () => {
    const three = [hinges[0]!, { x: 0, y: 5 }, hinges[3]!];
    const m = mechanism(three, -1, 0.04)!;
    expect(m).toHaveLength(2);
    const end = applyXf(m[1]!, three[2]!);
    expect(end.y).toBeCloseTo(three[2]!.y, 9);
    expect(dist(applyXf(m[0]!, three[1]!), applyXf(m[1]!, three[1]!))).toBeLessThan(1e-9);
  });

  it('returns null once the linkage locks', () => {
    expect(mechanism(hinges, 1, 3)).toBeNull();
  });
});
