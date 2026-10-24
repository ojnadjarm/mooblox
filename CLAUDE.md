# MOOBLOX: project notes

Personal open-source repo (GPL-3), remote origin (GitHub, private); commit per ticket `T<n>: <what>` and push. Moodle plugin `local_mooblox` in `moodle/local/mooblox`,
world client in `client/`. Design: `ARCHITECTURE.md`. Plan and tickets:
`~/agent-work/research/2026-10-24/T1276/PLAN.md`.

- Moodle target 5.0+ (`requires` 2025041400); dev/test on `~/moodle-envs/5.2` (:8052) through
  `mfixture with 5.2`. Never touch Vass envs.
- Moodle work ends with `/moodle-ci` (`mci quick` while iterating).
- Fixture data and manual-test notes live in `.research/testdata/` (untracked).

## Built

- Phase A (T1277-T1279), 2026-10-24:
  - Repo docs: README, ARCHITECTURE (10 client modules, 6 plugin classes), LICENSE (GPL-3), CREDITS.
  - `local_mooblox` 0.1.0 scaffold from /moodle-pluginskel: `local/mooblox:play` (course context;
    student, teacher, editingteacher, manager), site switch `local_mooblox/enabled` (default on),
    null privacy provider. Not installed permanently on 5.2: use `mfixture with 5.2 moodle/local/mooblox -- <cmd>`.
  - Fixture: `.research/testdata/setup.php` (run from the 5.2 root with `mphp`) builds course
    `mooblox_demo` (id 30 on 5.2): label (s0), page (s1), mp4 resource + YouTube url (s2), 3-question
    true/false quiz (s3), completion on, student `mooblox_student` (Mia). `testing-instructions.md` beside it.
- Phase B (T1280-T1284), 2026-10-24, version 2026102405:
  - `local_mooblox_get_world(courseid)` (ajax + mobile service) over `local\world_builder`: course name, first
    name, sections (id, number, name, available, availableinfo) and per visible cm id, modname, name, url,
    purpose, icon, available, availableinfo, completion (0/1/2), state, isautomatic, dates. Captured demo
    JSON (course 30, student): `.research/testdata/get_world_demo.json`.
  - `local_mooblox_view_activity(cmid)` (ajax, write): allow-list book/page/resource/url to `mod_*_view_*`
    via `call_external_function`; anything else throws `notviewable`.
  - `local\access::require_play()` (cap + site switch) guards play.php and both functions.
  - `play.php?id=<course>`: embedded layout, `templates/play.mustache` = `#mooblox-root`, JSON in
    `#mooblox-config` {wwwroot, courseid, sesskey, firstname, avatar, rev}, and
    `<script type="module" src="client/dist/mooblox.js?rev=">`: the client build must emit that file.
    Sets `$SESSION->local_mooblox_play`. Course tab "MOOBLOX" after "Course" via `secondary_extend`.
  - Framed pages: `local\embed_detector` (Sec-Fetch-Dest iframe + session flag) + `before_http_headers`
    switch to the embedded layout and add body class `local-mooblox-framed`. Browsers send Sec-Fetch-Dest
    only to https or localhost: test on `http://localhost:8052`, not the tailnet http host.
  - Avatar preference `local_mooblox_avatar` (PARAM_ALPHANUMEXT, own user only) in lib.php; privacy
    provider exports it and deletes it per user context.
  - Tests: PHPUnit 11 (5 files), Behat `tests/behat/play.feature` (2 scenarios), mprivacy ok, mci quick
    6 ok 0 red. The headless frame check left one in-progress quiz attempt for `mooblox_student`.
- Phase C (T1285-T1288), 2026-10-24, client core:
  - `client/`: Vite 8 + TypeScript 7 strict + three 0.186.1 + vitest 5. `npm ci && npm run build` (tsc, then
    vite) writes `moodle/local/mooblox/client/dist/mooblox.js` (committed; play.php loads it); `npm test` runs
    vitest (7 files, 38 tests). Delete `client/node_modules` after work.
  - `boot/main.ts` composition root: `readConfig` (validates `#mooblox-config`) → `AjaxGateway` → `CourseStore`,
    plus `keepSessionAlive` (`core_session_touch` every 5 min).
  - `domain/`: wire DTO (`dto.ts`), domain types and completion enums (`types.ts`), `toWorld`/`toDto` mapper.
  - `moodle/`: `MoodleGateway` interface; `AjaxGateway` (one POST per call to `lib/ajax/service.php?sesskey&info`,
    failures as `MoodleError` kinds network/http/session/exception/protocol); `FakeGateway` over
    `client/test/fixtures/get_world_demo.json` (the captured reply, host replaced by `https://moodle.example`).
  - `state/CourseStore`: notifies subscribers once per real change (JSON equality).
  - `world/IslandLayout` (`LayoutPolicy`): hub (r 12 m) at the origin, one zone per section (section 0 included)
    on a ring, plots per activity on a ring inside each zone, mulberry32 seeded by course id; 12 sections of 10
    activities stay within 150 m.
