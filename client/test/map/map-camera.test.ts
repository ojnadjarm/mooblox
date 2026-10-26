import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { flightPose, landingPose, MapCamera, overviewPose, placeCamera } from '../../src/map/map-camera';
import { mapLayout } from '../../src/map/map-layout';

describe('map camera', () => {
  it('flight starts at the overview, ends on the island and only gets closer', () => {
    const a = overviewPose(100, 1366, 768, 55);
    const b = landingPose(a, 40, -20, 13);
    expect(flightPose(a, b, 0)).toEqual(a);
    const end = flightPose(a, b, 1);
    for (const k of ['x', 'z', 'distance', 'yaw', 'pitch'] as const) expect(end[k]).toBeCloseTo(b[k], 9);
    let last = Infinity;
    for (let t = 0; t <= 1; t += 0.05) {
      const p = flightPose(a, b, t);
      expect(p.distance).toBeLessThanOrEqual(last + 1e-9);
      last = p.distance;
    }
  });

  it('overview sees every island on a phone and a wide screen', () => {
    for (const n of [1, 12, 40]) {
      const l = mapLayout(n);
      for (const [w, h] of [[400, 860], [768, 1024], [2560, 1440]] as const) {
        const camera = new PerspectiveCamera(55, w / h, 0.1, 5000);
        placeCamera(camera, overviewPose(l.extent, w, h, 55));
        camera.updateMatrixWorld();
        for (const c of l.islands) {
          const p = camera.position.clone().set(c.x, 0, c.z).project(camera);
          expect(Math.abs(p.x)).toBeLessThan(1 - (2 * 20) / w);
          expect(Math.abs(p.y)).toBeLessThan(1 - (2 * 60) / h);
        }
      }
    }
  });

  it('flyTo calls back once on arrival and pans stay inside the map', () => {
    const camera = new PerspectiveCamera(55, 1.5, 0.1, 2000);
    const map = new MapCamera(camera, 80);
    map.pan(-1e6, 0, 800);
    expect(Math.hypot(map.current.x, map.current.z)).toBeLessThanOrEqual(80 + 1e-6);
    let arrived = 0;
    map.flyTo(30, 30, 13, () => arrived++);
    for (let i = 0; i < 200; i++) map.update(1 / 60);
    expect(arrived).toBe(1);
    expect(map.current.x).toBeCloseTo(30);
    expect(map.flying).toBe(false);
  });
});
