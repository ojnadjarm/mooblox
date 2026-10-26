/** One course the user can enter, as `local_mooblox_get_courses` returns it. */
export interface MapCourse {
  readonly id: number;
  readonly fullname: string;
  readonly summary: string;
  /** Course image URL, '' when none. */
  readonly image: string;
  /** Activities done in percent, -1 when completion is not tracked. */
  readonly progress: number;
  readonly completed: boolean;
  /** Last visit (epoch s), 0 when never. */
  readonly lastaccess: number;
  /** The course world (play.php). */
  readonly url: string;
}

/** Transport for the course map. */
export interface CourseListGateway {
  getCourses(): Promise<MapCourse[]>;
}

const FIELDS: Readonly<Record<keyof MapCourse, 'number' | 'string' | 'boolean'>> = {
  id: 'number',
  fullname: 'string',
  summary: 'string',
  image: 'string',
  progress: 'number',
  completed: 'boolean',
  lastaccess: 'number',
  url: 'string',
};

/** Validates the wire list; throws an Error naming the first bad field. */
export function toMapCourses(dto: unknown): MapCourse[] {
  if (!Array.isArray(dto)) throw new Error('courses is not a list');
  return dto.map((row: unknown, i) => {
    if (typeof row !== 'object' || row === null) throw new Error(`courses[${i}] is not an object`);
    const o = row as Record<string, unknown>;
    for (const [key, type] of Object.entries(FIELDS)) {
      if (typeof o[key] !== type) throw new Error(`courses[${i}].${key} must be a ${type}`);
    }
    return Object.fromEntries(Object.keys(FIELDS).map((k) => [k, o[k]])) as unknown as MapCourse;
  });
}
