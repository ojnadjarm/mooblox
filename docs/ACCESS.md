# Access matrix: Moodle rules in the world

The world shows exactly what the course page shows the student. `local_mooblox_get_world` decides per section and
per activity (`classes/local/world_builder.php`); the client draws the result (zones, gates, props, book).
Tests: `tests/local/world_builder_access_test.php` (one data row per line below), client vitest
`test/world/access-fence.test.ts`, `test/ui/book-model.test.ts`, `test/boot/go-to-plot.test.ts`, live e2e
`node tools/moodle.mjs gates`.

## Moodle semantics (5.2, paths under `public/`)

- Section shown at all: `course/format/classes/base.php:1703-1719` `is_section_visible()` = `uservisible` OR
  ((`visible` OR course `hiddensections` = 0) AND (`available` OR `availableinfo` not empty)).
- Section open: `course/classes/section_info.php:440-470` `uservisible` false when hidden (no
  `viewhiddensections`) or not `available` (no `ignoreavailabilityrestrictions`); `available` from
  `info_section::is_available()` (`section_info.php:345-379`).
- A closed section lists no activities: `course/format/classes/output/local/content/section.php:221`
  `$showcmlist = $section->uservisible`.
- Activity: `course/classes/cm_info.php:1614-1659` `update_user_visible()`; a cm in an unavailable section is
  unavailable (`cm_info.php:1519-1526`). `is_visible_on_course_page()` (`:1559`) is true when the user can open it
  and it is on the page, or when it is visible, on the page and has restriction info (greyed out with reason).
  Stealth (`:1583`): `visibleoncoursepage` = 0, open by URL only.
- `availableinfo` is empty when the condition's eye is off (`showc` false): the item disappears.

## Matrix

| Moodle case | Sent | World | Sign / book text |
|---|---|---|---|
| Section open | yes, open | zone, bridge, plots | none |
| Section restricted by date, before "from" (shown) | yes, closed, no activities | zone visible, gate shut on its bridge, fence | "Opens Tue 3 Nov" ("Opens at 14:00" within a day) |
| Section restricted by date, after "until" (shown) | yes, closed | gate shut | "This has closed" |
| Section restricted by completion of an activity (shown) | yes, closed | gate shut; opens live after the panel closes | "Finish How volcanoes work first" ("Pass X first" for pass) |
| Section restricted by grade (shown) | yes, closed | gate shut | "Get a grade in Essay first" |
| Section restricted by group / grouping (shown) | yes, closed | gate shut | "Not open for you yet" |
| Section restricted by profile field (shown) | yes, closed | gate shut | "Not open for you yet" |
| Section with nested or "any of" rules (shown) | yes, closed | gate shut | Moodle's own restriction text |
| Section restricted, condition hidden (eye off) | no | no zone; the ring closes the gap | none |
| Hidden section (course hides hidden sections) | no | no zone | none |
| Hidden section, course shows it as "not available" | yes, closed, no activities | gate shut | "Not open yet" |
| Section visible, all its activities hidden | yes, open, no activities | empty zone, open bridge | none |
| Activity restricted, shown with info | yes, `available` false | prop with padlock, prompt shows reason, cannot open | short reason, book "Locked" button |
| Activity restricted, hidden entirely (eye off) | no | no plot | none |
| Hidden activity | no | no plot | none |
| Stealth activity (available, not on course page) | no | no plot | none |
| Course completion | no rule | nothing locks; the book shows progress | none |
| Teacher / manager | everything open (Moodle caps) | all zones open, hidden items too | none; students never get teacher-only items |

## How the world enforces it

- `world/access-fence.ts` `AccessFence`: for each closed section, a disc over the island and its shore
  (radius + 2.2 m) and the bridge corridor past the gate. `player/fenced-collider.ts` decorates the world
  collider, so every physics step (walk, run, jump, fall, teleport landing) ends outside: height does not matter.
- `world/gates/`: `Gate` (stone towers, oak beam, banded leaves, padlock, painted sign) and `GateLayer` (one
  gate per zone closed this session; opening swings the leaves and the sign turns "Open!").
- Book and Guide: `goToPlot` refuses a plot in a closed zone or a locked activity; the book lists closed
  sections with their reason and disables "Go there" on locked rows.
- Live: each panel close re-reads the course; `get_world.nextchange` (earliest future date condition in the
  course, sections and activities, shown or hidden) arms `state/access-clock.ts`, capped at 6 h per wait.
  When sections or activities appear, the islands are rebuilt and the player moves with their zone.
