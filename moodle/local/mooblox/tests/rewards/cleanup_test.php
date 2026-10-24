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

use local_mooblox\task\reconcile;
use local_mooblox\task\sync_course;
use PHPUnit\Framework\Attributes\CoversClass;

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->libdir . '/completionlib.php');

/**
 * Tests for the cleanup observers, the course re-sync and the nightly reconcile task.
 *
 * @package    local_mooblox
 * @category   test
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(cleanup::class)]
#[CoversClass(observer::class)]
#[CoversClass(batch_sync::class)]
#[CoversClass(sync_course::class)]
#[CoversClass(reconcile::class)]
final class cleanup_test extends \advanced_testcase {
    /** @var \stdClass course */
    private \stdClass $course;

    /** @var \stdClass enrolled student */
    private \stdClass $student;

    /** @var \cm_info manual completion page */
    private \cm_info $cm;

    /**
     * Builds a course with one manual completion page the student completed and syncs it.
     */
    protected function setUp(): void {
        parent::setUp();
        $this->resetAfterTest();
        $this->setAdminUser();
        $gen = $this->getDataGenerator();
        $this->course = $gen->create_course(['enablecompletion' => 1]);
        $this->student = $gen->create_and_enrol($this->course, 'student');
        $page = $gen->create_module('page', ['course' => $this->course, 'completion' => COMPLETION_TRACKING_MANUAL]);
        $this->cm = get_fast_modinfo($this->course)->get_cm($page->cmid);
        (new \completion_info($this->course))->update_state($this->cm, COMPLETION_COMPLETE, $this->student->id);
        $this->runAdhocTasks();
    }

    /**
     * A course reset that clears completions empties the ledger after the queued course re-sync.
     */
    public function test_reset_empties_ledger(): void {
        global $DB;
        $ids = ['courseid' => $this->course->id, 'userid' => $this->student->id];
        $this->assertSame(1, $DB->count_records('local_mooblox_ledger', $ids));

        reset_course_userdata((object) ['id' => $this->course->id, 'reset_completion' => 1]);
        $this->assertCount(1, \core\task\manager::get_adhoc_tasks(sync_course::class));
        $this->runAdhocTasks(sync_course::class);
        $this->assertSame(0, $DB->count_records('local_mooblox_ledger', $ids));
        $this->assertEquals(0, $DB->get_field('local_mooblox_xp', 'xp', $ids));
    }

    /**
     * Deleting the user, then the course, leaves no rewards rows.
     */
    public function test_delete_user_and_course_leaves_no_rows(): void {
        global $DB;
        $unlock = ['userid' => $this->student->id, 'itemkey' => 'hat:cap', 'courseid' => $this->course->id,
            'timeunlocked' => time()];
        $DB->insert_record('local_mooblox_unlock', $unlock);
        $DB->insert_record('local_mooblox_found', ['courseid' => $this->course->id, 'userid' => $this->student->id,
            'itemkey' => 'gem:' . $this->cm->id, 'timefound' => time()]);
        $DB->insert_record('local_mooblox_course', ['courseid' => $this->course->id, 'timemodified' => time()]);

        delete_user($this->student);
        foreach (cleanup::USER_TABLES as $table) {
            $this->assertSame(0, $DB->count_records($table, ['userid' => $this->student->id]), $table);
        }
        delete_course($this->course, false);
        foreach (cleanup::COURSE_TABLES as $table) {
            $this->assertSame(0, $DB->count_records($table, ['courseid' => $this->course->id]), $table);
        }
    }

    /**
     * The nightly task syncs users active in the last 7 days and skips older ones.
     */
    public function test_reconcile_syncs_active_users(): void {
        global $DB;
        $idle = $this->getDataGenerator()->create_and_enrol($this->course, 'student');
        $sink = $this->redirectEvents();
        $completion = new \completion_info($this->course);
        $completion->update_state($this->cm, COMPLETION_INCOMPLETE, $this->student->id);
        $completion->update_state($this->cm, COMPLETION_COMPLETE, $idle->id);
        $sink->close();
        $DB->delete_records('task_adhoc');
        $DB->insert_record('user_lastaccess', ['userid' => $this->student->id, 'courseid' => $this->course->id,
            'timeaccess' => time() - DAYSECS]);
        $DB->insert_record('user_lastaccess', ['userid' => $idle->id, 'courseid' => $this->course->id,
            'timeaccess' => time() - 8 * DAYSECS]);

        ob_start();
        (new reconcile())->execute();
        ob_end_clean();
        $this->assertSame(0, $DB->count_records('local_mooblox_ledger', ['userid' => $this->student->id]));
        $this->assertSame(0, $DB->count_records('local_mooblox_ledger', ['userid' => $idle->id]));
        $this->assertSame(1, $DB->count_records('local_mooblox_xp', ['userid' => $this->student->id]));
    }
}
