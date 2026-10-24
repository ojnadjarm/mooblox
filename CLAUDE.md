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
    - Numbers (1366, Iris Xe headless, `~/drop/T1309/numbers.json`): demo high 72 draws, 131k visible tris,
      30 programs, 47-50 fps; low 60 fps on all 4 shapes; xhigh demo 135-299 draws, 36 programs, 20-29 fps on
      this laptop. vitest 27 files 150 tests; walk 41/44, open 13/13, bump 8/8, live gates 8/8. Bundle 240 KB gz.
- Gamification phase G1 (T1338-T1343), 2026-10-24, version 2026102407 (plan: `~/agent-work/research/2026-10-24/T1337/PLAN.md`):
  - `ARCHITECTURE.md` §Rewards: 7 tables, 9 `classes/rewards/` classes, data flow, SOLID, motivation rules (gentle
    learning weeks replace "no streaks"); kids' safety now lists the 5 user tables and `local_mooblox_look`.
  - `db/install.xml` + `db/upgrade.php`: `local_mooblox_course|ledger|xp|day|unlock|found|goal` (upgrade from 2026102406
    checked with `mfixture with` + `mupgrade` + `admin/cli/check_database_schema.php`).
  - `rewards\catalog` (12 hats, 9 outfits, 6 pets, 3 trophy styles; `level_reward()`: a pet every 5 levels, else a hat or
    outfit, crc32-seeded by course + level from the not-owned pool) mirrored by `client/src/rewards/catalog.ts`
    (art key + LICENSES.csv row; `test/rewards/catalog.test.ts` compares both lists). Art: Kenney Cube Pets +
    Mini Characters (CC0) via `node tools/intake-cosmetics.mjs ../.research/assets-raw` (unzip `kenney-cube-pets.zip`
    and `kenney-mini-characters.zip` there first) → `public/assets/cosmetics/{pets,head}.glb` (227 KB); 10 hats and
    3 pedestals are box-built (row `built:boxes`), outfits are palettes on the Kenney skin.
  - `rewards\facts` (value object), `xp_rules` (pure; auto 10, view 5, manual 3 or 0, pass +10, grade 50/80/100 %
    +5/+10/+15 as one band row, badge 25, course 50; `version()` hash), `level_curve` (25·n·(n+1)),
    `fact_source` + `moodle_fact_source` (4 queries with warm modinfo; hidden grades skipped; course badges only),
    `reconciler::sync()` (one transaction: ledger diff, cache with peaklevel, day rows in the user's timezone, one
    unlock per new peak level; returns the change count, 0 on a re-run).
  - Tests: PHPUnit 47 (rewards 20: 15-set provider, fact source on a generated course, reconciler idempotence and
    untick), vitest 29 files 166 tests, mci quick 7 ok 0 red. Nothing wired to events or the client yet (T1344+).
- T1365, 2026-10-24, character creator (replaces the T1302 picker; no version bump: lib.php callback + lang only):
  - Look = compact JSON preference `local_mooblox_avatar` `{"v":2,skin,hair,hairc,eyes,eyec,brows,mouth,glasses,glassesc,
    top,topc,bottom,bottomc,shoes,shoesc}`; allow-lists in `moodle/local/mooblox/character.json`, shared by PHP
    (`local_mooblox\character::clean`, the preference `cleancallback`: invalid → '', T1302 `<body>[_<colour>]` kept) and
    the client (`player/character/catalog.ts` imports it). Client migrates T1302 values to 18 presets (`character/look.ts`).
  - `player/character/`: `parts.ts` (box/spike/quad parts on the 7 Kenney rig bones), `hair.ts` (11 box-built styles,
    `crown` tag for future hats), `face.ts` (eyes, highlights, brows, mouth quads; glasses slot), `outfit.ts`, `compose.ts`
    (`Wearable` slots hat/face/back/hand: plug-in seam for unlockables), `atlas.ts` (one 512² canvas face atlas, white
    masks tinted by vertex colour), `mesh.ts` (one merged indexed skinned geometry). `AvatarKit` keeps the
    `AvatarFactory` contract (legacy looks accepted): one SkinnedMesh + one shared Lambert material per character,
    Kenney glb used only for the rig transforms and clips. `player/recolor.ts` and the per-kid 1024² skin textures gone.
  - `ui/avatar-picker.ts` = full-screen creator (tabs Hair/Face/Skin/Clothes, `creator/preview.ts` turntable in its own
    small renderer, created on open and freed on close; Surprise me, Undo (`creator/history.ts`), Save, Cancel/Esc);
    world gate paused while open. Lang `creator_*`, privacy string describes the JSON.
  - Tools: `client/grid.html` (`?n=12` 3x4 showcase, `?n=20&random=1` crowd), `node tools/characters.mjs <dir> [n]
    [--random]`, `node tools/picker.mjs [dir]` (18 checks incl. 5 widths and 6x CPU fps), live `tools/moodle.mjs avatar` 6/6.
  - Numbers: 12 kids 12 draws / 3.6k tris, 20 kids 20 draws / 5.7k tris, ≤ 1.5k tris per kid (tested), preview 60 fps at
    400 px under 6x CPU throttle. vitest 29 files 166 tests, PHPUnit `character_test` 14 cases, mci quick 7 ok 0 red.
- Gamification phase G2 (T1344-T1347), 2026-10-24, version 2026102409:
  - Triggers: `db/hooks.php` `after_cm_completion_updated` (also fires on bulk updates, which skip the event) and
    `db/events.php` (completion, user_graded, badge_awarded/revoked, course_completed) → `rewards\sync_queue::user()` →
    deduped adhoc `task\sync_user` (courseid, userid). `rewards\course_switch::is_on()`: site `enabled`, site
    `gamification` !== '0', course row `enabled` (no row / null = on); off → nothing queued.
  - Cleanup: `course_deleted` / `user_deleted` → `rewards\cleanup` (unlocks outlive a deleted course);
    `course_reset_ended` → adhoc `task\sync_course` (users with XP rows or completions). Nightly `task\reconcile`
    (02:R): users in `user_lastaccess` within 7 days, `rewards\batch_sync` 200 per transaction. Class goals not yet (T1361).
  - Privacy: ledger, xp, day, found in the course context, unlock in the user context, prefs `local_mooblox_avatar` +
    `local_mooblox_look`; export per course under "MOOBLOX" (ledger with activity names). mprivacy ok.
  - Backup: `backup/moodle2/{backup,restore}_local_mooblox_plugin.class.php`: settings always; with users found (keys
    `gem:<cmid>`, `crystal:<sectionid>` remapped in `after_restore_course`, unmapped dropped) and days; ledger/XP rebuilt
    by a queued `sync_course`.
  - Tests: PHPUnit 69 (G2 adds sync_trigger 2, cleanup 3, privacy 2, backup 1), mci quick 7 ok 0 red.
- T1366, 2026-10-24, optimisation for any device (profile: `~/agent-work/research/2026-10-24/T1366/PROFILE.md`, compare page
  `~/drop/T1366/index.html`):
  - Tiers (`perf/quality.ts`): auto pick = phones, tablets, Chromebooks (`CrOS`), <= 4 cores or <= 4 GB, software or mobile
    GPUs → low; strong desktop GPUs with 8+ cores → high; every other laptop → medium; xhigh only with `?quality=xhigh`.
    Each tier carries `post`, `ao`, `districtDistance`, `minScale`. `DynamicResolution` aims at 50-57 fps (drops 0.1 per slow
    second, raises 0.05 after 3 s at vsync); at its floor `QualityManager` steps one tier down live (shadow, post, DPR) and
    remembers it in `localStorage['mooblox-tier']` (never when `?quality=` is set). Tiers without post get the grade's
    vignette as a CSS overlay (`.mooblox-vignette`).
  - World: `scenery.ts` one group per district (base mesh, `detail` group, `minor` group; no duplicate LOD copy),
    `cullDistricts` hides districts past `districtDistance` (low 45, medium 150, high 260 m; overview shows all), detail past
    `DETAIL_DISTANCE`, minor past `MINOR_DISTANCE`. Low: baked vertex-colour water (`bakedWaterGeometry`, glow material),
    coarser island rims, props to 50 m. Water shader loop stops at the island count. Sky and water draw after opaque parts.
    Boats, buoys, ships, detail meshes and the Guide cast no shadow below high.
  - Assets: `node tools/pack-kit.mjs` packs `client/kit-src/<pack>/*.glb` (the 97 Kenney sources, moved out of `public/`) into
    `public/assets/kit.glb` (628 KB, meshopt, tangents dropped); `ModelLibrary` loads it once (MeshoptDecoder, quantized
    attributes back to Float32). `tools/footprints.mjs` and `bevel-kit.py` read `kit-src/`.
  - Perf gate: `node tools/perf.mjs [outdir] [--shapes ..] [--tiers low,medium] [--load] [--stills] [--gate]` builds the dev
    page, walks to the farthest plot (`?walk=far`), asserts low (T1367: Iris Xe 400x800 DPR 1, 4x CPU: 58 fps, 40 draws, 80k tris,
    10 programs, no post; plus the SwiftShader 6x stress floor) and medium (Iris Xe 1366: 58 fps, 60 draws) plus all-tier heap 150 MB, GPU estimate 200 MB, worst
    frame 50 ms, Fast 4G load 3 s / 3 MB, 20x30 within 1.5x demo. `npm run test:perf`; `npm run test:all` = vitest + gate.
    `npm test` stays vitest only while the gate is red (it would fail every parallel agent's unit run).
- T1367, 2026-10-24, optimisation round 2 (PROFILE.md "Round 2", compare `~/drop/T1366/index.html#round2`):
  - Streaming: `world/district-streamer.ts` (`DistrictStreamer`: `buildNear` = the area within 25 m of the spawn before
    the first frame, `pump` = nearest unbuilt district first in 4-8 ms slices per frame, frees past `drop`: low 70/100 m,
    medium 170/200 m, xhigh never; `pending` on `view.streaming`). `scenery.ts` `DistrictBuild` (sliced build, `unload`,
    per-district collider + bounds, triangle counts in `userData.tris`) + `buildGlow`; `player/composite-collider.ts`
    (island BVH + built districts; `view.collider` replaces `view.solids`). Gates, fence, props stay layout-driven.
  - `cullDistricts(..., budget)`: nearest first within `QUALITY[tier].sceneryTris` (low 55k, others uncapped).
  - Designer: `world/segment-index.ts` + plot `Occupancy` in `free()` (same output); surface classes only on xhigh.
  - Allocations: `kit.sceneryInstanced` and `world/depth-materials.ts` (instanced/skinned casters) end per-draw program
    switches; colliders, fence (`pushPoint`), inputs (`MutableInput`), camera `toWorld`, player tick, movers, culls and the
    frame gate reuse objects. `test/player/step-allocation.test.ts` heap-samples 20k steps: 0 B from `client/src`.
  - Perf gate: low = Iris Xe DPR 1 400x800 4x CPU (58 fps) + stress SwiftShader 6x (30 fps, worst frame 100 ms); stills
    wait for `streaming.pending === 0`. Gate 85 pass / 15 fail (medium big-course draws/tris, 20x30 heap/GPU/load, stress
    worst frames; causes and costs in PROFILE.md). vitest 35 files 187 tests.
- Gamification phase G3 (T1363 fixture, T1348-T1351), 2026-10-24, version 2026102411:
  - Fixture: `.research/testdata/rewards.php` (helpers in `lib.php`, shared with `setup.php`) builds `mooblox_rewards`
    (4 sections, 3 pages, 2 YouTube urls, 2 quizzes pass/fail, manual journal, course completion, badges Bookworm/Quiz
    champ/Helper, teacher `rewards_teacher`, kids `rewards_kid1..6`) and syncs XP; `rewards_reset.php` puts Mia back at 45 XP.
    Scripts need `lib.php`, so copy the dir into the installed plugin: `mfixture with 5.2 moodle/local/mooblox -- bash -c
    'cp -r <repo>/.research/testdata $MFIXTURE_DIR/testdata && cd ~/moodle-envs/5.2/www && mexec local/mooblox/testdata/rewards.php'`.
    Live e2e `node tools/moodle.mjs rewards [outdir]` (server loop over ajax, no HUD yet): 11/11 in 15 s.
  - Pure: `rewards\course_shape` (tracked cms per section, kind video/quiz/page/other, pass grade, earnable badges, course
    completion), `quest_generator` (`sec:<id>`, `mod:video|quiz|page`, `badge:<id>`, `course`; each quest's item is a crc32 pick
    per course from hats + outfits, unique in the course, named before it is done), `collectible_catalog` (`gem:<cmid>`,
    `crystal:<sectionid>`, `star:<sectionid>:<n>` 1 per 3 cms; restore remaps star keys too). A failed attempt counts as done.
  - Moodle: `moodle_course_shape` (modinfo + 4 queries), `summary` (get_rewards: one fact load shared with the sync, quest items
    granted on read), `collector::claim`, `wardrobe` (`local_mooblox_look` JSON {hat, outfit, pet}, set only by set_look).
    Externals `local_mooblox_get_rewards` / `claim_collectible` / `set_look` (ajax, write; errors `collectiblelocked`,
    `itemlocked`, `rewardsoff`).
  - Teacher: `rewards.php?id=` (moodleform: rewards, manual XP, learning days 1-5, class goal + target; goal off = target 0,
    automatic = null), cap `local/mooblox:managerewards`, "MOOBLOX rewards" in the course More menu; site settings
    `gamification` and `rewardsdefault` (course without a choice).
  - Client: `domain/rewards*.ts` (types, wire DTO, mapper + `assertRewardsDto` exact shape), `MoodleGateway.getRewards |
    claimCollectible | setLook` in Ajax and Fake; `test/fixtures/get_rewards_demo.json` captured from 5.2. Not wired to boot yet.
  - Tests: PHPUnit 77, Behat 4 scenarios, vitest +2 files (rewards 9 tests), `mci full` 15 ok 0 red 1 skip (mustache: no java).
- T1364, 2026-10-24, art direction rounds (bible `docs/ART-BIBLE.md`, compare page `~/drop/T1364/index.html`, log
  `~/agent-work/research/2026-10-24/T1364/ROUNDS.md`):
  - Round 1: `world/look.ts` CAMPUS = bible palette (trim, cliff bands, lavender rock, wall), hemisphere ground = shadow tint
    `#4B5A8C`, sky blended in sRGB without tone mapping (`kit.sky.toneMapped = false`), water shallow/mid/deep over 26 m.
    `world/landmarks/`: `shapes.ts` (faceted helpers: box, prism, bowl, gable, cone, dome, rock, disc; `alternate`, `bands`,
    `bakeAo`), `landmarks.ts` (art data: clock tower 16 m, library, science dome + rocket, stadium, theatre tent, lighthouse;
    ≤ 3k tris each, tested), `themes.ts` (`pickThemes`: dominant activity purpose per district, unused first; accent + corner
    clusters per theme). Designer: hub tower on its terrace with an avenue and lamp pair (`Dressing.focus`: the spawn camera
    faces it), district landmark on a terrace where the bridge points (grows with the island), roofs in the district accent,
    `Placement.bands` (banded cliffs), `Dressing.landmarks`. Scenery bakes AO at the base of solids. Hub plaza: radial paving,
    cream trims, round stepped spawn pad; lawns flat-coloured with a gradient (no studs; pads keep them).
  - Tiers: xhigh uses `standard` materials (no detail textures); medium `districtDistance` 110, `sceneryTris` 90k, props
    30/70 m, streaming keep/drop 125/150 m, rims 2.5 segments per metre; island land casts no shadow (all tiers).
  - `node tools/art-stills.mjs <dir> [--shapes demo,8x12] [--prefix after] [--video]`: overview 1366 + play 1366 (high),
    play 400 (low) JPEGs and a 12 s `walk.webm`. Round 1 gate 8 over budget (HEAD 17); medium draws/tris pass on all shapes.
  - Round 2: `world/recipes.ts` (art data: treeClump, gardenBed, rockGroup, readingNook; tested) stamped by the designer
    (`clusters`, `stamp`: one footprint per cluster, trunk-sized obstacles) instead of uniform scatter; raised 1 m lawns
    (`lawnTerraces`, `raisedLawn`: faceted banded sides, stone steps, a cluster on top) where an island has room; shore rock
    groups + one cove (sand bulge, reeds, lilies); path lamps in pairs. Gate 76 pass / 8 fail (same 8 as round 1).
  - Round 3 (game feel): `player/game-feel.ts` (pure: `accelerate`, `JumpGate` coyote 0.1 s + buffer 0.12 s, `squash`,
    `landing`, `stepPuffs`/`puffScale`, `zoom`, `damp`); `stepBody` now jumps whenever `input.jump` (the gate decides).
    `Player` eases velocity, squashes the avatar on landing, `onFeet` -> `player/dust.ts` (instanced puffs; off on low).
    `FollowCamera`: pitch 0.38 (drag tilts), wheel zoom, look-ahead, sight-line probes against `view.collider` (10 Hz,
    nearest 4.5 m). Prompt pops in; `PropsLayer.update` returns newly done props -> gold sparkles. `world/npc-schedule.ts`
    (walkers pause at path ends, players hop). Gate 78 pass / 6 fail.
  - Round 4: door props swing their leaf open at the player's activity (`PropShape.leaf` builder, `Parts.append` +
    `mesh(name, mat, tail)` -> `userData.head`: the body draws without the merged leaf only while it swings; `Prop.swing`,
    `PropsLayer.swing(nearId)`, `ActivityInteraction.nearId`). Creator kids: `CLOTH` in the bible palette, baked shade-tint AO
    in `character/mesh.ts`; NPC shirts in the same palette. Gate 76 pass / 8 fail under machine load.
  - Round 5 (atmosphere, owner: "a warm place, alive"): `world/sky.ts` `Sky` = gradient dome (zenith, upper, warm horizon,
    sun glow and disc, far sea below the horizon) + faceted drifting clouds (`world/sky-data.ts` `cloudPuffs`, pure, tested) in
    one mesh, one draw, one program, centred on the camera in the vertex shader; colours in `Look.sky` (`SkyScript`). The haze
    (`world/haze.ts`) now fades to `skyColour(view ray)` (shared `SKY_UNIFORMS`/`SKY_GLSL`), varying `vHazeWorld` (vec3; `vHazeXZ`
    kept as a define for `island-fade.ts`). Neutral tone mapping, sun `#FFE6BF` 2.8 at about 38 degrees, hemisphere `#DCE8F8`
    over `#8A7290` 1.45. `Stage.add` hides the island builder's static `clouds` mesh; `kit.sky` removed. Water sparkles twinkle
    on the sun side; gulls wheel over the player (eased camera centre). Xhigh: no GTAO, no bevelled kit (kit-hd assets now unused).
    Dev `?scene=shot&cam=hub|district|shore` (`boot/dev-shots.ts` `conceptShot`, the bible's concept cameras on any course);
    `tools/art-stills.mjs` renders them too (`--views` filter).
    Numbers: demo low 60 fps (clean A/B vs HEAD: +3.4k tris of clouds, programs 10 = 10, 1 draw fewer), xhigh 28 -> 56 fps;
    gate 76 pass / 8 fail under load 8-11 with T1369's WIP in the tree.
  - Round 6 (creator kids): `BoxPart.bevel` + `block()` = eight-sided blocks (28 tris) for every body block, shoe and skirt;
    `mesh.ts` `formShade` (each bone's block shades top to bottom, `FORM` 0.09); `outfit.ts` hems, cuffs, shorts turn-ups, hoodie
    hood, collar or scoop neck (`PROUD` 0.012); `face.ts` cheeks (`blush` tile, skin pulled to rose); `character/material.ts`
    `characterMaterial` = Lambert with the sun wrapped past the terminator (`WRAP` 0.55, own program key); `grid.html` and the
    creator preview use `CAMPUS` light + Neutral tone mapping (`?turn=<rad>`, `tools/characters.mjs --turn=`). 12 kids 12 draws,
    639 tris per kid. Dist not rebuilt in this round (T1369 work in progress in the tree).
  - Round 7 (surface detail + roundness, owner: "everything is plain"; "not everything needs to be rounded"): `world/surface-atlas.ts`
    paints one 14-layer greyscale `DataArrayTexture` at boot (512 px, 256 on low; grass, meadow flowers in alpha, foliage, wood
    planks, rock, shingles, plaster, brick, dirt pebbles, sand ripples, flagstones, cliff strata); `surfaces.ts` `Surface` gains
    sand/paving/meadow/cliff + `ATLAS_LAYERS` (metres per tile, strength). `material-kit.ts` `withAtlas` on plastic, scenery and
    sceneryInstanced (every tier): layer from a `surface` attribute, else from vertex colour + slope in the vertex shader;
    object-space planar mapping, multiplies the colour, fades 45-130 m. `IslandBuilder` tags land parts, rolls a grass lip on
    every rim, rounded pads, merges ground decals (meadows, dirt, puddles). `world/ground-scatter.ts` (pure `groundSpots`/`lawnTest`,
    cell-stable) fills one preallocated mesh of tufts + pebbles ahead of the camera (`life.ts`, 360 within 18 m; low 80/9 m).
    Kit: `blender -b -P tools/round-kit.py -- kit-src <dir>` then `node tools/pack-kit.mjs <dir>` (per-object soft/round/eaves/
    crisp rules, ART-BIBLE §5); `ModelLibrary` keeps the glb normals. Low: atlas `LinearMipmapNearest`, anisotropy 1; scatter
    uploads only the filled range (`addUpdateRange`). Gate 76 pass / 0 fail (baseline 75/1); low demo 22 -> 24 draws, 39k -> 48k
    tris, programs 11 = 11, 60 fps all shapes. Dist not rebuilt (T1369 WIP).
- Gamification phase G4 (T1352-T1355), 2026-10-24, no version bump (play.php + lang only):
  - Wiring: `boot/rewards.ts` `startRewards` (main.ts and the dev page `rewards.html` -> `boot/dev-rewards.ts`, query `?off`,
    `?xp=`, `?weeks=`, `?hat=`, `?pet=`, `?scene=hats`). Off = no HUD, no wardrobe tab, no hats or pets loaded.
  - HUD: `rewards/rewards-store.ts`, `ui/hud-model.ts` (level curve 25·n·(n+1), next quest = closest to done), `ui/hud-rewards.ts`
    (card under Book: level chip, XP bar, leaf weeks, quest line, pet badge on low tier).
  - Level-up: `rewards/level-up.ts` (peak level rose since the last read), `ui/level-up.ts` (confetti, card, "Try it on" opens
    the wardrobe; reduced motion: static card), `ui/chime.ts` (Web Audio, -12.7 dBFS peak), names `rewards/item-names.ts`.
  - Wardrobe: `ui/avatar-picker.ts` `CreatorTab` seam (`addTab`, `openTab`), `ui/wardrobe*.ts`. `player/attachments.ts`
    `Outfitter` (AvatarFactory decorator: hat Wearable on the head, outfit = clothes swap). Hats: `tools/hats.py` in Blender
    -> `cosmetics/hats.glb` (12, 2160 tris, CC0), `player/hats.ts`, new `mesh` Part kind.
  - Pet: `player/pet-steering.ts` (pure: follow point beside and behind, leader velocity fed forward, snap > 12 m),
    `player/pets.ts` (Kenney cube pet merged to 1 SkinnedMesh on its node rig, idle/walk/run), `player/pet.ts` (PetFollower,
    fed the avatar root; no world code). Tiers: none on low (HUD badge), no shadow on medium, shadow on high/xhigh.
  - Checks: `node tools/rewards.mjs hud|levelup|wardrobe|hats|pet [outdir]`; stills `~/drop/T1276/T1352..T1355/`. vitest 222,
    mci quick 6 ok 0 red 1 skip (phpunit: plugin not in a Moodle root).
- Gamification phase G5 (T1356-T1362), 2026-10-24, version 2026102412 (`db/caches.php` `classgoal`):
  - World data: `world/walk-grid.ts` (`WalkGrid`: walkable cells + BFS from the spawn, shared by tests and placement),
    `Dressing.occupancy` (`GroundQuery`), `Dressing.hall` (round lawn reserved on the spawn hub, r 3.6/3.1/2.6, nearest the
    landmark) and `Dressing.monument` (spot on the spawn plaza beside the avenue, away from the hall and bridge lines).
  - Collectibles: `world/collectibles.ts` (seeded per course + key, gems round their plot, crystal mid-district, stars anywhere
    reachable; tier caps 40/80/150/300 nearest within 40-120 m), `collectible-models.ts` (gem 32, crystal 90, star 20 tris),
    `collectible-layer.ts` (3 instanced draws, spin + bob in the vertex shader), `boot/collectibles.ts` (walk-through pickup ->
    `claim_collectible` -> album; `ui/collect-toast.ts`).
  - Book: `BookController.addPage` + tabs (`ui/book.ts` `bookTabs`); `ui/book-rewards*.ts` + `boot/book-pages.ts`: Quests,
    Collection (album per district, "?" slots), Trophies (badge shelf, cup fallback).
  - Trophy hall: `world/trophy-hall.ts` (designed pavilion: stepped dais, radial paving, 5 columns, teal lintel, star crest;
    gold/silver/bronze faceted pedestals per badge in a horseshoe, 9 max, then a "+N" plaque; none = one "?" pedestal),
    `world/trophy-atlas.ts` (one 1024 canvas: medallions + name strips + a white patch), `boot/trophy-hall.ts` (one mesh, one
    `paintedPlastic` material, static collider part via `CompositeCollider.addStatic`). Catalog trophies now `designed:pedestal-*`.
  - Server: `rewards\learning_weeks` (pure: weeks of >= `weekdays` days Mon-Sun in the user's tz, a freeze per 4 learning weeks,
    max 2, spent on a missed week, the current week never breaks, a break restarts at 1 with `welcomeback`), `rewards\class_goal`
    (weekly `cm complete` ledger rows of the course in server time, target max(5, round(0.6 x students x 2)) or the teacher's,
    hidden below 5 students (`moodle/course:isincompletionreports`), counts in MUC `classgoal` 5 min, reached -> one
    `local_mooblox_goal` row). `get_rewards` gains `weeks` {weeks, welcomeback} and `goal` {week (0 = none), target, progress,
    reached, timereached}; the HUD leaf reads them ("Welcome back!").
  - Monument + fireworks: `world/monument.ts` (stepped plinth, teal column, gold star; 10 lanterns light with the shared
    progress, a sunburst when reached; one draw), `world/fireworks.ts` (one Points draw, 600/1500/3000 sparks), `ui/goal-burst.ts`
    (CSS burst on low; reduced motion = toast only), `boot/class-goal.ts` (once per course week per browser:
    `localStorage['mooblox-goal-<courseid>']`). Hall and monument cast shadows on high only (xhigh doubles draws via GTAO).
  - Dev page: `rewards.html?collect=all&trophies=N&goal=P/T`. Checks: `node tools/rewards.mjs collect|book|hall|goal [outdir]`
    (9, 37, 12, 15 checks); stills `~/drop/T1276/T1357..T1362/`. Extras from the spawn (collectibles + hall + monument):
    low 5 draws / 2.5k tris / 2 programs, medium 5 / 2.6k / 2, high 7 / 4.8k / 2, xhigh 10 / 5.2k / 2 (fireworks +1 program
    while they fly). vitest 48 files 295 tests, PHPUnit 82, mci quick 7 ok 0 red. Bundle 280 KB gz (+12.6 KB).
- T1368, 2026-10-24, one mini island at a time (research + architecture `~/agent-work/research/2026-10-24/T1368/TRICKS.md`,
  compare `~/drop/T1368/index.html`, options `~/drop/T1368/options.html`):
  - `world/island-streamer.ts` `IslandStreamer` (pure): `islandGraph` (hubs then zones = district order; a bridge per zone to its
    anchor, plus plaza links). Current island = the circle (+2 m) the player stands in, kept on bridges and in the water; the
    island across a bridge builds within 20 m of its deck and draws within 2.5 m; `crossing()`; `metric` feeds `DistrictStreamer`
    (new `StreamMetric` strategy, default edge distance; `finishWanted` for teleports and the first frame).
  - `world/haze.ts`: `installHaze()` patches three's fog chunks: fog by horizontal distance from one shared centre (per pixel);
    `Haze` eases centre/radius (0.45 s) to the current island, along the bridge by crossing progress. Overview opens it to the extent.
  - `world/island-fade.ts`: screen-door cross-fade (`FADE` slots x, z, r, alpha) on `kit.scenery`/`sceneryInstanced`; fakes use
    the inverse. `world/far-view.ts` (`?far=`): `fog`, `full` (all bridge neighbours real), `silhouette` (default: biggest solids as
    boxes, houses with roofs, trees as cones, landmark tower; ring merged into one mesh, 2 new per frame), `impostor` (each island
    built in background slices, captured once into a 2048x1024 atlas, camera-facing cards); `deckGeometry` + `groundGeometry` =
    fake decks and lawn discs for every island (one `far-ground` mesh).
  - `IslandBuilder` keeps the merged land/tops (overview, collider) and adds per-island `island-land` groups (drawn while live);
    `buildGlow` is per district; props draw only on live islands; life instancing (flags, boats, buoys, animals, butterflies)
    packs only what `view.sees()` through the haze. `WorldView.follow(target)`, `far`, `island`, `sees`.
  - Tools: `node tools/near-island.mjs <dir> [--modes ..] [--shapes ..]` (options at one camera, `options.json` + JPEGs);
    `tools/perf.mjs --query k=v` appends to every page query.
- T1369, 2026-10-24, smooth streaming (evidence `~/drop/T1369/index.html`, data `~/agent-work/evidence/T1369/`):
  - Budgets (owner): memory = JS heap + GPU estimate <= 800 MB per shape in the gate, hard ceiling 1 GB; spend it on smoothness.
    Low (Iris Xe DPR 1, 4x CPU) worst frame <= 20 ms over the walk and its bridge crossing; stress (SwiftShader 6x) <= 100 ms,
    30 fps. Low programs 11 (was 10): the impostor card is the one program the silhouettes did not need.
  - `perf/frame-budget.ts` `FrameBudget`: one measured slice per frame for all background work (0.7 of the device's usual
    interval minus the frame's own work, halved after a late frame; late = past 1.25x the running average, so a 30 Hz device is
    not late every frame). `world/gpu-warmup.ts` `GpuWarmup`: uploads fresh meshes before they are seen (render with a hidden
    material into a 1x1 target), one mesh per budget slice.
  - `DistrictBuild`: one placement per slice, appended to its mesh as it is placed (`world/district-merge.ts` `MeshMerge`,
    `SolidsMerge`; surface ids kept on rich tiers); the collision BVH builds in `world/build.worker.ts` (`build-worker.ts`
    `WorkerTrees`, `MeshBVH.serialize`, transferred back; inline where there is no worker or after it failed); `finish()` reuses
    a build waiting on the worker. Meshes come in 1 MB chunks (one short upload each). `BvhCollider` reuses a ready `boundsTree`.
  - Impostor is the default far view (`?far=` keeps the others); captures reuse the canvas programs (`isXRRenderTarget`, sRGB
    atlas, the card decodes) and touch only the district's line to the scene. Impostor-built districts refresh the collider.
  - `QualityManager`: resizes only when dynamic resolution moves; software GL starts at the scale floor.
  - Tools: `node tools/crossing.mjs <out.json> [--shapes] [--rigs low,stress,medium,high] [--query] [--walk]`: per-frame times of one
    bridge crossing (pump, render, off-screen renders, uploads, links).
  - Gate (quiet machine): 73 pass, 3 fail (stress demo fps 27, worst 300 ms; stress 1x2 worst 233 ms). Low green on all shapes.
    Open: stress keeps one 230-430 ms frame when the deck safety net finishes the island across inline (fix: placement prep in
    the worker); on high, impostor captures cost single 50-280 ms frames (16.8-33 ms with `?far=silhouette`).
