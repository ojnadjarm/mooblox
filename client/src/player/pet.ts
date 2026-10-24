import type { Object3D } from 'three';
import { startPet, stepPet, type PetState } from './pet-steering';
import type { PetModel } from './pets';

/** What the pet needs from the player: the feet and the facing of the shown avatar. */
export interface PetLead {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly yaw: number;
}

const WALK = 0.6;
const RUN = 7.5;

/** Walks the worn pet after the player, beside and behind; at most one pet, nothing when none is worn. */
export class PetFollower {
  private model: PetModel | null = null;
  private state: PetState | null = null;

  constructor(
    private readonly lead: () => PetLead,
    private readonly place: (object: Object3D) => void,
  ) {}

  get pet(): PetModel | null {
    return this.model;
  }

  /** Swaps the pet (null removes it); the new one appears at its spot. */
  wear(model: PetModel | null, shadow = false): void {
    this.model?.dispose();
    this.model = model;
    this.state = null;
    if (!model) return;
    model.mesh.castShadow = shadow;
    this.place(model.root);
    this.step(0);
  }

  step(dt: number): void {
    const model = this.model;
    if (!model) return;
    const l = this.lead();
    const leader = { x: l.position.x, z: l.position.z, yaw: l.yaw };
    this.state = this.state ? stepPet(this.state, leader, dt) : startPet(leader);
    const root = model.root;
    root.position.x = this.state.x;
    root.position.z = this.state.z;
    root.position.y = dt > 0 ? root.position.y + (l.position.y - root.position.y) * Math.min(1, dt * 10) : l.position.y;
    root.rotation.y = this.state.yaw;
    const bearing = Math.atan2(l.position.x - this.state.x, l.position.z - this.state.z) - this.state.yaw;
    model.setMotion(this.state.speed, this.state.yaw, root.position.y, Math.atan2(Math.sin(bearing), Math.cos(bearing)));
    model.play(this.state.speed > RUN ? 'run' : this.state.speed > WALK ? 'walk' : 'idle');
    model.update(dt);
  }

  dispose(): void {
    this.wear(null);
  }
}
