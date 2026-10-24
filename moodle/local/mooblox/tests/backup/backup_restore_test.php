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

/**
 * Backup and restore tests.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_mooblox\backup;

use local_mooblox\task\sync_course;
use PHPUnit\Framework\Attributes\CoversClass;

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->dirroot . '/backup/util/includes/backup_includes.php');
require_once($CFG->dirroot . '/backup/util/includes/restore_includes.php');
require_once($CFG->libdir . '/completionlib.php');

/**
 * Backup and restore tests.
 *
 * @package    local_mooblox
 * @category   test
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(\backup_local_mooblox_plugin::class)]
#[CoversClass(\restore_local_mooblox_plugin::class)]
#[CoversClass(sync_course::class)]
final class backup_restore_test extends \advanced_testcase {
    /**
     * Backs up a course and restores it into a new course.
     *
     * @param int $courseid course to back up
     * @param bool $users whether to include user data
     * @return int new course id
     */
    private function backup_and_restore(int $courseid, bool $users): int {
        global $USER;
        $bc = new \backup_controller(
            \backup::TYPE_1COURSE,
            $courseid,
            \backup::FORMAT_MOODLE,
            \backup::INTERACTIVE_NO,
            \backup::MODE_GENERAL,
            $USER->id
        );
        $bc->get_plan()->get_setting('users')->set_value($users);
        $backupid = $bc->get_backupid();
        $basepath = $bc->get_plan()->get_basepath();
        $bc->execute_plan();
        $file = $bc->get_results()['backup_destination'];
        $bc->destroy();
        if (!file_exists($basepath . '/moodle_backup.xml')) {
            $file->extract_to_pathname(get_file_packer('application/vnd.moodle.backup'), $basepath);
        }
        $course = get_course($courseid);
        $newid = \restore_dbops::create_new_course($course->fullname . ' 2', $course->shortname . '_2', $course->category);
        $rc = new \restore_controller(
            $backupid,
            $newid,
            \backup::INTERACTIVE_NO,
            \backup::MODE_GENERAL,
            $USER->id,
            \backup::TARGET_NEW_COURSE
        );
        $this->assertTrue($rc->execute_precheck());
        $rc->execute_plan();
        $rc->destroy();
        return $newid;
    }

    /**
     * With user data, found keys point at the new activity and section and the XP is rebuilt; without, only settings.
     */
    public function test_restore_remaps_found_keys_and_rebuilds_xp(): void {
        global $DB;
        $this->resetAfterTest();
        $this->setAdminUser();
        $gen = $this->getDataGenerator();
        $course = $gen->create_course(['enablecompletion' => 1]);
        $student = $gen->create_and_enrol($course, 'student');
        $page = $gen->create_module('page', ['course' => $course, 'completion' => COMPLETION_TRACKING_MANUAL]);
        $cm = get_fast_modinfo($course)->get_cm($page->cmid);
        (new \completion_info($course))->update_state($cm, COMPLETION_COMPLETE, $student->id);
        $this->runAdhocTasks();
        $DB->insert_record('local_mooblox_course', ['courseid' => $course->id, 'manualxp' => 1, 'weekdays' => 3,
            'timemodified' => time()]);
        foreach (['gem:' . $cm->id, 'crystal:' . $cm->section, 'star:1'] as $key) {
            $DB->insert_record('local_mooblox_found', ['courseid' => $course->id, 'userid' => $student->id,
                'itemkey' => $key, 'timefound' => time()]);
        }

        $newid = $this->backup_and_restore($course->id, true);
        $pages = get_fast_modinfo($newid)->get_instances_of('page');
        $newcm = reset($pages);
        $keys = $DB->get_fieldset('local_mooblox_found', 'itemkey', ['courseid' => $newid, 'userid' => $student->id]);
        $this->assertEqualsCanonicalizing(['gem:' . $newcm->id, 'crystal:' . $newcm->section, 'star:1'], $keys);
        $this->assertEquals(3, $DB->get_field('local_mooblox_course', 'weekdays', ['courseid' => $newid]));
        $this->assertEquals(1, $DB->count_records('local_mooblox_day', ['courseid' => $newid]));
        $this->assertSame(0, $DB->count_records('local_mooblox_ledger', ['courseid' => $newid]));
        $this->runAdhocTasks(sync_course::class);
        $this->assertEquals(3, $DB->get_field('local_mooblox_xp', 'xp', ['courseid' => $newid, 'userid' => $student->id]));

        $importid = $this->backup_and_restore($course->id, false);
        $this->assertSame(1, $DB->count_records('local_mooblox_course', ['courseid' => $importid]));
        $this->assertSame(0, $DB->count_records('local_mooblox_found', ['courseid' => $importid]));
        $this->assertSame(0, $DB->count_records('local_mooblox_day', ['courseid' => $importid]));
    }
}
