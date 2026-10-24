import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Activity } from '../../../src/domain/types';
import type { FrameBudget } from '../../../src/perf/frame-budget';
import { CanvasSignPainter } from '../../../src/world/props/sign-painter';

const ctx2d = { fillRect() {}, fill() {}, beginPath() {}, roundRect() {}, fillText() {}, drawImage() {}, measureText: (t: string) => ({ width: t.length * 20 }) };
const activity = (id: number): Activity => ({ id, name: `Activity ${id}`, purpose: 'content', iconUrl: '' }) as unknown as Activity;
/** One job per frame: a budget that lets one paint through per step. */
const oneJob = { run: (job: () => boolean) => job() } as unknown as FrameBudget;
const size = (t: { image: unknown }) => {
  const c = t.image as { width: number; height: number };
  return `${c.width}x${c.height}`;
};

describe('CanvasSignPainter', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { createElement: () => ({ width: 300, height: 150, getContext: () => ctx2d }) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('paints at once by default', () => {
    const signs = new CanvasSignPainter(() => undefined);
    const t = signs.paint(activity(1));
    expect(size(t)).toBe('576x192');
    signs.release(t);
    expect(size(t)).toBe('576x192');
  });

  it('lazy signs hold a 1 x 1 board until wanted, paint one per budget slice, and free their pixels on release', () => {
    const signs = new CanvasSignPainter(() => undefined, true);
    const a = signs.paint(activity(1));
    const b = signs.paint(activity(2));
    expect(size(a)).toBe('1x1');
    signs.want(a);
    signs.want(b);
    signs.want(a);
    expect(signs.pending).toBe(2);
    expect(signs.step(oneJob)).toBe(true);
    expect([size(a), size(b)]).toEqual(['576x192', '1x1']);
    expect(signs.step(oneJob)).toBe(true);
    expect(size(b)).toBe('576x192');
    expect(signs.step(oneJob)).toBe(false);
    const disposed = vi.fn();
    a.addEventListener('dispose', disposed);
    signs.release(a);
    expect(size(a)).toBe('1x1');
    expect(disposed).toHaveBeenCalled();
    signs.want(a);
    signs.step(oneJob);
    expect(size(a)).toBe('576x192');
  });

  it('a sign released or forgotten before its slice is not painted', () => {
    const signs = new CanvasSignPainter(() => undefined, true);
    const a = signs.paint(activity(1));
    const b = signs.paint(activity(2));
    signs.want(a);
    signs.want(b);
    signs.release(a);
    signs.forget(b);
    expect(signs.step(oneJob)).toBe(false);
    expect([size(a), size(b)]).toEqual(['1x1', '1x1']);
    signs.want(b);
    expect(signs.pending).toBe(0);
  });
});
