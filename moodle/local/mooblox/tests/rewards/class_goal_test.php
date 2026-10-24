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

/**
 * Tests for the weekly class goal.
 *
 * @package    local_mooblox
 * @category   test
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(class_goal::class)]
final class class_goal_test extends \advanced_testcase {
    /**
     * Adds `count` completion rows earned at `time` by one user.
     *
     * @param int $courseid course id
     * @param int $userid user id
     * @param int $count rows
     * @param int $time time earned
     */
    private function complete(int $courseid, int $userid, int $count, int $time): void {
        global $DB;
        for ($i = 1; $i <= $count; $i++) {
            $DB->insert_record('local_mooblox_ledger', ['courseid' => $courseid, 'userid' => $userid, 'source' => 'cm',
                'sourceid' => $time + $i, 'kind' => 'complete', 'xp' => 10, 'timeearned' => $time]);
        }
    }

    /**
     * Hidden with 4 students; with 5 the automatic target is 6, this week's completions count, reaching it is stored once.
     */
    public function test_goal_hidden_below_five_then_reached(): void {
        global $DB;
        $this->resetAfterTest();
        $this->setTimezone('Europe/Madrid');
        $gen = $this->getDataGenerator();
        $course = $gen->create_course();
        $students = [];
        for ($i = 0; $i < 4; $i++) {
            $students[] = $gen->create_and_enrol($course, 'student');
        }
        $gen->create_and_enrol($course, 'editingteacher');
        // Wednesday 2026-10-21 12:00 in Madrid; the week runs from Monday 2026-10-19 00:00 (22:00 UTC on Sunday).
        $now = 1792576800;
        $this->assertNull(class_goal::state($course->id, $now));

        $students[] = $gen->create_and_enrol($course, 'student');
        \cache::make('local_mooblox', 'classgoal')->purge();
        $this->complete($course->id, $students[0]->id, 3, $now - DAYSECS);
        $this->complete($course->id, $students[1]->id, 2, 1792360800 - 60);
        $this->complete($course->id, $students[1]->id, 2, 1792360800);
        $this->assertEquals(
            ['week' => 202643, 'target' => 6, 'progress' => 5, 'reached' => false, 'timereached' => 0],
            class_goal::state($course->id, $now)
        );

        $this->complete($course->id, $students[2]->id, 1, $now);
        $this->assertSame(5, class_goal::state($course->id, $now)['progress'], 'counts stay cached for 5 minutes');
        \cache::make('local_mooblox', 'classgoal')->purge();
        $this->assertEquals(
            ['week' => 202643, 'target' => 6, 'progress' => 6, 'reached' => true, 'timereached' => $now],
            class_goal::state($course->id, $now)
        );
        $this->assertTrue(class_goal::state($course->id, $now + 60)['reached']);
        $this->assertSame(1, $DB->count_records('local_mooblox_goal', ['courseid' => $course->id]));
        $this->assertFalse(class_goal::state($course->id, $now + WEEKSECS)['reached']);
    }

    /**
     * A teacher's target replaces the automatic one; target 0 turns the goal off.
     */
    public function test_teacher_target_and_off(): void {
        $this->resetAfterTest();
        $gen = $this->getDataGenerator();
        $course = $gen->create_course();
        for ($i = 0; $i < 10; $i++) {
            $gen->create_and_enrol($course, 'student');
        }
        $this->assertSame(12, class_goal::state($course->id)['target']);
        $settings = (object) ['enabled' => 1, 'manualxp' => 1, 'weekdays' => 2, 'goal' => 1, 'goaltarget' => 3];
        course_settings::save($course->id, $settings);
        $this->assertSame(3, class_goal::state($course->id)['target']);
        course_settings::save($course->id, (object) (['goal' => 0] + (array) $settings));
        $this->assertNull(class_goal::state($course->id));
    }
}
