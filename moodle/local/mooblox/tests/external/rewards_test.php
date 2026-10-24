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

namespace local_mooblox\external;

use core_external\external_api;
use PHPUnit\Framework\Attributes\CoversClass;

/**
 * Tests for the rewards external functions: get_rewards, claim_collectible, set_look.
 *
 * @package    local_mooblox
 * @category   test
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(get_rewards::class)]
#[CoversClass(claim_collectible::class)]
#[CoversClass(set_look::class)]
#[CoversClass(\local_mooblox\rewards\summary::class)]
#[CoversClass(\local_mooblox\rewards\collector::class)]
#[CoversClass(\local_mooblox\rewards\wardrobe::class)]
#[CoversClass(\local_mooblox\rewards\moodle_course_shape::class)]
final class rewards_test extends \advanced_testcase {
    /**
     * A student completes a page: XP, a gem to claim (twice, idempotent), the quest item to wear; locked ones fail.
     */
    public function test_rewards_flow(): void {
        global $DB;
        $this->resetAfterTest();
        $generator = $this->getDataGenerator();
        $course = $generator->create_course(['enablecompletion' => 1]);
        $student = $generator->create_and_enrol($course, 'student');
        $view = ['course' => $course->id, 'completion' => COMPLETION_TRACKING_AUTOMATIC, 'completionview' => 1];
        $page = $generator->create_module('page', $view + ['section' => 1]);
        $other = $generator->create_module('page', $view + ['section' => 2]);
        $this->setUser($student);
        $modinfo = get_fast_modinfo($course);
        [$s1, $s2] = [$modinfo->get_cm($page->cmid)->section, $modinfo->get_cm($other->cmid)->section];
        $get = fn() => external_api::clean_returnvalue(get_rewards::execute_returns(), get_rewards::execute($course->id));

        $before = $get();
        $this->assertTrue($before['enabled']);
        $this->assertSame([0, 0, 50], [$before['xp'], $before['level'], $before['levelnext']]);
        $this->assertSame(["sec:$s1", "sec:$s2"], array_column($before['quests'], 'id'));
        $this->assertSame([], array_keys(array_filter(array_column($before['collectibles'], 'unlocked', 'key'))));

        $cm = get_fast_modinfo($course)->get_cm($page->cmid);
        (new \completion_info($course))->set_module_viewed($cm, $student->id);
        $after = $get();
        $this->assertSame(5, $after['xp']);
        $unlocked = array_keys(array_filter(array_column($after['collectibles'], 'unlocked', 'key')));
        $this->assertSame(['gem:' . $page->cmid, 'crystal:' . $s1], $unlocked);
        $reward = $after['quests'][0]['reward'];
        $this->assertTrue($after['quests'][0]['complete']);
        $this->assertSame([$reward], $after['unlocks']);

        $claim = fn(string $key) => external_api::clean_returnvalue(
            claim_collectible::execute_returns(),
            claim_collectible::execute($course->id, $key)
        );
        $this->assertSame(1, $claim('gem:' . $page->cmid)['found']);
        $this->assertSame(1, $claim('gem:' . $page->cmid)['found']);
        $this->assertEquals(1, $DB->count_records('local_mooblox_found', ['userid' => $student->id]));
        try {
            $claim('gem:' . $other->cmid);
            $this->fail('A locked gem was claimed');
        } catch (\moodle_exception $e) {
            $this->assertSame('collectiblelocked', $e->errorcode);
        }

        $slot = str_starts_with($reward, 'hat-') ? 'hat' : 'outfit';
        $look = external_api::clean_returnvalue(set_look::execute_returns(), set_look::execute(...[$slot => $reward]));
        $this->assertSame($reward, $look[$slot]);
        $this->assertSame($look, $get()['look']);
        $this->expectExceptionMessage(get_string('itemlocked', 'local_mooblox'));
        set_look::execute(pet: 'pet-cat');
    }

    /**
     * With rewards off in the course, get_rewards says so and claims are refused.
     */
    public function test_rewards_off(): void {
        global $DB;
        $this->resetAfterTest();
        $generator = $this->getDataGenerator();
        $course = $generator->create_course(['enablecompletion' => 1]);
        $student = $generator->create_and_enrol($course, 'student');
        $DB->insert_record('local_mooblox_course', ['courseid' => $course->id, 'enabled' => 0, 'timemodified' => time()]);
        $this->setUser($student);

        $result = external_api::clean_returnvalue(get_rewards::execute_returns(), get_rewards::execute($course->id));

        $this->assertFalse($result['enabled']);
        $this->assertSame([], $result['quests']);
        $this->expectExceptionMessage(get_string('rewardsoff', 'local_mooblox'));
        claim_collectible::execute($course->id, 'gem:1');
    }
}
