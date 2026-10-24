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

use local_mooblox\task\sync_user;
use PHPUnit\Framework\Attributes\CoversClass;

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->libdir . '/completionlib.php');
require_once($CFG->libdir . '/gradelib.php');
require_once($CFG->libdir . '/badgeslib.php');

/**
 * Tests for the completion hook, the fact observers and the sync_user task.
 *
 * @package    local_mooblox
 * @category   test
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(observer::class)]
#[CoversClass(sync_queue::class)]
#[CoversClass(course_switch::class)]
#[CoversClass(sync_user::class)]
#[CoversClass(\local_mooblox\hook_callbacks::class)]
final class sync_trigger_test extends \advanced_testcase {
    /**
     * A bulk completion update fires no event, yet the hook queues a sync that writes the ledger.
     */
    public function test_bulk_update_syncs_via_hook(): void {
        global $DB;
        $this->resetAfterTest();
        $this->setAdminUser();
        $gen = $this->getDataGenerator();
        $course = $gen->create_course(['enablecompletion' => 1]);
        $student = $gen->create_and_enrol($course, 'student');
        $page = $gen->create_module('page', ['course' => $course, 'completion' => COMPLETION_TRACKING_MANUAL]);
        $cm = get_fast_modinfo($course)->get_cm($page->cmid);

        $sink = $this->redirectEvents();
        (new \completion_info($course))->update_state($cm, COMPLETION_COMPLETE, $student->id, false, true);
        $events = array_filter($sink->get_events(), fn($e) => $e instanceof \core\event\course_module_completion_updated);
        $sink->close();
        $this->assertCount(0, $events);
        $this->assertCount(1, \core\task\manager::get_adhoc_tasks(sync_user::class));

        $this->runAdhocTasks(sync_user::class);
        $ids = ['courseid' => $course->id, 'userid' => $student->id];
        $this->assertSame(['cm'], $DB->get_fieldset('local_mooblox_ledger', 'source', $ids));
        $this->assertEquals(3, $DB->get_field('local_mooblox_xp', 'xp', $ids));
    }

    /**
     * A completion, a grade and a badge for one user queue one task; with rewards off they queue none.
     */
    public function test_three_events_queue_one_task(): void {
        global $DB;
        $this->resetAfterTest();
        $this->setAdminUser();
        $gen = $this->getDataGenerator();
        $course = $gen->create_course(['enablecompletion' => 1]);
        $student = $gen->create_and_enrol($course, 'student');
        $page = $gen->create_module('page', ['course' => $course, 'completion' => COMPLETION_TRACKING_MANUAL]);
        $assign = $gen->create_module('assign', ['course' => $course, 'grade' => 100]);
        $badge = $gen->get_plugin_generator('core_badges')->create_badge(['courseid' => $course->id,
            'type' => BADGE_TYPE_COURSE]);
        $item = \grade_item::fetch(['itemtype' => 'mod', 'itemmodule' => 'assign', 'iteminstance' => $assign->id,
            'courseid' => $course->id]);
        $cm = get_fast_modinfo($course)->get_cm($page->cmid);

        (new \completion_info($course))->update_state($cm, COMPLETION_COMPLETE, $student->id);
        $item->update_final_grade($student->id, 90, 'test');
        $badge->issue($student->id, true);
        $tasks = \core\task\manager::get_adhoc_tasks(sync_user::class);
        $this->assertCount(1, $tasks);
        $expected = (object) ['courseid' => $course->id, 'userid' => $student->id];
        $this->assertEquals($expected, reset($tasks)->get_custom_data());

        $DB->delete_records('task_adhoc');
        $DB->insert_record('local_mooblox_course', ['courseid' => $course->id, 'enabled' => 0, 'timemodified' => time()]);
        (new \completion_info($course))->update_state($cm, COMPLETION_INCOMPLETE, $student->id);
        $item->update_final_grade($student->id, 40, 'test');
        $this->assertCount(0, \core\task\manager::get_adhoc_tasks(sync_user::class));
    }
}
