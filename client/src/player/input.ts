/** Camera-relative intent: x right, z forward (length ≤ 1), run and jump held. */
export interface InputState {
  readonly x: number;
  readonly z: number;
  readonly run: boolean;
  readonly jump: boolean;
}

export const NO_INPUT: InputState = { x: 0, z: 0, run: false, jump: false };

/** Anything that produces player intent: keyboard, touch, scripted. */
export interface InputSource {
  read(): InputState;
}

/** Combines sources: the strongest stick wins, buttons are ORed. */
export class CombinedInput implements InputSource {
  constructor(private readonly sources: readonly InputSource[]) {}

  read(): InputState {
    let best = NO_INPUT;
    let run = false;
    let jump = false;
    for (const s of this.sources) {
      const i = s.read();
      if (Math.hypot(i.x, i.z) > Math.hypot(best.x, best.z)) {
        best = i;
      }
      run ||= i.run;
      jump ||= i.jump;
    }
    return { x: best.x, z: best.z, run, jump };
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

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => this.key(e, true));
    target.addEventListener('keyup', (e) => this.key(e, false));
    target.addEventListener('blur', () => this.down.clear());
  }

  read(): InputState {
    const has = (k: string): number => (this.down.has(k) ? 1 : 0);
    const x = has('r') - has('l');
    const z = has('f') - has('b');
    const len = Math.hypot(x, z) || 1;
    return { x: x / len, z: z / len, run: this.down.has('run'), jump: this.down.has('jump') };
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
