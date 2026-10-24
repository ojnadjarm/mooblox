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
    expect(walled.position.z).toBeGreaterThan(3);
    expect(walled.position.y).toBeGreaterThan(2.1);
  });

  it('comes in close in front of a wall right behind the player instead of sitting inside it', () => {
    const cam = new PerspectiveCamera();
    const wall = BvhCollider.fromMeshes([new Mesh(new BoxGeometry(20, 20, 0.5).translate(0, 0, 2.5))]);
    new FollowCamera(cam, canvas, wall).follow(new Vector3(), 0, true);
    expect(cam.position.z).toBeLessThan(2.25);
    expect(cam.position.z).toBeGreaterThan(0.5);
  });

  it('a lagging camera never trails behind a wall that cuts into the sight line', () => {
    const cam = new PerspectiveCamera();
    const wall = BvhCollider.fromMeshes([new Mesh(new BoxGeometry(20, 20, 0.5).translate(0, 0, 6))]);
    const none = new Vector3();
    let shown = false;
    const f = new FollowCamera(cam, canvas, { resolve: (a, b, r) => (shown ? wall.resolve(a, b, r) : none) });
    f.follow(new Vector3(), 0, true);
    shown = true;
    f.follow(new Vector3(), 0.1);
    expect(cam.position.z).toBeLessThan(5.75);
  });

  it('looks ahead along the velocity', () => {
    const cam = new PerspectiveCamera();
    const f = new FollowCamera(cam, canvas);
    for (let i = 0; i < 120; i++) f.follow(new Vector3(), 1 / 60, false, { x: 10, z: 0 });
    expect(cam.position.x).toBeGreaterThan(2);
  });
});
