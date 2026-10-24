import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK } from '../../src/player/character/look';
import { LookHistory } from '../../src/ui/creator/history';
import { TABS } from '../../src/ui/creator/tabs';
import { FIELDS } from '../../src/player/character/catalog';

describe('creator history and tabs', () => {
  it('undoes changes back to the start and ignores repeats', () => {
    const h = new LookHistory(DEFAULT_LOOK);
    expect(h.canUndo).toBe(false);
    h.push({ ...DEFAULT_LOOK, hair: 'afro' });
    h.push({ ...DEFAULT_LOOK, hair: 'afro' });
    h.push({ ...DEFAULT_LOOK, hair: 'bob' });
    expect(h.undo().hair).toBe('afro');
    expect(h.undo()).toEqual(DEFAULT_LOOK);
    expect(h.undo()).toEqual(DEFAULT_LOOK);
  });

  it('shows every field in exactly one tab', () => {
    const shown = TABS.flatMap((t) => t.fields);
    expect([...shown].sort()).toEqual([...FIELDS].sort());
  });
});
