import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/get_world_demo.json';
import type { WorldDto } from '../../src/domain/dto';
import { toWorld } from '../../src/domain/mapper';
import { bookModel } from '../../src/ui/book-model';

describe('bookModel', () => {
  it('lists sections with their activities, statuses and progress', () => {
    const dto: WorldDto = structuredClone(fixture);
    dto.sections[1]!.modules[0]!.state = 1;
    Object.assign(dto.sections[2]!.modules[1]!, { available: false, availableinfo: 'Not available unless: <b>video</b> done' });
    dto.sections[3]!.modules[0]!.dates = [{ label: 'Closes:', timestamp: 1793000000 }];
    const book = bookModel(toWorld(dto));
    expect(book.title).toBe('MOOBLOX demo');
    expect(book.sections.map((s) => s.name)).toEqual(['General', 'Reading corner', 'Cinema', 'Arena']);
    expect(book.sections.flatMap((s) => s.rows).map((r) => `${r.id}:${r.status}`)).toEqual([
      '40:untracked', '41:done', '42:todo', '43:locked', '44:todo',
    ]);
    expect(book.sections[2]!.rows[1]!.lockedInfo).toContain('video');
    expect(book.sections[3]!.rows[0]!.dates).toEqual([{ label: 'Closes:', timestamp: 1793000000 }]);
    expect([book.done, book.total]).toEqual([1, 4]);
  });
});
