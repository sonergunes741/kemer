/**
 * GLSL for the stone field, patched into MeshStandardMaterial (and the depth material) through
 * onBeforeCompile. Each vertex carries its stone's index; the stone's transform (pivot and scale,
 * rotation, offset and a dirt value) is read from a float texture, so laying, settling, cracking
 * and the collapse are only texture writes.
 *
 * The surface is the level's stone texture box-mapped in the stone's own frame with a random
 * offset per stone, so no two stones show the same patch and the pattern moves with the stone.
 * On top: a per-stone tint, darkened joints, moss creeping up from the waterline and on shaded
 * faces, a wet band at the water, snow on top faces and the patina of age.
 */

export const XF_PARS = /* glsl */ `
attribute float aStone;
attribute float aJoint;
uniform highp sampler2D uXf;
uniform int uXfCols;
varying vec3 vLocal;
varying vec3 vRestN;
varying vec3 vKWorld;
varying vec3 vKWorldN;
varying float vStone;
varying float vJoint;
varying float vDirt;
varying vec3 vAx;
varying vec3 vAy;
varying vec3 vAz;
void kemerXf(float sid, out vec4 t0, out vec4 t1, out vec4 t2) {
  int id = int(sid + 0.5);
  int col = (id - (id / uXfCols) * uXfCols) * 3;
  int row = id / uXfCols;
  t0 = texelFetch(uXf, ivec2(col, row), 0);
  t1 = texelFetch(uXf, ivec2(col + 1, row), 0);
  t2 = texelFetch(uXf, ivec2(col + 2, row), 0);
}
vec3 kemerRot(vec4 q, vec3 v) {
  return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}
`;

/** Only what the depth pass needs. */
export const XF_PARS_DEPTH = /* glsl */ `
attribute float aStone;
uniform highp sampler2D uXf;
uniform int uXfCols;
void kemerXf(float sid, out vec4 t0, out vec4 t1, out vec4 t2) {
  int id = int(sid + 0.5);
  int col = (id - (id / uXfCols) * uXfCols) * 3;
  int row = id / uXfCols;
  t0 = texelFetch(uXf, ivec2(col, row), 0);
  t1 = texelFetch(uXf, ivec2(col + 1, row), 0);
  t2 = texelFetch(uXf, ivec2(col + 2, row), 0);
}
vec3 kemerRot(vec4 q, vec3 v) {
  return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}
`;

export const XF_BEGINNORMAL = /* glsl */ `
vec4 kx0; vec4 kx1; vec4 kx2;
kemerXf(aStone, kx0, kx1, kx2);
vec3 objectNormal = kemerRot(kx1, vec3(normal));
#ifdef USE_TANGENT
  vec3 objectTangent = vec3(tangent.xyz);
#endif
`;

export const XF_BEGIN = /* glsl */ `
vec3 transformed = kx0.xyz + kx2.xyz + kemerRot(kx1, (position - kx0.xyz) * kx0.w);
#ifdef KEMER_WORLD_UV
  vLocal = position;
#else
  vLocal = position - kx0.xyz;
#endif
vRestN = vec3(normal);
vStone = aStone;
vJoint = aJoint;
vDirt = kx2.w;
vAx = normalize(normalMatrix * kemerRot(kx1, vec3(1.0, 0.0, 0.0)));
vAy = normalize(normalMatrix * kemerRot(kx1, vec3(0.0, 1.0, 0.0)));
vAz = normalize(normalMatrix * kemerRot(kx1, vec3(0.0, 0.0, 1.0)));
`;

export const XF_BEGIN_DEPTH = /* glsl */ `
vec4 kx0; vec4 kx1; vec4 kx2;
kemerXf(aStone, kx0, kx1, kx2);
vec3 transformed = kx0.xyz + kx2.xyz + kemerRot(kx1, (position - kx0.xyz) * kx0.w);
`;

export const XF_WORLDPOS = /* glsl */ `
#include <worldpos_vertex>
vKWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
vKWorldN = normalize(mat3(modelMatrix) * objectNormal);
`;

export const SURFACE_PARS = /* glsl */ `
uniform sampler2D uColorMap;
uniform sampler2D uNormalMap;
uniform sampler2D uArmMap;
uniform sampler2D uMossMap;
uniform float uHasMap;
uniform float uHasMoss;
uniform float uTile;
uniform float uMoss;
uniform float uPatina;
uniform float uSnow;
uniform float uWater;
uniform float uWaterRough;
uniform float uFloodLine;
uniform float uJoint;
uniform float uNormalScale;
uniform vec2 uHover;
uniform vec3 uSunDir;
uniform vec3 uMossColor;
uniform float uHalfWidth;
uniform sampler2D uWipe;
uniform vec4 uWipeBox;
uniform float uOvergrowth;
varying vec3 vLocal;
varying vec3 vRestN;
varying vec3 vKWorld;
varying vec3 vKWorldN;
varying float vStone;
varying float vJoint;
varying float vDirt;
varying vec3 vAx;
varying vec3 vAy;
varying vec3 vAz;
float kHash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
float kHash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float kNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(kHash3(i), kHash3(i + vec3(1, 0, 0)), f.x), mix(kHash3(i + vec3(0, 1, 0)), kHash3(i + vec3(1, 1, 0)), f.x), f.y);
  float b = mix(mix(kHash3(i + vec3(0, 0, 1)), kHash3(i + vec3(1, 0, 1)), f.x), mix(kHash3(i + vec3(0, 1, 1)), kHash3(i + vec3(1, 1, 1)), f.x), f.y);
  return mix(a, b, f.z);
}
`;

/** Base colour, ARM and every weathering layer; runs in place of <map_fragment>. */
export const SURFACE_MAP = /* glsl */ `
float kh1 = kHash(vStone * 1.37 + 0.51);
float kh2 = kHash(vStone * 2.71 + 3.13);
float kh3 = kHash(vStone * 0.93 + 7.77);
#ifdef KEMER_WORLD_UV
  vec3 kp = vLocal * uTile;
  vec3 kOff = vec3(0.0);
#else
  vec3 kp = vLocal * uTile * (0.92 + 0.16 * kh3);
  vec3 kOff = vec3(kh1, kh2, kh3) * 9.0;
#endif
vec3 kw = pow(abs(normalize(vRestN)), vec3(5.0));
kw /= max(1e-4, kw.x + kw.y + kw.z);
vec2 kuvX = kp.zy + kOff.xy;
vec2 kuvY = kp.xz + kOff.yz;
vec2 kuvZ = kp.xy + kOff.zx;
vec3 kCol = vec3(1.0);
vec3 kArm = vec3(1.0, 1.0, 0.0);
if (uHasMap > 0.5) {
  kCol = texture2D(uColorMap, kuvX).rgb * kw.x + texture2D(uColorMap, kuvY).rgb * kw.y + texture2D(uColorMap, kuvZ).rgb * kw.z;
  kArm = texture2D(uArmMap, kuvX).rgb * kw.x + texture2D(uArmMap, kuvY).rgb * kw.y + texture2D(uArmMap, kuvZ).rgb * kw.z;
} else {
  float g = kNoise(kp * 9.0 + kOff) * 0.6 + kNoise(kp * 31.0 + kOff) * 0.4;
  kCol = vec3(0.86 + 0.24 * g);
  kArm = vec3(0.9 + 0.1 * g, 0.85, 0.0);
}
#ifdef KEMER_WORLD_UV
  vec3 kTint = vec3(1.0);
#else
  // Every stone a little different: lighter or darker, warmer or cooler, now and then one from
  // another bed of the quarry.
  float kOdd = step(0.86, kh3);
  vec3 kTint = (0.8 + 0.36 * kh1) * vec3(1.0 + (kh2 - 0.5) * 0.12, 1.0, 1.0 - (kh2 - 0.5) * 0.14);
  kTint *= mix(vec3(1.0), vec3(0.88, 0.86, 0.84), kOdd);
#endif
vec3 kBase = diffuseColor.rgb * kCol * kTint;
#ifndef KEMER_WORLD_UV
  // A stone weathers unevenly: a soft gradient across each face, and broad mottling over the
  // whole bridge, so no two blocks and no two stretches of wall read the same.
  vec3 kDir = normalize(vec3(kh2 - 0.5, kh3 - 0.5, kh1 - 0.5) + 1e-3);
  kBase *= 1.0 + 0.16 * clamp(dot(kDir, vLocal) / 0.45, -1.0, 1.0);
#endif
float kMott = kNoise(vKWorld * 0.23 + 11.0) * 0.6 + kNoise(vKWorld * 0.71 + 5.0) * 0.4;
kBase *= 0.9 + 0.2 * kMott;
kBase = mix(kBase, kBase * vec3(1.03, 0.99, 0.95), smoothstep(0.4, 0.8, kMott));
float kRough = 1.0;

float kN1 = kNoise(vKWorld * 1.3);
float kN2 = kNoise(vKWorld * 5.1 + 3.7);
float kN3 = kNoise(vKWorld * 17.0 + 1.3);

// Joints: every bevel is a little darker than the face, darkest down in the joint, and more so
// as the mortar wastes away.
float kBevel = smoothstep(0.2, 0.45, vJoint);
float kDeep = clamp(vJoint * 2.0 - 1.0, 0.0, 1.0) * kBevel;
float kJoint = clamp(kBevel * 0.28 + kDeep * (0.42 + 0.35 * uJoint), 0.0, 0.95);
kBase *= 1.0 - kJoint;
kBase *= 1.0 - vDirt * 0.55;

// Wiped by hand (the epilogue): moss and lichen come off the upstream face under the mask.
float kWiped = 0.0;
float kInBox = 0.0;
if (uWipeBox.z > 0.0 && vKWorld.z > 0.0) {
  vec2 kWuv = (vKWorld.xy - uWipeBox.xy) / uWipeBox.zw;
  if (kWuv.x > 0.0 && kWuv.x < 1.0 && kWuv.y > 0.0 && kWuv.y < 1.0) {
    kWiped = texture2D(uWipe, kWuv).r;
    kInBox = 1.0;
  }
}

// Patina: the stone greys and darkens; streaks run down from the ledges; lichen on the tops.
float kLum = dot(kBase, vec3(0.3, 0.59, 0.11));
kBase = mix(kBase, vec3(kLum) * vec3(1.0, 0.97, 0.92), 0.3 * uPatina) * (1.0 - 0.2 * uPatina);
float kStreak = smoothstep(0.5, 0.85, kNoise(vec3(vKWorld.x * 7.0, vKWorld.y * 0.45, vKWorld.z * 7.0)));
kBase *= 1.0 - 0.28 * kStreak * uPatina * (1.0 - abs(vKWorldN.y));
float kLichen = uPatina * smoothstep(0.72, 0.8, kN2 * 0.7 + kN3 * 0.35) * smoothstep(-0.2, 0.6, vKWorldN.y + 0.2);
kBase = mix(kBase, vec3(0.55, 0.5, 0.33) * (0.8 + 0.4 * kN3), kLichen * 0.45 * (1.0 - kWiped));

// Old high-water stain up to the yearly flood line.
float kStain = uPatina * (1.0 - smoothstep(uFloodLine - 0.25, uFloodLine + 0.15, vKWorld.y + (kN1 - 0.5) * 0.3));
kBase *= 1.0 - 0.25 * kStain;
kBase = mix(kBase, kBase * vec3(0.92, 0.98, 0.85), kStain * 0.6);

// Moss creeps up from the waterline, sits on ledges and in joints, likes the shaded faces.
float kH = vKWorld.y;
float kReach = 0.25 + 1.7 * uMoss;
float kFromWater = 1.0 - smoothstep(kReach * 0.35, kReach, kH + (kN1 - 0.5) * 0.9);
float kShade = smoothstep(0.15, -0.45, dot(normalize(vKWorldN), uSunDir));
float kLedge = smoothstep(0.55, 0.95, vKWorldN.y);
float kMoss = uMoss * (kFromWater * 0.95 + kShade * 0.4 * (1.0 - smoothstep(2.0, 6.0, kH)) + kLedge * 0.55 + vJoint * 0.7);
kMoss *= smoothstep(0.38, 0.62, kN2 * 0.55 + kN3 * 0.45 + kMoss * 0.35 - 0.1);
// Never a full green coat: the stone shows through even where the moss is thickest.
kMoss = clamp(kMoss, 0.0, 0.8) * (1.0 - kWiped);
vec3 kMossCol = uMossColor * (0.7 + 0.45 * kN3);
if (uHasMoss > 0.5) {
  vec3 m = texture2D(uMossMap, kuvX * 1.7).rgb * kw.x + texture2D(uMossMap, kuvY * 1.7).rgb * kw.y + texture2D(uMossMap, kuvZ * 1.7).rgb * kw.z;
  kMossCol = mix(kMossCol, m * vec3(0.78, 0.82, 0.66), 0.5);
}
kBase = mix(kBase, kMossCol, kMoss);
kRough = mix(kRough, 1.1, kMoss);

// Decades untended (the epilogue): a close coat of moss and grey-green lichen over the upstream
// face, the mark under it too, cut through only where the rag has passed.
float kCoat = 0.0;
if (uOvergrowth > 0.0 && kInBox > 0.5) {
  float kFacing = smoothstep(0.15, 0.6, vKWorldN.z);
  float kPatch = smoothstep(0.3, 0.6, kN1 * 0.45 + kN2 * 0.35 + kN3 * 0.2);
  kCoat = uOvergrowth * kFacing * mix(0.88, 0.97, kPatch) * (1.0 - smoothstep(0.15, 0.85, kWiped));
  // One close green, alive in its fine grain, a little deeper in the joints, with pale lichen
  // rosettes here and there: no broad patches that would read as camouflage.
  float kFine = kNoise(vKWorld * 43.0 + 2.1);
  vec3 kCoatCol = kMossCol * (0.8 + 0.22 * kN3 + 0.16 * kFine) * (1.0 - 0.22 * kBevel);
  float kRosette = smoothstep(0.7, 0.78, kN3 * 0.55 + kFine * 0.45);
  kCoatCol = mix(kCoatCol, vec3(0.6, 0.6, 0.48) * (0.9 + 0.2 * kFine), kRosette * 0.65);
  kBase = mix(kBase, kCoatCol, kCoat);
  kRough = mix(kRough, 1.15, kCoat);
  kMoss = max(kMoss, kCoat);
}
// What the rag leaves: the stone a shade cleaner and damp, as fresh-wiped stone is.
kBase *= 1.0 - 0.08 * kWiped * uOvergrowth;

// Wet band at the water: dark and glossy, fading a hand's breadth above it.
float kWetTop = uWater + 0.12 + uWaterRough * 0.6;
float kWet = 1.0 - smoothstep(kWetTop - 0.3, kWetTop + 0.08 * kN2, kH);
kBase *= mix(1.0, 0.5, kWet);
kRough *= mix(1.0, 0.4, kWet);

// Snow on the top faces.
float kSnow = uSnow * smoothstep(0.45, 0.85, vKWorldN.y) * smoothstep(0.25, 0.55, kN2 * 0.6 + kN3 * 0.4 + uSnow * 0.35);
kBase = mix(kBase, vec3(0.9, 0.92, 0.95), kSnow);
kRough = mix(kRough, 1.0, kSnow);

// The stone the player is about to mark.
if (vStone > uHover.x - 0.5 && vStone < uHover.y + 0.5) kBase = kBase * 1.18 + vec3(0.035, 0.028, 0.012);

diffuseColor.rgb = kBase;
// Little sky reaches the soffit deep under the barrel, nor the faces turned to the ground.
float kUnder = smoothstep(0.15, -0.75, vKWorldN.y);
float kInside = 1.0 - smoothstep(uHalfWidth - 0.9, uHalfWidth + 0.05, abs(vKWorld.z));
// A coat of moss fills the joints and the cut of the mark: they no longer hold shadow.
float kAO = kArm.r * (1.0 - kJoint * 0.6 * (1.0 - kCoat)) * (1.0 - 0.6 * kUnder * kInside) * (1.0 - 0.2 * kUnder);
`;

export const SURFACE_ROUGHNESS = /* glsl */ `
float roughnessFactor = clamp(roughness * mix(1.0, kArm.g, uHasMap) * kRough, 0.04, 1.0);
`;

export const SURFACE_NORMAL = /* glsl */ `
if (uHasMap > 0.5) {
  vec3 nX = texture2D(uNormalMap, kuvX).xyz * 2.0 - 1.0;
  vec3 nY = texture2D(uNormalMap, kuvY).xyz * 2.0 - 1.0;
  vec3 nZ = texture2D(uNormalMap, kuvZ).xyz * 2.0 - 1.0;
  // Box mapping: each projection's tangent plane is two of the stone's own (rotated) axes.
  vec3 kPert = (vAz * nX.x + vAy * nX.y) * kw.x + (vAx * nY.x + vAz * nY.y) * kw.y + (vAx * nZ.x + vAy * nZ.y) * kw.z;
  float kFlat = 1.0 - max(kSnow, kMoss * 0.6);
  normal = normalize(normal + kPert * uNormalScale * kFlat);
}
`;

export const SURFACE_AO = /* glsl */ `
float ambientOcclusion = kAO;
reflectedLight.indirectDiffuse *= ambientOcclusion;
#if defined( USE_ENVMAP ) && defined( STANDARD )
  float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
  reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
#endif
`;
