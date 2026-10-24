import type { MoodleGateway } from '../moodle/gateway';
import type { CourseStore } from './course-store';

/** Re-reads the course from Moodle into the store (after an activity closes). */
export class CourseSync {
  constructor(
    private readonly gateway: MoodleGateway,
    private readonly store: CourseStore,
    private readonly courseId: number,
    private readonly onError: (e: unknown) => void = (e) => console.error('mooblox: refresh failed', e),
  ) {}

  /** Fetches the world; returns whether anything changed. */
  async refresh(): Promise<boolean> {
    try {
      return this.store.set(await this.gateway.getWorld(this.courseId));
    } catch (e) {
      this.onError(e);
      return false;
    }
  }
}
