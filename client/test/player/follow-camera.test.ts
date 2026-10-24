import { BoxGeometry, Mesh, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BvhCollider } from '../../src/player/collider';
import { FollowCamera } from '../../src/player/follow-camera';

const canvas = { addEventListener: () => undefined, setPointerCapture: () => undefined } as unknown as HTMLElement;

describe('FollowCamera', () => {
  it('sits behind the player in the open and pulls in in front of a wall', () => {
    const open = new PerspectiveCamera();
    new FollowCamera(open, canvas).follow(new Vector3(), 0, true);
    expect(open.position.z).toBeCloseTo(10, 5);
    const walled = new PerspectiveCamera();
    const wall = BvhCollider.fromMeshes([new Mesh(new BoxGeometry(20, 20, 0.5).translate(0, 0, 5))]);
    new FollowCamera(walled, canvas, wall).follow(new Vector3(), 0, true);
    expect(walled.position.z).toBeLessThan(4.7);
    expect(walled.position.z).toBeGreaterThanOrEqual(4.5 - 1e-9);
  });

  it('looks ahead along the velocity', () => {
    const cam = new PerspectiveCamera();
    const f = new FollowCamera(cam, canvas);
    for (let i = 0; i < 120; i++) f.follow(new Vector3(), 1 / 60, false, { x: 10, z: 0 });
    expect(cam.position.x).toBeGreaterThan(2);
  });
});
