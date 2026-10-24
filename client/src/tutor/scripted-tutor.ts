import { CompletionTracking, isDone, type Activity } from '../domain/types';
import type { Tutor, TutorContext, TutorLine } from './tutor';

/** The tutor's words; `{name}` and `{activity}` are filled in. */
export interface TutorStrings {
  readonly greeting: string;
  readonly next: string;
  readonly alldone: string;
}

export const DEFAULT_TUTOR_STRINGS: TutorStrings = {
  greeting: 'Hi {name}! I am your Guide.',
  next: 'Next up: {activity}. Want me to show you the way?',
  alldone: 'You did everything here. Amazing work!',
};

/** Rule-based stub: greets by first name and points to the first open activity not done yet. No AI, no free text. */
export class ScriptedTutor implements Tutor {
  constructor(private readonly strings: TutorStrings = DEFAULT_TUTOR_STRINGS) {}

  greet(ctx: TutorContext): TutorLine {
    const next = this.nextStep(ctx);
    return { text: `${fill(this.strings.greeting, { name: ctx.world.firstName })} ${next.text}`, activityId: next.activityId };
  }

  nextStep(ctx: TutorContext): TutorLine {
    const a = nextActivity(ctx);
    return a
      ? { text: fill(this.strings.next, { activity: a.name }), activityId: a.id }
      : { text: this.strings.alldone, activityId: null };
  }
}

/** The first activity in course order that is open, tracked and not done. */
export function nextActivity(ctx: TutorContext): Activity | null {
  for (const s of ctx.world.sections) {
    for (const a of s.activities) {
      if (a.available && a.completion.tracking !== CompletionTracking.None && !isDone(a.completion)) {
        return a;
      }
    }
  }
  return null;
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => values[key] ?? m);
}
