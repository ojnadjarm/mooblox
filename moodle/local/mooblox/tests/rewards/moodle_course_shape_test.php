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
 * Course shape read from Moodle.
 *
 * @package    local_mooblox
 * @category   test
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(moodle_course_shape::class)]
final class moodle_course_shape_test extends \advanced_testcase {
    /**
     * Only quizzes whose completion needs a passing grade are pass quizzes; a grade-only quiz is done once graded.
     */
    public function test_pass_quiz_needs_pass_completion(): void {
        $this->resetAfterTest();
        $generator = $this->getDataGenerator();
        $course = $generator->create_course(['enablecompletion' => 1, 'numsections' => 1]);
        $auto = ['course' => $course->id, 'section' => 1, 'gradepass' => 5, 'grade' => 10,
            'completion' => COMPLETION_TRACKING_AUTOMATIC, 'completionusegrade' => 1];
        $graded = $generator->create_module('quiz', $auto + ['completionpassgrade' => 0]);
        $mustpass = $generator->create_module('quiz', $auto + ['completionpassgrade' => 1]);

        $cms = moodle_course_shape::load($course->id)->cms();
        $this->assertFalse($cms[$graded->cmid]['passgrade']);
        $this->assertTrue($cms[$mustpass->cmid]['passgrade']);
    }
}
