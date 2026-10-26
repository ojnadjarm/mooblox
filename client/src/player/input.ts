import { IDLE_ACTS } from './idle-acts';

/** Camera-relative intent: x right, z forward (length ≤ 1), run and jump held, and an emote pressed this frame (idle act index; -1 or absent = none). */
export interface InputState {
  readonly x: number;
  readonly z: number;
  readonly run: boolean;
  readonly jump: boolean;
  readonly emote?: number;
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

/** Input that goes silent while `frozen` (a warp or a lift ride runs). */
export class GatedInput implements InputSource {
  frozen = false;
  constructor(private readonly inner: InputSource) {}
  read(): InputState {
    const own = this.inner.read();
    return this.frozen ? NO_INPUT : own;
  }
}

/** Combines sources: the strongest stick wins, buttons are ORed, the first emote wins. */
export class CombinedInput implements InputSource {
  private readonly state: MutableInput = { x: 0, z: 0, run: false, jump: false, emote: -1 };

  constructor(private readonly sources: readonly InputSource[]) {}

  read(): InputState {
    const out = this.state;
    out.x = out.z = 0;
    out.run = out.jump = false;
    out.emote = -1;
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
      if (out.emote < 0 && i.emote !== undefined && i.emote >= 0) out.emote = i.emote;
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

const act = (clip: string): number => IDLE_ACTS.findIndex((a) => a.clip === clip);
/** Emote keys 1-5 as idle act indices. */
const EMOTE_KEYS: Readonly<Record<string, number>> = { Digit1: act('wave'), Digit2: act('cheer'), Digit3: act('emote-yes'), Digit4: act('emote-no'), Digit5: act('stretch') };

/** WASD / arrows to move, Shift to run, Space to jump, 1-5 to emote (wave, cheer, nod, head shake, stretch). */
export class KeyboardInput implements InputSource {
  private readonly down = new Set<string>();
  private readonly state: MutableInput = { x: 0, z: 0, run: false, jump: false, emote: -1 };
  private pending = -1;

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
    s.emote = this.pending;
    this.pending = -1;
    return s;
  }

  private key(e: KeyboardEvent, pressed: boolean): void {
    const action = KEYS[e.code];
    const emote = EMOTE_KEYS[e.code];
    if ((!action && emote === undefined) || (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, iframe'))) {
      return;
    }
    if (!action) {
      if (pressed && !e.repeat) this.pending = emote!;
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
