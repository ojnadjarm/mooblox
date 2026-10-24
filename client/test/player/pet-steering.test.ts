import { describe, expect, it } from 'vitest';
import { followPoint, PET, startPet, stepPet, type Leader, type PetState } from '../../src/player/pet-steering';

const DT = 1 / 60;
const dist = (s: PetState, l: Leader) => Math.hypot(s.x - l.x, s.z - l.z);

/** Runs the leader along `path` (position per step) and returns the pet's largest distance after a warm-up. */
function chase(path: (t: number) => Leader, seconds: number): { worst: number; last: PetState; leader: Leader } {
  let leader = path(0);
  let pet = startPet(leader);
  let worst = 0;
  for (let i = 1; i <= seconds * 60; i++) {
    leader = path(i * DT);
    pet = stepPet(pet, leader, DT);
    if (i > 30) worst = Math.max(worst, dist(pet, leader));
  }
  return { worst, last: pet, leader };
}

describe('stepPet', () => {
  it('stands beside and behind the leader, within 2 m', () => {
    const l = { x: 3, z: 4, yaw: 0 };
    const f = followPoint(l);
    expect(f.z).toBeLessThan(l.z);
    expect(Math.hypot(f.x - l.x, f.z - l.z)).toBeLessThan(2);
    expect(stepPet(startPet(l), l, DT)).toMatchObject({ x: f.x, z: f.z, speed: 0 });
  });

  it('keeps within 2 m of a leader running straight at 10 m/s', () => {
    const r = chase((t) => ({ x: 0, z: 10 * t, yaw: 0 }), 4);
    expect(r.worst).toBeLessThan(2);
    expect(r.last.yaw).toBeCloseTo(0, 1);
  });

  it('keeps within 2 m of a leader walking a 6 m/s circle', () => {
    const r = chase((t) => ({ x: 8 * Math.sin((6 / 8) * t), z: 8 * Math.cos((6 / 8) * t), yaw: (6 / 8) * t + Math.PI / 2 }), 10);
    expect(r.worst).toBeLessThan(2);
  });

  it('settles at its spot when the leader stops, facing the same way', () => {
    let pet = startPet({ x: 0, z: 0, yaw: 0 });
    const l = { x: 2, z: 1, yaw: 1 };
    for (let i = 0; i < 180; i++) pet = stepPet(pet, l, DT);
    const f = followPoint(l);
    expect(Math.hypot(pet.x - f.x, pet.z - f.z)).toBeLessThan(0.01);
    expect(pet.yaw).toBeCloseTo(1, 1);
  });

  it('jumps to its spot after a teleport and never exceeds its top speed', () => {
    const pet = stepPet(startPet({ x: 0, z: 0, yaw: 0 }), { x: 40, z: 0, yaw: 0 }, DT);
    expect(pet).toMatchObject(startPet({ x: 40, z: 0, yaw: 0 }));
    const near = stepPet(startPet({ x: 0, z: 0, yaw: 0 }), { x: 6, z: 0, yaw: 0 }, DT);
    expect(near.speed).toBeLessThanOrEqual(PET.maxSpeed);
  });
});
