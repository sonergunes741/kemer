import { describe, expect, it } from 'vitest';
import { parseGlb } from './models';

/** A minimal GLB: one leaf quad (MASK material with an embedded image) and one bark triangle. */
function makeGlb(withImage: boolean): ArrayBuffer {
  const quad = new Float32Array([-1, 1, 0, 1, 1, 0, 1, 3, 0, -1, 3, 0]);
  const quadUv = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]);
  const quadIdx = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const tri = new Float32Array([0, 0, 0, 0.2, 0, 0, 0, 1, 0]);
  const image = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const parts: Uint8Array[] = [new Uint8Array(quad.buffer), new Uint8Array(quadUv.buffer), new Uint8Array(quadIdx.buffer), new Uint8Array(4), new Uint8Array(tri.buffer), image];
  const views: { byteOffset: number; byteLength: number }[] = [];
  let offset = 0;
  for (const p of parts) {
    views.push({ byteOffset: offset, byteLength: p.byteLength });
    offset += p.byteLength;
  }
  const bin = new Uint8Array(offset);
  parts.forEach((p, i) => bin.set(p, views[i]!.byteOffset));
  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, translation: [0, 1, 0] }],
    meshes: [
      {
        primitives: [
          { attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 },
          { attributes: { POSITION: 3 }, material: 1 },
        ],
      },
    ],
    materials: [
      { name: 'foliage', alphaMode: 'MASK', pbrMetallicRoughness: withImage ? { baseColorTexture: { index: 0 } } : {} },
      { name: 'bark' },
    ],
    textures: [{ source: 0 }],
    images: [{ bufferView: 5, mimeType: 'image/webp' }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3' },
      { bufferView: 1, componentType: 5126, count: 4, type: 'VEC2' },
      { bufferView: 2, componentType: 5123, count: 6, type: 'SCALAR' },
      { bufferView: 4, componentType: 5126, count: 3, type: 'VEC3' },
    ],
    bufferViews: views,
    buffers: [{ byteLength: bin.byteLength }],
  };
  let text = new TextEncoder().encode(JSON.stringify(json));
  const pad = (4 - (text.byteLength % 4)) % 4;
  if (pad) text = new Uint8Array([...text, ...new Array<number>(pad).fill(0x20)]);
  const binPad = (4 - (bin.byteLength % 4)) % 4;
  const total = 12 + 8 + text.byteLength + 8 + bin.byteLength + binPad;
  const out = new ArrayBuffer(total);
  const dv = new DataView(out);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, text.byteLength, true);
  dv.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(out, 20, text.byteLength).set(text);
  const b = 20 + text.byteLength;
  dv.setUint32(b, bin.byteLength + binPad, true);
  dv.setUint32(b + 4, 0x004e4942, true);
  new Uint8Array(out, b + 8, bin.byteLength).set(bin);
  return out;
}

describe('parseGlb', () => {
  it('merges primitives with node transforms and classifies leaves', () => {
    const { geometry, leafImage } = parseGlb(makeGlb(true), 0);
    expect(geometry.getAttribute('position').count).toBe(7);
    expect(geometry.index?.count).toBe(9);
    const kind = geometry.getAttribute('aKind');
    expect(kind.getX(0)).toBe(1);
    expect(kind.getX(5)).toBe(0);
    // The node lifts everything by one metre.
    expect(geometry.getAttribute('position').getY(0)).toBeCloseTo(2, 6);
    // Its own leaf image travels with it and the cards keep their UVs.
    expect(leafImage?.mime).toBe('image/webp');
    expect(Array.from(leafImage!.bytes)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(geometry.getAttribute('uv').getY(0)).toBeCloseTo(1, 6);
    // Leaf normals are bent out of the crown: never pointing into it.
    expect(geometry.getAttribute('normal').getY(3)).toBeGreaterThan(0);
  });

  it('maps leaves into the procedural atlas when the model has no leaf image', () => {
    const { geometry, leafImage } = parseGlb(makeGlb(false), 0);
    expect(leafImage).toBeNull();
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < 4; i++) {
      expect(uv.getX(i)).toBeLessThanOrEqual(0.5);
      expect(uv.getY(i)).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('rejects what is not a GLB', () => {
    expect(() => parseGlb(new ArrayBuffer(32), 0)).toThrow();
  });
});
