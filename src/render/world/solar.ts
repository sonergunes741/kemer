/**
 * Where the sun is. Pure maths, no three.js, so it can be tested.
 *
 * Compass: east is -X (the left bank in the elevation view), west is +X, south is +Z (towards
 * the default camera, so the upstream face is lit at midday), north is -Z. A per-site rotation
 * about Y turns the compass a little so not every valley is lit the same way.
 */
import { DEG2RAD, TAU } from '../../core/math';

export interface Dir3 {
  x: number;
  y: number;
  z: number;
}

/** Solar declination (radians) for a position in the year (0 = 1 January). */
export function declination(season: number): number {
  const day = (((season % 1) + 1) % 1) * 365;
  return 23.44 * DEG2RAD * Math.sin((TAU * (day - 81)) / 365);
}

/** Rotate a direction about +Y by `angle` radians (in place). */
function rotateY(d: Dir3, angle: number): Dir3 {
  if (angle === 0) return d;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const x = d.x * c + d.z * s;
  const z = -d.x * s + d.z * c;
  d.x = x;
  d.z = z;
  return d;
}

/**
 * Unit vector towards the sun in world space for a latitude (degrees), a declination (radians)
 * and a local solar hour (0..24). y < 0 means the sun is below the horizon.
 */
export function sunDirection(latitude: number, decl: number, hour: number, compass = 0, out: Dir3 = { x: 0, y: 0, z: 0 }): Dir3 {
  const phi = latitude * DEG2RAD;
  const h = ((hour - 12) / 24) * TAU;
  const cd = Math.cos(decl);
  const sd = Math.sin(decl);
  const east = -cd * Math.sin(h);
  const north = sd * Math.cos(phi) - cd * Math.cos(h) * Math.sin(phi);
  const up = sd * Math.sin(phi) + cd * Math.cos(h) * Math.cos(phi);
  out.x = -east;
  out.y = up;
  out.z = -north;
  return rotateY(out, compass);
}

/** Unit vector to the north celestial pole: the axis the sun's daily circle turns about. */
export function celestialPole(latitude: number, compass = 0, out: Dir3 = { x: 0, y: 0, z: 0 }): Dir3 {
  const phi = latitude * DEG2RAD;
  out.x = 0;
  out.y = Math.sin(phi);
  out.z = -Math.cos(phi);
  return rotateY(out, compass);
}

/** Sun elevation above the horizon at local noon, radians. */
export function noonElevation(latitude: number, decl: number): number {
  return Math.PI / 2 - Math.abs(latitude * DEG2RAD - decl);
}

/**
 * The light of a whole day folded into one direction: the irradiance-weighted mean of the sun's
 * path, used when time runs so fast that single days blur (WorldTime.lapse = 1). Also returns
 * the share of the noon irradiance that the day delivers on average.
 */
export function dayAverage(latitude: number, decl: number, compass = 0, out: Dir3 = { x: 0, y: 0, z: 0 }): { dir: Dir3; strength: number } {
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let sum = 0;
  const tmp: Dir3 = { x: 0, y: 0, z: 0 };
  const steps = 24;
  for (let i = 0; i < steps; i++) {
    const hour = 4 + (16 * (i + 0.5)) / steps;
    sunDirection(latitude, decl, hour, compass, tmp);
    const w = Math.max(0, tmp.y);
    sx += tmp.x * w;
    sy += tmp.y * w;
    sz += tmp.z * w;
    sum += w;
  }
  const len = Math.hypot(sx, sy, sz) || 1;
  out.x = sx / len;
  out.y = sy / len;
  out.z = sz / len;
  const noon = Math.max(1e-3, Math.sin(noonElevation(latitude, decl)));
  return { dir: out, strength: sum / steps / noon };
}
