import { describe, expect, it } from 'vitest';
import type { AudioApi } from '../core/contracts';
import { Bus } from '../core/bus';
import { createAudio } from './index';

describe('createAudio without Web Audio', () => {
  it('is a silent implementation that never throws', async () => {
    // Node has no AudioContext: exactly the case of a browser without Web Audio.
    const bus = new Bus();
    const audio: AudioApi = createAudio(bus);
    await expect(audio.unlock()).resolves.toBeUndefined();
    expect(audio.unlocked).toBe(false);
    expect(() => {
      audio.setVolumes(Number.NaN, 2, -1);
      audio.setMuted(true);
      audio.setAmbience({ river: 0.8, birds: 0 });
      audio.setMood('peril', 1);
      audio.play('ui-tap', { pitch: 1.2 });
      audio.setListener(Number.POSITIVE_INFINITY, 0);
      bus.emit('crack', { at: { x: 0, y: 0, z: 0 } });
      audio.suspend();
      audio.resume();
      audio.update(1 / 60);
      audio.dispose();
      audio.dispose();
    }).not.toThrow();
  });
});
