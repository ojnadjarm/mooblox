import { CanvasTexture, Group, Mesh, PlaneGeometry, SRGBColorSpace, TorusGeometry, type Material } from 'three';
import type { GateSpot } from '../access-fence';
import type { MaterialKit } from '../material-kit';
import { Palette } from '../palette';
import { Parts } from '../props/parts';

const SPAN = 3.4;
const POST = 0.9;
const LEAF_H = 2.7;
const LEAF_W = SPAN / 2;
const BEAM_Y = 3.5;
const BOARD_W = SPAN + 1.6;
const BOARD_H = 1.25;
const OPEN_ANGLE = 1.75;
const SWING_S = 0.9;

const css = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`;
const FONT = '"Nunito", "Fredoka", "Trebuchet MS", system-ui, sans-serif';

/** A castle-style bridge gate: stone towers, an oak beam with a painted sign, two banded leaves and a padlock. */
export class Gate {
  readonly root = new Group();
  private readonly leaves: [Group, Group];
  private readonly lock: Mesh;
  private readonly board: Mesh;
  private readonly material: Material;
  private readonly texture: CanvasTexture;
  private open = 0;
  private target = 0;
  private text = '';

  constructor(
    readonly sectionId: number,
    spot: GateSpot,
    private readonly kit: MaterialKit,
  ) {
    this.root.name = `gate-${sectionId}`;
    this.root.position.set(spot.x, 0, spot.z);
    this.root.rotation.y = spot.yaw;
    this.root.add(frame().mesh('gate-frame', kit.plastic));
    this.leaves = [this.leaf(-1), this.leaf(1)];
    this.lock = padlock(kit.plastic);
    this.lock.position.set(0, 1.45, -0.32);
    this.root.add(this.lock);

    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = Math.round((768 * BOARD_H) / BOARD_W);
    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.material = kit.textured(this.texture);
    this.board = new Mesh(new PlaneGeometry(BOARD_W - 0.2, BOARD_H - 0.2), this.material);
    this.board.name = 'gate-sign';
    this.board.position.set(0, BEAM_Y + 0.95, -0.86);
    this.board.rotation.y = Math.PI;
    this.root.add(this.board);
  }

  get isOpen(): boolean {
    return this.target === 1;
  }

  /** Poses the leaves shut or open at once. */
  snap(closed: boolean): void {
    this.open = this.target = closed ? 0 : 1;
    this.pose();
  }

  /** Closed with the lock reason on the sign, or open with `openText`; swings the leaves on the next frames. */
  set(closed: boolean, reason: string, openText: string): void {
    this.target = closed ? 0 : 1;
    this.lock.visible = closed;
    const text = closed ? reason : openText;
    if (text !== this.text) {
      this.text = text;
      paintSign(this.texture, text, closed);
    }
  }

  /** Advances the swing; returns whether it still moves. */
  update(dt: number): boolean {
    if (this.open === this.target) {
      return false;
    }
    const step = dt / SWING_S;
    this.open = this.target > this.open ? Math.min(this.target, this.open + step) : Math.max(this.target, this.open - step);
    this.pose();
    return true;
  }

  dispose(): void {
    this.root.traverse((o) => (o as Mesh).geometry?.dispose());
    this.material.dispose();
    this.texture.dispose();
  }

  private pose(): void {
    const ease = this.open * this.open * (3 - 2 * this.open);
    this.leaves[0].rotation.y = -ease * OPEN_ANGLE;
    this.leaves[1].rotation.y = ease * OPEN_ANGLE;
  }

  /** One leaf hung on its tower; side -1 is left (seen from the hub), +1 right; swings away from the hub. */
  private leaf(side: -1 | 1): Group {
    const hinge = new Group();
    hinge.position.set(side * (SPAN / 2), 0, 0);
    const c = -side * (LEAF_W / 2);
    const parts = new Parts();
    for (let i = 0; i < 4; i++) {
      const w = LEAF_W / 4;
      const x = -side * (w / 2 + i * w);
      parts.box(w - 0.04, LEAF_H - (i % 2) * 0.12, 0.22, i % 2 ? Palette.wood : Palette.woodDark, x, LEAF_H / 2 + 0.1, 0);
    }
    for (const y of [0.6, 2.2]) {
      parts.box(LEAF_W - 0.08, 0.2, 0.3, Palette.stoneDark, c, y, 0);
      parts.box(0.18, 0.18, 0.34, Palette.ink, side * -0.15, y, 0);
    }
    parts.box(LEAF_W * 0.92, 0.14, 0.26, Palette.stoneDark, c, 1.4, 0, 0, 0);
    parts.box(0.2, 0.2, 0.36, Palette.gold, -side * (LEAF_W - 0.25), 1.45, 0);
    hinge.add(parts.mesh('gate-leaf', this.kit.plastic));
    this.root.add(hinge);
    return hinge;
  }
}

/** Towers, battlements, the oak beam and the sign frame, merged into one mesh. */
function frame(): Parts {
  const parts = new Parts();
  for (const side of [-1, 1]) {
    const x = side * (SPAN / 2 + POST / 2);
    parts.box(POST + 0.3, 0.5, POST + 0.3, Palette.stoneDark, x, 0.25, 0);
    for (let row = 0; row < 7; row++) {
      const y = 0.5 + row * 0.55 + 0.275;
      const shade = row % 2 ? Palette.stone : 0x8f8e92;
      parts.box(POST, 0.5, POST, shade, x, y, 0);
    }
    parts.box(POST + 0.3, 0.3, POST + 0.3, Palette.stoneDark, x, 4.5, 0);
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      parts.box(0.34, 0.4, 0.34, Palette.stone, x + cx * 0.4, 4.85, cz * 0.4);
    }
    parts.box(0.3, 0.3, 0.3, Palette.gold, x, 5.05, 0);
  }
  parts.box(SPAN + 0.4, 0.5, 0.6, Palette.woodDark, 0, BEAM_Y - 0.55, 0);
  parts.box(SPAN, 0.2, 0.7, Palette.wood, 0, BEAM_Y - 0.2, 0);
  parts.box(BOARD_W, BOARD_H, 0.18, Palette.woodDark, 0, BEAM_Y + 0.95, -0.76);
  for (const side of [-1, 1]) {
    parts.box(0.16, 0.16, 0.5, Palette.ink, side * (SPAN / 2 - 0.3), BEAM_Y + 0.95, -0.47);
  }
  return parts;
}

/** A chunky gold padlock on the leaves' seam. */
function padlock(material: Material): Mesh {
  return new Parts()
    .box(0.8, 0.7, 0.3, Palette.gold, 0, 0, 0)
    .add(new TorusGeometry(0.26, 0.08, 8, 16, Math.PI), Palette.stoneDark, 0, 0.35, 0)
    .box(0.14, 0.26, 0.32, Palette.ink, 0, -0.04, 0)
    .mesh('gate-lock', material);
}

/** Paints the sign: a lock or a tick badge and the text, wrapped to two lines. */
function paintSign(texture: CanvasTexture, value: string, closed: boolean): void {
  const canvas = texture.image as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const { width: w, height: h } = canvas;
  ctx.fillStyle = css(closed ? 0xfff4d6 : 0xe4f8e6);
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = css(closed ? Palette.gold : Palette.green);
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, w - 10, h - 10);
  const badge = h - 52;
  ctx.fillStyle = css(closed ? Palette.red : Palette.green);
  ctx.beginPath();
  ctx.roundRect(26, 26, badge, badge, 22);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  const cx = 26 + badge / 2;
  const cy = 26 + badge / 2;
  if (closed) {
    ctx.fillRect(cx - 30, cy - 6, 60, 46);
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(cx, cy - 6, 20, Math.PI, 0);
    ctx.stroke();
  } else {
    ctx.lineWidth = 16;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 28, cy + 2);
    ctx.lineTo(cx - 6, cy + 24);
    ctx.lineTo(cx + 30, cy - 22);
    ctx.stroke();
  }
  ctx.fillStyle = css(Palette.ink);
  const left = 26 + badge + 28;
  const room = w - left - 30;
  let size = 64;
  let lines: string[] = [];
  for (; size >= 34; size -= 4) {
    ctx.font = `800 ${size}px ${FONT}`;
    lines = wrap(ctx, value, room);
    if (lines.length <= 2 && lines.every((l) => ctx.measureText(l).width <= room)) {
      break;
    }
  }
  lines = lines.slice(0, 2);
  ctx.textBaseline = 'middle';
  const lineH = size * 1.12;
  lines.forEach((line, i) => ctx.fillText(line, left, h / 2 - ((lines.length - 1) * lineH) / 2 + i * lineH, room));
  texture.needsUpdate = true;
}

function wrap(ctx: CanvasRenderingContext2D, value: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of value.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  lines.push(line);
  return lines;
}
