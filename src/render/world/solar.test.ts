import { describe, expect, it } from 'vitest';
import { DEG2RAD } from '../../core/math';
import { celestialPole, dayAverage, declination, noonElevation, sunDirection } from './solar';

describe('solar', () => {
  it('declination peaks near the solstices', () => {
    expect(declination(172 / 365) / DEG2RAD).toBeCloseTo(23.44, 0);
    expect(declination(355 / 365) / DEG2RAD).toBeCloseTo(-23.44, 0);
    expect(Math.abs(declination(80 / 365))).toBeLessThan(0.02);
  });

  it('the noon sun stands due south (+Z) at 90 - lat + decl', () => {
    const lat = 39;
    const d = declination(0.47);
    const s = sunDirection(lat, d, 12);
    expect(Math.abs(s.x)).toBeLessThan(1e-9);
    expect(s.z).toBeGreaterThan(0);
    expect(Math.asin(s.y)).toBeCloseTo(noonElevation(lat, d), 6);
    expect(Math.hypot(s.x, s.y, s.z)).toBeCloseTo(1, 9);
  });

  it('the morning sun is in the east (-X), the evening sun in the west (+X)', () => {
    expect(sunDirection(39, 0, 8).x).toBeLessThan(0);
    expect(sunDirection(39, 0, 16).x).toBeGreaterThan(0);
    expect(sunDirection(39, 0, 0).y).toBeLessThan(0);
  });

  it('the pole stands north (-Z) at the latitude, and the sun circles it', () => {
    const lat = 41;
    const p = celestialPole(lat);
    expect(Math.asin(p.y) / DEG2RAD).toBeCloseTo(lat, 6);
    expect(p.z).toBeLessThan(0);
    // Every hour of a day keeps the same angle to the pole: 90 degrees minus the declination.
    const d = declination(0.3);
    for (const hour of [6, 9, 12, 15, 18]) {
      const s = sunDirection(lat, d, hour);
      expect(Math.acos(s.x * p.x + s.y * p.y + s.z * p.z)).toBeCloseTo(Math.PI / 2 - d, 6);
    }
  });

  it('the compass turns sun and pole together', () => {
    const a = sunDirection(39, 0.2, 10, 0.3);
    const b = sunDirection(39, 0.2, 10, 0);
    expect(a.y).toBeCloseTo(b.y, 9);
    expect(Math.hypot(a.x, a.z)).toBeCloseTo(Math.hypot(b.x, b.z), 9);
  });

  it('the day average is a high southern light weaker than noon', () => {
    const avg = dayAverage(39, declination(0.5));
    expect(avg.dir.y).toBeGreaterThan(0.5);
    expect(avg.dir.z).toBeGreaterThan(0);
    expect(avg.strength).toBeGreaterThan(0.2);
    expect(avg.strength).toBeLessThan(1);
  });
});
