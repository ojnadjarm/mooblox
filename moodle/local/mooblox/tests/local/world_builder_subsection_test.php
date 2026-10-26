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
 * World builder tests for subsections (delegated sections) and the completion done flag.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_mooblox\local;

use core_availability\tree;
use PHPUnit\Framework\Attributes\CoversClass;

/**
 * Subsection contents sit in their parent's zone; `done` follows Moodle's overall completion.
 *
 * @package    local_mooblox
 * @category   test
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(world_builder::class)]
final class world_builder_subsection_test extends \advanced_testcase {
    /**
     * A subsection's activities come right after it in the parent section; no zone of its own.
     */
    public function test_subsection_contents_in_parent(): void {
        [$course, $student, $sub, $inside] = $this->fixture();
        $world = world_builder::build($course, $student);

        $this->assertSame(['General', 'Topic'], array_column($world['sections'], 'name'));
        $ids = array_column($world['sections'][1]['modules'], 'id');
        $this->assertSame([(int) $sub->cmid, (int) $inside->cmid], array_map('intval', $ids));
        $this->assertTrue($world['sections'][1]['modules'][1]['available']);
    }

    /**
     * A restricted subsection is shown locked with its reason and none of its activities.
     */
    public function test_restricted_subsection_is_locked(): void {
        global $DB;
        [$course, $student, $sub] = $this->fixture();
        $delegated = get_fast_modinfo($course)->get_cm($sub->cmid)->get_delegated_section_info();
        $from = \availability_date\condition::get_json('>=', time() + 10 * DAYSECS);
        $DB->set_field('course_sections', 'availability', json_encode(tree::get_root_json([$from])), ['id' => $delegated->id]);
        rebuild_course_cache($course->id, true);

        $modules = world_builder::build($course, $student)['sections'][1]['modules'];
        $this->assertCount(1, $modules);
        $this->assertFalse($modules[0]['available']);
        $this->assertStringStartsWith('Opens ', $modules[0]['lock']);
    }

    /**
     * A hidden subsection sends neither itself nor its activities to a student.
     */
    public function test_hidden_subsection_left_out(): void {
        [$course, $student, $sub] = $this->fixture();
        set_coursemodule_visible($sub->cmid, 0);
        rebuild_course_cache($course->id, true);

        $this->assertSame([], world_builder::build($course, $student)['sections'][1]['modules']);
    }

    /**
     * A failed graded quiz is done when completion only needs a grade, not done when it needs a pass.
     */
    public function test_done_follows_overall_completion(): void {
        global $DB;
        $this->resetAfterTest();
        $generator = $this->getDataGenerator();
        $course = $generator->create_course(['enablecompletion' => 1, 'numsections' => 1]);
        $student = $generator->create_and_enrol($course, 'student');
        $auto = ['course' => $course->id, 'section' => 1, 'gradepass' => 5, 'grade' => 10,
            'completion' => COMPLETION_TRACKING_AUTOMATIC, 'completionusegrade' => 1];
        $graded = $generator->create_module('quiz', $auto + ['completionpassgrade' => 0]);
        $mustpass = $generator->create_module('quiz', $auto + ['completionpassgrade' => 1]);
        foreach ([$graded, $mustpass] as $quiz) {
            $DB->insert_record('course_modules_completion', ['coursemoduleid' => $quiz->cmid, 'userid' => $student->id,
                'completionstate' => COMPLETION_COMPLETE_FAIL, 'timemodified' => time()]);
        }
        \cache::make('core', 'completion')->purge();

        $modules = array_column(world_builder::build($course, $student)['sections'][1]['modules'], null, 'id');
        $this->assertSame(COMPLETION_COMPLETE_FAIL, $modules[$graded->cmid]['state']);
        $this->assertTrue($modules[$graded->cmid]['done']);
        $this->assertFalse($modules[$mustpass->cmid]['done']);
    }

    /**
     * A course with one topic holding a subsection with one page.
     *
     * @return array [course, student, subsection module, page inside]
     */
    private function fixture(): array {
        global $CFG, $DB;
        $this->resetAfterTest();
        $CFG->enableavailability = 1;
        $generator = $this->getDataGenerator();
        $course = $generator->create_course(['enablecompletion' => 1, 'numsections' => 1, 'format' => 'topics']);
        $DB->set_field('course_sections', 'name', 'General', ['course' => $course->id, 'section' => 0]);
        $DB->set_field('course_sections', 'name', 'Topic', ['course' => $course->id, 'section' => 1]);
        $student = $generator->create_and_enrol($course, 'student');
        $sub = $generator->create_module('subsection', ['course' => $course->id, 'section' => 1, 'name' => 'Side quest']);
        $delegated = get_fast_modinfo($course)->get_cm($sub->cmid)->get_delegated_section_info();
        $inside = $generator->create_module('page', ['course' => $course->id, 'section' => $delegated->section,
            'name' => 'Side quest page']);
        return [$course, $student, $sub, $inside];
    }
}
