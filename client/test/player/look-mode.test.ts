import { describe, expect, it } from 'vitest';
import { LookModel, type LookEvent } from '../../src/player/look-mode';

/** Feeds events, returning the actions asked for. */
const run = (m: LookModel, events: LookEvent[]) => events.map((e) => m.handle(e));

describe('LookModel', () => {
  it('a click asks for the lock; the lock turns mouse-look on', () => {
    const m = new LookModel();
    expect(run(m, ['click'])).toEqual(['lock']);
    expect(m.mode).toBe('off');
    run(m, ['locked']);
    expect(m.mode).toBe('locked');
    expect(run(m, ['click'])).toEqual([null]);
  });

  it('holding Tab frees the cursor, releasing it locks again', () => {
    const m = new LookModel();
    run(m, ['click', 'locked']);
    expect(run(m, ['hold-down'])).toEqual(['unlock']);
    expect(m.mode).toBe('free');
    run(m, ['unlocked']);
    expect(m.mode).toBe('free');
    expect(run(m, ['click'])).toEqual([null]);
    expect(run(m, ['hold-up', 'locked'])).toEqual(['lock', null]);
    expect(m.mode).toBe('locked');
  });

  it('a refused lock falls back to waiting for a click', () => {
    const m = new LookModel();
    run(m, ['click', 'locked', 'hold-down', 'unlocked', 'hold-up', 'refused']);
    expect(m.mode).toBe('off');
    expect(run(m, ['click'])).toEqual(['lock']);
  });

  it('Esc (the browser drops the lock) and focus loss end mouse-look; Tab is forgotten on blur', () => {
    const m = new LookModel();
    run(m, ['click', 'locked', 'unlocked']);
    expect(m.mode).toBe('off');
    run(m, ['click', 'locked', 'hold-down', 'unlocked', 'blur']);
    expect(m.mode).toBe('off');
    expect(run(m, ['click'])).toEqual(['lock']);
  });

  it('a panel frees the cursor while open and locks again on close, unless Tab is still held', () => {
    const m = new LookModel();
    run(m, ['click', 'locked']);
    expect(run(m, ['panel-open', 'unlocked'])).toEqual(['unlock', null]);
    expect(m.mode).toBe('held');
    expect(run(m, ['click', 'hold-up'])).toEqual([null, null]);
    expect(run(m, ['panel-close', 'locked'])).toEqual(['lock', null]);
    expect(m.mode).toBe('locked');
    run(m, ['hold-down', 'unlocked', 'panel-open']);
    expect(run(m, ['panel-close'])).toEqual([null]);
    expect(m.mode).toBe('free');
    expect(run(m, ['hold-up'])).toEqual(['lock']);
  });

  it('a panel opened before any lock leaves the cursor alone after it closes', () => {
    const m = new LookModel();
    expect(run(m, ['panel-open', 'panel-close'])).toEqual([null, null]);
    expect(m.mode).toBe('off');
  });

  it('a lock that lands while Tab is held or a panel is open is let go at once', () => {
    const m = new LookModel();
    run(m, ['click', 'hold-down']);
    expect(run(m, ['locked'])).toEqual(['unlock']);
  });
});
