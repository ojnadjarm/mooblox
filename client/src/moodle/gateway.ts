import type { Look, Rewards } from '../domain/rewards';
import type { WorldData } from '../domain/types';

/** Transport to Moodle; adapters: AjaxGateway (session), FakeGateway (fixture). */
export interface MoodleGateway {
  getWorld(courseId: number): Promise<WorldData>;
  viewActivity(cmId: number): Promise<void>;
  setManualCompletion(cmId: number, done: boolean): Promise<void>;
  savePreference(name: string, value: string): Promise<void>;
  touchSession(): Promise<void>;
  getRewards(courseId: number): Promise<Rewards>;
  /** Picks up an unlocked collectible; resolves to the number found in the course. */
  claimCollectible(courseId: number, key: string): Promise<number>;
  setLook(look: Look): Promise<Look>;
}
