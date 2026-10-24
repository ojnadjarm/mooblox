import type { WorldData } from '../domain/types';

/** What the tutor knows when it speaks. */
export interface TutorContext {
  readonly world: WorldData;
}

/** One thing the tutor says; `activityId` is the activity it points to, if any. */
export interface TutorLine {
  readonly text: string;
  readonly activityId: number | null;
}

/** Anything that guides the learner: the scripted stub now, an AI helper later. */
export interface Tutor {
  greet(ctx: TutorContext): TutorLine;
  nextStep(ctx: TutorContext): TutorLine;
}
