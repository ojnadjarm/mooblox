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
 * Tests for the world access check.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_mooblox\local;

use PHPUnit\Framework\Attributes\CoversClass;

/**
 * Tests for the world access check.
 *
 * @package    local_mooblox
 * @category   test
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(access::class)]
final class access_test extends \advanced_testcase {
    /**
     * A student passes; a prohibited student is denied; the site switch off denies everyone.
     */
    public function test_require_play(): void {
        $this->resetAfterTest();
        $generator = $this->getDataGenerator();
        $course = $generator->create_course();
        $context = \context_course::instance($course->id);
        $student = $generator->create_and_enrol($course, 'student');
        $denied = $generator->create_and_enrol($course, 'student');
        $roleid = $generator->create_role();
        assign_capability('local/mooblox:play', CAP_PROHIBIT, $roleid, $context);
        role_assign($roleid, $denied->id, $context);

        $this->setUser($student);
        access::require_play($context);

        set_config('enabled', 0, 'local_mooblox');
        try {
            access::require_play($context);
            $this->fail('Disabled site switch must deny access');
        } catch (\moodle_exception $e) {
            $this->assertSame('disabled', $e->errorcode);
        }

        set_config('enabled', 1, 'local_mooblox');
        $this->setUser($denied);
        $this->expectException(\required_capability_exception::class);
        access::require_play($context);
    }
}
