/**
 * Plant shading injected into MeshStandardMaterial (and the matching shadow depth material):
 * slow life cycles (saplings grow, old trees die and are replaced), wind, season colour,
 * leaves that fall card by card in autumn and return in spring, blossom, and snow on top.
 */

export const PLANT_VERTEX_PARS = /* glsl */ `
attribute float aKind;
attribute float aAO;
attribute float aFlex;
attribute float aRand;
attribute float aSeed;
attribute vec2 aLife;
uniform float uTime;
uniform float uYear;
uniform float uWind;
uniform float uGap;
varying float vKind;
varying float vAO;
varying float vRand;
varying float vSeed;
varying float vKUp;
`;

export const PLANT_VERTEX = /* glsl */ `
{
  #ifdef USE_INSTANCING
    vec3 kOrigin = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  #else
    vec3 kOrigin = vec3(0.0);
  #endif
  // Life: grow from a sapling over the first third of the span, die, leave a gap, start again.
  float kCycle = aLife.y + uGap;
  float kA = mod(uYear - aLife.x, kCycle);
  float kGrow = smoothstep(0.0, aLife.y * 0.3, kA);
  float kAlive = 1.0 - smoothstep(aLife.y - 3.0, aLife.y, kA);
  transformed *= mix(0.3, 1.0, kGrow) * kAlive;
  float kPh = uTime * (1.05 + aSeed * 0.4) + aSeed * 6.2831 + kOrigin.x * 0.07 + kOrigin.z * 0.05;
  float kSway = aFlex * uWind;
  transformed.x += (sin(kPh) * 0.6 + sin(kPh * 2.3 + 1.0) * 0.25) * kSway * 0.3;
  transformed.z += cos(kPh * 0.8) * 0.4 * kSway * 0.22;
  if (aKind > 0.5 && aKind < 1.5) transformed.y += sin(uTime * 6.0 + aRand * 40.0) * 0.03 * kSway;
  vKind = aKind;
  vAO = aAO;
  vRand = aRand;
  vSeed = aSeed;
  vKUp = normal.y;
}
`;

export const PLANT_FRAGMENT_PARS = /* glsl */ `
varying float vKind;
varying float vAO;
varying float vRand;
varying float vSeed;
varying float vKUp;
uniform vec3 uLeafSpring;
uniform vec3 uLeafSummer;
uniform vec3 uLeafAutumn;
uniform vec3 uBark;
uniform vec3 uBlossom;
uniform vec3 uReedGreen;
uniform vec3 uReedStraw;
uniform vec3 uRockA;
uniform vec3 uRockB;
uniform float uLeaf;
uniform float uAutumn;
uniform float uSpringW;
uniform float uBloom;
uniform float uSnow;
uniform float uStraw;
uniform float uEvergreen;
uniform float uLeafNorm;
uniform float uMapSize;
`;

/** Leaf cards drop out one by one as the leaf amount falls; mips must not thin distant crowns. */
export const PLANT_ALPHA = /* glsl */ `
if (vKind > 0.5 && vKind < 1.5) {
  float kLeaf = uEvergreen > 0.5 ? 1.0 : uLeaf;
  // Each patch of cards has its own moment to fall: gone outright below it (the mip boost
  // must not bring it back), thinning just above it.
  float kKeep = smoothstep(vRand * 0.85, vRand * 0.85 + 0.15, kLeaf);
  if (kKeep <= 0.0) discard;
  // A lowish cut keeps the crown a closed mass of leaves; the mip boost keeps it closed as the
  // texture's alpha averages out with distance (no alpha-to-coverage without multisampling).
  float kThr = mix(0.98, 0.36, kKeep);
  #ifdef USE_MAP
    float kMip = max(0.0, log2(max(length(dFdx(vMapUv)), length(dFdy(vMapUv))) * uMapSize));
  #else
    float kMip = 0.0;
  #endif
  if (diffuseColor.a * (1.0 + kMip * 0.45) < kThr) discard;
}
`;

export const PLANT_COLOR = /* glsl */ `
{
  #ifdef USE_MAP
    vec4 kTex = texture2D(map, vMapUv);
  #else
    vec4 kTex = vec4(1.0);
  #endif
  vec3 kCol;
  float kAlpha = 1.0;
  if (vKind < 0.5) {
    kCol = uBark * (0.75 + 0.5 * vRand);
  } else if (vKind < 1.5) {
    float aut = clamp(uAutumn * (0.55 + 0.9 * vRand) * (1.0 - uEvergreen), 0.0, 1.0);
    kCol = mix(uLeafSummer, uLeafAutumn, aut);
    kCol = mix(kCol, uLeafSpring, uSpringW * (1.0 - uEvergreen * 0.6));
    // Blossom as a pale veil over the crown, thicker in patches, never a field of white cards.
    kCol = mix(kCol, uBlossom, uBloom * 0.75 * smoothstep(0.15, 0.6, vRand));
    // The leaf picture at part strength: single leaves must not each catch the eye.
    vec3 kLeafTex = mix(vec3(1.0), kTex.rgb * uLeafNorm, 0.55);
    kCol *= kLeafTex * (0.86 + 0.28 * vSeed);
    kAlpha = kTex.a;
  } else if (vKind < 2.5) {
    kCol = mix(uReedGreen, uReedStraw, clamp(uStraw * (0.7 + 0.6 * vRand), 0.0, 1.0)) * (0.8 + 0.4 * vRand);
  } else {
    kCol = mix(uRockB, uRockA, vRand) * (0.85 + 0.3 * vSeed);
  }
  kCol *= vAO;
  float kSnow = uSnow * smoothstep(0.15, 0.8, vKUp) * ((vKind > 0.5 && vKind < 1.5) ? (uEvergreen > 0.5 ? 0.85 : 0.5) : 0.9);
  kCol = mix(kCol, vec3(0.86, 0.89, 0.93), kSnow);
  diffuseColor.rgb *= kCol;
  diffuseColor.a *= kAlpha;
}
`;

export const PLANT_ROUGHNESS = /* glsl */ `
float roughnessFactor = (vKind > 0.5 && vKind < 1.5) ? 0.8 : 0.92;
`;

/** Leaf and blade normals point out of the crown on both faces (no back-face flip). */
export const PLANT_NORMAL = /* glsl */ `
if (vKind > 0.5 && vKind < 2.5) normal = normalize(vNormal);
`;
