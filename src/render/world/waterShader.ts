/**
 * River surface. Flow-mapped ripples carried along the channel, Fresnel between a planar
 * reflection (or the sky on low) and a depth-tinted body, foam at the banks and around the
 * piers, silt for floods, ripple rings from splashes, the bridge's shadow, and the afflux heap
 * upstream of the bridge. Output is premultiplied so the river bed shows through shallow water.
 */
import { HAZE_FUNCTION } from './haze';

export const MAX_RIPPLES = 8;

export const WATER_VERTEX = /* glsl */ `
#include <common>
#include <shadowmap_pars_vertex>
attribute float aU;
attribute float aBase;
attribute vec2 aFlow;
uniform float uLevel;
uniform float uHeap;
uniform float uHalfW;
uniform float uHeapLen;
varying vec3 vW;
varying float vU;
varying vec2 vFlow;
varying vec3 vViewPos;
void main() {
  vec3 p = position;
  // Afflux: the water stands higher upstream of the bridge and eases back to normal far upstream.
  float up = smoothstep(-uHalfW, uHalfW + 2.0, p.z) * exp(-max(p.z - uHalfW - 2.0, 0.0) / uHeapLen);
  p.y = uLevel + aBase + uHeap * up;
  vec4 worldPosition = modelMatrix * vec4(p, 1.0);
  vW = worldPosition.xyz;
  vU = aU;
  vFlow = aFlow;
  vec4 mvPosition = viewMatrix * worldPosition;
  vViewPos = mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
  #include <shadowmap_vertex>
}
`;

export const WATER_FRAGMENT = /* glsl */ `
#include <common>
#include <packing>
#include <shadowmap_pars_fragment>
uniform float uTime;
uniform float uSpeed;
uniform float uTurb;
uniform float uRough;
uniform float uHeap;
uniform sampler2D uWaves;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSilt;
uniform float uAbsorb;
uniform vec3 uSunDir;
uniform vec3 uSunLight;
uniform vec3 uBodyLight;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform sampler2D uReflection;
uniform float uReflOn;
uniform mat4 uTexMatrix;
uniform sampler2D uBed;
uniform vec4 uBedXf;
uniform sampler2D uFoamTex;
uniform vec4 uFoamXf;
uniform float uFoamOn;
uniform sampler2D uScour;
uniform vec4 uRipples[${MAX_RIPPLES}];
uniform float uDaylight;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
varying vec3 vW;
varying float vU;
varying vec2 vFlow;
varying vec3 vViewPos;

${HAZE_FUNCTION}

float waterShadow() {
  float s = 1.0;
  #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
    DirectionalLightShadow ds = directionalLightShadows[ 0 ];
    s = getShadow( directionalShadowMap[ 0 ], ds.shadowMapSize, ds.shadowIntensity, ds.shadowBias, ds.shadowRadius, vDirectionalShadowCoord[ 0 ] );
  #endif
  return s;
}

void main() {
  // Depth from the baked river bed, plus scour holes at the piers.
  vec2 bedUv = vec2((vU - uBedXf.x) * uBedXf.y, 0.5 + 0.5 * asinh(vW.z / uBedXf.z) * uBedXf.w);
  float bed = texture2D(uBed, bedUv).r;
  vec4 fb = vec4(0.0);
  vec2 fuv = vec2((vW.x - uFoamXf.x) * uFoamXf.y, (vW.z - uFoamXf.z) * uFoamXf.w);
  if (uFoamOn > 0.5 && fuv.x > 0.0 && fuv.x < 1.0 && fuv.y > 0.0 && fuv.y < 1.0) fb = texture2D(uFoamTex, fuv);
  float scour = texture2D(uScour, vec2(fb.b * (255.0 / 256.0) + 0.5 / 256.0, 0.5)).r * fb.g;
  float depth = max(vW.y - bed, 0.0);
  float seen = depth + scour;

  float dist = length(vViewPos);
  float spd = uSpeed * (0.3 + 0.7 * smoothstep(0.0, 1.5, depth));
  vec2 flow = vFlow * spd;

  // Two-phase flow map: two copies of the ripples slide with the current and cross-fade.
  float cyc = 2.0;
  float ph0 = fract(uTime / cyc);
  float ph1 = fract(uTime / cyc + 0.5);
  float w0 = 1.0 - abs(2.0 * ph0 - 1.0);
  vec2 uvA = vW.xz / 9.0;
  vec2 uvB = vW.xz / 2.6;
  vec4 a0 = texture2D(uWaves, uvA - flow * ph0 * cyc / 9.0);
  vec4 a1 = texture2D(uWaves, uvA - flow * ph1 * cyc / 9.0 + 0.37);
  vec4 b0 = texture2D(uWaves, uvB - flow * ph0 * cyc / 2.6 + vec2(uTime * 0.013, 0.0));
  vec4 b1 = texture2D(uWaves, uvB - flow * ph1 * cyc / 2.6 + 0.61);
  vec4 wa = mix(a1, a0, w0);
  vec4 wb = mix(b1, b0, w0);
  float far = 1.0 / (1.0 + dist / 220.0);
  float ampA = (0.05 + 0.22 * uRough + 0.02 * spd) * far;
  float ampB = (0.035 + 0.12 * uRough) * far;
  vec2 slope = (wa.rg - 0.5) * 2.0 * ampA + (wb.rg - 0.5) * 2.0 * ampB;

  // Ripple rings from splashes.
  float ringFoam = 0.0;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 r = uRipples[i];
    float age = uTime - r.z;
    if (r.w <= 0.0 || age < 0.0 || age > 6.0) continue;
    vec2 d = vW.xz - r.xy;
    float rd = length(d);
    float radius = age * (1.2 + r.w * 0.6);
    float x = (rd - radius) / (0.3 + r.w * 0.15);
    float fade = exp(-age * 0.9) * min(r.w, 3.0);
    float wave = -x * exp(-x * x) * fade * 0.35;
    slope += (rd > 1e-3 ? d / rd : vec2(0.0)) * wave;
    ringFoam += exp(-x * x) * fade * 0.3 * smoothstep(1.5, 0.0, age);
  }

  vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));
  vec3 V = normalize(cameraPosition - vW);
  float NdV = max(dot(N, V), 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
  // Silt and broken water scatter the mirror away: a flood shows a dull, torn reflection.
  F *= (1.0 - uTurb * 0.35) * (1.0 - uRough * 0.5);

  vec3 R = reflect(-V, N);
  vec3 refl = mix(uHorizon, uZenith, smoothstep(0.0, 0.45, R.y));
  if (uReflOn > 0.5) {
    vec4 c = uTexMatrix * vec4(vW, 1.0);
    vec2 base = c.xy / c.w;
    // The ripples' offset shrinks towards the edges of the mirror image: pushed past them it would
    // read the clamped border texels and smear them into long streaks.
    float room = clamp(min(min(base.x, 1.0 - base.x), min(base.y, 1.0 - base.y)) * 8.0, 0.0, 1.0);
    vec2 ruv = base + N.xz * (0.035 + 0.3 * uRough) * far * room;
    float inside = smoothstep(0.0, 0.04, ruv.x) * smoothstep(1.0, 0.96, ruv.x) * smoothstep(0.0, 0.05, ruv.y) * smoothstep(1.0, 0.95, ruv.y);
    refl = mix(refl, texture2D(uReflection, clamp(ruv, 0.002, 0.998)).rgb, inside);
  }

  float shadow = waterShadow();
  vec3 H = normalize(V + uSunDir);
  float nh = max(dot(N, H), 0.0);
  vec3 spec = uSunLight * shadow * (pow(nh, 900.0) * (uReflOn > 0.5 ? 6.0 : 30.0) + pow(nh, 90.0) * 0.12) * (1.0 - uTurb * 0.6);

  // Body: absorption along the light's way down to the bed and the view ray's way back up, silt
  // in a flood, lit by sky and sun (shaded under the bridge).
  float absorb = uAbsorb * (1.0 + uTurb * 7.0);
  float path = seen * (1.0 / max(V.y, 0.12) + 1.0);
  float T = exp(-path * absorb);
  vec3 body = mix(uShallow, uDeep, 1.0 - exp(-path * absorb * 0.35));
  body = mix(body, uSilt * (0.85 + 0.3 * wa.b), uTurb);
  body *= uBodyLight * mix(0.55, 1.0, shadow);

  // Foam: banks, piers (bow wave, collar, wake), rough water in flood, ripple rings.
  float fA = texture2D(uWaves, uvA * 2.3 - flow * ph0 * cyc / 4.0).a;
  float fB = texture2D(uWaves, uvA * 2.3 - flow * ph1 * cyc / 4.0 + 0.5).a;
  float fn = mix(fB, fA, w0);
  float shore = 1.0 - smoothstep(0.0, 0.12 + 0.45 * uRough + 0.3 * uTurb, depth);
  float pierFoam = fb.r * (0.3 + 0.3 * clamp(uSpeed / 2.5, 0.0, 1.0) + 0.35 * uRough + 0.5 * min(uHeap, 1.0));
  float streaks = uRough * 0.35 * smoothstep(0.55, 0.85, wa.a);
  // Shore foam stays broken and faint: a solid white rim reads as a drawn outline. The amount
  // is capped below 1 so even the bow wave of a pier in flood stays torn, never a white sheet.
  float amount = min(shore * (0.22 + 0.3 * uRough) * smoothstep(0.35, 0.75, wb.a) + pierFoam + streaks + ringFoam, 0.8);
  float foam = smoothstep(1.0 - amount, 1.0 - amount + 0.22, fn) * amount;
  vec3 foamCol = vec3(0.86, 0.87, 0.84) * mix(vec3(1.0), uSilt * 2.2, uTurb * 0.45) * uBodyLight * mix(0.6, 1.0, shadow) * 1.25;

  float opaque = 1.0 - T;
  vec3 col = body * opaque * (1.0 - F) + refl * F + spec;
  float alpha = opaque * (1.0 - F) + F;
  col = mix(col, foamCol, foam);
  alpha = mix(alpha, 1.0, foam);
  float edge = smoothstep(0.0, 0.06, depth);
  col *= edge;
  alpha *= edge;

  float haze = kemerHaze(vViewPos, fogNear, fogFar, cameraPosition.y);
  col = mix(col, fogColor * alpha, haze);
  gl_FragColor = vec4(col, alpha);
}
`;
