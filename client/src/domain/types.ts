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
}

export interface ActivityDate {
  readonly label: string;
  readonly timestamp: number;
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
  readonly completion: Completion;
  readonly dates: readonly ActivityDate[];
}

export interface Section {
  readonly id: number;
  readonly number: number;
  readonly name: string;
  readonly available: boolean;
  readonly availableInfo: string;
  readonly activities: readonly Activity[];
}

export interface WorldData {
  readonly courseId: number;
  readonly courseName: string;
  readonly firstName: string;
  readonly sections: readonly Section[];
}

/** Whether an activity counts as done for the book and the tutor. */
export function isDone(c: Completion): boolean {
  return c.state === CompletionState.Complete || c.state === CompletionState.CompletePass;
}
