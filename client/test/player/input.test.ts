import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { IDLE_ACTS } from '../../src/player/idle-acts';
import { CombinedInput, KeyboardInput, type InputSource } from '../../src/player/input';

/** A window stand-in that the keyboard listens on. */
function keys(): { target: Window; press: (code: string, repeat?: boolean) => void } {
  const target = new EventTarget();
  const press = (code: string, repeat = false): void => {
    for (const type of ['keydown', 'keyup']) {
      const e = Object.assign(new Event(type), { code, repeat });
      target.dispatchEvent(e);
    }
  };
  return { target: target as unknown as Window, press };
}

const act = (clip: string): number => IDLE_ACTS.findIndex((a) => a.clip === clip);

describe('emote input', () => {
  beforeAll(() => vi.stubGlobal('HTMLElement', class {}));
  afterAll(() => vi.unstubAllGlobals());

  it('keys 1-5 emote once per press (wave, cheer, nod, head shake, stretch); held keys do not repeat', () => {
    const { target, press } = keys();
    const kb = new KeyboardInput(target);
    expect(kb.read().emote).toBe(-1);
    const want = ['wave', 'cheer', 'emote-yes', 'emote-no', 'stretch'];
    want.forEach((clip, i) => {
      press(`Digit${i + 1}`);
      expect(kb.read().emote).toBe(act(clip));
      expect(kb.read().emote).toBe(-1);
    });
    press('Digit1', true);
    expect(kb.read().emote).toBe(-1);
    expect(want.every((c) => act(c) >= 0)).toBe(true);
  });

  it('the combined input passes the first emote on, and none when no source has one', () => {
    const src = (emote?: number): InputSource => ({ read: () => ({ x: 0, z: 0, run: false, jump: false, ...(emote === undefined ? {} : { emote }) }) });
    expect(new CombinedInput([src(), src(3), src(1)]).read().emote).toBe(3);
    expect(new CombinedInput([src(), src(-1)]).read().emote).toBe(-1);
  });
});
