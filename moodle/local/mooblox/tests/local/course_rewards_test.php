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

namespace local_mooblox\local;

use PHPUnit\Framework\Attributes\CoversClass;

/**
 * Tests for the per-course rewards the hub shows.
 *
 * @package    local_mooblox
 * @category   test
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(course_rewards::class)]
final class course_rewards_test extends \advanced_testcase {
    /**
     * Stored XP, level, found collectibles by kind, the course's gem count and the badges held come back.
     */
    public function test_for_course_reads_stored_rewards(): void {
        global $DB, $CFG;
        require_once($CFG->libdir . '/badgeslib.php');
        $this->resetAfterTest();
        $gen = $this->getDataGenerator();
        $course = $gen->create_course(['enablecompletion' => 1]);
        $student = $gen->create_and_enrol($course, 'student');
        $pages = [];
        foreach ([1, 2] as $i) {
            $pages[] = $gen->create_module('page', ['course' => $course->id, 'completion' => COMPLETION_TRACKING_MANUAL]);
        }
        $section = (int) get_fast_modinfo($course)->get_cm($pages[0]->cmid)->section;
        foreach (["gem:{$pages[0]->cmid}", "crystal:$section", "star:$section:1", 'other:1'] as $key) {
            $DB->insert_record('local_mooblox_found', ['courseid' => $course->id, 'userid' => $student->id, 'itemkey' => $key,
                'timefound' => 1]);
        }
        $DB->delete_records('local_mooblox_xp', ['courseid' => $course->id, 'userid' => $student->id]);
        $DB->insert_record('local_mooblox_xp', ['courseid' => $course->id, 'userid' => $student->id, 'xp' => 160, 'level' => 2,
            'peaklevel' => 2, 'rulesversion' => 'test', 'timecomputed' => 1]);
        $badge = $gen->get_plugin_generator('core_badges')->create_badge(['type' => BADGE_TYPE_COURSE, 'courseid' => $course->id,
            'name' => 'Island champion']);
        $badge->issue($student->id, true);

        $rewards = course_rewards::for_course((int) $course->id, (int) $student->id);

        $this->assertSame(160, $rewards['xp']);
        $this->assertSame(2, $rewards['level']);
        $this->assertSame([1, 2, 1, 1], [$rewards['gems'], $rewards['gemstotal'], $rewards['crystals'], $rewards['stars']]);
        $this->assertCount(1, $rewards['trophies']);
        $this->assertSame((int) $badge->id, $rewards['trophies'][0]['badgeid']);
        $this->assertSame('Island champion', $rewards['trophies'][0]['name']);
        $this->assertStringContainsString('/badges/badgeimage/' . $badge->id . '/', $rewards['trophies'][0]['image']);
    }

    /**
     * Rewards switched off for the site leave every course at nothing earned.
     */
    public function test_for_course_none_when_rewards_off(): void {
        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course();
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        set_config('gamification', '0', 'local_mooblox');

        $this->assertSame(course_rewards::NONE, course_rewards::for_course((int) $course->id, (int) $student->id));
    }
}
