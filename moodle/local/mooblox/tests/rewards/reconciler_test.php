<?php
// This file is part of Moodle - https://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <https://www.gnu.org/licenses/>.

namespace local_mooblox\rewards;

use PHPUnit\Framework\Attributes\CoversClass;

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->libdir . '/completionlib.php');

/**
 * Tests for the reconciler.
 *
 * @package    local_mooblox
 * @category   test
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(reconciler::class)]
#[CoversClass(catalog::class)]
final class reconciler_test extends \advanced_testcase {
    /**
     * Syncing twice changes nothing; losing facts removes rows but keeps the peak level, day and unlock.
     */
    public function test_sync_is_idempotent_and_keeps_peak(): void {
        global $DB;
        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course();
        $user = $this->getDataGenerator()->create_user(['timezone' => 'Europe/Madrid']);
        $source = new class implements fact_source {
            /** @var int number of automatic completions, all at 2025-10-24 22:00 UTC */
            public int $count = 6;

            #[\Override]
            public function load(int $courseid, int $userid): facts {
                $state = ['state' => COMPLETION_COMPLETE, 'mode' => facts::AUTO, 'time' => 1761343200];
                return new facts($courseid, $this->count ? array_fill(1, $this->count, $state) : []);
            }
        };
        $reconciler = new reconciler($source);
        $ids = ['courseid' => $course->id, 'userid' => $user->id];

        $this->assertSame(6 + 1 + 1 + 1, $reconciler->sync($course->id, $user->id));
        $this->assertSame(0, $reconciler->sync($course->id, $user->id));
        $cache = $DB->get_record('local_mooblox_xp', $ids);
        $this->assertEquals([60, 1, 1], [$cache->xp, $cache->level, $cache->peaklevel]);
        $this->assertSame((new xp_rules())->version(), $cache->rulesversion);
        $this->assertEquals([20251025], $DB->get_fieldset('local_mooblox_day', 'day', $ids));
        $unlocked = $DB->get_fieldset('local_mooblox_unlock', 'itemkey', ['userid' => $user->id]);
        $this->assertSame([catalog::level_reward($course->id, 1, [])], $unlocked);

        $source->count = 4;
        $this->assertSame(2 + 1, $reconciler->sync($course->id, $user->id));
        $this->assertSame(4, $DB->count_records('local_mooblox_ledger', $ids));
        $cache = $DB->get_record('local_mooblox_xp', $ids);
        $this->assertEquals([40, 0, 1], [$cache->xp, $cache->level, $cache->peaklevel]);
        $this->assertSame($unlocked, $DB->get_fieldset('local_mooblox_unlock', 'itemkey', ['userid' => $user->id]));
        $this->assertSame(1, $DB->count_records('local_mooblox_day', $ids));
    }

    /**
     * Ticking and unticking a manual completion on a real course adds and removes its ledger row.
     */
    public function test_untick_removes_the_row(): void {
        global $DB;
        $this->resetAfterTest();
        $this->setAdminUser();
        $gen = $this->getDataGenerator();
        $course = $gen->create_course(['enablecompletion' => 1]);
        $student = $gen->create_and_enrol($course, 'student');
        $page = $gen->create_module('page', ['course' => $course, 'completion' => COMPLETION_TRACKING_MANUAL]);
        $cm = get_fast_modinfo($course)->get_cm($page->cmid);
        $completion = new \completion_info($course);
        $reconciler = new reconciler(new moodle_fact_source());
        $ids = ['courseid' => $course->id, 'userid' => $student->id];

        $completion->update_state($cm, COMPLETION_COMPLETE, $student->id);
        $reconciler->sync($course->id, $student->id);
        $this->assertSame(['cm'], $DB->get_fieldset('local_mooblox_ledger', 'source', $ids));
        $this->assertEquals(3, $DB->get_field('local_mooblox_xp', 'xp', $ids));

        $completion->update_state($cm, COMPLETION_INCOMPLETE, $student->id);
        $reconciler->sync($course->id, $student->id);
        $this->assertSame(0, $DB->count_records('local_mooblox_ledger', $ids));
        $this->assertEquals(0, $DB->get_field('local_mooblox_xp', 'xp', $ids));
        $this->assertSame(0, $reconciler->sync($course->id, $student->id));
    }
}
