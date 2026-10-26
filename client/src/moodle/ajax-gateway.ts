import type { WorldDto } from '../domain/dto';
import type { Look, Rewards } from '../domain/rewards';
import type { ClaimDto, LookDto } from '../domain/rewards-dto';
import { assertRewardsDto, toLook, toLookDto, toRewards } from '../domain/rewards-mapper';
import { toWorld } from '../domain/mapper';
import type { WorldData } from '../domain/types';
import { toHubCourses, type CourseListGateway, type HubCourse } from '../hub/courses';
import type { MoodleGateway } from './gateway';
import { MoodleError } from './moodle-error';

export interface AjaxSession {
  readonly wwwroot: string;
  readonly sesskey: string;
}

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

/** Gateway over lib/ajax/service.php with the user's session and sesskey. */
export class AjaxGateway implements MoodleGateway, CourseListGateway {
  constructor(
    private readonly session: AjaxSession,
    private readonly fetchFn: Fetch = (input, init) => fetch(input, init),
  ) {}

  async getWorld(courseId: number): Promise<WorldData> {
    return toWorld(await this.call<WorldDto>('local_mooblox_get_world', { courseid: courseId }));
  }

  async viewActivity(cmId: number): Promise<void> {
    await this.call('local_mooblox_view_activity', { cmid: cmId });
  }

  async setManualCompletion(cmId: number, done: boolean): Promise<void> {
    await this.call('core_completion_update_activity_completion_status_manually', { cmid: cmId, completed: done });
  }

  async savePreference(name: string, value: string): Promise<void> {
    await this.call('core_user_update_user_preferences', { preferences: [{ type: name, value }] });
  }

  async touchSession(): Promise<void> {
    await this.call('core_session_touch', {});
  }

  async getRewards(courseId: number): Promise<Rewards> {
    const dto = await this.call<unknown>('local_mooblox_get_rewards', { courseid: courseId });
    try {
      assertRewardsDto(dto);
    } catch (e) {
      throw new MoodleError('protocol', `local_mooblox_get_rewards: ${e instanceof Error ? e.message : String(e)}`);
    }
    return toRewards(dto);
  }

  async claimCollectible(courseId: number, key: string): Promise<number> {
    return (await this.call<ClaimDto>('local_mooblox_claim_collectible', { courseid: courseId, key })).found;
  }

  async setLook(look: Look): Promise<Look> {
    return toLook(await this.call<LookDto>('local_mooblox_set_look', { ...toLookDto(look) }));
  }

  async getCourses(): Promise<HubCourse[]> {
    const dto = await this.call<unknown>('local_mooblox_get_courses', {});
    try {
      return toHubCourses(dto);
    } catch (e) {
      throw new MoodleError('protocol', `local_mooblox_get_courses: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async call<T>(methodname: string, args: Record<string, unknown>): Promise<T> {
    const url = `${this.session.wwwroot}/lib/ajax/service.php?sesskey=${encodeURIComponent(this.session.sesskey)}`
      + `&info=${methodname}`;
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ index: 0, methodname, args }]),
      });
    } catch (e) {
      throw new MoodleError('network', e instanceof Error ? e.message : String(e));
    }
    if (!response.ok) {
      throw new MoodleError('http', `HTTP ${response.status} from ${methodname}`);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new MoodleError('protocol', `${methodname} did not return JSON`);
    }
    return unwrap<T>(methodname, body);
  }
}

interface ExceptionPayload {
  errorcode?: string;
  message?: string;
  error?: string;
}

function unwrap<T>(methodname: string, body: unknown): T {
  if (!Array.isArray(body)) {
    const whole = (body ?? {}) as ExceptionPayload;
    if (whole.errorcode || whole.error) {
      throw MoodleError.fromException(whole.errorcode ?? '', whole.error ?? whole.message ?? methodname);
    }
    throw new MoodleError('protocol', `${methodname} returned no response list`);
  }
  const first = body[0] as { error?: boolean; data?: T; exception?: ExceptionPayload } | undefined;
  if (!first) {
    throw new MoodleError('protocol', `${methodname} returned an empty list`);
  }
  if (first.error === false) {
    return first.data as T;
  }
  const ex = first.exception ?? {};
  throw MoodleError.fromException(ex.errorcode ?? '', ex.message ?? methodname);
}
