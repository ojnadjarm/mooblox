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
 * Tests for the procedural quests and collectibles over four course shapes.
 *
 * @package    local_mooblox
 * @category   test
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(quest_generator::class)]
#[CoversClass(collectible_catalog::class)]
#[CoversClass(course_shape::class)]
final class procedural_test extends \basic_testcase {
    /**
     * A shape of sections built from kind lists, with ids section 100+n and cm 1000+.
     *
     * @param int $courseid course id
     * @param array $sections section name => kinds, a kind with '+' is a quiz with a pass grade
     * @param array $badges badge id => name
     * @param bool $completion course completion on
     * @return course_shape
     */
    private static function shape(int $courseid, array $sections, array $badges = [], bool $completion = false): course_shape {
        $built = [];
        $cmid = 1000;
        $sectionid = 100;
        foreach ($sections as $name => $kinds) {
            $cms = [];
            foreach ($kinds as $kind) {
                $cms[++$cmid] = ['kind' => rtrim($kind, '+'), 'passgrade' => str_ends_with($kind, '+')];
            }
            $built[++$sectionid] = ['name' => $name, 'cms' => $cms];
        }
        return new course_shape($courseid, $built, $badges, $completion);
    }

    /**
     * Four course shapes and their expected quest ids, quest count, collectible counts per kind.
     *
     * @return array
     */
    public static function shape_provider(): array {
        $big = [];
        for ($s = 1; $s <= 30; $s++) {
            $big["Week $s"] = ['page', 'page', 'video', 'quiz+', 'other', 'other', 'page', 'video', 'other', 'quiz'];
        }
        return [
            'empty course' => [self::shape(2, ['General' => []], [], true), [], ['gem' => 0, 'crystal' => 0, 'star' => 0]],
            'rewards demo' => [
                self::shape(31, [
                    'Reading corner' => ['page', 'page', 'page'],
                    'Cinema' => ['video', 'video'],
                    'Arena' => ['quiz+', 'quiz'],
                    'Lava lab' => ['page'],
                ], [1 => 'Bookworm', 2 => 'Quiz champ'], true),
                ['sec:101', 'sec:102', 'sec:103', 'sec:104', 'mod:video', 'mod:page', 'badge:1', 'badge:2', 'course'],
                ['gem' => 8, 'crystal' => 4, 'star' => 1],
            ],
            'one section, two quizzes with pass grades' => [
                self::shape(7, ['Only' => ['quiz+', 'quiz+', 'other']]),
                ['sec:101', 'mod:quiz'],
                ['gem' => 3, 'crystal' => 1, 'star' => 1],
            ],
            '30 sections of 10' => [
                self::shape(99, $big, [], true),
                array_merge(
                    array_map(fn($n) => 'sec:' . (100 + $n), range(1, 30)),
                    ['mod:video', 'mod:quiz', 'mod:page', 'course'],
                ),
                ['gem' => 300, 'crystal' => 30, 'star' => 90],
            ],
        ];
    }

    /**
     * Quest ids, collectible counts and keys are stable for a shape, and quest items are unique and seeded.
     *
     * @param course_shape $shape course structure
     * @param string[] $questids expected quest ids in order
     * @param array $counts expected collectibles per kind
     */
    #[DataProvider('shape_provider')]
    public function test_shape(course_shape $shape, array $questids, array $counts): void {
        $facts = new facts($shape->courseid);
        $quests = quest_generator::quests($shape, $facts);
        $this->assertSame($questids, array_column($quests, 'id'));
        $this->assertSame($quests, quest_generator::quests($shape, $facts));

        $rewards = array_filter(array_column($quests, 'reward'));
        $this->assertCount(min(count($quests), 21), $rewards);
        $this->assertSame(array_values(array_unique($rewards)), array_values($rewards));
        $this->assertEmpty(array_diff($rewards, catalog::ids()));
        $this->assertSame(array_column($quests, 'reward', 'id'), quest_generator::rewards($shape->courseid, $questids));

        $all = collectible_catalog::all($shape);
        $kinds = array_count_values(array_column($all, 'kind')) + ['gem' => 0, 'crystal' => 0, 'star' => 0];
        $this->assertEquals($counts, $kinds);
        $this->assertCount(count($all), array_unique(array_column($all, 'key')));
        $this->assertSame($all, collectible_catalog::all($shape));
        $this->assertSame([], collectible_catalog::unlocked($shape, $facts));
    }

    /**
     * Progress and unlocks follow the facts: a fail finishes a section, only a pass counts for the quiz quest.
     */
    public function test_progress_and_unlocks(): void {
        $shape = self::shape_provider()['rewards demo'][0];
        $done = fn(int $state) => ['state' => $state, 'mode' => facts::AUTO, 'time' => 1];
        $facts = new facts(31, [
            1001 => $done(COMPLETION_COMPLETE),
            1002 => $done(COMPLETION_COMPLETE),
            1003 => $done(COMPLETION_INCOMPLETE),
            1006 => $done(COMPLETION_COMPLETE_PASS),
            1007 => $done(COMPLETION_COMPLETE_FAIL),
        ], [], [1 => 50]);
        $quests = array_column(quest_generator::quests($shape, $facts), null, 'id');

        $section = $quests['sec:101'];
        $this->assertSame([2, 3, false], [$section['done'], $section['total'], $section['complete']]);
        $this->assertTrue($quests['sec:103']['complete']);
        $this->assertTrue($quests['badge:1']['complete']);
        $this->assertFalse($quests['course']['complete']);
        $this->assertSame(
            ['gem:1001', 'gem:1002', 'star:101:1', 'gem:1006', 'gem:1007', 'crystal:103'],
            collectible_catalog::unlocked($shape, $facts)
        );
    }
}
