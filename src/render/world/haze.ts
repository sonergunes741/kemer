/**
 * Aerial perspective for every material in the scene, the bridge's included: exponential height
 * fog integrated along the view ray, so the valley floor is hazier than the ridges and distant
 * hills fall back in layers of air.
 *
 * three.js only feeds a fog colour and two numbers to its materials, so the world re-purposes a
 * `THREE.Fog`: `near` carries the haze density at the water level (1/m) and `far` the height
 * falloff (1/m). The fog chunks are patched once, globally, to read them that way. Materials with
 * `fog: false` are untouched; FogExp2 keeps its stock behaviour.
 */
import { ShaderChunk } from 'three';

const FOG_PARS_VERTEX = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogView;
#endif
`;

const FOG_VERTEX = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogView = mvPosition.xyz;
#endif
`;

const FOG_PARS_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogView;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif
`;

/** The fog amount along a view-space ray; shared with the water shader. */
export const HAZE_FUNCTION = /* glsl */ `
float kemerHaze(vec3 viewPos, float density, float falloff, float camY) {
  float dist = length(viewPos);
  // View space to world space for a direction: the transpose of the view rotation.
  vec3 dirW = normalize((vec4(viewPos, 0.0) * viewMatrix).xyz);
  float k = max(falloff, 1e-5);
  float x = k * dirW.y * dist;
  float shape = abs(x) > 1e-3 ? (1.0 - exp(-x)) / x : 1.0 - 0.5 * x;
  float amount = density * exp(-k * camY) * dist * shape;
  // A thin layer that does not thin with height keeps far ridges from ever turning crisp.
  amount += density * 0.06 * dist;
  return 1.0 - exp(-amount);
}
`;

const FOG_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = kemerHaze(vFogView, fogNear, fogFar, cameraPosition.y);
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`;

let installed = false;

/** Patch the fog chunks (idempotent). Must run before any material compiles. */
export function installHaze(): void {
  if (installed) return;
  installed = true;
  const chunks = ShaderChunk as unknown as Record<string, string>;
  chunks['fog_pars_vertex'] = FOG_PARS_VERTEX;
  chunks['fog_vertex'] = FOG_VERTEX;
  chunks['fog_pars_fragment'] = `${FOG_PARS_FRAGMENT}\n#ifdef USE_FOG\n#ifndef FOG_EXP2\n${HAZE_FUNCTION}\n#endif\n#endif\n`;
  chunks['fog_fragment'] = FOG_FRAGMENT;
}
