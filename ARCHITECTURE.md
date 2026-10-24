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
| 4 | `world/` | `LayoutPolicy` (Strategy; `IslandLayout`: plot rings, plaza archipelago past ~12 sections) · `designWorld` (pure dressing data) → `buildScenery` (merged district LODs + collision) · `MaterialKit` (Flyweight: one sway material for all scenery) · `PropRegistry` + factories |
| 5 | `player/` | Avatar (glTF + AnimationMixer) · Controller (BVH capsule, fixed 60 Hz step) · keyboard and touch input · camera |
| 6 | `interaction/` | Proximity triggers · `OpenerRegistry` (Strategy + fallback chain): `FrameOpener` (default), `VideoOpener` |
| 7 | `ui/` | Panel (frame/native host, focus trap, Esc) · Book · HUD · Settings; DOM over the canvas |
| 8 | `tutor/` | `Tutor` interface · `ScriptedTutor` v1 · later `MoodleAiTutor` · NPC (avatar + bubble) |
| 9 | `net/` | `Presence` interface · `NullPresence` v1 · later a room relay |
| 10 | `perf/` | `QualityTier` (DPR clamp, shadow toggle) · `FrameGate` (render on demand; idle GPU while a panel is open) |

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

Entry points: `play.php` (require_login + capability + site switch, then the mustache shell with the
client bundle and a JSON config), `db/access.php` (`local/mooblox:play`), `db/services.php`,
`db/hooks.php`, `lib.php` (`local_mooblox_user_preferences()`).

The 6 classes:

| # | Class | Responsibility |
|---|---|---|
| 1 | `classes/external/get_world.php` | Thin external function: validate, call the builder, return |
| 2 | `classes/external/view_activity.php` | Thin external function: allow-listed dispatch to the module's view function |
| 3 | `classes/local/world_builder.php` | `get_fast_modinfo()` + completion details → world DTO |
| 4 | `classes/local/embed_detector.php` | Pure: request headers + session flag → framed or not |
| 5 | `classes/hook_callbacks.php` | `before_http_headers` (embedded layout) · `secondary_extend` (course tab) |
| 6 | `classes/privacy/provider.php` | Avatar user-preference export and delete |

## Data flow

```
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

## Kids' safety (v1)

One world per course behind the Moodle login; no kid-to-kid text; first name only; preset avatars;
no plugin tables, one user preference; progress lives in Moodle core.
