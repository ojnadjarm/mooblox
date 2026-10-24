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

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->libdir . '/completionlib.php');
require_once($CFG->libdir . '/gradelib.php');

/**
 * Tests for the Moodle fact source.
 *
 * @package    local_mooblox
 * @category   test
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(moodle_fact_source::class)]
final class moodle_fact_source_test extends \advanced_testcase {
    /**
     * Pass, fail, override, manual, badge and course completion facts come from 4 queries and earn the expected XP.
     */
    public function test_load_reads_completion_grades_badges_and_course(): void {
        global $DB;
        $this->resetAfterTest();
        $this->setAdminUser();
        $gen = $this->getDataGenerator();
        $course = $gen->create_course(['enablecompletion' => 1]);
        $passer = $gen->create_and_enrol($course, 'student');
        $failer = $gen->create_and_enrol($course, 'student');
        $viewpage = $gen->create_module('page', ['course' => $course, 'completion' => COMPLETION_TRACKING_AUTOMATIC,
            'completionview' => 1]);
        $manualpage = $gen->create_module('page', ['course' => $course, 'completion' => COMPLETION_TRACKING_MANUAL]);
        $assign = $gen->create_module('assign', ['course' => $course, 'grade' => 100, 'gradepass' => 50,
            'completion' => COMPLETION_TRACKING_AUTOMATIC, 'completionusegrade' => 1, 'completionpassgrade' => 1]);
        $modinfo = get_fast_modinfo($course);
        $completion = new \completion_info($course);

        $completion->set_module_viewed($modinfo->get_cm($viewpage->cmid), $passer->id);
        $completion->update_state($modinfo->get_cm($manualpage->cmid), COMPLETION_COMPLETE, $passer->id);
        $completion->update_state($modinfo->get_cm($viewpage->cmid), COMPLETION_COMPLETE, $failer->id, true);
        $item = \grade_item::fetch(['itemtype' => 'mod', 'itemmodule' => 'assign', 'iteminstance' => $assign->id,
            'courseid' => $course->id]);
        $item->update_final_grade($passer->id, 80, 'test');
        $item->update_final_grade($failer->id, 30, 'test');
        $badge = $gen->get_plugin_generator('core_badges')->create_badge(['type' => BADGE_TYPE_COURSE,
            'courseid' => $course->id]);
        $badge->issue($passer->id, true);
        (new \completion_completion(['course' => $course->id, 'userid' => $passer->id]))->mark_complete();

        get_fast_modinfo($course->id);
        $source = new moodle_fact_source();
        $reads = $DB->perf_get_reads();
        $passed = $source->load($course->id, $passer->id);
        $this->assertSame(4, $DB->perf_get_reads() - $reads);
        $failed = $source->load($course->id, $failer->id);

        $states = fn(facts $f) => array_map(fn($c) => [$c['state'], $c['mode']], $f->completions);
        $this->assertEquals([
            $viewpage->cmid => [COMPLETION_COMPLETE, facts::VIEW],
            $manualpage->cmid => [COMPLETION_COMPLETE, facts::MANUAL],
            $assign->cmid => [COMPLETION_COMPLETE_PASS, facts::AUTO],
        ], $states($passed));
        $this->assertEquals([
            $viewpage->cmid => [COMPLETION_COMPLETE, facts::VIEW],
            $assign->cmid => [COMPLETION_COMPLETE_FAIL, facts::AUTO],
        ], $states($failed));
        $this->assertEqualsWithDelta(80.0, $passed->grades[$item->id]['percent'], 0.001);
        $this->assertEqualsWithDelta(30.0, $failed->grades[$item->id]['percent'], 0.001);
        $this->assertSame([(int) $badge->id], array_keys($passed->badges));
        $this->assertSame([], $failed->badges);
        $this->assertNotNull($passed->coursecompleted);
        $this->assertNull($failed->coursecompleted);

        $xp = fn(facts $f) => array_sum(array_column((new xp_rules())->desired($f), 'xp'));
        $this->assertSame(5 + 3 + 10 + 10 + 10 + 25 + 50, $xp($passed));
        $this->assertSame(5 + 10, $xp($failed));
    }
}
