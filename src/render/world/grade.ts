/**
 * AgX tone mapping with a gentle look. three.js ships AgX with no look at all, which leaves a
 * daylit landscape soft and greyish (its toe lifts the shadows a long way). Blender's "Punchy"
 * look fixes that but is too loud for this game; this is about half of it: a little more
 * contrast in the encoded domain and a little more saturation, nothing else. The AgX math is
 * three's (Filament's), so highlights still roll off to white the same way.
 */
import { Effect } from 'postprocessing';
import { Uniform } from 'three';

const FRAGMENT = /* glsl */ `
uniform float exposure;
uniform float lookPower;
uniform float lookSat;

const mat3 K_SRGB_TO_2020 = mat3(
  vec3(0.6274, 0.0691, 0.0164),
  vec3(0.3293, 0.9195, 0.0880),
  vec3(0.0433, 0.0113, 0.8956)
);
const mat3 K_2020_TO_SRGB = mat3(
  vec3(1.6605, -0.1246, -0.0182),
  vec3(-0.5876, 1.1329, -0.1006),
  vec3(-0.0728, -0.0083, 1.1187)
);
const mat3 K_INSET = mat3(
  vec3(0.856627153315983, 0.137318972929847, 0.11189821299995),
  vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903),
  vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859)
);
const mat3 K_OUTSET = mat3(
  vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826),
  vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294),
  vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405)
);

vec3 kemerAgxContrast(vec3 x) {
  vec3 x2 = x * x;
  vec3 x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = K_INSET * (K_SRGB_TO_2020 * (inputColor.rgb * exposure));
  c = clamp((log2(max(c, 1e-10)) + 12.47393) / 16.499999, 0.0, 1.0);
  c = kemerAgxContrast(c);
  // The look, in the encoded domain like Blender's.
  c = pow(max(c, 0.0), vec3(lookPower));
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = luma + lookSat * (c - luma);
  c = K_OUTSET * max(c, 0.0);
  c = pow(max(c, 0.0), vec3(2.2));
  c = clamp(K_2020_TO_SRGB * c, 0.0, 1.0);
  outputColor = vec4(c, inputColor.a);
}
`;

export class AgxLookEffect extends Effect {
  constructor(options: { exposure?: number; power?: number; saturation?: number } = {}) {
    super('AgxLookEffect', FRAGMENT, {
      uniforms: new Map<string, Uniform>([
        ['exposure', new Uniform(options.exposure ?? 1)],
        ['lookPower', new Uniform(options.power ?? 1.42)],
        ['lookSat', new Uniform(options.saturation ?? 1.2)],
      ]),
    });
  }
}
