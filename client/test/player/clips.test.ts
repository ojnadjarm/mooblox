import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Euler, Quaternion } from 'three';
import { CLIP_FOR, fallClip, jumpClip, sitClip } from '../../src/player/clips';

function glbJson(file: string): { animations: { name: string }[]; nodes: { name?: string }[] } {
  const b = readFileSync(file);
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'));
}

describe('avatar clips', () => {
  const glb = glbJson(join(__dirname, '../../public/assets/kenney-blocky.glb'));
  const names = [...glb.animations.map((a) => a.name), jumpClip().name, fallClip().name, sitClip().name];

  it('every state has its clip: idle, walk, run (sprint), jump, fall, sit', () => {
    expect(CLIP_FOR).toEqual({ idle: 'idle', walk: 'walk', run: 'sprint', jump: 'jump', fall: 'fall', sit: 'sit-swing' });
    for (const clip of Object.values(CLIP_FOR)) {
      expect(names).toContain(clip);
    }
  });

  it('the jump and fall clips only target nodes the model has', () => {
    const nodes = glb.nodes.map((n) => n.name);
    for (const t of [...jumpClip().tracks, ...fallClip().tracks, ...sitClip().tracks]) {
      expect(nodes).toContain(t.name.split('.')[0]);
    }
  });

  it('the seated loop keeps both legs out front and only ever kicks the feet up, never down through the seat', () => {
    const legs = sitClip().tracks.filter((t) => t.name.startsWith('leg-'));
    expect(legs.length).toBe(2);
    const q = new Quaternion();
    const e = new Euler();
    for (const t of legs) {
      const x: number[] = [];
      for (let i = 0; i < t.times.length; i++) x.push(e.setFromQuaternion(q.fromArray(t.values, i * 4)).x);
      expect(Math.max(...x)).toBeLessThanOrEqual(-1.57 + 1e-3);
      expect(Math.min(...x)).toBeLessThan(-1.7);
    }
  });
});
