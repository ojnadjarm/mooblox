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

/**
 * Tests for the gentle learning weeks.
 *
 * @package    local_mooblox
 * @category   test
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(learning_weeks::class)]
#[CoversClass(summary::class)]
final class learning_weeks_test extends \advanced_testcase {
    /** @var int[] Monday and Tuesday of 4 weeks in a row from 2026-09-07 */
    const FOUR_WEEKS = [20260907, 20260908, 20260914, 20260915, 20260921, 20260922, 20260928, 20260929];

    /**
     * Four learning weeks earn a freeze that covers the missed fifth week; the week in progress never breaks.
     */
    public function test_freeze_is_spent_on_a_missed_week(): void {
        $this->assertSame(
            ['weeks' => 4, 'welcomeback' => false, 'freezes' => 1],
            learning_weeks::count(self::FOUR_WEEKS, 2, 20261001)
        );
        $this->assertSame(
            ['weeks' => 4, 'welcomeback' => false, 'freezes' => 0],
            learning_weeks::count(self::FOUR_WEEKS, 2, 20261013)
        );
        $this->assertSame(
            ['weeks' => 5, 'welcomeback' => false, 'freezes' => 0],
            learning_weeks::count([...self::FOUR_WEEKS, 20261012, 20261013], 2, 20261014)
        );
    }

    /**
     * A break with no freeze left ends the run quietly; the next learning week starts at 1 with a welcome back.
     */
    public function test_break_starts_again_at_one(): void {
        $this->assertSame(
            ['weeks' => 0, 'welcomeback' => false, 'freezes' => 0],
            learning_weeks::count([20260907, 20260908], 2, 20260923)
        );
        $back = learning_weeks::count([20260907, 20260908, 20261005, 20261007], 2, 20261007);
        $this->assertSame(['weeks' => 1, 'welcomeback' => true, 'freezes' => 0], $back);
        $again = learning_weeks::count([20260907, 20260908, 20261005, 20261007, 20261012, 20261013], 2, 20261013);
        $this->assertFalse($again['welcomeback']);
        $this->assertSame(0, learning_weeks::count([20260907], 2, 20260908)['weeks']);
    }

    /**
     * A completion late on Sunday UTC is already Monday in Auckland: the user's timezone decides the week it counts in.
     */
    public function test_days_follow_the_user_timezone(): void {
        global $DB;
        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course(['enablecompletion' => 1]);
        $source = new class implements fact_source {
            #[\Override]
            public function load(int $courseid, int $userid): facts {
                $at = fn($time) => ['state' => COMPLETION_COMPLETE, 'mode' => facts::AUTO, 'time' => $time];
                // Sunday 2026-10-18 20:00 UTC and Tuesday 2026-10-20 01:00 UTC.
                return new facts($courseid, [1 => $at(1792353600), 2 => $at(1792458000)]);
            }
        };
        $weeks = [];
        foreach (['Pacific/Auckland', 'UTC'] as $tz) {
            $user = $this->getDataGenerator()->create_user(['timezone' => $tz]);
            (new reconciler($source))->sync($course->id, $user->id);
            $days = $DB->get_fieldset('local_mooblox_day', 'day', ['courseid' => $course->id, 'userid' => $user->id], 'day');
            $weeks[$tz] = [array_map('intval', $days), learning_weeks::count($days, 2, 20261021)['weeks']];
        }
        $this->assertSame([[20261019, 20261020], 1], $weeks['Pacific/Auckland']);
        $this->assertSame([[20261018, 20261020], 0], $weeks['UTC']);
    }
}
