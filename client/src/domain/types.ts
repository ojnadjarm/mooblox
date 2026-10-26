/** How Moodle tracks completion of an activity. */
export enum CompletionTracking {
  None = 0,
  Manual = 1,
  Automatic = 2,
}

/** Moodle completion state (COMPLETION_INCOMPLETE .. COMPLETION_COMPLETE_FAIL). */
export enum CompletionState {
  Incomplete = 0,
  Complete = 1,
  CompletePass = 2,
  CompleteFail = 3,
}

export interface Completion {
  readonly tracking: CompletionTracking;
  readonly state: CompletionState;
  readonly automatic: boolean;
  /** Moodle's overall completion; decides whether a failed attempt (`CompleteFail`) counts. */
  readonly done?: boolean;
}

export interface ActivityDate {
  readonly label: string;
  readonly timestamp: number;
}

/** What a module plays: a resource's main file or a URL's target. */
export interface Media {
  readonly type: 'file' | 'link';
  readonly mimetype: string;
  readonly src: string;
}

export interface Activity {
  readonly id: number;
  readonly sectionId: number;
  readonly modname: string;
  readonly name: string;
  readonly url: string;
  readonly purpose: string;
  readonly iconUrl: string;
  readonly available: boolean;
  readonly availableInfo: string;
  /** Short, kid-friendly lock reason; empty when open. */
  readonly lock: string;
  readonly completion: Completion;
  readonly dates: readonly ActivityDate[];
  readonly media: Media | null;
}

export interface Section {
  readonly id: number;
  readonly number: number;
  readonly name: string;
  readonly available: boolean;
  readonly availableInfo: string;
  /** Short, kid-friendly lock reason; empty when open. */
  readonly lock: string;
  readonly activities: readonly Activity[];
}

export interface WorldData {
  readonly courseId: number;
  readonly courseName: string;
  readonly firstName: string;
  readonly sections: readonly Section[];
  /** Earliest future restriction date (epoch s) the world must re-read at, 0 when none. */
  readonly nextChange: number;
}

/** Whether an activity counts as done for the book and the tutor. */
export function isDone(c: Completion): boolean {
  return c.state === CompletionState.Complete || c.state === CompletionState.CompletePass || (c.state === CompletionState.CompleteFail && c.done === true);
}
