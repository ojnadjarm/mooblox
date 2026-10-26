# MOOBLOX architecture (v1)

## Delivery

`local_mooblox` serves a full-screen three.js client from the Moodle origin
(`/local/mooblox/play.php?id=<course>`). Same origin gives SSO, no CORS, no tokens, and Moodle pages
framed with the user's session (X-Frame-Options `sameorigin`). The client talks to a `MoodleGateway`
interface, so a later standalone PWA (token-based `RestGateway`) is a second adapter, not a rewrite.

Moodle target: 5.0+ (`$plugin->requires`). Dev and test site: Moodle 5.2.

## Authentication

- play.php calls `require_login($course)` and checks `local/mooblox:play`.
- The client calls only ajax-enabled functions through `lib/ajax/service.php` with the sesskey.
- Most core read functions are mobile-service only, so the plugin exposes two ajax facades that call
  core server-side.

## Web services

| Need | Call |
|---|---|
| World + book data | `local_mooblox_get_world(courseid)` (ajax + mobile service) |
| World map (the user's courses) | `local_mooblox_get_courses()`: id, name, short summary, image, progress %, completed, last access, play URL |
| Mark viewed (native video) | `local_mooblox_view_activity(cmid)`: allow-list dispatch to the module's own view function |
| Manual completion | `core_completion_update_activity_completion_status_manually` |
| Due dates in the book | `core_calendar_get_action_events_by_course` |
| Keep session alive | `core_session_touch` |
| Avatar choice | `core_user_update_user_preferences` + `local_mooblox_user_preferences()` |

## Activities in the world

| modname | World object | Opens as |
|---|---|---|
| page | Book stand | Moodle page in the frame panel |
| resource (video) / url (YouTube, Vimeo) | Cinema | Native `<video>` panel / youtube-nocookie embed |
| quiz | Arena gate | Moodle quiz in the frame panel |
| any other with a URL | Generic door (module icon, name) | Frame panel of `cm->url` |
| label | Signpost | Text bubble |
| restricted | Locked door | Shows `availableinfo` |

Framed requests (`Sec-Fetch-Dest: iframe` plus a play-session flag) get the `embedded` page layout
through a `before_http_headers` hook callback, so Moodle chrome disappears inside the panel.

## Client modules (`client/src`)

`boot/main.ts` is the composition root: it reads the play.php config and wires the adapters. It is the
only place that instantiates concrete classes. The 10 modules it wires:

| # | Module | Responsibility |
|---|---|---|
| 1 | `domain/` | Course, Section, Activity, Completion types + mapper from DTOs (anti-corruption layer) |
| 2 | `moodle/` | `MoodleGateway` interface · `AjaxGateway` (session + sesskey) · `FakeGateway` (fixture JSON) · later `RestGateway` |
| 3 | `state/` | `CourseStore` (Observer: book, props, tutor subscribe to completion and availability) |
| 4 | `world/` | `LayoutPolicy` (Strategy; `IslandLayout`: plot rings, plaza archipelago past ~12 sections) · `designWorld` (pure dressing data; `Occupancy` grid: every solid claims its footprint) → `buildScenery` (merged district LODs per tier level + collision) · `surfaces` (xhigh detail-texture classes) · `MaterialKit` (Flyweight: one sway material for all scenery) · `PropRegistry` + factories |
| 5 | `player/` | Avatar (glTF + AnimationMixer) · Controller (BVH capsule, fixed 60 Hz step) · keyboard and touch input · camera |
| 6 | `interaction/` | Proximity triggers · `OpenerRegistry` (Strategy + fallback chain): `FrameOpener` (default), `VideoOpener` |
| 7 | `ui/` | Panel (frame/native host, focus trap, Esc) · Book · HUD · Settings; DOM over the canvas |
| 8 | `tutor/` | `Tutor` interface · `ScriptedTutor` v1 · later `MoodleAiTutor` · NPC (avatar + bubble) |
| 9 | `net/` | `Presence` interface · `NullPresence` v1 · later a room relay |
| 10 | `perf/` | `QualityTier` (DPR clamp, shadow toggle) · `FrameGate` (render on demand; idle GPU while a panel is open) |

Map mode (`index.php`, config `mode: 'map'`): `map/` (`courses.ts` DTO check + `CourseListGateway` · `map-layout.ts` pure
ring layout, no overlap for any count · `map-camera.ts` overview fit, pan/zoom, eased flight · `map-scene.ts` one island per course
through `IslandBuilder` + landmark + trophy · `island-labels.ts` / `course-card.ts` / `map-hud.ts` DOM) wired by `boot/map.ts`;
it reuses `Stage`, `MaterialKit`, `IslandBuilder`, landmarks, trophies and the sound engine. In a course world `ui/map-button.ts`
links back to the map.

Key interfaces:

```ts
interface MoodleGateway { getWorld(courseId: number): Promise<WorldData>; viewActivity(cmId: number): Promise<void>;
  setManualCompletion(cmId: number, done: boolean): Promise<void>; savePreference(name: string, value: string): Promise<void>;
  touchSession(): Promise<void>; }
interface LayoutPolicy { layout(world: WorldData): WorldLayout; }
interface PropFactory { readonly key: string; create(a: Activity, plot: Plot, kit: MaterialKit): Prop; }
interface ActivityOpener { canOpen(a: Activity): boolean; open(a: Activity, panel: Panel): Promise<void>; }
interface Tutor { greet(ctx: TutorContext): TutorLine; nextStep(ctx: TutorContext): TutorLine; }
interface Presence { join(ticket: string): Promise<void>; publish(s: AvatarState): void;
  onPeers(cb: (p: Peer[]) => void): () => void; leave(): void; }
```

## Plugin (`moodle/local/mooblox`)

Entry points: `index.php` (the world map: require_login + site switch, the same bundle in map mode), `play.php` (require_login + capability + site switch, then the mustache shell with the
client bundle and a JSON config), `db/access.php` (`local/mooblox:play`), `db/services.php`,
`db/hooks.php`, `lib.php` (`local_mooblox_user_preferences()`).

The 8 classes:

| # | Class | Responsibility |
|---|---|---|
| 1 | `classes/external/get_world.php` | Thin external function: validate, call the builder, return |
| 2 | `classes/external/view_activity.php` | Thin external function: allow-listed dispatch to the module's view function |
| 3 | `classes/local/world_builder.php` | `get_fast_modinfo()` + completion details → world DTO |
| 4 | `classes/local/embed_detector.php` | Pure: request headers + session flag → framed or not |
| 5 | `classes/hook_callbacks.php` | `before_http_headers` (embedded layout) · `secondary_extend` (course tab) · `primary_extend` (map link) |
| 6 | `classes/privacy/provider.php` | Avatar user-preference export and delete |
| 7 | `classes/local/course_list.php` | The user's enrolled courses where they may play → map course rows (progress, completion, last access) |
| 8 | `classes/external/get_courses.php` | Thin external function: validate, return `course_list::for_user` |

## Data flow

```
Student → "Mooblox" (primary navigation) → index.php → boot (map mode) → AjaxGateway.getCourses → mapLayout → map scene
  → pick an island → camera flight → play.php?id=<course>; in the world the "Map" button returns to index.php
Student in course → "MOOBLOX" tab → play.php (session, cap) → HTML shell + config {wwwroot, courseid, sesskey, firstname, avatar, rev}
  → boot → AjaxGateway.getWorld → CourseStore → IslandLayout → scene (props per activity) + Book
  → walk to a prop → Proximity → OpenerRegistry → FrameOpener → <iframe src=cm url> (embedded layout)
  → Moodle runs the activity → panel closed → getWorld → store notifies → Book tick + prop flag + tutor line
```

## Patterns and SOLID

- Adapter: gateways. Strategy: layout, openers. Factory + Registry: props, openers. Observer: `CourseStore`.
  Facade: `get_world`, `view_activity`. Flyweight: one palette material. Null Object: `NullPresence`,
  `ScriptedTutor`. Composition Root: `main.ts`.
- S: transport, DTO mapping, layout, scene, DOM UI, PHP builder and external functions are separate modules.
- O: a new activity type is a new `PropFactory` plus an optional `ActivityOpener`, registered at boot.
- L: Ajax, Rest and Fake gateways are interchangeable; tests run on Fake with JSON captured from Moodle 5.2.
- I: small interfaces (Gateway, Tutor, Presence, Opener); the plugin's service lists only the functions used.
- D: world, UI and tutor depend on interfaces; only `main.ts` knows the concrete classes.

## Rewards (gamification)

XP, levels, quests, collectibles, cosmetics and trophies come only from what Moodle already knows: activity
completion, final grades, course badges and course completion. The server derives everything from core tables;
no client call can add XP. Rewards switch off per course (`local_mooblox_course.enabled`) and site-wide
(`local_mooblox/gamification`); fully off, `get_rewards` returns `{enabled: false}`, observers return at once and
the client builds no HUD, gems, hall or monument. Turning rewards on later back-fills from Moodle state.

### Rewards tables

| Table | Role |
|---|---|
| `local_mooblox_course` | Per-course switches: enabled, manualxp, goaltarget, weekdays |
| `local_mooblox_ledger` | One row per earned fact (source cm/grade/badge/course + sourceid + kind): the truth |
| `local_mooblox_xp` | Cache per course and user: xp, level, peaklevel (never goes down), rulesversion |
| `local_mooblox_day` | Learning days (yyyymmdd in the user's timezone) for streaks and class goals |
| `local_mooblox_unlock` | Cosmetics per user, global across courses: once unlocked, never re-locked |
| `local_mooblox_found` | Collectibles picked up in the world |
| `local_mooblox_goal` | Weekly class goal per course: aggregate only, no user ids |

### Rewards classes (`classes/rewards/`, pure core + one Moodle adapter)

| Class | One job |
|---|---|
| `fact_source` (interface) | Reads the facts of one user in one course: completions, grades, badges, course completion |
| `moodle_fact_source` | The Moodle adapter of `fact_source`: one query per fact kind |
| `facts` | Value object: the facts one sync works on |
| `xp_rules` | Pure: facts + the manualxp switch → desired ledger rows (source, sourceid, kind, xp) |
| `level_curve` | Pure: XP ↔ level (level n needs 25·n·(n+1) XP) |
| `reconciler` | `sync(courseid, userid)`: desired vs stored ledger diff in one transaction; rewrites the cache, adds day rows, grants unlocks; returns the change count; idempotent |
| `catalog` | Cosmetic ids (hats, outfits, pets, trophy styles), mirrored by the client art keys; seeded level-up pick |
| `quest_generator` | Pure: course structure → quests with deterministic ids |
| `collectible_catalog` | Pure: facts → unlocked collectible keys (`gem:<cmid>`, `crystal:<sectionid>`, `star:<n>`) |

Interfaces:

```php
interface fact_source { public function load(int $courseid, int $userid): facts; }
final class xp_rules { public function __construct(bool $manualxp = true); public function desired(facts $facts): array;
  public function version(): string; }
final class level_curve { public static function level(int $xp): int; public static function threshold(int $level): int; }
final class reconciler { public function __construct(fact_source $source); public function sync(int $courseid, int $userid): int; }
```

XP defaults (`xp_rules`): automatic completion 10, view-only completion 5, manual completion 3 (0 with manualxp off),
completed with pass +10, grade ≥ 50 % +5 / ≥ 80 % +10 / 100 % +15, badge 25, course completed 50. A failed
completion keeps its completion XP: trying counts.

### Rewards data flow

```
Moodle fact changes (completion hook, user_graded, badge_awarded/revoked, course_completed)
  → observer (one cached settings read; returns at once when rewards are off)
  → deduped adhoc task sync_user(courseid, userid)        nightly task reconcile: users active in 7 days
  → reconciler.sync: moodle_fact_source.load → xp_rules.desired → diff vs ledger
  → one transaction: insert/delete ledger rows, rewrite xp cache (level_curve), day rows, unlocks
client get_rewards (syncs inline for the caller) → HUD, quests, wardrobe, collectibles, trophies
client claim_collectible / set_look → validated by recomputation, idempotent
```

The ledger is derived, so recalculation, restore, course reset and anti-cheat are one code path: toggling a manual
completion or retaking a quiz re-derives the same rows; unticking removes the XP while peaklevel and unlocks stay.
A rules or settings change bumps `rulesversion` (a hash) and the next read re-syncs.

### Rewards patterns and SOLID

- Adapter: `moodle_fact_source`. Strategy: `fact_source` (tests use an in-memory source). Observer: event observers
  and the completion hook. Command: the `sync_user` adhoc task. Value objects: `facts`, ledger rows.
- S: reading facts, scoring, levelling, persisting and scheduling are separate classes.
- O: a new XP source is a new fact kind plus a rule; the reconciler does not change.
- L: any `fact_source` gives the same reconciler behaviour.
- I: `fact_source` has one method; the client gets one read and two validated writes.
- D: `reconciler` depends on `fact_source` and the pure rules, not on Moodle tables.

### Motivation rules for ages 8-12

1. No shame: never a loss, a "behind", a red number or anyone else's score. A failed quiz keeps its completion XP.
2. No rankings: no leaderboard, no per-kid numbers visible to other kids. Class goals show one shared bar, hidden
   below 5 enrolled students.
3. No loot boxes, no random rewards, no currency, no shop, no paid items, no ads. Every unlock is named in advance;
   quest item picks are seeded.
4. Gentle streaks: a learning week = at least `weekdays` (default 2) learning days Mon-Sun in the kid's timezone.
   One freeze every 4 learning weeks (max 2), spent automatically. A break shows "Welcome back!" and starts at 1,
   never "streak lost". No notifications or emails.
5. Level-up moment: 2.5 s confetti + chime, skippable; `prefers-reduced-motion` gets a static card; at most one per
   panel close. The 3-hour break reminder stays.
6. Class goals: weekly "Together finish {target} activities"; a missed week resets quietly.

## Kids' safety (v1)

One world per course behind the Moodle login; no kid-to-kid text; first name only; preset avatars;
progress lives in Moodle core. Rewards add 5 per-user tables (ledger, xp, day, unlock, found) and one more
preference (`local_mooblox_look`), all exported and deleted by the privacy provider. No dark patterns: no loot boxes,
no ads, no guilt streaks (gentle learning weeks only, see the motivation rules), and the 3-hour break reminder.
