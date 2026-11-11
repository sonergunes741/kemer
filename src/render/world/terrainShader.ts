/**
 * Ground shading injected into MeshStandardMaterial. Four photo texture sets carry the detail:
 * grass and bare soil on the gentle ground, the cliff rock (tri-planar, so vertical faces are not
 * smeared) on the steep, gravel or mud where the river reaches. Each set is drawn at its true
 * size and again five and a half times larger, multiplied in, so neither tiles visibly; its normal
 * map lights the relief. The biome table's colours tint the photos (a texture is divided by its
 * own mean colour first), the seasons tint the grass, and only very slow noise (tens to hundreds
 * of metres) varies the colour: no fine procedural grain, which shimmers as the camera moves.
 * Fields and far woods, the damp band at the water, the river bed, marsh pools and snow sit on top.
 */

export const TERRAIN_VERTEX_PARS = /* glsl */ `
varying vec3 vKWorld;
varying vec3 vKNormal;
`;

export const TERRAIN_VERTEX = /* glsl */ `
vKWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
vKNormal = normalize(mat3(modelMatrix) * objectNormal);
`;

export const TERRAIN_FRAGMENT_PARS = /* glsl */ `
varying vec3 vKWorld;
varying vec3 vKNormal;
uniform sampler2D uNoise;
uniform vec3 uGrass;
uniform vec3 uDry;
uniform vec3 uSoilA;
uniform vec3 uSoilB;
uniform vec3 uRockA;
uniform vec3 uRockB;
uniform vec3 uBank;
uniform vec3 uBed;
uniform vec3 uForestCol;
uniform float uCover;
uniform float uStrata;
uniform vec2 uRockSlope;
uniform float uFields;
uniform float uForest;
uniform float uPools;
uniform float uSnow;
uniform float uWaterY;
uniform float uSlope;
uniform float uWetBand;
uniform vec2 uCentre;
#ifdef K_GROUND_TEX
uniform sampler2D uGrassCol;
uniform sampler2D uGrassNor;
uniform sampler2D uSoilCol;
uniform sampler2D uSoilNor;
uniform sampler2D uRockCol;
uniform sampler2D uRockNor;
uniform sampler2D uBankCol;
uniform sampler2D uBankNor;
// 1 / the linear mean colour of each photo, so the photo is pure detail around 1.
uniform vec3 uGrassInv;
uniform vec3 uSoilInv;
uniform vec3 uRockInv;
uniform vec3 uBankInv;
// 1 / metres per tile: grass, soil, rock, bank.
uniform vec4 uTile;
#endif
float kHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float kRough;
vec3 kNormalW;
// The larger copy of a texture: five and a half times the size and turned, so the two never line up.
vec2 kMacro(vec2 uv) {
  return mat2(0.8, -0.6, 0.6, 0.8) * uv * 0.182 + vec2(0.37, 0.71);
}
float kLum(vec3 c) {
  return dot(c, vec3(0.3, 0.59, 0.11));
}
// Slow noise, tri-planar: read from above only, it would run down a steep bank in long streaks.
vec4 kNoise3(vec3 p, vec3 w, float s) {
  return texture2D(uNoise, p.zy * s) * w.x + texture2D(uNoise, p.xz * s) * w.y + texture2D(uNoise, p.xy * s) * w.z;
}
`;

/** Replaces <map_fragment>: the ground colour into diffuseColor, its normal into kNormalW. */
export const TERRAIN_COLOR = /* glsl */ `
{
  vec3 wp = vKWorld;
  vec3 wn = normalize(vKNormal);
  float slope = 1.0 - wn.y;
  float dist = length(vViewPosition);
  vec3 bw = pow(abs(wn), vec3(4.0));
  bw /= dot(bw, vec3(1.0));
  // Slow noise only: hundreds of metres, tens of metres. The two nearer scales are tri-planar.
  vec4 nA = kNoise3(wp, bw, 0.011);
  vec4 nB = kNoise3(wp, bw, 0.063);
  vec4 nM = texture2D(uNoise, wp.xz * 0.0031 + 0.5);
  // Where the photos laid from above would stretch down the slope, the soft ground borrows the
  // rock's tri-planar grain instead: stony soil on a steep bank, not smeared grass.
  float steep = smoothstep(0.16, 0.4, slope);
  float h = wp.y - (uWaterY + uSlope * wp.z);
  float near = 1.0 - smoothstep(40.0, 260.0, dist);

  // Detail from the photos (1 = the mean), their relief (0.5 = the mean) and tangent normals.
  vec3 gD = vec3(1.0);
  vec3 sD = vec3(1.0);
  vec3 rD = vec3(1.0);
  vec3 kD = vec3(1.0);
  float gH = 0.5;
  float sH = 0.5;
  float rH = 0.5;
  float kH = 0.5;
  #ifdef K_GROUND_TEX
  vec2 top = wp.xz;
  vec2 uvG = top * uTile.x;
  vec2 uvS = top * uTile.y;
  vec2 uvK = top * uTile.w;
  gD = texture2D(uGrassCol, uvG).rgb * uGrassInv;
  gD *= pow(texture2D(uGrassCol, kMacro(uvG)).rgb * uGrassInv, vec3(0.7));
  sD = texture2D(uSoilCol, uvS).rgb * uSoilInv;
  sD *= pow(texture2D(uSoilCol, kMacro(uvS)).rgb * uSoilInv, vec3(0.7));
  kD = texture2D(uBankCol, uvK).rgb * uBankInv;
  kD *= pow(texture2D(uBankCol, kMacro(uvK)).rgb * uBankInv, vec3(0.6));
  // Rock, tri-planar: x faces take (z, y), y faces (x, z), z faces (x, y).
  vec2 rx = wp.zy * uTile.z;
  vec2 ry = wp.xz * uTile.z;
  vec2 rz = wp.xy * uTile.z;
  rD = (texture2D(uRockCol, rx).rgb * bw.x + texture2D(uRockCol, ry).rgb * bw.y + texture2D(uRockCol, rz).rgb * bw.z) * uRockInv;
  vec3 rM = (texture2D(uRockCol, kMacro(rx)).rgb * bw.x + texture2D(uRockCol, kMacro(ry)).rgb * bw.y + texture2D(uRockCol, kMacro(rz)).rgb * bw.z) * uRockInv;
  rD *= pow(rM, vec3(0.75));
  vec3 rGrain = vec3(kLum(rD));
  gD = mix(gD, rGrain, steep * 0.9);
  sD = mix(sD, rGrain, steep * 0.9);
  kD = mix(kD, rGrain, steep * 0.9);
  gH = clamp(kLum(gD) * 0.5, 0.0, 1.0);
  sH = clamp(kLum(sD) * 0.5, 0.0, 1.0);
  rH = clamp(kLum(rD) * 0.5, 0.0, 1.0);
  kH = clamp(kLum(kD) * 0.5, 0.0, 1.0);
  #endif

  // Rock: thick irregular beds, warped, lighter and darker, with the photo on top.
  float band = 0.5 + 0.3 * sin(wp.y * 0.55 + nB.r * 4.0 + nA.g * 3.0) + 0.2 * sin(wp.y * 1.7 + nB.g * 6.0);
  float rockT = clamp(nB.g * 1.2 - 0.1 + (band - 0.5) * uStrata, 0.0, 1.0);
  vec3 rock = mix(uRockB, uRockA, rockT) * rD;

  vec3 soil = mix(uSoilB, uSoilA, clamp(nB.g * 1.3 - 0.15, 0.0, 1.0)) * sD;
  float dryMix = smoothstep(0.38, 0.72, nA.r * 0.55 + nB.b * 0.45);
  vec3 grass = mix(uGrass, uDry, dryMix * 0.7) * gD;
  // Where grass gives way to soil follows the photos' own relief: tufts stand, hollows go bare.
  float coverN = nB.r * 0.6 + nA.g * 0.4 + (gH - sH) * 0.25;
  float grassW = smoothstep(1.0 - uCover - 0.08, 1.0 - uCover + 0.08, coverN) * (1.0 - smoothstep(0.22, 0.42, slope));
  vec3 col = mix(soil, grass, grassW);

  float dC = length(wp.xz - uCentre);

  // Fields and gardens: a patchwork on the gentle ground above the floods.
  if (uFields > 0.0) {
    float a = 0.35;
    vec2 q = vec2(wp.x * cos(a) - wp.z * sin(a), wp.x * sin(a) + wp.z * cos(a));
    vec2 cell = floor(q / vec2(46.0, 27.0));
    float r = kHash(cell);
    float r2 = kHash(cell + 17.0);
    vec2 f = fract(q / vec2(46.0, 27.0));
    float edge = smoothstep(0.0, 0.04, f.x) * smoothstep(1.0, 0.96, f.x) * smoothstep(0.0, 0.06, f.y) * smoothstep(1.0, 0.94, f.y);
    // Kept back from the bridge: the near banks are the stage and big flat patches there read
    // as stains rather than fields.
    float away = smoothstep(70.0, 190.0, dC);
    // Only the valley floor is farmed: fields climbing the hillsides read as painted stripes.
    float floorLand = (1.0 - smoothstep(0.03, 0.07, slope)) * (1.0 - smoothstep(18.0, 30.0, h));
    float field = step(1.0 - uFields, r) * floorLand * smoothstep(0.8, 1.8, h) * edge * away;
    vec3 crop = r2 < 0.4 ? uGrass * vec3(0.92, 1.08, 0.82) : (r2 < 0.75 ? mix(uDry, vec3(0.62, 0.52, 0.28), 0.25) : mix(soil, uGrass, 0.3));
    crop *= gD * (0.92 + 0.16 * r2);
    col = mix(col, crop, field * 0.7);
  }

  // Woods on the far hills, read as dark mottled green from afar.
  float woods = uForest * smoothstep(0.48, 0.62, nA.g * 0.7 + nB.g * 0.3) * (1.0 - smoothstep(0.35, 0.7, slope)) * smoothstep(90.0, 320.0, dC);
  col = mix(col, uForestCol * (0.7 + 0.45 * nB.b), woods);

  // Rock on the steep: the threshold wanders with slow noise and follows the rock's relief, so
  // ledges break out of the slope instead of meeting it along a drawn line.
  float soft = smoothstep(60.0, 500.0, dist) * 0.12;
  float rockW = smoothstep(uRockSlope.x - soft, uRockSlope.y + soft, slope + (nB.a - 0.5) * 0.2 + (rH - 0.5) * 0.18);
  col = mix(col, rock, rockW);

  // Gravel, sand or mud where the water reaches in an ordinary year, the bed under the water.
  float bankW = (1.0 - smoothstep(0.1, 0.75 + nB.r * 0.9, h + (kH - 0.5) * 0.3)) * (1.0 - rockW * 0.6);
  vec3 bank = uBank * kD;
  col = mix(col, bank, bankW);
  float under = smoothstep(0.05, -0.25, h);
  col = mix(col, uBed * kD, under);
  // The damp band: dark and a little richer just above the water, fading up the bank.
  float wet = 1.0 - smoothstep(-0.02, 0.22 + uWetBand * (0.6 + nB.g * 0.8), h);
  col = mix(col, col * col * 1.35, wet * 0.4);
  col *= mix(1.0, 0.62, wet);

  // Pools: standing water in the hollows of the flats, dark and glossy so the sky shows in it.
  float pool = 0.0;
  if (uPools > 0.0) {
    float hollow = nA.g * 0.6 + nB.r * 0.4;
    float thr = 0.5 + (1.0 - uPools) * 0.15;
    float lowFlat = (1.0 - smoothstep(0.02, 0.06, slope)) * (1.0 - smoothstep(2.5, 4.0, h)) * smoothstep(0.3, 0.8, h);
    pool = smoothstep(thr, thr + 0.04, hollow) * lowFlat;
    // Reed beds ring the pools: from afar a marsh is straw-green stands around dark water.
    float reed = smoothstep(thr - 0.08, thr - 0.01, hollow) * lowFlat * (1.0 - pool) * uPools;
    col = mix(col, mix(uDry, uGrass, 0.35) * gD, reed * 0.85);
    // A muted sky-grey: the pools mostly show the pale sky at the angles the camera sees them.
    col = mix(col, mix(uBed * 0.5, vec3(0.26, 0.29, 0.3), 0.6), pool);
  }

  // Large, gentle variation of colour and light across the valley: patches of drier and greener
  // ground, slightly darker and lighter tracts, as the eye sees from a hillside.
  col *= 0.9 + 0.2 * nM.r;
  col = mix(col, col * vec3(1.06, 1.0, 0.9), smoothstep(0.45, 0.7, nM.g) * 0.5 * (1.0 - rockW));

  float snowW = uSnow * smoothstep(0.62, 0.86, wn.y + (nB.b - 0.5) * 0.3 + uSnow * 0.15 + (gH - 0.5) * 0.15) * smoothstep(-0.02, 0.2, h);
  // Woods stay dark under snow (it lies under the trees, not on them) and wind scours thin
  // patches on the open slopes: a winter valley keeps its drawing instead of going blank.
  snowW *= 1.0 - woods * 0.7;
  snowW *= 1.0 - 0.35 * smoothstep(0.55, 0.75, nA.b * 0.6 + nB.g * 0.4) * smoothstep(0.08, 0.3, slope) * (1.0 - uSnow * 0.4);
  col = mix(col, vec3(0.86, 0.89, 0.93) * (0.94 + 0.06 * gH), snowW);

  diffuseColor.rgb = col;
  kRough = mix(mix(mix(mix(0.95, 0.9, bankW), 0.86, rockW), 0.4, wet), 0.1, pool * (1.0 - uSnow));
  kRough = mix(kRough, 0.62, snowW);

  // Relief: the photos' normal maps, whiteout-blended onto the surface normal. Planar from above
  // for the soft ground, tri-planar for the rock; flattened under snow and in the pools, and a
  // little with distance, where the mips have already averaged most of it away.
  kNormalW = wn;
  #ifdef K_GROUND_TEX
  float relief = (1.0 - snowW * 0.75) * (1.0 - pool) * mix(0.55, 1.0, near);
  vec3 tg = texture2D(uGrassNor, uvG).xyz * 2.0 - 1.0;
  vec3 ts = texture2D(uSoilNor, uvS).xyz * 2.0 - 1.0;
  vec3 tk = texture2D(uBankNor, uvK).xyz * 2.0 - 1.0;
  float wk = max(bankW, under);
  vec3 tSoft = mix(mix(ts, tg, grassW), tk, wk);
  tSoft.xy *= relief * mix(1.0, 0.6, wet);
  vec3 nSoft = normalize(vec3(tSoft.x + wn.x, abs(tSoft.z) * wn.y, tSoft.y + wn.z));
  vec3 tx = texture2D(uRockNor, rx).xyz * 2.0 - 1.0;
  vec3 ty = texture2D(uRockNor, ry).xyz * 2.0 - 1.0;
  vec3 tz = texture2D(uRockNor, rz).xyz * 2.0 - 1.0;
  float rr = relief * 1.25;
  tx = vec3(tx.xy * rr + wn.zy, abs(tx.z) * wn.x);
  ty = vec3(ty.xy * rr + wn.xz, abs(ty.z) * wn.y);
  tz = vec3(tz.xy * rr + wn.xy, abs(tz.z) * wn.z);
  vec3 nRock = normalize(tx.zyx * bw.x + ty.xzy * bw.y + tz.xyz * bw.z);
  kNormalW = normalize(mix(nSoft, nRock, max(rockW * (1.0 - wk * 0.5), steep * 0.85)));
  #endif
}
`;

export const TERRAIN_ROUGHNESS = /* glsl */ `
float roughnessFactor = kRough;
`;

/** After <normal_fragment_maps>: the textured world normal into view space. */
export const TERRAIN_NORMAL = /* glsl */ `
normal = normalize((viewMatrix * vec4(kNormalW, 0.0)).xyz);
`;
