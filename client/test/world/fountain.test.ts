import { Mesh, PlaneGeometry, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/get_world_demo.json';
import { parseShape, shapeWorld } from '../../src/domain/course-shape';
import { toWorld } from '../../src/domain/mapper';
import { BvhCollider } from '../../src/player/collider';
import { Physics, stepBody, type Body } from '../../src/player/controller';
import { designWorld } from '../../src/world/dressing';
import { IslandLayout } from '../../src/world/island-layout';
import { FOUNTAIN_LIP, FOUNTAIN_STEP, tieredFountain } from '../../src/world/landmarks/fountain';
import { CAMPUS } from '../../src/world/look';
import { RIPPLE, SPLASH, STREAM } from '../../src/world/water-motion';

const tris = (g: { getAttribute(n: string): { count: number } }) => g.getAttribute('position').count / 3;

describe('tiered fountain', () => {
  const lm = tieredFountain(CAMPUS.palette, 0x2fa39a);

  it('is a landmark-sized model with three tiers inside its step', () => {
    expect(lm.parts.reduce((n, g) => n + tris(g), 0)).toBeLessThanOrEqual(3000);
    expect(lm.height).toBeGreaterThan(2.5);
    for (const g of lm.parts) {
      expect(g.getAttribute('color')).toBeDefined();
      expect(g.getAttribute('surface')).toBeDefined();
      g.computeBoundingBox();
      expect(Math.max(-g.boundingBox!.min.x, g.boundingBox!.max.x, -g.boundingBox!.min.z, g.boundingBox!.max.z)).toBeLessThanOrEqual(FOUNTAIN_STEP + 1e-6);
    }
  });

  it('codes its water to move: ripples in every pool, streams and the jet flowing, splashes where the streams land', () => {
    const codes = lm.parts.flatMap((g) => Array.from((g.getAttribute('sway')?.array as Float32Array | undefined) ?? []));
    expect(codes.filter((c) => c >= RIPPLE && c < STREAM).length).toBeGreaterThan(0);
    expect(codes.filter((c) => c >= STREAM && c < SPLASH).length).toBeGreaterThan(0);
    expect(codes.filter((c) => c >= SPLASH).length).toBeGreaterThan(0);
    expect(lm.parts.filter((g) => g.getAttribute('sway') && Math.min(...(g.getAttribute('sway').array as Float32Array)) >= STREAM && Math.max(...(g.getAttribute('sway').array as Float32Array)) < SPLASH).length).toBe(8 + 6 + 1);
  });

  for (const [name, w] of [['demo', toWorld(fixture)], ['8x12', shapeWorld(812, parseShape('8x12'))]] as const) {
    describe(name, () => {
      const layout = new IslandLayout(CAMPUS.size).layout(w);
      const d = designWorld(layout, w.courseId, CAMPUS.palette);
      const hub = layout.hubs[0]!;

      it('stands on the plaza centre, walled above any jump, and the player starts outside it facing it and the landmark', () => {
        expect(d.obstacles.some((o) => Math.hypot(o.x - hub.x, o.z - hub.z) < 1e-6 && o.r >= FOUNTAIN_LIP)).toBe(true);
        const apex = (Physics.jump * Physics.jump) / (2 * -Physics.gravity);
        const wall = d.districts[0]!.blockers.map((b) => (b.computeBoundingBox(), b.boundingBox!)).find((b) => Math.abs((b.min.x + b.max.x) / 2 - hub.x) < 1e-6 && Math.abs((b.min.z + b.max.z) / 2 - hub.z) < 1e-6);
        expect(wall!.max.y).toBeGreaterThan(apex + 1.2);
        const s = d.start;
        expect(Math.hypot(s.x - hub.x, s.z - hub.z)).toBeGreaterThan(FOUNTAIN_LIP + Physics.radius + 1);
        expect(Math.abs(Math.atan2(hub.x - s.x, hub.z - s.z) - s.face)).toBeLessThan(1e-9);
        const f = d.focus!;
        expect(Math.abs(Math.atan2(f.x - s.x, f.z - s.z) - s.face)).toBeLessThan(1e-6);
      });

      it('stops a player running and jumping at it from the start', () => {
        const solids = d.districts[0]!.terrain.filter((t) => t.solid).map((t) => new Mesh(t.geometry));
        const ground = new Mesh(new PlaneGeometry(400, 400).rotateX(-Math.PI / 2));
        const collider = BvhCollider.fromMeshes([ground, ...solids, ...d.districts[0]!.blockers.map((b) => new Mesh(b))]);
        const body: Body = { position: new Vector3(d.start.x, 0.2, d.start.z), velocity: new Vector3(), onGround: false };
        const ux = Math.sin(d.start.face);
        const uz = Math.cos(d.start.face);
        let nearest = Infinity;
        for (let i = 0; i < 240; i++) {
          stepBody(body, { x: ux, z: uz, run: true, jump: body.onGround }, Physics.step, collider);
          nearest = Math.min(nearest, Math.hypot(body.position.x - hub.x, body.position.z - hub.z));
        }
        expect(body.position.y).toBeGreaterThan(-0.1);
        expect(nearest).toBeGreaterThan(FOUNTAIN_LIP);
      });
    });
  }
});
