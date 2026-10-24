import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLIP_FOR, jumpClip } from '../../src/player/clips';

function glbJson(file: string): { animations: { name: string }[]; nodes: { name?: string }[] } {
  const b = readFileSync(file);
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'));
}

describe('avatar clips', () => {
  const glb = glbJson(join(__dirname, '../../public/assets/kenney-blocky.glb'));
  const names = [...glb.animations.map((a) => a.name), jumpClip().name];

  it('every state has its clip: idle, walk, run (sprint), jump', () => {
    expect(CLIP_FOR).toEqual({ idle: 'idle', walk: 'walk', run: 'sprint', jump: 'jump' });
    for (const clip of Object.values(CLIP_FOR)) {
      expect(names).toContain(clip);
    }
  });

  it('the jump clip only targets nodes the model has', () => {
    const nodes = glb.nodes.map((n) => n.name);
    for (const t of jumpClip().tracks) {
      expect(nodes).toContain(t.name.split('.')[0]);
    }
  });
});
