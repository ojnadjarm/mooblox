import { seededRandom } from './random';

/** One billow of a cloud, offset from the cloud's base centre (the flat bottom sits at dy = 0). */
export interface CloudLump {
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
  readonly r: number;
}

/** One cloud: ring and high clouds round the camera (x, z relative to it, y absolute, m); overview clouds in extent units. */
export interface CloudPuff {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly lumps: readonly CloudLump[];
}

/** Clouds in the ring the eye-level camera sees above the horizon, plus a few high ones overhead (base height, width in m). */
export const CLOUD_RING = { count: 14, near: 240, far: 420, low: 26, high: 52, width: [62, 100] } as const;
export const CLOUD_HIGH = { count: 4, near: 130, far: 210, low: 70, high: 90, width: [40, 60] } as const;

/**
 * The overview's composed clouds (archipelago centre and half-extent units): over the far sea at the top of the map camera's
 * frame, a big one on each side and a small one between, below the camera so they are seen from above as in the concept.
 */
export const OVERVIEW_CLOUDS = [
  { x: -0.98, y: 0.2, z: -1.18, width: 0.62 },
  { x: 0.16, y: 0.2, z: -1.41, width: 0.4 },
  { x: 1.41, y: 0.2, z: -0.22, width: 0.85 },
] as const;

/** A cumulus of the given width: a row of 3-5 billows on one flat base, biggest in the middle, and 1-2 crowns on top. */
export function cumulus(random: () => number, width: number): CloudLump[] {
  const crowns = 1 + Math.floor(random() * 2);
  const row = 3 + Math.floor(random() * 3);
  const lumps: CloudLump[] = [];
  for (let k = 0; k < crowns; k++) {
    const r = width * (0.24 - k * 0.04 + random() * 0.03);
    lumps.push({ dx: (k ? 1 : -1) * width * (0.04 + random() * 0.1), dy: r * (0.75 + random() * 0.2), dz: (random() - 0.5) * width * 0.08, r });
  }
  for (let k = 0; k < row; k++) {
    const u = row === 1 ? 0 : (k / (row - 1)) * 2 - 1;
    const r = width * (0.17 + random() * 0.03) * (1 - 0.35 * Math.abs(u));
    lumps.push({ dx: u * (width / 2 - r), dy: r * 0.45, dz: (random() - 0.5) * width * 0.16, r });
  }
  return lumps;
}

/**
 * The camera-centred cloud layer, pure and seeded: cumulus spread round the full circle in jittered sectors so every view
 * direction gets one or two, never a uniform row.
 */
export function cloudPuffs(seed: number): CloudPuff[] {
  const random = seededRandom(seed ^ 0x5c10d5);
  const out: CloudPuff[] = [];
  const ring = (band: typeof CLOUD_RING | typeof CLOUD_HIGH) => {
    for (let i = 0; i < band.count; i++) {
      const a = ((i + 0.15 + random() * 0.7) / band.count) * Math.PI * 2;
      const d = band.near + random() * (band.far - band.near);
      const lumps = cumulus(random, band.width[0] + random() * (band.width[1] - band.width[0]));
      out.push({ x: Math.cos(a) * d, y: band.low + random() * (band.high - band.low), z: Math.sin(a) * d, yaw: a + Math.PI / 2 + (random() - 0.5) * 0.6, lumps });
    }
  };
  ring(CLOUD_RING);
  ring(CLOUD_HIGH);
  return out;
}

/** The overview's clouds in extent units, facing the map camera (which looks along -z). */
export function overviewPuffs(seed: number): CloudPuff[] {
  const random = seededRandom(seed ^ 0x0e7c10);
  return OVERVIEW_CLOUDS.map((c) => ({ x: c.x, y: c.y, z: c.z, yaw: (random() - 0.5) * 0.5, lumps: cumulus(random, c.width) }));
}
