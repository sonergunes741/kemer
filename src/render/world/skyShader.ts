/**
 * Sky dome shader: Preetham daylight (constants as in three's Sky example, see skyModel.ts for
 * the CPU twin), a soft sun disc, the time-lapse streak along the sun's daily circle, a thin
 * drifting cloud layer, night, and the haze band that meets the distant hills.
 */

export const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // Pin the dome to the far plane so it never hides the landscape.
  gl_Position = p.xyww;
}
`;

export const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uBetaR;
uniform vec3 uBetaM;
uniform float uSunE;
uniform float uSunfade;
uniform float uMieG;
uniform float uExposure;
uniform float uDisc;
uniform vec3 uPole;
uniform vec2 uDecBand;
uniform float uStreak;
uniform vec3 uStreakTint;
uniform sampler2D uNoise;
uniform float uCloudCover;
uniform float uCloudAlpha;
uniform vec2 uCloudOffset;
uniform vec3 uCloudSun;
uniform vec3 uCloudShade;
uniform vec3 uFogColor;
uniform float uHorizonHaze;
uniform float uNight;
uniform vec3 uGround;
uniform float uEnvPass;
varying vec3 vDir;

const float PI_ = 3.141592653589793;
const float RAYLEIGH_ZENITH = 8.4E3;
const float MIE_ZENITH = 1.25E3;

float hgPhase(float c, float g) {
  float g2 = g * g;
  return 0.07957747154594767 * ((1.0 - g2) / pow(1.0 - 2.0 * g * c + g2, 1.5));
}

vec3 extinctionAt(float dirY) {
  float zen = acos(max(0.0, dirY));
  float m = 1.0 / (cos(zen) + 0.15 * pow(max(1e-3, 93.885 - zen * 180.0 / PI_), -1.253));
  return exp(-(uBetaR * RAYLEIGH_ZENITH + uBetaM * MIE_ZENITH) * m);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec3 dir = normalize(vDir);
  vec3 fex = extinctionAt(dir.y);
  float cosTheta = dot(dir, uSunDir);
  float rPhase = 0.05968310365946075 * (1.0 + pow(cosTheta * 0.5 + 0.5, 2.0));
  vec3 betaTheta = uBetaR * rPhase + uBetaM * hgPhase(cosTheta, uMieG);
  vec3 ratio = betaTheta / (uBetaR + uBetaM);
  vec3 lin = pow(uSunE * ratio * (1.0 - fex), vec3(1.5));
  lin *= mix(vec3(1.0), pow(uSunE * ratio * fex, vec3(0.5)), clamp(pow(1.0 - uSunDir.y, 5.0), 0.0, 1.0));
  vec3 tex = (lin + 0.1 * fex) * 0.04 + vec3(0.0, 0.0003, 0.00075);
  vec3 col = pow(tex, vec3(1.0 / (1.2 + 1.2 * uSunfade)));
  // The fit's gamma lift greys the blue; give back some of its colour.
  col = max(mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, 1.4), 0.0);

  // Night: a deep blue floor and a sparse field of stars.
  vec3 night = vec3(0.006, 0.009, 0.02) * (0.6 + 0.4 * max(dir.y, 0.0));
  col = max(col, night * uNight);
  if (uNight > 0.01 && dir.y > 0.0) {
    vec2 cell = floor(vec2(atan(dir.z, dir.x) * 180.0, dir.y * 260.0));
    float star = step(0.9975, hash12(cell));
    col += vec3(0.6, 0.65, 0.75) * star * uNight * smoothstep(0.02, 0.2, dir.y) * 0.25;
  }

  // Sun disc with a soft rim; fades away as the time-lapse takes over.
  float disc = smoothstep(0.99990, 0.99996, cosTheta);
  float halo = pow(max(cosTheta, 0.0), 1200.0) * 0.003;
  col += uSunE * fex * (disc * 0.16 + halo) * uDisc * smoothstep(-0.02, 0.01, dir.y);

  // Time-lapse: the sun's daily circle, a band whose height follows the season.
  if (uStreak > 0.001) {
    float a = acos(clamp(dot(dir, uPole), -1.0, 1.0));
    float p0 = 1.5707963 - uDecBand.y;
    float p1 = 1.5707963 - uDecBand.x;
    float dd = max(max(p0 - a, a - p1), 0.0);
    float width = max(p1 - p0, 0.0);
    // One day draws a bright line; the same light spread over a wider band of days is fainter.
    // Not fully energy-conserving: a year-wide band must still read as a luminous ribbon.
    float spread = 1.0 / (1.0 + width / 0.03);
    float core = exp(-dd * dd / 0.00003) * 9.0 * spread;
    // A band of many days is a soft ribbon, brighter at its edges where the sun turns at the
    // solstices and lingers, with a faint grain of single days (gaps for cloudy ones) as on a
    // pinhole solargraph. Sharp trails across the whole band read as stripes, not as light.
    float u = width > 1e-4 ? clamp((a - 0.5 * (p0 + p1)) / (0.5 * width), -0.96, 0.96) : 0.0;
    float day = hash12(vec2(floor((a - p0) / 0.006), 7.0));
    float grain = 0.8 + 0.2 * smoothstep(0.2, 0.6, day);
    float edges = 0.55 / sqrt(1.0 - u * u);
    core *= mix(1.0, edges * grain, smoothstep(0.015, 0.05, width));
    float glow = exp(-dd * dd / 0.0025) * 0.35 * (0.12 + 0.88 * spread);
    float above = smoothstep(-0.03, 0.05, dir.y);
    col += uStreakTint * fex * (core + glow) * above * uStreak;
  }

  // A layer of soft fair-weather clouds on a plane high above the valley: separate, rounded
  // masses a little drawn out by the wind, lit on top and greyer at their thick cores.
  if (dir.y > 0.0 && uCloudAlpha > 0.001) {
    float t = 1.0 / max(dir.y, 0.04);
    vec2 p = dir.xz * t * 0.22 + uCloudOffset;
    vec2 q = vec2(p.x * 0.6, p.y * 0.95);
    // A gentle warp turns the noise's blobs into heaped, irregular clouds.
    vec2 warp = (texture2D(uNoise, q * 0.21 + 0.13).ba - 0.5) * 0.9;
    float n = texture2D(uNoise, (q + warp) * 0.33).r * 0.62 + texture2D(uNoise, (q + warp) * 1.05 + 0.37).g * 0.28 + texture2D(uNoise, p * 2.9 + 0.71).b * 0.1;
    // The mixed noise sits at 0.5 with a spread of about 0.05; cover is measured in those units
    // so that 0.4 really clouds about four tenths of the sky.
    float z = (n - 0.5) / 0.05;
    float z0 = (0.5 - uCloudCover) * 2.5 + 0.35;
    float c = smoothstep(z0 - 0.2, z0 + 1.6, z);
    float core = smoothstep(z0 + 0.9, z0 + 3.0, z);
    c *= smoothstep(0.03, 0.22, dir.y);
    vec3 lit = uCloudSun * (0.5 + 2.0 * hgPhase(cosTheta, 0.6)) * (1.0 - 0.35 * core) + uCloudShade * (1.0 + 0.25 * (1.0 - core));
    col = mix(col, lit, c * uCloudAlpha);
  }

  // The haze band at the horizon, the same colour the distant hills fade into.
  float band = (1.0 - smoothstep(-0.02, 0.16, dir.y)) * uHorizonHaze;
  col = mix(col, uFogColor, band);

  // For the environment map the lower half is lit ground, so things are lit from below a little.
  if (uEnvPass > 0.5) col = mix(col, uGround, smoothstep(0.02, -0.12, dir.y));

  gl_FragColor = vec4(col * uExposure, 1.0);
}
`;
