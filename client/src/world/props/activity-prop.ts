import { BoxGeometry, Group, Mesh, PlaneGeometry, TorusGeometry, type Material } from 'three';
import { CompletionTracking, isDone, type Activity } from '../../domain/types';
import type { Plot } from '../layout';
import { paint } from '../material-kit';
import { Palette } from '../palette';
import { Parts } from './parts';
import type { Prop, PropContext, PropState } from './prop';

/** Top of the plot pad the props stand on. */
export const PAD_TOP = 0.3;

/** Where a factory wants the shared pieces; local +Z faces the zone centre. */
export interface PropShape {
  readonly body: Parts;
  readonly sign: { readonly x: number; readonly y: number; readonly z: number; readonly w: number; readonly h: number };
  readonly flag: { readonly x: number; readonly z: number; readonly height: number } | null;
  readonly lock: { readonly x: number; readonly y: number; readonly z: number };
}

const FLAG_W = 0.9;
const FLAG_H = 0.6;

/** A factory's body plus the shared name sign, completion flag and padlock. */
export class ActivityProp implements Prop {
  readonly activityId: number;
  readonly root = new Group();
  readonly detail = new Group();
  private readonly flag: Mesh;
  private readonly lock: Mesh;
  private readonly materials: Material[] = [];
  private readonly hasFlag: boolean;
  private current: PropState = { locked: false, done: null };

  constructor(
    readonly key: string,
    a: Activity,
    plot: Plot,
    ctx: PropContext,
    shape: PropShape,
  ) {
    this.activityId = a.id;
    this.root.name = `prop-${a.id}`;
    this.root.position.set(plot.x, PAD_TOP, plot.z);
    this.root.rotation.y = plot.facing;
    const { sign, lock } = shape;
    const flag = shape.flag ?? { x: 0, z: 0, height: 0 };
    this.hasFlag = shape.flag !== null;
    if (this.hasFlag) {
      shape.body.cylinder(0.07, flag.height, Palette.white, flag.x, flag.height / 2, flag.z, 8);
      shape.body.box(0.22, 0.22, 0.22, Palette.gold, flag.x, flag.height + 0.08, flag.z);
    }
    this.root.add(shape.body.mesh('prop-body', ctx.kit.plastic));

    const signMaterial = ctx.kit.textured(ctx.signs.paint(a));
    this.materials.push(signMaterial);
    const board = new Mesh(new PlaneGeometry(sign.w, sign.h), signMaterial);
    board.name = 'prop-sign';
    board.position.set(sign.x, sign.y, sign.z);
    this.detail.add(board);

    const cloth = new BoxGeometry(FLAG_W, FLAG_H, 0.06);
    cloth.translate(flag.x + FLAG_W / 2 + 0.05, flag.height - FLAG_H / 2 - 0.05, flag.z);
    this.flag = new Mesh(paint(cloth, Palette.white), ctx.kit.plastic);
    this.flag.name = 'prop-flag';
    this.flag.castShadow = true;
    this.detail.add(this.flag);

    this.lock = padlock(ctx.kit.plastic);
    this.lock.position.set(lock.x, lock.y, lock.z);
    this.detail.add(this.lock);
    this.root.add(this.detail);
    this.update(a);
  }

  get state(): PropState {
    return this.current;
  }

  update(a: Activity): void {
    const tracked = a.completion.tracking !== CompletionTracking.None;
    this.current = { locked: !a.available, done: tracked ? isDone(a.completion) : null };
    this.flag.visible = this.hasFlag && tracked && a.available;
    paint(this.flag.geometry, this.current.done ? Palette.green : Palette.white);
    this.lock.visible = this.current.locked;
  }

  dispose(): void {
    this.root.traverse((o) => (o as Mesh).geometry?.dispose());
    for (const m of this.materials) {
      m.dispose();
    }
  }
}

/** A chunky gold padlock, shown on locked activities. */
function padlock(material: Material): Mesh {
  return new Parts()
    .box(0.7, 0.6, 0.3, Palette.gold, 0, 0, 0)
    .add(new TorusGeometry(0.22, 0.07, 8, 16, Math.PI), Palette.stoneDark, 0, 0.3, 0)
    .box(0.12, 0.22, 0.32, Palette.ink, 0, -0.02, 0)
    .mesh('prop-lock', material);
}
