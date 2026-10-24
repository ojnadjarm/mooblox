import { Group } from 'three';
import type { WorldData } from '../../domain/types';
import { gateSpot } from '../access-fence';
import type { WorldLayout } from '../layout';
import type { MaterialKit } from '../material-kit';
import { Gate } from './gate';

/** Fallback sign text when Moodle gives no reason. */
export const DEFAULT_GATE_STRINGS = { gate_open: 'Open!', lock_notyet: 'Not open yet' };
export type GateStrings = typeof DEFAULT_GATE_STRINGS;

/** One gate per zone that has been closed this session: shut with its reason, swung open once the section opens. */
export class GateLayer {
  readonly group = new Group();
  private readonly gates = new Map<number, Gate>();
  private readonly closed = new Map<number, boolean>();
  private layout: WorldLayout | null = null;

  constructor(
    private readonly kit: MaterialKit,
    private readonly strings: GateStrings = DEFAULT_GATE_STRINGS,
  ) {
    this.group.name = 'gates';
  }

  get(sectionId: number): Gate | undefined {
    return this.gates.get(sectionId);
  }

  /** Places the gates on a (new) layout and shows the world's state at once. */
  build(world: WorldData, layout: WorldLayout): this {
    for (const gate of this.gates.values()) {
      gate.root.removeFromParent();
      gate.dispose();
    }
    this.gates.clear();
    this.layout = layout;
    this.sync(world);
    return this;
  }

  /** Closes or opens each gate after a course change; opening swings on the next frames. */
  update(world: WorldData): void {
    this.sync(world);
  }

  /** Advances the swings; returns whether any gate still moves. */
  frame(dt: number): boolean {
    let moving = false;
    for (const gate of this.gates.values()) {
      moving = gate.update(dt) || moving;
    }
    return moving;
  }

  private sync(world: WorldData): void {
    for (const section of world.sections) {
      const before = this.closed.get(section.id);
      const zone = this.layout?.zones.find((z) => z.sectionId === section.id);
      if (!zone || (before === undefined && section.available)) {
        continue;
      }
      this.closed.set(section.id, !section.available);
      let gate = this.gates.get(section.id);
      if (!gate) {
        gate = new Gate(section.id, gateSpot(zone), this.kit);
        gate.snap(before ?? !section.available);
        this.gates.set(section.id, gate);
        this.group.add(gate.root);
      }
      gate.set(!section.available, section.lock || this.strings.lock_notyet, this.strings.gate_open);
    }
  }
}
