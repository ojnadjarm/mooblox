import { describe, expect, it, vi } from 'vitest';
import fixture from '../fixtures/get_world_demo.json';
import { AjaxGateway } from '../../src/moodle/ajax-gateway';
import { MoodleError } from '../../src/moodle/moodle-error';

const session = { wwwroot: 'https://moodle.example', sesskey: 's3ss' };

function gatewayReplying(body: unknown, status = 200) {
  const fetchFn = vi.fn(async (_url: string, _init: RequestInit) =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));
  return { gw: new AjaxGateway(session, fetchFn), fetchFn };
}

function sent(fetchFn: ReturnType<typeof gatewayReplying>['fetchFn']) {
  const [url, init] = fetchFn.mock.calls[0]!;
  return { url, init, body: JSON.parse(String(init.body)) };
}

async function failure(p: Promise<unknown>): Promise<MoodleError> {
  const e = await p.then(() => null, (err: unknown) => err);
  expect(e).toBeInstanceOf(MoodleError);
  return e as MoodleError;
}

describe('AjaxGateway', () => {
  it('posts one service.php request with the sesskey and maps get_world', async () => {
    const { gw, fetchFn } = gatewayReplying([{ error: false, data: fixture }]);
    const world = await gw.getWorld(30);
    const { url, init, body } = sent(fetchFn);
    expect(url).toBe('https://moodle.example/lib/ajax/service.php?sesskey=s3ss&info=local_mooblox_get_world');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(body).toEqual([{ index: 0, methodname: 'local_mooblox_get_world', args: { courseid: 30 } }]);
    expect(world.firstName).toBe('Mia');
  });

  it.each([
    ['viewActivity', (g: AjaxGateway) => g.viewActivity(42), 'local_mooblox_view_activity', { cmid: 42 }],
    ['setManualCompletion', (g: AjaxGateway) => g.setManualCompletion(7, true),
      'core_completion_update_activity_completion_status_manually', { cmid: 7, completed: true }],
    ['savePreference', (g: AjaxGateway) => g.savePreference('local_mooblox_avatar', 'blue2'),
      'core_user_update_user_preferences', { preferences: [{ type: 'local_mooblox_avatar', value: 'blue2' }] }],
    ['touchSession', (g: AjaxGateway) => g.touchSession(), 'core_session_touch', {}],
  ])('%s sends its method and args', async (_name, run, methodname, args) => {
    const { gw, fetchFn } = gatewayReplying([{ error: false, data: { status: true } }]);
    await run(gw);
    expect(sent(fetchFn).body).toEqual([{ index: 0, methodname, args }]);
  });

  it('maps a function exception to a typed exception failure', async () => {
    const { gw } = gatewayReplying([{ error: true, exception: { errorcode: 'notviewable', message: 'No' } }]);
    const e = await failure(gw.viewActivity(44));
    expect([e.kind, e.errorcode, e.message]).toEqual(['exception', 'notviewable', 'No']);
  });

  it('maps a lost session to a session failure', async () => {
    const { gw } = gatewayReplying({ error: 'Invalid sesskey', errorcode: 'invalidsesskey' });
    const e = await failure(gw.touchSession());
    expect([e.kind, e.errorcode]).toEqual(['session', 'invalidsesskey']);
  });

  it.each([
    ['http', () => gatewayReplying('oops', 500).gw],
    ['protocol', () => gatewayReplying('<html>').gw],
    ['protocol', () => gatewayReplying([]).gw],
    ['network', () => new AjaxGateway(session, async () => { throw new TypeError('offline'); })],
  ])('maps transport trouble to a %s failure', async (kind, make) => {
    expect((await failure(make().getWorld(30))).kind).toBe(kind);
  });
});
