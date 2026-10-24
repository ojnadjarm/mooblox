import type { ModuleDto, WorldDto } from '../domain/dto';
import type { Look, Rewards } from '../domain/rewards';
import type { RewardsDto } from '../domain/rewards-dto';
import { toLookDto, toRewards } from '../domain/rewards-mapper';
import { toWorld } from '../domain/mapper';
import { CompletionState, CompletionTracking } from '../domain/types';
import type { WorldData } from '../domain/types';
import type { MoodleGateway } from './gateway';
import { MoodleError } from './moodle-error';

const REWARDS_OFF: RewardsDto = {
  enabled: false, xp: 0, level: 0, peaklevel: 0, levelstart: 0, levelnext: 0,
  quests: [], collectibles: [], unlocks: [], look: { hat: '', outfit: '', pet: '' }, trophies: [],
};

/** In-memory Moodle over captured get_world and get_rewards replies, for tests and offline play. */
export class FakeGateway implements MoodleGateway {
  readonly preferences = new Map<string, string>();
  private readonly dto: WorldDto;
  protected readonly rewards: RewardsDto;

  constructor(fixture: WorldDto, rewards: RewardsDto = REWARDS_OFF) {
    this.dto = structuredClone(fixture);
    this.rewards = structuredClone(rewards);
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

  async getRewards(courseId: number): Promise<Rewards> {
    this.course(courseId);
    return toRewards(structuredClone(this.rewards));
  }

  async claimCollectible(courseId: number, key: string): Promise<number> {
    this.course(courseId);
    const item = this.rewards.collectibles.find((c) => c.key === key);
    if (!this.rewards.enabled || !item?.unlocked) {
      throw MoodleError.fromException('collectiblelocked', `${key} is locked`);
    }
    item.found = true;
    return this.rewards.collectibles.filter((c) => c.found).length;
  }

  async setLook(look: Look): Promise<Look> {
    const dto = toLookDto(look);
    if (Object.values(dto).some((item) => item !== '' && !this.rewards.unlocks.includes(item))) {
      throw MoodleError.fromException('itemlocked', 'Item not unlocked');
    }
    this.rewards.look = dto;
    return { ...look };
  }

  private course(courseId: number): void {
    if (courseId !== this.dto.courseid) {
      throw new Error(`FakeGateway has no course ${courseId}`);
    }
  }

  private module(cmId: number): ModuleDto {
    const m = this.dto.sections.flatMap((s) => s.modules).find((x) => x.id === cmId);
    if (!m) {
      throw new Error(`FakeGateway has no cm ${cmId}`);
    }
    return m;
  }
}
