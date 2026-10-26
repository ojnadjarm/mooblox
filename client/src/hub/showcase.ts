import { CylinderGeometry, Group, Mesh, MeshLambertMaterial, type BufferGeometry, type Material } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Trophy } from '../domain/rewards';
import { hallEntries } from '../boot/trophy-hall';
import { collectibleGeometry } from '../world/collectible-models';
import { facet } from '../world/landmarks/shapes';
import type { MaterialKit } from '../world/material-kit';
import { ATLAS_WHITE, atlasCell, TrophyAtlas } from '../world/trophy-atlas';
import { hallCapacity, hallGeometry, metalOf, type HallItem } from '../world/trophy-hall';
import { withShine } from '../world/trophy-shine';
import type { HubTotals } from './courses';
import { displaySpots, HUB } from './hub-layout';

/** Float height and size of the display models over their plinths. */
const FLOAT = { y: 2.15, scale: 2.3 } as const;

/** The show-off area: every trophy in the hall, and a gem, crystal, star and level coin turning over their plinths. */
export class Showcase {
  readonly group = new Group();
  /** The hall (solid). */
  readonly hall: Mesh;
  /** Badges standing on pedestals. */
  readonly shown: number;
  private readonly models: Mesh[] = [];
  private readonly atlas: TrophyAtlas;
  private readonly materials: Material[] = [];

  constructor(kit: MaterialKit, totals: HubTotals, changed: () => void, shadows: boolean) {
    this.group.name = 'showcase';
    this.atlas = new TrophyAtlas(changed);
    const hallMaterial = withShine(kit.paintedPlastic(this.atlas.texture), kit.time);
    hallMaterial.customProgramCacheKey = () => 'mooblox-trophy-hall';
    const trophies: Trophy[] = totals.trophies.map((t) => ({ badgeId: t.badgeid, name: t.name, imageUrl: t.image, timeIssued: t.timeissued }));
    const capacity = hallCapacity(HUB.hall.r);
    const entries = hallEntries(trophies, capacity);
    const ids = trophies.map((t) => t.badgeId);
    const items: HallItem[] = entries.map((e, i) => (e.kind === 'badge' ? { metal: metalOf(ids[i]!), trophy: true } : { metal: e.kind === 'more' ? 'gold' : 'silver', trophy: false }));
    this.atlas.paint(entries);
    this.hall = new Mesh(hallGeometry(HUB.hall, items, entries.map((_, i) => atlasCell(i)), ATLAS_WHITE).geometry, hallMaterial);
    this.hall.name = 'trophy-hall';
    this.hall.castShadow = shadows;
    this.hall.receiveShadow = true;
    this.shown = entries.filter((e) => e.kind === 'badge').length;
    this.group.add(this.hall);
    const modelMaterial = new MeshLambertMaterial({ vertexColors: true, emissive: 0x3a3450 });
    this.materials.push(hallMaterial, modelMaterial);
    const geometries: BufferGeometry[] = [collectibleGeometry('gem'), collectibleGeometry('crystal'), collectibleGeometry('star'), coin()];
    displaySpots().forEach((s, i) => {
      const m = new Mesh(geometries[i], modelMaterial);
      m.name = `display-${i}`;
      m.position.set(s.x, FLOAT.y, s.z);
      m.scale.setScalar(FLOAT.scale);
      m.castShadow = shadows;
      this.models.push(m);
      this.group.add(m);
    });
  }

  /** Turns and bobs the display models (t = seconds). */
  update(t: number): void {
    this.models.forEach((m, i) => {
      m.rotation.y = t * 0.9 + i * 1.3;
      m.position.y = FLOAT.y + Math.sin(t * 1.6 + i) * 0.12;
    });
  }

  dispose(): void {
    this.atlas.dispose();
    for (const m of this.materials) m.dispose();
    this.hall.geometry.dispose();
    for (const m of this.models) m.geometry.dispose();
  }
}

/** A gold level coin standing on its edge, a sky-blue disc on each face. */
function coin(): BufferGeometry {
  const rim = facet(new CylinderGeometry(0.42, 0.42, 0.12, 20).rotateX(Math.PI / 2), 0xffc21a);
  const face = facet(new CylinderGeometry(0.3, 0.3, 0.14, 20).rotateX(Math.PI / 2), 0x4fc3ff);
  return mergeGeometries([rim, face], false)!;
}
