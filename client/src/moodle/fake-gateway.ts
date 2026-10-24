import type { ModuleDto, WorldDto } from '../domain/dto';
import { toWorld } from '../domain/mapper';
import { CompletionState, CompletionTracking } from '../domain/types';
import type { WorldData } from '../domain/types';
import type { MoodleGateway } from './gateway';

/** In-memory Moodle over a captured get_world reply, for tests and offline play. */
export class FakeGateway implements MoodleGateway {
  readonly preferences = new Map<string, string>();
  private readonly dto: WorldDto;

  constructor(fixture: WorldDto) {
    this.dto = structuredClone(fixture);
  }

  async getWorld(courseId: number): Promise<WorldData> {
    if (courseId !== this.dto.courseid) {
      throw new Error(`FakeGateway has no course ${courseId}`);
    }
    return toWorld(structuredClone(this.dto));
  }

  async viewActivity(cmId: number): Promise<void> {
    const m = this.module(cmId);
    if (m.completion === CompletionTracking.Automatic) {
      m.state = CompletionState.Complete;
    }
  }

  async setManualCompletion(cmId: number, done: boolean): Promise<void> {
    const m = this.module(cmId);
    if (m.completion !== CompletionTracking.Manual) {
      throw new Error(`cm ${cmId} has no manual completion`);
    }
    m.state = done ? CompletionState.Complete : CompletionState.Incomplete;
  }

  async savePreference(name: string, value: string): Promise<void> {
    this.preferences.set(name, value);
  }

  async touchSession(): Promise<void> {}

  private module(cmId: number): ModuleDto {
    const m = this.dto.sections.flatMap((s) => s.modules).find((x) => x.id === cmId);
    if (!m) {
      throw new Error(`FakeGateway has no cm ${cmId}`);
    }
    return m;
  }
}
