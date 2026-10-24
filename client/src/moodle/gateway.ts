import type { WorldData } from '../domain/types';

/** Transport to Moodle; adapters: AjaxGateway (session), FakeGateway (fixture). */
export interface MoodleGateway {
  getWorld(courseId: number): Promise<WorldData>;
  viewActivity(cmId: number): Promise<void>;
  setManualCompletion(cmId: number, done: boolean): Promise<void>;
  savePreference(name: string, value: string): Promise<void>;
  touchSession(): Promise<void>;
}
