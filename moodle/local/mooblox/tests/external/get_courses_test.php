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
 * Tests for the local_mooblox_get_courses external function.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_mooblox\external;

use core_external\external_api;
use PHPUnit\Framework\Attributes\CoversClass;

/**
 * Tests for the local_mooblox_get_courses external function.
 *
 * @package    local_mooblox
 * @category   test
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(get_courses::class)]
final class get_courses_test extends \advanced_testcase {
    /**
     * A student gets their course with its world URL.
     */
    public function test_execute_returns_courses(): void {
        $this->resetAfterTest();
        $generator = $this->getDataGenerator();
        $course = $generator->create_course(['fullname' => 'Volcanoes']);
        $student = $generator->create_and_enrol($course, 'student');
        $this->setUser($student);

        $result = external_api::clean_returnvalue(get_courses::execute_returns(), get_courses::execute());

        $this->assertCount(1, $result);
        $this->assertSame((int) $course->id, $result[0]['id']);
        $this->assertSame('Volcanoes', $result[0]['fullname']);
        $this->assertSame(-1, $result[0]['progress']);
        $this->assertStringContainsString('/local/mooblox/play.php?id=' . $course->id, $result[0]['url']);
    }

    /**
     * The site switch off refuses the call.
     */
    public function test_execute_refuses_when_switched_off(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());
        set_config('enabled', 0, 'local_mooblox');

        $this->expectException(\moodle_exception::class);
        get_courses::execute();
    }
}
