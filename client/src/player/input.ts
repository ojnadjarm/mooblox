/** Camera-relative intent: x right, z forward (length ≤ 1), run and jump held. */
export interface InputState {
  readonly x: number;
  readonly z: number;
  readonly run: boolean;
  readonly jump: boolean;
}

export const NO_INPUT: InputState = { x: 0, z: 0, run: false, jump: false };

/** A source's own reusable state object (read() hands it out; callers must not keep it across frames). */
export type MutableInput = { -readonly [K in keyof InputState]: InputState[K] };

/** Squared stick length. */
const len2 = (i: InputState): number => i.x * i.x + i.z * i.z;

/** Anything that produces player intent: keyboard, touch, scripted. */
export interface InputSource {
  /** The intent this frame; the object may be reused by the next call. */
  read(): InputState;
}

/** Combines sources: the strongest stick wins, buttons are ORed. */
export class CombinedInput implements InputSource {
  private readonly state: MutableInput = { x: 0, z: 0, run: false, jump: false };

  constructor(private readonly sources: readonly InputSource[]) {}

  read(): InputState {
    const out = this.state;
    out.x = out.z = 0;
    out.run = out.jump = false;
    let best = 0;
    for (let k = 0; k < this.sources.length; k++) {
      const i = this.sources[k]!.read();
      if (len2(i) > best) {
        best = len2(i);
        out.x = i.x;
        out.z = i.z;
      }
      out.run ||= i.run;
      out.jump ||= i.jump;
    }
    return out;
  }
}

const KEYS: Readonly<Record<string, 'f' | 'b' | 'l' | 'r' | 'run' | 'jump'>> = {
  KeyW: 'f',
  ArrowUp: 'f',
  KeyS: 'b',
  ArrowDown: 'b',
  KeyA: 'l',
  ArrowLeft: 'l',
  KeyD: 'r',
  ArrowRight: 'r',
  ShiftLeft: 'run',
  ShiftRight: 'run',
  Space: 'jump',
};

/** WASD / arrows to move, Shift to run, Space to jump. */
export class KeyboardInput implements InputSource {
  private readonly down = new Set<string>();
  private readonly state: MutableInput = { x: 0, z: 0, run: false, jump: false };

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => this.key(e, true));
    target.addEventListener('keyup', (e) => this.key(e, false));
    target.addEventListener('blur', () => this.down.clear());
  }

  read(): InputState {
    const d = this.down;
    const x = (d.has('r') ? 1 : 0) - (d.has('l') ? 1 : 0);
    const z = (d.has('f') ? 1 : 0) - (d.has('b') ? 1 : 0);
    const len = Math.sqrt(x * x + z * z) || 1;
    const s = this.state;
    s.x = x / len;
    s.z = z / len;
    s.run = d.has('run');
    s.jump = d.has('jump');
    return s;
  }

  private key(e: KeyboardEvent, pressed: boolean): void {
    const action = KEYS[e.code];
    if (!action || (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, iframe'))) {
      return;
    }
    e.preventDefault();
    if (pressed) {
      this.down.add(action);
    } else {
      this.down.delete(action);
    }
  }
}
