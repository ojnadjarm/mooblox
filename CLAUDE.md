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
- Phase D (T1289-T1294), 2026-10-24, world:
  - `npm run dev`-free dev page: `client/index.html` → `boot/dev.ts` (FakeGateway demo course). Query: `?scene=overview`
    (no player), `?scene=avatars` (3 tinted avatars), `?walk=<cmid>` (autopilot to a plot), `?touch`, `?perf=1`,
    `?quality=low|medium|high`. Headless tools (playwright-core from the Playwright MCP install, `PLAYWRIGHT_CORE`
    overrides): `node tools/still.mjs <dir> [WxH..] [--query q]`, `tools/walk.mjs <cmid>`, `tools/touch.mjs`,
    `tools/quality.mjs` (exit 0 = pass). Headless Chrome gets the real Iris Xe GPU via `--use-angle=vulkan`.
  - Scene: `world/stage.ts` (WebGL2, hemisphere + sun with one shadow following the player, fog, gradient sky),
    `world/material-kit.ts` (Flyweight: plastic + studded plastic, vertex-colour palette `world/palette.ts`),
    `world/island-builder.ts` (hub plaza, zone islands, plank bridges, purpose-coloured studded pads, decor from
    `world/decor.ts`, clouds; 4 merged meshes), `perf/frame-gate.ts` (on demand while paused).
  - Assets: `node tools/intake-assets.mjs ../.research/assets-raw` (unzip the 3 zips there first) →
    `client/public/assets` (Kenney Blocky Characters 2.0 + 18 skins, KayKit Prototype/City picks; meshopt; 548 KB)
    + `LICENSES.csv` (all CC0, tested). Quaternius UAL not shipped: the Kenney rig is node-animated.
  - Player: `player/avatar-kit.ts` (glb + skins, shirt tint recolour), `avatar.ts` + `clips.ts` (idle, walk,
    run = sprint, jump = ours), `collider.ts` (three-mesh-bvh capsule), `controller.ts` (pure fixed 1/60 s step),
    `fixed-step.ts`, `input.ts` (keyboard, combined), `follow-camera.ts`, `player.ts`; `ui/touch-controls.ts`
    (joystick + jump); `perf/quality*.ts` + `ui/perf-overlay.ts`. `boot/app.ts`: `startWorld` + `startPlayer`.
  - vitest 14 files 57 tests; bundle 194 KB gz. Draw calls 19 with one avatar.
- Phase E (T1295-T1302), 2026-10-24, activities in the world:
  - Props: `world/props/` Factory + Registry (`catalog.ts`: Signpost (no url), BookStand (page), Cinema (playable video
    file or YouTube link), ArenaGate (quiz), Door fallback). Each prop: purpose-coloured body, canvas sign (icon + name),
    completion flag white/green, padlock when restricted; `PropsLayer.update(world)` on every store change. Not solid.
  - `get_world` returns `media` {type file|link, mimetype, src} per cm (resource main file, url externalurl).
  - Interaction: `interaction/proximity.ts` (enter 3.2 m, exit 3.8 m), `ui/prompt.ts` (E or tap), `OpenerRegistry`
    (`VideoOpener` native video / youtube-nocookie + `view_activity`, then `FrameOpener` iframe of the cm url),
    `ui/panel.ts` (dialog, focus trap, Esc, inert world, render paused). Each close → `CourseSync.refresh` → store →
    props + prompt. Manual-completion toggle in the panel bar.
  - Book: `ui/book-model.ts` + `ui/book.ts` (HUD button, key B), "Go there" → `goToPlot` (`Player.teleport`).
  - Guide NPC: `tutor/` (`Tutor` interface, `ScriptedTutor`: greeting by first name, next step, all done) +
    `tutor/guide.ts` (bubble over the head, Show me). Strings from lang via play config `strings`.
  - Avatar picker: `ui/avatar-picker.ts` (HUD "My avatar", bottom sheet: `AvatarFactory.bodies` faces × 9 shirt
    colours from `player/look.ts`, live swap via `Player.setAvatar`), saved on close as preference
    `local_mooblox_avatar` = `<body>` or `<body>_<colour>` through `core_user_update_user_preferences`. A new
    character set only has to implement `AvatarFactory` (bodies + create).
  - Tests: vitest 23 files 83 tests; dev e2e `node tools/{open,manual,book,guide,picker}.mjs`; live e2e on 5.2:
    `mfixture with 5.2 moodle/local/mooblox -- bash -c "cd ~/moodle-envs/5.2/www && mphp <repo>/.research/testdata/reset.php
    && cd <repo>/client && node tools/moodle.mjs video|quiz|avatar [outdir]"` (reset.php clears the student's attempts,
    completion and avatar). mci quick 7 ok 0 red. Bundle 205 KB gz.
- T1308, 2026-10-24, version 2026102406, access gates (matrix: `docs/ACCESS.md`):
  - `get_world` mirrors the course page: sections by `format->is_section_visible()`, no activities in a closed
    section, activities by `is_visible_on_course_page()` (stealth and eye-off restrictions left out). New `lock`
    (kid sign text) per section and cm from `local\lock_reason` (date, completion, grade, group/grouping/profile;
    else Moodle's text) and `nextchange` (earliest future date condition in the course). Lang `lock_*`, `gate_open`.
  - Client: `world/access-fence.ts` + `player/fenced-collider.ts` (closed island, shore and bridge past the gate,
    any height), `world/gates/` (Gate model + GateLayer, swings open live), `world/rebuild.ts` (relayout when
    sections or activities come or go; the player moves with its zone), `state/access-clock.ts` (refresh at
    `nextchange`), book lists closed sections with the reason and disables "Go there"; `goToPlot` refuses.
  - Fixture: demo course gains "Lava lab" (after the page, with page "Lava lab notes") and "Space camp" (opens
    on a date). Live e2e `node tools/moodle.mjs gates [outdir]` 8/8. PHPUnit 27 tests (11-row data provider),
    vitest 26 files 99 tests, mci quick 7 ok 0 red. Bundle 210 KB gz.
- T1309, 2026-10-24, look B "Cosy campus", procedural for any course shape:
  - `world/island-layout.ts`: hub r 22, one district island per section with plots on rings (pitch 6.5 m, ring step 7 m,
    entry gap), zones packed greedily round the hub with straight bridges clear of every island. Fallback past ~12
    sections: an archipelago of small plazas (r 13) linked by always-open bridges (`layout.hubs`, `layout.links`,
    `Zone.anchor`); 20x30 = 13 plazas, extent 284 m. Same course id → same world.
  - `world/dressing.ts` (pure data, node-testable via `model-footprints.json` from `node tools/footprints.mjs`): rim cliffs,
    hub hall terrace, plaza walks to every bridge, brick ring walks, houses, mesas, hedges, lamps, docks, trees, flowers.
    `world/scenery.ts`: one LOD per district (far drops detail), one sway material, one glow mesh; solid parts feed
    the BVH collider (real bridges, rails, buildings, trees). `world/life.ts`: instanced flags and boats, gulls, petals,
    2 NPC kids (not on low). Props past 40 drop sign/flag/lock beyond 50 m and hide beyond 140 m (low 30/80).
  - Dev: `?shape=8x12` or `?shape=3,0,5&course=N` (`domain/course-shape.ts`). Perf + stills: `node tools/perf.mjs <dir>
    [shapes] [tiers]` (merges `numbers.json`). Kit: 34 CC0 Kenney models in `public/assets/kit`; KayKit packs removed.
  - Demo high 1366: 86 draws, 147k tris all passes (76k on screen), 30 shaders; low tier 60 fps on all 4 shapes.
    vitest 26 files 133 tests (`campus-shapes.test.ts`: determinism, no overlaps, BFS walk from spawn to every plot
    for 4 shapes + 6 random). Live `tools/moodle.mjs gates` 8/8.
  - Owner round 2 (same ticket): density, collision, xhigh.
    - `world/occupancy.ts` grid: every solid model claims its footprint in `Designer.model()` (hedges/fences as
      abutting `wall` pieces); overlaps are skipped. Fountains get collision-only walls (`District.blockers`).
      `campus-shapes.test.ts` asserts zero solid footprint overlaps; `node tools/bump.mjs [shape]` walks the player
      into fountains, houses and stalls (8/8).
    - Density: one theme corner per ~120 m² of district (park playground built from boxes, market, garden, fountain
      square, woods camp), ground patches, path edging, more flowers and tufts, shore rocks/reeds/lilies, buoys,
      islets, coloured roofs. `Placement.minor` (low drops it, shadowless mesh) and `rich` (xhigh only). Life:
      ducks, cats, dogs, butterflies (instanced), smoke points, 2 ships, kids per tier (medium 2, high 3, xhigh 8)
      at hangouts or on paths, hidden past 60 m.
    - Xhigh tier (merged from branch `t1309-xhigh`): `perf/gpu.ts` auto-picks it on discrete GPUs with 8+ cores,
      `?quality=xhigh` forces it. `public/assets/kit-hd/` = bevelled kit (`blender -b -P tools/bevel-kit.py --
      public/assets/kit public/assets/kit-hd`, then `python3 tools/hd-licences.py public/assets`), `detail/` = 2
      packed ambientCG CC0 detail atlases (`tools/pack-detail.py`), `world/surfaces.ts` classes per vertex, GTAO,
      4096 shadows. Assets test: 3 MB base budget, separate 12 MB xhigh budget.
