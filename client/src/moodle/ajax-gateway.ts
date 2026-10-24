import type { WorldDto } from '../domain/dto';
import { toWorld } from '../domain/mapper';
import type { WorldData } from '../domain/types';
import type { MoodleGateway } from './gateway';
import { MoodleError } from './moodle-error';

export interface AjaxSession {
  readonly wwwroot: string;
  readonly sesskey: string;
}

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

/** Gateway over lib/ajax/service.php with the user's session and sesskey. */
export class AjaxGateway implements MoodleGateway {
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
