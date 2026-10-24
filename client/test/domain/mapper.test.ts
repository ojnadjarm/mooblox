import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/get_world_demo.json';
import type { WorldDto } from '../../src/domain/dto';
import { toDto, toWorld } from '../../src/domain/mapper';
import { CompletionTracking } from '../../src/domain/types';

const dto: WorldDto = fixture;

describe('mapper', () => {
  it('round-trips the captured get_world reply', () => {
    expect(toDto(toWorld(dto))).toEqual(dto);
  });

  it('maps course, sections and activities to domain fields', () => {
    const world = toWorld(dto);
    expect(world.courseName).toBe('MOOBLOX demo');
    expect(world.firstName).toBe('Mia');
    expect(world.sections.map((s) => s.activities.length)).toEqual([1, 1, 2, 1]);
    const quiz = world.sections[3]?.activities[0];
    expect(quiz?.modname).toBe('quiz');
    expect(quiz?.sectionId).toBe(world.sections[3]?.id);
    expect(quiz?.completion.tracking).toBe(CompletionTracking.Automatic);
    expect(world.sections[0]?.activities[0]?.completion.tracking).toBe(CompletionTracking.None);
  });
});
