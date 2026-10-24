import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/get_world_demo.json';
import type { WorldDto } from '../../src/domain/dto';
import { toWorld } from '../../src/domain/mapper';
import { ScriptedTutor } from '../../src/tutor/scripted-tutor';

const world = (edit: (dto: WorldDto) => void = () => {}) => {
  const dto: WorldDto = structuredClone(fixture);
  edit(dto);
  return toWorld(dto);
};
const tutor = new ScriptedTutor();

describe('ScriptedTutor', () => {
  it('points to the first incomplete available activity, skipping untracked, done and locked ones', () => {
    expect(tutor.nextStep({ world: world() }).activityId).toBe(41);
    expect(tutor.nextStep({ world: world((d) => (d.sections[1]!.modules[0]!.state = 1)) }).activityId).toBe(42);
    const locked = world((d) => {
      d.sections[1]!.modules[0]!.state = 2;
      d.sections[2]!.modules[0]!.available = false;
    });
    expect(tutor.nextStep({ world: locked })).toEqual({ text: 'Next up: Big Buck Bunny. Want me to show you the way?', activityId: 43 });
  });

  it('greets by first name and says when everything is done', () => {
    expect(tutor.greet({ world: world() }).text).toBe('Hi Mia! I am your Guide. Next up: How volcanoes work. Want me to show you the way?');
    const done = world((d) => d.sections.forEach((s) => s.modules.forEach((m) => (m.state = 1))));
    expect(tutor.nextStep({ world: done })).toEqual({ text: 'You did everything here. Amazing work!', activityId: null });
  });
});
