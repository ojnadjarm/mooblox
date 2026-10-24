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
 * Tests for the course rewards switches.
 *
 * @package    local_mooblox
 * @category   test
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(course_settings::class)]
#[CoversClass(course_switch::class)]
final class course_settings_test extends \advanced_testcase {
    /**
     * Defaults follow the site default; saved switches round-trip; only teachers may manage them.
     */
    public function test_settings(): void {
        $this->resetAfterTest();
        $generator = $this->getDataGenerator();
        $course = $generator->create_course();
        $student = $generator->create_and_enrol($course, 'student');
        $teacher = $generator->create_and_enrol($course, 'editingteacher');
        $context = \context_course::instance($course->id);

        $defaults = ['enabled' => 1, 'manualxp' => 1, 'weekdays' => 2, 'goal' => 1, 'goaltarget' => 0];
        $this->assertSame($defaults, course_settings::get($course->id));
        set_config('rewardsdefault', 0, 'local_mooblox');
        $this->assertFalse(course_switch::is_on($course->id));

        $saved = ['enabled' => 1, 'manualxp' => 0, 'weekdays' => 4, 'goal' => 1, 'goaltarget' => 12];
        course_settings::save($course->id, (object) $saved);
        $this->assertSame($saved, course_settings::get($course->id));
        $this->assertTrue(course_switch::is_on($course->id));
        course_settings::save($course->id, (object) (['goal' => 0, 'enabled' => 0] + $saved));
        $off = course_settings::get($course->id);
        $this->assertSame([0, 0], [$off['enabled'], $off['goal']]);

        $this->assertTrue(has_capability('local/mooblox:managerewards', $context, $teacher));
        $this->assertFalse(has_capability('local/mooblox:managerewards', $context, $student));
    }
}
