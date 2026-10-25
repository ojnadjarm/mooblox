import { BoxGeometry, Mesh, Object3D, PlaneGeometry, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { Avatar } from '../../src/player/avatar';
import { BvhCollider } from '../../src/player/collider';
import type { FollowCamera } from '../../src/player/follow-camera';
import { Player } from '../../src/player/player';

/** A player on flat ground running +z at a wall 3 m ahead; records what the avatar is told. */
function rig() {
  const ground = new Mesh(new PlaneGeometry(200, 200).rotateX(-Math.PI / 2));
  const wall = new Mesh(new BoxGeometry(20, 4, 1).translate(0, 2, 3.5));
  const seen = { speed: 0, state: '', scaleY: 1 };
  const root = new Object3D();
  const avatar = {
    root,
    state: null,
    setMotion: (speed: number) => (seen.speed = speed),
    play: (state: string) => (seen.state = state),
    emote: () => false,
    update: () => {},
  } as unknown as Avatar;
  const camera = { yaw: 0, toWorld: (x: number, z: number) => ({ x, z }), follow: () => {} } as unknown as FollowCamera;
  const input = { read: () => ({ x: 0, z: 1, run: true, jump: false }) };
  const player = new Player(avatar, BvhCollider.fromMeshes([ground, wall]), new Vector3(0, 0, 0), input, camera);
  const puffs: number[] = [];
  player.onFeet = (_x, _y, _z, n) => puffs.push(n);
  const frame = () => {
    player.update(1 / 60);
    seen.scaleY = root.scale.y;
  };
  return { player, seen, puffs, frame };
}

describe('Player motion against a wall', () => {
  it('runs at full speed in the open, then stands still instead of running in place against the wall', () => {
    const { player, seen, frame } = rig();
    for (let f = 0; f < 15; f++) frame();
    expect(seen.state).toBe('run');
    expect(seen.speed).toBeGreaterThan(7);
    for (let f = 0; f < 60; f++) frame();
    expect(player.body.position.z).toBeLessThan(3.01);
    expect(seen.speed).toBeLessThan(0.5);
    expect(seen.state).toBe('idle');
  });

  it('bumps into the wall once: a puff at the face and a short squash, no footstep puffs while pressed against it', () => {
    const { seen, puffs, frame } = rig();
    for (let f = 0; f < 15; f++) frame();
    const before = puffs.length;
    let low = 1;
    for (let f = 0; f < 20; f++) {
      frame();
      low = Math.min(low, seen.scaleY);
    }
    expect(puffs.length - before).toBe(1);
    expect(puffs[before]).toBeGreaterThan(1);
    expect(low).toBeLessThan(0.97);
    const pressed = puffs.length;
    for (let f = 0; f < 60; f++) frame();
    expect(puffs.length).toBe(pressed);
  });
});
