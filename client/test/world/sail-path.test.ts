import { Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { sailPose, type SailPose } from '../../src/world/sail-path';

const SAILS = [
  { x: 0, z: 0, r: 60 },
  { x: 0, z: 0, r: 72 },
  { x: 12, z: -30, r: 25 },
];

describe('sailPose', () => {
  it('points the bow (+z) along the travel at every moment, both ways round the circle', () => {
    const m = new Object3D();
    const bow = new Vector3();
    const a: SailPose = { x: 0, z: 0, yaw: 0 };
    const b: SailPose = { x: 0, z: 0, yaw: 0 };
    let checked = 0;
    for (const [k, s] of SAILS.entries()) {
      for (const i of [k, k + 1]) {
        for (let t = 0; t < 120; t += 0.7) {
          sailPose(s, i, t, a);
          const { x, z } = sailPose(s, i, t + 1e-3, b);
          const v = new Vector3(x - a.x, 0, z - a.z).normalize();
          m.rotation.set(0, a.yaw, 0.05);
          m.updateMatrix();
          bow.set(0, 0, 1).applyMatrix4(m.matrix).setY(0).normalize();
          expect(bow.dot(v)).toBeGreaterThan(0.999);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('keeps the ship on its circle at sailing speed', () => {
    const p: SailPose = { x: 0, z: 0, yaw: 0 };
    const s = SAILS[2]!;
    sailPose(s, 1, 3, p);
    expect(Math.hypot(p.x - s.x, p.z - s.z)).toBeCloseTo(s.r, 6);
    const q = sailPose(s, 1, 4, { x: 0, z: 0, yaw: 0 });
    expect(Math.hypot(q.x - p.x, q.z - p.z)).toBeCloseTo(5, 1);
  });
});
