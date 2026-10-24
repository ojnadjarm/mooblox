import { CompletionTracking, isDone, type Activity, type WorldData } from '../domain/types';

export type RowStatus = 'done' | 'todo' | 'locked' | 'untracked';

export interface BookRow {
  readonly id: number;
  readonly name: string;
  readonly modname: string;
  readonly purpose: string;
  readonly iconUrl: string;
  readonly status: RowStatus;
  /** Kid-friendly lock reason (or Moodle's restriction HTML), empty when open. */
  readonly lockedInfo: string;
  /** Each date as its Moodle label and epoch seconds. */
  readonly dates: readonly { readonly label: string; readonly timestamp: number }[];
}

export interface BookSection {
  readonly id: number;
  readonly name: string;
  readonly lockedInfo: string;
  readonly rows: readonly BookRow[];
}

export interface BookModel {
  readonly title: string;
  readonly done: number;
  readonly total: number;
  readonly sections: readonly BookSection[];
}

/** The course as the book lists it: sections with activities, each with its status; progress over tracked ones. */
export function bookModel(world: WorldData): BookModel {
  const sections = world.sections
    .filter((s) => s.activities.length > 0 || !s.available)
    .map((s) => ({
      id: s.id,
      name: s.name,
      lockedInfo: s.available ? '' : reason(s.lock, s.availableInfo),
      rows: s.activities.map(row),
    }));
  return {
    title: world.courseName,
    done: sections.flatMap((s) => s.rows).filter((r) => r.status === 'done').length,
    total: world.sections.flatMap((s) => s.activities).filter((a) => a.completion.tracking !== CompletionTracking.None).length,
    sections,
  };
}

function row(a: Activity): BookRow {
  return {
    id: a.id,
    name: a.name,
    modname: a.modname,
    purpose: a.purpose,
    iconUrl: a.iconUrl,
    status: status(a),
    lockedInfo: a.available ? '' : reason(a.lock, a.availableInfo),
    dates: a.dates,
  };
}

/** The short lock reason, else Moodle's restriction HTML, else a plain "Locked". */
function reason(lock: string, info: string): string {
  return lock || info || 'Locked';
}

function status(a: Activity): RowStatus {
  if (!a.available) {
    return 'locked';
  }
  if (a.completion.tracking === CompletionTracking.None) {
    return 'untracked';
  }
  return isDone(a.completion) ? 'done' : 'todo';
}
