import { describe, expect, it } from 'vitest';
import { MeshBasicMaterial, Vector3 } from 'three';
import { Campfires, emberAt, flicker } from '../../src/world/campfire';

describe('campfire motion', () => {
  it('flickers within a bounded range and keeps moving', () => {
    const hs = Array.from({ length: 200 }, (_, i) => flicker(i / 60, 0.4).h);
    expect(Math.min(...hs)).toBeGreaterThan(0.7);
    expect(Math.max(...hs)).toBeLessThan(1.3);
    expect(Math.max(...hs) - Math.min(...hs)).toBeGreaterThan(0.2);
  });
  it('sends embers up while they shrink to nothing', () => {
    const a = emberAt(0.1, 0.5);
    const b = emberAt(0.9, 0.5);
    expect(b.dy).toBeGreaterThan(a.dy);
    expect(b.size).toBeLessThan(a.size);
    expect(emberAt(1, 0.5).size).toBe(0);
  });
});

describe('Campfires', () => {
  const fires = [{ x: 0, y: 0, z: 0 }, { x: 300, y: 0, z: 0 }];
  const lamp = new MeshBasicMaterial({ vertexColors: true });
  it('animates near fires only: flames and embers in one draw on the given material, a glow disc each in another', () => {
    const f = new Campfires(fires, 'high', lamp, 2.5);
    f.update(1, new Vector3(2, 2, 2));
    const drawn = f.flames.geometry.drawRange.count;
    expect(drawn).toBe(f.flames.geometry.getAttribute('position').count / 2);
    expect(f.flames.material).toBe(lamp);
    expect(f.glow!.count).toBe(1);
    const colour = f.flames.geometry.getAttribute('color').array as Float32Array;
    expect(Math.max(...colour.subarray(0, drawn * 3)) * 2.5).toBeLessThan(1.4);
    f.dispose();
  });
  it('drops the embers and the ground glow on the low tier but keeps the flames', () => {
    const low = new Campfires(fires, 'low', lamp, 1);
    const high = new Campfires(fires, 'high', lamp, 2.5);
    low.update(1, new Vector3());
    high.update(1, new Vector3());
    expect(low.flames.geometry.drawRange.count).toBeGreaterThan(0);
    expect(low.flames.geometry.drawRange.count).toBeLessThan(high.flames.geometry.drawRange.count);
    expect(low.glow).toBeNull();
  });
});
