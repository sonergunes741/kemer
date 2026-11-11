/**
 * What the offline analysis renders, and the loudness each sound should have (momentary maximum,
 * LUFS, with every fader at full). The balance in one table: interface sounds whisper, laid stones
 * speak, the keystone and a collapse are the loudest things in the game, and the river sits under
 * the effects.
 */
import type { Bus } from '../src/core/bus';
import type { MusicMood, SfxId } from '../src/core/contracts';
import type { ActorKind, Vec3 } from '../src/core/types';
import type { Engine } from '../src/audio/engine';

export interface CaseContext {
  readonly engine: Engine;
  readonly bus: Bus;
  /** Run `fn` when the simulated clock reaches `t` seconds. */
  at(t: number, fn: () => void): void;
}

export interface Case {
  readonly id: string;
  readonly group: 'stone' | 'timber' | 'water' | 'hazard' | 'life' | 'ui' | 'ambience' | 'music' | 'scene';
  readonly seconds: number;
  /** Target momentary loudness, LUFS, and the tolerance either side. */
  readonly target: number;
  readonly tol?: number;
  /** Analyse from this time (skips fade-ins). */
  readonly from?: number;
  /** Keep the ambience bed audible (otherwise it is muted to isolate the sound). */
  readonly ambience?: boolean;
  /** Allowed sample peak, dBFS. */
  readonly maxPeak?: number;
  readonly setup: (c: CaseContext) => void;
}

const P: Vec3 = { x: 0, y: 4, z: 0 };
const T0 = 0.25;

function ev(id: string, group: Case['group'], target: number, seconds: number, fire: (c: CaseContext) => void, tol = 3): Case {
  return { id, group, target, tol, seconds, setup: (c) => c.at(T0, () => fire(c)) };
}

function sfx(id: SfxId, target: number, tol = 3, options?: { pitch?: number }): Case {
  return ev(`sfx ${id}`, 'ui', target, id === 'century' || id === 'safe' || id === 'rumble' ? 3.5 : 1.5, (c) => c.engine.ui.play(id, options), tol);
}

function steps(kind: ActorKind, target: number): Case {
  return {
    id: `steps ${kind}`,
    group: 'life',
    seconds: 2.5,
    target,
    setup: (c) => {
      for (let i = 0; i < 6; i++) c.at(T0 + i * 0.32, () => c.bus.emit('traffic:step', { kind, at: { x: -3 + i, y: 3, z: 0 } }));
    },
  };
}

function ambience(id: string, target: number, state: Parameters<Engine['ambience']['set']>[0], seconds = 9, tol = 3): Case {
  return {
    id: `ambience ${id}`,
    group: 'ambience',
    seconds,
    target,
    tol,
    from: 3,
    ambience: true,
    setup: (c) => c.engine.ambience.set({ river: 0, wind: 0, birds: 0, rain: 0, night: 0, season: 0.35, lapse: 0, ...state }),
  };
}

function mood(m: MusicMood, target: number, tol = 5): Case {
  return { id: `music ${m}`, group: 'music', seconds: 30, target, tol, from: 2, setup: (c) => c.engine.music.setMood(m, 1, 0) };
}

export const CASES: readonly Case[] = [
  ev('stone 0.3 t voussoir', 'stone', -25, 1.5, (c) => c.bus.emit('stone:land', { at: P, mass: 0.3, part: 'voussoir', count: 1 })),
  ev('stone 1 t voussoir', 'stone', -22, 1.5, (c) => c.bus.emit('stone:land', { at: P, mass: 1, part: 'voussoir', count: 1 })),
  ev('stone 3 t pier', 'stone', -19, 1.5, (c) => c.bus.emit('stone:land', { at: P, mass: 3, part: 'pier', count: 1 })),
  ev('stone flurry x4', 'stone', -21, 2, (c) => c.bus.emit('stone:land', { at: P, mass: 0.8, part: 'voussoir', count: 4 })),
  ev('keystone boom', 'stone', -14, 5, (c) => c.bus.emit('keystone:seat', { at: P, span: 0 })),
  {
    id: 'chisel x3',
    group: 'stone',
    seconds: 2,
    target: -25,
    tol: 3,
    setup: (c) => [1, 2, 3].forEach((n) => c.at(T0 + (n - 1) * 0.35, () => c.bus.emit('mark:tap', { at: P, n }))),
  },
  ev('wedge left 2', 'timber', -20, 2, (c) => c.bus.emit('wedge:strike', { at: P, left: 2 })),
  ev('wedge left 1', 'timber', -19, 2, (c) => c.bus.emit('wedge:strike', { at: P, left: 1 })),
  ev('wedge left 0', 'timber', -18, 2, (c) => c.bus.emit('wedge:strike', { at: P, left: 0 })),
  ev('centering raise', 'timber', -24, 4, (c) => c.bus.emit('centering:raise', { at: P, span: 0 })),
  ev('creak 0.3', 'timber', -32, 1.5, (c) => c.bus.emit('timber:creak', { at: P, strain: 0.3 }), 4),
  ev('creak 0.9', 'timber', -25, 1.5, (c) => c.bus.emit('timber:creak', { at: P, strain: 0.9 }), 4),
  ev('centering fall', 'timber', -16, 4, (c) => c.bus.emit('centering:fall', { at: P, span: 0 })),
  ev('arch settle 1.2 cm', 'timber', -25, 2.5, (c) => c.bus.emit('arch:settle', { at: P, span: 0, drop: 0.012 })),
  ev('splash 0.3 m', 'water', -28, 1.5, (c) => c.bus.emit('splash', { at: P, size: 0.3 })),
  ev('splash 1.5 m', 'water', -22, 2, (c) => c.bus.emit('splash', { at: P, size: 1.5 })),
  ev('splash 5 m', 'water', -17, 3.5, (c) => c.bus.emit('splash', { at: P, size: 5 })),
  ev('impact ground 5 kJ', 'hazard', -26, 1.5, (c) => c.bus.emit('impact', { at: P, energy: 5, surface: 'ground' })),
  ev('impact ground 200 kJ', 'hazard', -19, 1.5, (c) => c.bus.emit('impact', { at: P, energy: 200, surface: 'ground' })),
  ev('impact stone 50 kJ', 'hazard', -20, 1.5, (c) => c.bus.emit('impact', { at: P, energy: 50, surface: 'stone' })),
  ev('crack', 'hazard', -25, 1.5, (c) => c.bus.emit('crack', { at: P })),
  {
    id: 'flood rise-peak-fall',
    group: 'hazard',
    seconds: 12,
    target: -20,
    setup: (c) => {
      c.at(0.2, () => c.bus.emit('flood', { phase: 'rise', level: 2, drama: 0.8 }));
      c.at(4, () => c.bus.emit('flood', { phase: 'peak', level: 4, drama: 0.8 }));
      c.at(8, () => c.bus.emit('flood', { phase: 'fall', level: 2, drama: 0.8 }));
      c.at(10, () => c.bus.emit('flood', { phase: 'end', level: 0, drama: 0.8 }));
    },
  },
  {
    id: 'quake 0.25 g',
    group: 'hazard',
    seconds: 6,
    target: -18,
    setup: (c) => {
      c.at(0.2, () => c.bus.emit('quake', { phase: 'start', pga: 0.25 }));
      c.at(4, () => c.bus.emit('quake', { phase: 'end', pga: 0.25 }));
    },
  },
  {
    id: 'collapse stress (420 events)',
    group: 'hazard',
    seconds: 9,
    target: -11,
    tol: 4,
    maxPeak: 0,
    setup: (c) => {
      c.at(0.1, () => c.bus.emit('collapse:start', { info: { year: 1683, cause: 'flood-scour', spans: [], piers: [] } }));
      for (let i = 0; i < 420; i++) {
        const t = 0.2 + Math.pow(i / 420, 0.8) * 4.5;
        const x = -10 + (i % 21);
        const k = i % 4;
        c.at(t, () => {
          if (k === 0) c.bus.emit('splash', { at: { x, y: 0, z: 0 }, size: 0.5 + (i % 7) });
          else if (k === 1) c.bus.emit('impact', { at: { x, y: 2, z: 0 }, energy: 5 + (i % 11) * 30, surface: 'stone' });
          else if (k === 2) c.bus.emit('impact', { at: { x, y: 0, z: 0 }, energy: 3 + (i % 5) * 50, surface: 'ground' });
          else if (i % 8 === 3) c.bus.emit('crack', { at: { x, y: 4, z: 0 } });
          else c.bus.emit('stone:land', { at: { x, y: 3, z: 0 }, mass: 1.5, part: 'voussoir', count: 3 });
        });
      }
      c.at(5.2, () => c.bus.emit('collapse:end', {}));
    },
  },
  steps('villager', -33),
  steps('rider', -29),
  steps('ox-cart', -29),
  steps('caravan', -30),
  {
    id: 'truck pass',
    group: 'life',
    seconds: 6,
    target: -24,
    setup: (c) => {
      c.at(0.2, () => c.bus.emit('traffic:pass', { kind: 'truck', at: P, phase: 'enter' }));
      c.at(2, () => c.bus.emit('traffic:pass', { kind: 'truck', at: P, phase: 'mid' }));
      for (let i = 0; i < 6; i++) c.at(1 + i * 0.4, () => c.bus.emit('traffic:step', { kind: 'truck', at: P }));
      c.at(3.5, () => c.bus.emit('traffic:pass', { kind: 'truck', at: P, phase: 'exit' }));
    },
  },
  ev('seal stamp', 'life', -18, 1.5, (c) => c.bus.emit('seal:stamp', { which: 'standing' })),
  ev('seal masterwork', 'life', -17, 3, (c) => c.bus.emit('seal:stamp', { which: 'masterwork' })),
  sfx('ui-tap', -31),
  sfx('ui-hover', -43, 4),
  sfx('ui-back', -31),
  sfx('ui-page', -31),
  sfx('handle-grab', -31),
  sfx('handle-tick', -36, 4),
  sfx('handle-release', -33),
  sfx('handle-limit', -29),
  sfx('safe', -24),
  sfx('unsafe', -29),
  sfx('seal', -19),
  sfx('year-tick', -42, 4),
  sfx('century', -27),
  sfx('timber', -26),
  sfx('crack', -26),
  sfx('rumble', -21),
  ambience('river 0.25 murmur', -36, { river: 0.25 }),
  ambience('river 0.6', -30, { river: 0.6 }),
  ambience('river 1 roar', -23, { river: 1 }),
  ambience('wind 1', -30, { wind: 1 }),
  ambience('rain 1', -30, { rain: 1 }),
  ambience('birds spring day', -36, { birds: 1, season: 0.35 }, 20, 6),
  ambience('crickets summer night', -40, { night: 1, season: 0.55 }, 9, 4),
  ambience('lapse 1, river 0.5', -34, { river: 0.5, lapse: 1, birds: 1 }),
  mood('title', -29),
  mood('survey', -29),
  mood('design', -32),
  mood('build', -28),
  mood('relief', -28),
  mood('time', -29),
  mood('peril', -27),
  mood('elegy', -29),
  mood('legacy', -28),
  mood('hush', -48, 8),
];
