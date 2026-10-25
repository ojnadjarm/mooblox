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
    const wall = BvhCollider.fromMeshes([new Mesh(new BoxGeometry(20, 20, 0.5).translate(0, 0, 2.8))]);
    new FollowCamera(cam, canvas, wall).follow(new Vector3(), 0, true);
    expect(cam.position.z).toBeLessThan(2.55);
    expect(cam.position.z).toBeGreaterThan(0.5);
  });

  it('a wall that cuts into the sight line pulls the camera in front of it in a quick glide, not a cut', () => {
    const cam = new PerspectiveCamera();
    const wall = BvhCollider.fromMeshes([new Mesh(new BoxGeometry(20, 20, 0.5).translate(0, 0, 6))]);
    const none = new Vector3();
    let shown = false;
    const f = new FollowCamera(cam, canvas, { resolve: (a, b, r) => (shown ? wall.resolve(a, b, r) : none) });
    f.follow(new Vector3(), 0, true);
    shown = true;
    f.follow(new Vector3(), 0.1);
    let step = 0;
    for (let i = 0; i < 15; i++) {
      const z = cam.position.z;
      f.follow(new Vector3(), 1 / 60);
      step = Math.max(step, z - cam.position.z);
    }
    expect(cam.position.z).toBeLessThan(5.75);
    expect(step).toBeLessThan(1.5);
  });

  it('running past a wall that pulls the camera in, it stays behind the kid: no frame beside, past or inside it', () => {
    const wall = BvhCollider.fromMeshes([new Mesh(new BoxGeometry(20, 20, 0.5).translate(0, 0, 3))]);
    const none = new Vector3();
    let shown = false;
    const cam = new PerspectiveCamera(55, 1366 / 768, 0.1, 900);
    const f = new FollowCamera(cam, canvas, { resolve: (a, b, r) => (shown ? wall.resolve(a, b, r) : none) });
    const p = new Vector3();
    f.follow(p, 0, true);
    for (let i = 0; i < 60; i++) f.follow(p, 1 / 60, false, { x: 0, z: -10 });
    shown = true;
    for (let i = 0; i < 60; i++) {
      f.follow(p, 1 / 60, false, { x: 0, z: -10 });
      cam.updateMatrixWorld();
      expect(cam.position.z - p.z).toBeGreaterThan(1.5);
      const chest = p.clone().setY(1.3).project(cam);
      expect(Math.abs(chest.x)).toBeLessThan(1);
      expect(Math.abs(chest.y)).toBeLessThan(1);
    }
  });

  it('running sideways behind a wall, the glide in starts before the wall cuts the line to the chest', () => {
    for (const speed of [6, 8, 10]) {
      const wall = BvhCollider.fromMeshes([new Mesh(new BoxGeometry(10, 20, 4).translate(8, 0, 6))]);
      const cam = new PerspectiveCamera(55, 1366 / 768, 0.1, 900);
      const f = new FollowCamera(cam, canvas, wall);
      const p = new Vector3(-8, 0, 0);
      f.follow(p, 0, true);
      const chest = new Vector3();
      const to = new Vector3();
      let hidden = 0;
      for (let i = 0; i < 120; i++) {
        p.x += speed / 60;
        const before = cam.position.clone().sub(p);
        f.follow(p, 1 / 60, false, { x: speed, z: 0 });
        expect(cam.position.clone().sub(p).distanceTo(before)).toBeLessThan(2.5);
        chest.copy(p).setY(1.3);
        to.copy(cam.position).sub(chest);
        const length = to.length();
        to.normalize();
        const from = chest.clone().addScaledVector(to, 0.5);
        if (wall.resolve(from, chest.clone().addScaledVector(to, length - 0.35), 0.05).lengthSq() > 1e-6) hidden++;
      }
      expect(hidden).toBeLessThanOrEqual(1);
    }
  });

  it('spreads a blocked probe over frames: one sight line per frame, same answer as all at once', () => {
    const cases = [
      { box: new BoxGeometry(20, 20, 0.5).translate(0, 0, 5), far: false },
      { box: new BoxGeometry(0.15, 20, 0.15).translate(0, 0, 7), far: true },
      { box: new BoxGeometry(2, 20, 0.15).translate(1.3, 0, 7), far: true },
    ];
    for (const { box, far } of cases) {
      const solid = BvhCollider.fromMeshes([new Mesh(box)]);
      let calls = 0;
      let most = 0;
      const cam = new PerspectiveCamera();
      const f = new FollowCamera(cam, canvas, { resolve: (a, b, r) => (calls++, solid.resolve(a, b, r)) });
      f.follow(new Vector3(0, 0, -20), 0, true);
      for (let i = 0; i < 240; i++) {
        calls = 0;
        f.follow(new Vector3(), 1 / 60);
        most = Math.max(most, calls);
      }
      expect(most).toBeLessThanOrEqual(2 * 10 + 1);
      const once = new PerspectiveCamera();
      new FollowCamera(once, canvas, solid).follow(new Vector3(), 0, true);
      expect(cam.position.z).toBeCloseTo(once.position.z, 1);
      expect(cam.position.z > 9).toBe(far);
    }
  });

  it('a lamp post on the sight line does not pull it in', () => {
    const cam = new PerspectiveCamera();
    const post = BvhCollider.fromMeshes([new Mesh(new BoxGeometry(0.15, 20, 0.15).translate(0, 0, 7))]);
    new FollowCamera(cam, canvas, post).follow(new Vector3(), 0, true);
    expect(cam.position.z).toBeCloseTo(10, 5);
  });

  it('between sight-line probes, slides off a post it would touch', () => {
    const cam = new PerspectiveCamera();
    const post = BvhCollider.fromMeshes([new Mesh(new BoxGeometry(0.4, 20, 0.4).translate(0.3, 0, 10))]);
    const none = new Vector3();
    let shown = false;
    const f = new FollowCamera(cam, canvas, { resolve: (a, b, r) => (shown ? post.resolve(a, b, r) : none) });
    f.follow(new Vector3(), 0, true);
    shown = true;
    f.follow(new Vector3(), 1 / 60);
    expect(cam.position.x).toBeLessThan(0.1 - 0.25 + 1e-3);
  });

  it('looks ahead along the velocity', () => {
    const cam = new PerspectiveCamera(55, 2);
    const f = new FollowCamera(cam, canvas);
    for (let i = 0; i < 120; i++) f.follow(new Vector3(), 1 / 60, false, { x: 10, z: 0 });
    expect(cam.position.x).toBeGreaterThan(2);
  });

  it('keeps a kid running across a narrow portrait view inside the frame, a wide view keeps its look-ahead', () => {
    const across = (aspect: number): number => {
      const cam = new PerspectiveCamera(55, aspect, 0.1, 900);
      const f = new FollowCamera(cam, canvas);
      const p = new Vector3();
      f.follow(p, 0, true);
      let most = 0;
      for (let i = 0; i < 180; i++) {
        p.x += 10 / 60;
        f.follow(p, 1 / 60, false, { x: 10, z: 0 });
        cam.updateMatrixWorld();
        most = Math.max(most, Math.abs(p.clone().setY(1.3).project(cam).x));
      }
      return most;
    };
    expect(across(400 / 800)).toBeLessThan(0.75);
    expect(across(1366 / 768)).toBeGreaterThan(0.25);
  });

  it('a narrow view swings round behind a sideways run; a wide view and a held drag keep the yaw', () => {
    const turned = (aspect: number, drag = false): number => {
      const on = new Map<string, (e: unknown) => void>();
      const el = { addEventListener: (t: string, h: (e: unknown) => void) => on.set(t, h), setPointerCapture: () => undefined } as unknown as HTMLElement;
      const f = new FollowCamera(new PerspectiveCamera(55, aspect, 0.1, 900), el);
      const p = new Vector3();
      f.follow(p, 0, true);
      if (drag) on.get('pointerdown')!({ clientX: 0, clientY: 0, pointerId: 1 });
      for (let i = 0; i < 120; i++) {
        p.x += 10 / 60;
        f.follow(p, 1 / 60, false, { x: 10, z: 0 });
      }
      return f.yaw;
    };
    expect(turned(400 / 800)).toBeLessThan(-0.9);
    expect(turned(1366 / 768)).toBeGreaterThan(-0.25);
    expect(turned(400 / 800, true)).toBe(0);
  });

  it('pulled in by a wall behind, a run away from it keeps the camera behind the kid, out of the wall, the kid in the picture', () => {
    const wall = BvhCollider.fromMeshes([new Mesh(new BoxGeometry(20, 20, 0.5).translate(0, 0, 3))]);
    for (const aspect of [400 / 800, 1366 / 768]) {
      const cam = new PerspectiveCamera(55, aspect, 0.1, 900);
      const f = new FollowCamera(cam, canvas, wall);
      const p = new Vector3();
      f.follow(p, 0, true);
      for (let i = 0; i < 120; i++) {
        f.follow(p, 1 / 60, false, { x: 0, z: -10 });
        cam.updateMatrixWorld();
        expect(cam.position.z).toBeGreaterThan(1.5);
        expect(cam.position.z).toBeLessThan(2.75);
        expect(Math.abs(p.clone().setY(1.3).project(cam).y)).toBeLessThan(1);
      }
    }
  });
});
