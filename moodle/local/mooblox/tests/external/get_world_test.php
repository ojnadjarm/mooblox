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
 * Tests for the local_mooblox_get_world external function.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_mooblox\external;

use core_external\external_api;
use PHPUnit\Framework\Attributes\CoversClass;

/**
 * Tests for the local_mooblox_get_world external function.
 *
 * @package    local_mooblox
 * @category   test
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(get_world::class)]
#[CoversClass(\local_mooblox\local\world_builder::class)]
final class get_world_test extends \advanced_testcase {
    /**
     * A student gets sections, activities, completion states and dates; hidden activities are left out.
     */
    public function test_execute_returns_world_for_student(): void {
        $this->resetAfterTest();
        $generator = $this->getDataGenerator();
        $course = $generator->create_course(['fullname' => 'Volcanoes', 'enablecompletion' => 1, 'numsections' => 2]);
        $student = $generator->create_and_enrol($course, 'student', ['firstname' => 'Mia']);
        $page = $generator->create_module('page', ['course' => $course->id, 'section' => 1,
            'completion' => COMPLETION_TRACKING_AUTOMATIC, 'completionview' => COMPLETION_VIEW_REQUIRED]);
        $timeclose = time() + DAYSECS;
        $quiz = $generator->create_module('quiz', ['course' => $course->id, 'section' => 2, 'timeclose' => $timeclose,
            'completion' => COMPLETION_TRACKING_MANUAL]);
        $generator->create_module('page', ['course' => $course->id, 'section' => 2, 'visible' => 0]);

        $completion = new \completion_info($course);
        $completion->set_module_viewed(get_fast_modinfo($course, $student->id)->get_cm($page->cmid), $student->id);
        $this->setUser($student);

        $result = external_api::clean_returnvalue(get_world::execute_returns(), get_world::execute($course->id));

        $this->assertSame('Volcanoes', $result['coursename']);
        $this->assertSame('Mia', $result['firstname']);
        $this->assertCount(3, $result['sections']);
        $this->assertSame([], $result['sections'][0]['modules']);
        $pagedto = $result['sections'][1]['modules'][0];
        $this->assertSame($page->cmid, $pagedto['id']);
        $this->assertSame('page', $pagedto['modname']);
        $this->assertStringContainsString('/mod/page/view.php?id=' . $page->cmid, $pagedto['url']);
        $this->assertSame(MOD_PURPOSE_CONTENT, $pagedto['purpose']);
        $this->assertTrue($pagedto['available']);
        $this->assertSame(COMPLETION_TRACKING_AUTOMATIC, $pagedto['completion']);
        $this->assertSame(COMPLETION_COMPLETE, $pagedto['state']);
        $this->assertTrue($pagedto['isautomatic']);
        $this->assertCount(1, $result['sections'][2]['modules']);
        $quizdto = $result['sections'][2]['modules'][0];
        $this->assertSame($quiz->cmid, $quizdto['id']);
        $this->assertSame(MOD_PURPOSE_ASSESSMENT, $quizdto['purpose']);
        $this->assertSame(COMPLETION_TRACKING_MANUAL, $quizdto['completion']);
        $this->assertSame(COMPLETION_INCOMPLETE, $quizdto['state']);
        $this->assertFalse($quizdto['isautomatic']);
        $this->assertContains($timeclose, array_column($quizdto['dates'], 'timestamp'));
    }

    /**
     * A user without the play capability is refused.
     */
    public function test_execute_requires_play_capability(): void {
        $this->resetAfterTest();
        $generator = $this->getDataGenerator();
        $course = $generator->create_course();
        $student = $generator->create_and_enrol($course, 'student');
        $roleid = $this->getDataGenerator()->create_role();
        assign_capability('local/mooblox:play', CAP_PROHIBIT, $roleid, \context_course::instance($course->id));
        role_assign($roleid, $student->id, \context_course::instance($course->id));
        $this->setUser($student);

        $this->expectException(\required_capability_exception::class);
        get_world::execute($course->id);
    }
}
