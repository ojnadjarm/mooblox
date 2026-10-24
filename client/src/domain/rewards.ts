/** Rewards of the user in a course; computed by the server, read-only here. */
export type QuestKind = 'section' | 'video' | 'quiz' | 'page' | 'badge' | 'course';
export type CollectibleKind = 'gem' | 'crystal' | 'star';

export interface Quest {
  readonly id: string;
  readonly kind: QuestKind;
  readonly name: string;
  readonly text: string;
  readonly done: number;
  readonly total: number;
  readonly complete: boolean;
  /** Catalog item id the quest unlocks, null when none. */
  readonly reward: string | null;
}

export interface Collectible {
  readonly key: string;
  readonly kind: CollectibleKind;
  readonly sectionId: number;
  /** Activity of a gem, null for crystals and stars. */
  readonly cmId: number | null;
  readonly unlocked: boolean;
  readonly found: boolean;
}

/** Worn items; null = slot empty. */
export interface Look {
  readonly hat: string | null;
  readonly outfit: string | null;
  readonly pet: string | null;
}

export interface Trophy {
  readonly badgeId: number;
  readonly name: string;
  readonly imageUrl: string;
  readonly timeIssued: number;
}

/** Learning weeks in a row (the leaf counter); `welcomeBack` on the first week after a break. */
export interface LearningWeeks {
  readonly count: number;
  readonly welcomeBack: boolean;
}

/** The class's shared weekly goal (yyyyww week). */
export interface ClassGoal {
  readonly week: number;
  readonly target: number;
  readonly progress: number;
  readonly reached: boolean;
  readonly timeReached: number;
}

export interface Rewards {
  readonly enabled: boolean;
  readonly xp: number;
  readonly level: number;
  readonly peakLevel: number;
  /** XP where the current level starts and the next one starts. */
  readonly levelStart: number;
  readonly levelNext: number;
  readonly quests: readonly Quest[];
  readonly collectibles: readonly Collectible[];
  readonly unlocks: readonly string[];
  readonly look: Look;
  readonly trophies: readonly Trophy[];
  readonly weeks: LearningWeeks;
  /** Null when the goal is off or the class is too small. */
  readonly goal: ClassGoal | null;
}

export const NO_LOOK: Look = { hat: null, outfit: null, pet: null };
