import { describe, expect, it } from 'vitest';
import { gardenRoom, HEDGE_THICK, roomReach, ROOMS, type RoomKind } from '../../src/world/landmarks/garden-room';
import { CAMPUS } from '../../src/world/look';
import { seededRandom } from '../../src/world/random';

const KINDS: readonly RoomKind[] = ['reading', 'parterre'];

describe('garden room', () => {
  for (const kind of KINDS) {
    for (const size of ROOMS) {
      it(`${kind} ${size.w}x${size.d}: coloured meshes inside its reach, under 1.6k triangles, walls apart and inside the hedges`, () => {
        const room = gardenRoom(kind, size, CAMPUS.palette, 0x2fa39a, seededRandom(7));
        let tris = 0;
        for (const g of [room.hedges, room.inside]) {
          const pos = g.getAttribute('position');
          expect(g.getAttribute('color').count).toBe(pos.count);
          tris += pos.count / 3;
          for (let i = 0; i < pos.count; i++) expect(Math.hypot(pos.getX(i), pos.getZ(i))).toBeLessThanOrEqual(roomReach(size) + 0.15);
        }
        expect(tris).toBeLessThan(1600);
        const spots = [...room.walls, { ...room.tree, r: 0.5 }, ...(room.bench ? [{ ...room.bench, r: 0.5 }] : [])];
        for (let i = 0; i < spots.length; i++) {
          for (let j = i + 1; j < spots.length; j++) {
            const a = spots[i]!;
            const b = spots[j]!;
            expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(a.r + b.r - 1e-6);
          }
        }
        for (const s of [...room.seats, room.tree]) {
          expect(Math.abs(s.x)).toBeLessThan(size.w / 2 - HEDGE_THICK / 2);
          expect(Math.abs(s.z)).toBeLessThan(size.d / 2 - HEDGE_THICK / 2);
        }
      });
    }
  }

  it('the open front leaves a walk-in gap: a 1.6 m clear gap at the front centre', () => {
    for (const kind of KINDS) {
      const room = gardenRoom(kind, ROOMS[0]!, CAMPUS.palette, 0xf07a5f, seededRandom(1));
      for (const w of room.walls) expect(Math.hypot(w.x, w.z - ROOMS[0]!.d / 2)).toBeGreaterThan(0.8 + w.r);
    }
  });
});
