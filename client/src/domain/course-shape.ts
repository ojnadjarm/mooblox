import { CompletionState, CompletionTracking, type Activity, type Section, type WorldData } from './types';
import { seededRandom } from '../world/random';

/** Sections × activities, or explicit counts per section. */
export type CourseShape = readonly number[];

const KINDS = [
  ['page', 'content'],
  ['quiz', 'assessment'],
  ['url', 'content'],
  ['assign', 'assessment'],
  ['forum', 'collaboration'],
  ['book', 'content'],
] as const;
const LONG = 'The extremely long activity name that a teacher typed without ever thinking about the sign it lands on';

/** `"8x12"` → eight sections of twelve; `"3,0,5"` → explicit counts. */
export function parseShape(text: string): CourseShape {
  const grid = /^(\d+)x(\d+)$/.exec(text);
  if (grid) return Array.from({ length: Number(grid[1]) }, () => Number(grid[2]));
  return text.split(',').map((n) => Number(n) || 0);
}

/** A synthetic course of the given shape for the dev page and tests: mixed activity kinds, some long names. */
export function shapeWorld(courseId: number, shape: CourseShape): WorldData {
  const random = seededRandom(courseId ^ 0x5eed);
  let next = 1000;
  const sections: Section[] = shape.map((count, i) => {
    const id = 500 + i;
    const activities: Activity[] = Array.from({ length: count }, (_, k) => {
      const [modname, purpose] = KINDS[Math.floor(random() * KINDS.length)]!;
      const aid = next++;
      return {
        id: aid,
        sectionId: id,
        modname,
        name: k % 7 === 3 ? LONG : `${modname[0]!.toUpperCase()}${modname.slice(1)} ${i}.${k + 1}`,
        url: `https://moodle.example/mod/${modname}/view.php?id=${aid}`,
        purpose,
        iconUrl: '',
        available: true,
        availableInfo: '',
        lock: '',
        completion: { tracking: CompletionTracking.Manual, state: random() < 0.3 ? CompletionState.Complete : CompletionState.Incomplete, automatic: false },
        dates: [],
        media: null,
      };
    });
    return { id, number: i, name: i === 2 ? 'A section with a really long name for a kid-sized sign' : `Section ${i}`, available: true, availableInfo: '', lock: '', activities };
  });
  return { courseId, courseName: `Shape ${shape.join(',')}`, firstName: 'Mia', sections, nextChange: 0 };
}
