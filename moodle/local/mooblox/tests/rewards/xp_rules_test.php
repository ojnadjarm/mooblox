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
use PHPUnit\Framework\Attributes\DataProvider;

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->libdir . '/completionlib.php');

/**
 * Tests for the XP rules and the level curve.
 *
 * @package    local_mooblox
 * @category   test
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(xp_rules::class)]
#[CoversClass(level_curve::class)]
final class xp_rules_test extends \basic_testcase {
    /**
     * Fact sets, the manual XP switch, the expected rows (key => xp) and level.
     *
     * @return array
     */
    public static function facts_provider(): array {
        $auto = fn(int $state = COMPLETION_COMPLETE) => ['state' => $state, 'mode' => facts::AUTO, 'time' => 100];
        $grade = fn(float $percent) => [7 => ['percent' => $percent, 'time' => 200]];
        return [
            'nothing yet' => [[], true, [], 0],
            'automatic completion' => [['completions' => [1 => $auto()]], true, ['cm:1:complete' => 10], 0],
            'view-only completion' => [
                ['completions' => [1 => ['state' => COMPLETION_COMPLETE, 'mode' => facts::VIEW, 'time' => 1]]],
                true, ['cm:1:complete' => 5], 0,
            ],
            'manual completion' => [
                ['completions' => [1 => ['state' => COMPLETION_COMPLETE, 'mode' => facts::MANUAL, 'time' => 1]]],
                true, ['cm:1:complete' => 3], 0,
            ],
            'manual completion, manual XP off' => [
                ['completions' => [1 => ['state' => COMPLETION_COMPLETE, 'mode' => facts::MANUAL, 'time' => 1]]],
                false, [], 0,
            ],
            'passed' => [['completions' => [1 => $auto(COMPLETION_COMPLETE_PASS)]], true,
                ['cm:1:complete' => 10, 'cm:1:pass' => 10], 0],
            'failed keeps the completion XP' => [['completions' => [1 => $auto(COMPLETION_COMPLETE_FAIL)]], true,
                ['cm:1:complete' => 10], 0],
            'incomplete' => [['completions' => [1 => $auto(COMPLETION_INCOMPLETE)]], true, [], 0],
            'grade below half' => [['grades' => $grade(49.9)], true, [], 0],
            'grade 50 %' => [['grades' => $grade(50)], true, ['grade:7:grade50' => 5], 0],
            'grade 80 %' => [['grades' => $grade(80)], true, ['grade:7:grade80' => 10], 0],
            'grade 100 %' => [['grades' => $grade(100)], true, ['grade:7:grade100' => 15], 0],
            'badge' => [['badges' => [3 => 300]], true, ['badge:3:badge' => 25], 0],
            'course completed' => [['coursecompleted' => 400], true, ['course:9:complete' => 50], 1],
            'whole course' => [
                [
                    'completions' => [1 => $auto(), 2 => $auto(), 3 => $auto(), 4 => $auto(), 5 => $auto(),
                        6 => $auto(COMPLETION_COMPLETE_PASS)],
                    'grades' => $grade(100),
                    'badges' => [3 => 300, 4 => 300],
                    'coursecompleted' => 400,
                ],
                true,
                [
                    'cm:1:complete' => 10, 'cm:2:complete' => 10, 'cm:3:complete' => 10, 'cm:4:complete' => 10,
                    'cm:5:complete' => 10, 'cm:6:complete' => 10, 'cm:6:pass' => 10, 'grade:7:grade100' => 15,
                    'badge:3:badge' => 25, 'badge:4:badge' => 25, 'course:9:complete' => 50,
                ],
                2,
            ],
        ];
    }

    /**
     * Each fact set earns the expected ledger rows and level.
     *
     * @param array $args facts constructor arguments besides the course id
     * @param bool $manualxp manual XP switch
     * @param array $expected expected key => xp
     * @param int $level expected level
     */
    #[DataProvider('facts_provider')]
    public function test_desired_rows_and_level(array $args, bool $manualxp, array $expected, int $level): void {
        $rows = (new xp_rules($manualxp))->desired(new facts(9, ...$args));

        $this->assertSame($expected, array_map(fn($r) => $r['xp'], $rows));
        $this->assertSame($level, level_curve::level(array_sum($expected)));
    }

    /**
     * Level thresholds follow 25 * n * (n + 1).
     */
    public function test_level_curve(): void {
        $this->assertSame([0, 50, 150, 300, 500], array_map([level_curve::class, 'threshold'], [0, 1, 2, 3, 4]));
        $this->assertSame([0, 0, 1, 1, 2, 3, 4], array_map([level_curve::class, 'level'], [0, 49, 50, 149, 150, 300, 500]));
    }

    /**
     * The rules version changes with the manual XP switch.
     */
    public function test_version_follows_switches(): void {
        $this->assertSame((new xp_rules(true))->version(), (new xp_rules(true))->version());
        $this->assertNotSame((new xp_rules(true))->version(), (new xp_rules(false))->version());
    }
}
