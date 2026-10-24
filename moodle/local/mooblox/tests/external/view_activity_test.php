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
 * Tests for the local_mooblox_view_activity external function.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_mooblox\external;

use core_external\external_api;
use PHPUnit\Framework\Attributes\CoversClass;

/**
 * Tests for the local_mooblox_view_activity external function.
 *
 * @package    local_mooblox
 * @category   test
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(view_activity::class)]
final class view_activity_test extends \advanced_testcase {
    /**
     * Viewing a resource with view completion marks it complete for the student.
     */
    public function test_execute_marks_resource_viewed(): void {
        $this->resetAfterTest();
        $generator = $this->getDataGenerator();
        $course = $generator->create_course(['enablecompletion' => 1]);
        $student = $generator->create_and_enrol($course, 'student');
        $this->setAdminUser();
        $resource = $generator->create_module('resource', ['course' => $course->id,
            'completion' => COMPLETION_TRACKING_AUTOMATIC, 'completionview' => COMPLETION_VIEW_REQUIRED]);
        $this->setUser($student);
        $_POST['sesskey'] = sesskey();

        $result = external_api::clean_returnvalue(view_activity::execute_returns(), view_activity::execute($resource->cmid));

        $this->assertTrue($result['status']);
        $cm = get_fast_modinfo($course, $student->id)->get_cm($resource->cmid);
        $state = (new \completion_info($course))->get_data($cm, false, $student->id)->completionstate;
        $this->assertEquals(COMPLETION_COMPLETE, $state);
    }

    /**
     * A module type outside the allow-list is rejected.
     */
    public function test_execute_rejects_unlisted_module(): void {
        $this->resetAfterTest();
        $generator = $this->getDataGenerator();
        $course = $generator->create_course();
        $student = $generator->create_and_enrol($course, 'student');
        $quiz = $generator->create_module('quiz', ['course' => $course->id]);
        $this->setUser($student);

        $this->expectExceptionMessage(get_string('notviewable', 'local_mooblox'));
        view_activity::execute($quiz->cmid);
    }
}
