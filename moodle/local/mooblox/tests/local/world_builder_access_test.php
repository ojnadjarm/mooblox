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
 * Access matrix tests for the world builder (docs/ACCESS.md).
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_mooblox\local;

use core_availability\tree;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * One case per row of docs/ACCESS.md: what get_world sends for each Moodle access rule.
 *
 * @package    local_mooblox
 * @category   test
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(world_builder::class)]
#[CoversClass(lock_reason::class)]
final class world_builder_access_test extends \advanced_testcase {
    /** @var int Opening date of the future-dated sections. */
    private int $future;

    /** @var \stdClass[] Course modules by fixture key. */
    private array $cms = [];

    /**
     * Section rows: name of the section → expected [sent, available, lock text, module count].
     *
     * @return array
     */
    public static function section_rows(): array {
        return [
            'open section' => ['Open', true, true, '', 3],
            'completion of an activity' => ['After page', true, false, 'Finish Volcano page first', 0],
            'date before "from"' => ['From date', true, false, 'Opens {future}', 0],
            'date after "until"' => ['Until date', true, false, 'This has closed', 0],
            'date, condition hidden (eye)' => ['Hidden date', false, false, '', 0],
            'grade in an activity' => ['After grade', true, false, 'Get a grade in Essay first', 0],
            'group' => ['Group only', true, false, 'Not open for you yet', 0],
            'profile field' => ['Profile only', true, false, 'Not open for you yet', 0],
            'or-tree falls back to Moodle text' => ['Either', true, false, 'Not available unless', 0],
            'hidden section' => ['Hidden', false, false, '', 0],
            'visible, all activities hidden' => ['Empty', true, true, '', 0],
        ];
    }

    /**
     * Each section rule gives the student the expected zone: sent or not, open or closed, sign text.
     *
     * @param string $name section name
     * @param bool $sent whether the section is in the reply
     * @param bool $available whether it is open
     * @param string $lock expected sign text (prefix for Moodle text)
     * @param int $modules number of activities sent
     */
    #[DataProvider('section_rows')]
    public function test_section_rule(string $name, bool $sent, bool $available, string $lock, int $modules): void {
        [$course, $student] = $this->fixture();
        $world = world_builder::build($course, $student);
        $section = $this->section($world, $name);
        if (!$sent) {
            $this->assertNull($section);
            return;
        }
        $this->assertNotNull($section);
        $this->assertSame($available, $section['available']);
        $lock = str_replace('{future}', userdate($this->future, get_string('strftimegateday', 'local_mooblox')), $lock);
        if ($available) {
            $this->assertSame('', $section['lock']);
        } else {
            $this->assertStringStartsWith(preg_replace('/\s+/', ' ', $lock), $section['lock']);
        }
        $this->assertCount($modules, $section['modules']);
    }

    /**
     * Activity rules in an open section: restricted shown with a reason, restricted hidden, stealth and hidden left out.
     */
    public function test_activity_rules(): void {
        [$course, $student] = $this->fixture();
        $modules = array_column($this->section(world_builder::build($course, $student), 'Open')['modules'], null, 'id');

        $this->assertTrue($modules[$this->cms['page']->cmid]['available']);
        $this->assertSame('', $modules[$this->cms['page']->cmid]['lock']);
        $shown = $modules[$this->cms['restricted']->cmid];
        $this->assertFalse($shown['available']);
        $this->assertStringStartsWith('Opens ', $shown['lock']);
        $this->assertArrayNotHasKey($this->cms['restrictedhidden']->cmid, $modules);
        $this->assertArrayNotHasKey($this->cms['stealth']->cmid, $modules);
        $this->assertArrayNotHasKey($this->cms['hidden']->cmid, $modules);
    }

    /**
     * Completing the page opens the section that waits for it; the earliest future date is sent for the client timer.
     */
    public function test_completion_opens_section_and_next_change(): void {
        [$course, $student] = $this->fixture();
        $world = world_builder::build($course, $student);
        $this->assertSame($this->future, $world['nextchange']);

        $cm = get_fast_modinfo($course, $student->id)->get_cm($this->cms['page']->cmid);
        (new \completion_info($course))->set_module_viewed($cm, $student->id);
        $section = $this->section(world_builder::build($course, $student), 'After page');
        $this->assertTrue($section['available']);
        $this->assertSame('', $section['lock']);
        $this->assertCount(1, $section['modules']);
    }

    /**
     * Hidden sections the course shows as "not available" (hiddensections = 0) come as closed zones.
     */
    public function test_hidden_section_shown_as_unavailable(): void {
        [$course, $student] = $this->fixture(0);
        $section = $this->section(world_builder::build($course, $student), 'Hidden');
        $this->assertFalse($section['available']);
        $this->assertSame('Not open yet', $section['lock']);
        $this->assertSame([], $section['modules']);
    }

    /**
     * A teacher sees every section and activity open; only students get the student view.
     */
    public function test_teacher_sees_everything(): void {
        [$course] = $this->fixture();
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');
        $world = world_builder::build($course, $teacher);
        $this->assertNotNull($this->section($world, 'Hidden'));
        $this->assertTrue($this->section($world, 'After page')['available']);
        $this->assertCount(6, $this->section($world, 'Open')['modules']);
    }

    /**
     * Builds the matrix course: one section per rule, plus activity rules in the open section.
     *
     * @param int $hiddensections course setting: 1 hides hidden sections entirely, 0 shows them as not available
     * @return array [course, student]
     */
    private function fixture(int $hiddensections = 1): array {
        global $CFG, $DB;
        $this->resetAfterTest();
        $CFG->enableavailability = 1;
        $CFG->allowstealth = 1;
        $generator = $this->getDataGenerator();
        $names = ['Open', 'After page', 'From date', 'Until date', 'Hidden date', 'After grade', 'Group only', 'Profile only',
            'Either', 'Hidden', 'Empty'];
        $course = $generator->create_course(['enablecompletion' => 1, 'numsections' => count($names),
            'hiddensections' => $hiddensections]);
        foreach ($names as $i => $name) {
            $DB->set_field('course_sections', 'name', $name, ['course' => $course->id, 'section' => $i + 1]);
        }
        $student = $generator->create_and_enrol($course, 'student');
        $group = $generator->create_group(['courseid' => $course->id]);
        $this->future = (int) (usergetmidnight(time()) + 10 * DAYSECS);
        $from = \availability_date\condition::get_json('>=', $this->future);

        $this->cms['page'] = $generator->create_module('page', ['course' => $course->id, 'section' => 1, 'name' => 'Volcano page',
            'completion' => COMPLETION_TRACKING_AUTOMATIC, 'completionview' => COMPLETION_VIEW_REQUIRED]);
        $assign = $generator->create_module('assign', ['course' => $course->id, 'section' => 1, 'name' => 'Essay']);
        $this->cms['restricted'] = $generator->create_module('page', ['course' => $course->id, 'section' => 1,
            'availability' => json_encode(tree::get_root_json([$from]))]);
        $this->cms['restrictedhidden'] = $generator->create_module('page', ['course' => $course->id, 'section' => 1,
            'availability' => json_encode(tree::get_root_json([$from], tree::OP_AND, false))]);
        $this->cms['stealth'] = $generator->create_module('page', ['course' => $course->id, 'section' => 1,
            'visibleoncoursepage' => 0]);
        $this->cms['hidden'] = $generator->create_module('page', ['course' => $course->id, 'section' => 1, 'visible' => 0]);
        $generator->create_module('page', ['course' => $course->id, 'section' => 2]);
        $generator->create_module('page', ['course' => $course->id, 'section' => 10]);
        $generator->create_module('page', ['course' => $course->id, 'section' => 11, 'visible' => 0]);
        $gradeitem = \grade_item::fetch(['itemtype' => 'mod', 'itemmodule' => 'assign', 'iteminstance' => $assign->id,
            'courseid' => $course->id]);

        $rules = [
            2 => tree::get_root_json([\availability_completion\condition::get_json($this->cms['page']->cmid, COMPLETION_COMPLETE)]),
            3 => tree::get_root_json([$from]),
            4 => tree::get_root_json([\availability_date\condition::get_json('<', time() - DAYSECS)]),
            5 => tree::get_root_json([$from], tree::OP_AND, false),
            6 => tree::get_root_json([\availability_grade\condition::get_json($gradeitem->id, 50)]),
            7 => tree::get_root_json([\availability_group\condition::get_json($group->id)]),
            8 => tree::get_root_json([\availability_profile\condition::get_json(false, 'email', 'isequalto', 'no@example.com')]),
            9 => tree::get_root_json([$from, \availability_group\condition::get_json($group->id)], tree::OP_OR),
        ];
        foreach ($rules as $number => $json) {
            $DB->set_field('course_sections', 'availability', json_encode($json), ['course' => $course->id, 'section' => $number]);
        }
        $DB->set_field('course_sections', 'visible', 0, ['course' => $course->id, 'section' => 10]);
        rebuild_course_cache($course->id, true);
        return [get_course($course->id), $student];
    }

    /**
     * Returns the section DTO named `$name`, or null.
     *
     * @param array $world get_world reply
     * @param string $name section name
     * @return array|null
     */
    private function section(array $world, string $name): ?array {
        foreach ($world['sections'] as $section) {
            if ($section['name'] === $name) {
                return $section;
            }
        }
        return null;
    }
}
