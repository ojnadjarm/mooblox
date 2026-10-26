import { FrontSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { familyOf } from '../../src/world/kit-materials';
import { bakeKit } from '../../tools/kit-bake';

const kit = await bakeKit(new URL('../../public/assets/kit.glb', import.meta.url).pathname);
const houses = [...kit].filter(([id]) => /building/.test(id));

/** Distance past the wall plane at which a ray from outside first meets a front face (Infinity: it sees through the house). */
function depthAt(mesh: Mesh, from: Vector3, dir: Vector3): number {
  const hits = new Raycaster(from, dir, 0, 5).intersectObject(mesh);
  return hits.length ? hits[0]!.distance - 0.1 : Infinity;
}

describe('kit houses: closed doors and cosy windows (play-test round 2, items 5 and 6)', () => {
  it('finds all six house kinds', () => expect(houses.length).toBe(6));

  for (const [id, { model, materials }] of houses) {
    const mesh = new Mesh(model.geometry, new MeshBasicMaterial({ side: FrontSide }));
    const pos = model.geometry.getAttribute('position');
    const col = model.geometry.getAttribute('color');

    it(`${id}: every doorway is closed across its whole opening`, () => {
      for (const side of [1, -1]) {
        const door = [...Array(pos.count).keys()].filter((i) => /door/.test(materials[i]!) && Math.sign(pos.getZ(i)) === side);
        if (!door.length) continue;
        const xs = door.map((i) => pos.getX(i));
        const plane = Math.max(...door.map((i) => pos.getZ(i) * side));
        const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
        expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.13);
        for (const dx of [-0.055, -0.02, 0.02, 0.055]) {
          for (const y of [0.03, 0.1, 0.19, 0.25]) {
            const from = new Vector3(mid + dx, y, (plane + 0.1) * side);
            expect(depthAt(mesh, from, new Vector3(0, 0, -side))).toBeLessThan(0.03);
          }
        }
      }
    });

    it(`${id}: rectangular blue panes became rooms, none tinted for the roof repaint`, () => {
      let glass = 0;
      let room = 0;
      for (let i = 0; i < pos.count; i += 3) {
        if (materials[i] === 'colormap' && familyOf(id, 'colormap', col.getX(i), col.getY(i), col.getZ(i)) === 'smooth') glass++;
        if (materials[i] === 'interior') room++;
      }
      // Only the triangular gable lights stay glass.
      expect(glass).toBeLessThanOrEqual(2);
      expect(room).toBeGreaterThan(100);
      for (let i = 0; i < pos.count; i++) {
        if (materials[i] !== 'interior') continue;
        const [r, g, b] = [col.getX(i), col.getY(i), col.getZ(i)];
        expect(g > r * 1.25 && g > b * 1.1).toBe(false);
      }
    });
  }
});
