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
 * Tests for the hub course list.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_mooblox\local;

use PHPUnit\Framework\Attributes\CoversClass;

/**
 * Tests for the hub course list.
 *
 * @package    local_mooblox
 * @category   test
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(course_list::class)]
final class course_list_test extends \advanced_testcase {
    /**
     * Courses come in the site's course order, and visiting one or enrolling in another moves no other course.
     */
    public function test_for_user_keeps_the_course_order(): void {
        global $DB;
        $this->resetAfterTest();
        $generator = $this->getDataGenerator();
        $student = $generator->create_user();
        $courses = [];
        foreach (['Zebras', 'Ants', 'Moons'] as $name) {
            $courses[] = $course = $generator->create_course(['fullname' => $name]);
            $generator->enrol_user($student->id, $course->id, 'student');
        }
        $ids = fn() => array_column(course_list::for_user($student->id), 'id');
        [$in, $params] = $DB->get_in_or_equal(array_column($courses, 'id'));
        $order = array_map('intval', $DB->get_fieldset_sql("SELECT id FROM {course} WHERE id $in ORDER BY sortorder, id", $params));
        $this->assertSame($order, $ids());
        $this->assertSame($order, $ids());
        $DB->insert_record('user_lastaccess', ['userid' => $student->id, 'courseid' => end($courses)->id, 'timeaccess' => time()]);
        $this->assertSame($order, $ids());
        $late = $generator->create_course(['fullname' => 'Late']);
        $generator->enrol_user($student->id, $late->id, 'student');
        $after = $ids();
        $this->assertSame($order, array_values(array_diff($after, [(int) $late->id])));
        $this->assertContains((int) $late->id, $after);
    }

    /**
     * Playable visible courses come with progress, completion and last access; others are left out.
     */
    public function test_for_user_lists_playable_courses(): void {
        global $DB;
        $this->resetAfterTest();
        $generator = $this->getDataGenerator();
        $half = $generator->create_course(['fullname' => 'Volcanoes', 'summary' => '<p>Hot <b>rocks</b></p>',
            'enablecompletion' => 1]);
        $done = $generator->create_course(['fullname' => 'Oceans', 'enablecompletion' => 1]);
        $free = $generator->create_course(['fullname' => 'Free play']);
        $locked = $generator->create_course(['fullname' => 'No world']);
        $hidden = $generator->create_course(['fullname' => 'Hidden', 'visible' => 0]);
        $student = $generator->create_user();
        foreach ([$half, $done, $free, $locked, $hidden] as $course) {
            $generator->enrol_user($student->id, $course->id, 'student');
        }
        $pages = [];
        foreach ([$half, $half, $done] as $course) {
            $pages[] = $generator->create_module('page', ['course' => $course->id,
                'completion' => COMPLETION_TRACKING_MANUAL]);
        }
        foreach ([0 => $half, 2 => $done] as $i => $course) {
            $cm = get_fast_modinfo($course)->get_cm($pages[$i]->cmid);
            (new \completion_info($course))->update_state($cm, COMPLETION_COMPLETE, $student->id);
        }
        $role = $DB->get_field('role', 'id', ['shortname' => 'student']);
        assign_capability('local/mooblox:play', CAP_PROHIBIT, $role, \context_course::instance($locked->id)->id);
        $DB->insert_record('user_lastaccess', ['userid' => $student->id, 'courseid' => $half->id, 'timeaccess' => 12345]);
        $this->setUser($student);

        $rows = array_column(course_list::for_user($student->id), null, 'id');

        $this->assertEqualsCanonicalizing([$half->id, $done->id, $free->id], array_keys($rows));
        $this->assertSame('Volcanoes', $rows[$half->id]['fullname']);
        $this->assertSame('Hot rocks', $rows[$half->id]['summary']);
        $this->assertSame(50, $rows[$half->id]['progress']);
        $this->assertFalse($rows[$half->id]['completed']);
        $this->assertSame(12345, $rows[$half->id]['lastaccess']);
        $this->assertStringContainsString('/local/mooblox/play.php?id=' . $half->id, $rows[$half->id]['url']);
        $this->assertSame(100, $rows[$done->id]['progress']);
        $this->assertTrue($rows[$done->id]['completed']);
        $this->assertSame(0, $rows[$done->id]['lastaccess']);
        $this->assertSame(-1, $rows[$free->id]['progress']);
        $this->assertFalse($rows[$free->id]['completed']);
        $this->assertSame(2, $rows[$half->id]['gemstotal']);
        $this->assertSame([], $rows[$half->id]['trophies']);
    }

    /**
     * The site switch off empties the list.
     */
    public function test_for_user_empty_when_switched_off(): void {
        $this->resetAfterTest();
        $generator = $this->getDataGenerator();
        $course = $generator->create_course();
        $student = $generator->create_and_enrol($course, 'student');
        set_config('enabled', 0, 'local_mooblox');

        $this->assertSame([], course_list::for_user($student->id));
    }
}
