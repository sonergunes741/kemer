/**
 * The Preetham daylight model on the CPU, matching sky.ts line for line. The renderer uses it to
 * colour the sun light, the haze and the ambient so that the ground always agrees with the sky.
 * Pure maths; colours are linear RGB triples.
 */
import { clamp } from '../../core/math';
import type { Dir3 } from './solar';

export type Rgb = [number, number, number];

export interface SkyParams {
  readonly turbidity: number;
  readonly rayleigh: number;
  readonly mie: number;
  readonly mieG: number;
}

export interface SkyState {
  readonly sun: Dir3;
  readonly betaR: Rgb;
  readonly betaM: Rgb;
  readonly sunE: number;
  readonly sunfade: number;
}

const TOTAL_RAYLEIGH: Rgb = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const MIE_CONST: Rgb = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
const CUTOFF = 1.6110731556870734;
const STEEPNESS = 1.5;
const EE = 1000;
const RAYLEIGH_ZENITH = 8.4e3;
const MIE_ZENITH = 1.25e3;

export function skyState(params: SkyParams, sun: Dir3): SkyState {
  const cosZ = clamp(sun.y, -1, 1);
  const sunE = EE * Math.max(0, 1 - Math.exp(-((CUTOFF - Math.acos(cosZ)) / STEEPNESS)));
  // After sunset the Rayleigh part fades, which reddens and darkens the dusk sky.
  const sunfade = sun.y >= 0 ? 1 : Math.exp(sun.y * 0.889 * 3);
  const rc = params.rayleigh - (1 - sunfade);
  const c = 0.2 * params.turbidity * 1e-17;
  return {
    sun,
    betaR: [TOTAL_RAYLEIGH[0] * rc, TOTAL_RAYLEIGH[1] * rc, TOTAL_RAYLEIGH[2] * rc],
    betaM: [0.434 * c * MIE_CONST[0] * params.mie, 0.434 * c * MIE_CONST[1] * params.mie, 0.434 * c * MIE_CONST[2] * params.mie],
    sunE,
    sunfade,
  };
}

/** Optical air mass along a direction (the zenith is 1). */
function airMass(dirY: number): number {
  const zen = Math.acos(Math.max(0, dirY));
  return 1 / (Math.cos(zen) + 0.15 * Math.pow(Math.max(1e-3, 93.885 - (zen * 180) / Math.PI), -1.253));
}

/** Transmittance of the atmosphere along a direction: the colour of the sun seen that way. */
export function extinction(state: SkyState, dirY: number, out: Rgb = [0, 0, 0]): Rgb {
  const m = airMass(dirY);
  for (let i = 0; i < 3; i++) out[i] = Math.exp(-(state.betaR[i]! * RAYLEIGH_ZENITH + state.betaM[i]! * MIE_ZENITH) * m);
  return out;
}

function hg(cosTheta: number, g: number): number {
  const g2 = g * g;
  return (1 / (4 * Math.PI)) * ((1 - g2) / Math.pow(1 - 2 * g * cosTheta + g2, 1.5));
}

/** Sky radiance (no sun disc, no clouds) in a direction, in the units sky.ts writes. */
export function skyRadiance(state: SkyState, params: SkyParams, dir: Dir3, out: Rgb = [0, 0, 0]): Rgb {
  const fex = extinction(state, dir.y);
  const cosTheta = dir.x * state.sun.x + dir.y * state.sun.y + dir.z * state.sun.z;
  const rPhase = (3 / (16 * Math.PI)) * (1 + Math.pow(cosTheta * 0.5 + 0.5, 2));
  const mPhase = hg(cosTheta, params.mieG);
  const horizonMix = clamp(Math.pow(1 - state.sun.y, 5), 0, 1);
  const gamma = 1 / (1.2 + 1.2 * state.sunfade);
  for (let i = 0; i < 3; i++) {
    const bR = state.betaR[i]!;
    const bM = state.betaM[i]!;
    const ratio = (bR * rPhase + bM * mPhase) / (bR + bM);
    let lin = Math.pow(state.sunE * ratio * (1 - fex[i]!), 1.5);
    lin *= 1 + (Math.pow(state.sunE * ratio * fex[i]!, 0.5) - 1) * horizonMix;
    const l0 = 0.1 * fex[i]!;
    const tex = (lin + l0) * 0.04 + (i === 0 ? 0 : i === 1 ? 0.0003 : 0.00075);
    out[i] = Math.pow(tex, gamma);
  }
  return out;
}
