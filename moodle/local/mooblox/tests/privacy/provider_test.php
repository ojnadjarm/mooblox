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
 * Tests for the privacy provider.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_mooblox\privacy;

use core_privacy\local\request\approved_contextlist;
use core_privacy\local\request\approved_userlist;
use core_privacy\local\request\userlist;
use core_privacy\local\request\writer;
use PHPUnit\Framework\Attributes\CoversClass;

/**
 * Tests for the privacy provider.
 *
 * @package    local_mooblox
 * @category   test
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(provider::class)]
final class provider_test extends \core_privacy\tests\provider_testcase {
    /**
     * The avatar preference is exported, then deleted for the requesting user only.
     */
    public function test_export_and_delete_avatar_preference(): void {
        $this->resetAfterTest();
        $user = $this->getDataGenerator()->create_user();
        $other = $this->getDataGenerator()->create_user();
        set_user_preference(provider::AVATAR, 'blocky2-red', $user);
        set_user_preference(provider::AVATAR, 'blocky1-blue', $other);

        $contextlist = provider::get_contexts_for_userid($user->id);
        $this->assertEquals([\context_user::instance($user->id)->id], array_values($contextlist->get_contextids()));

        provider::export_user_preferences($user->id);
        $prefs = writer::with_context(\context_system::instance())->get_user_preferences('local_mooblox');
        $this->assertSame('blocky2-red', $prefs->{provider::AVATAR}->value);

        provider::delete_data_for_user(new approved_contextlist($user, 'local_mooblox', $contextlist->get_contextids()));
        $this->assertNull(get_user_preferences(provider::AVATAR, null, $user->id));
        $this->assertSame('blocky1-blue', get_user_preferences(provider::AVATAR, null, $other->id));
        $this->assertCount(0, provider::get_contexts_for_userid($user->id));
    }

    /**
     * Gives a user XP, a ledger row, a day and a found gem in a course, plus an unlock and a look.
     *
     * @param \stdClass $course course
     * @param \stdClass $user user
     */
    private function add_rewards(\stdClass $course, \stdClass $user): void {
        global $DB;
        $ids = ['courseid' => $course->id, 'userid' => $user->id];
        $DB->insert_record('local_mooblox_xp', $ids + ['xp' => 60, 'level' => 1, 'peaklevel' => 1, 'rulesversion' => 'v',
            'timecomputed' => time()]);
        $DB->insert_record('local_mooblox_ledger', $ids + ['source' => 'badge', 'sourceid' => 7, 'kind' => 'earned',
            'xp' => 25, 'timeearned' => time()]);
        $DB->insert_record('local_mooblox_day', $ids + ['day' => 20261024]);
        $DB->insert_record('local_mooblox_found', $ids + ['itemkey' => 'gem:1', 'timefound' => time()]);
        $DB->insert_record('local_mooblox_unlock', ['userid' => $user->id, 'itemkey' => 'hat:cap', 'courseid' => $course->id,
            'timeunlocked' => time()]);
        set_user_preference(provider::LOOK, 'hat:cap', $user);
    }

    /**
     * Counts the rewards rows of a user across the 5 tables.
     *
     * @param \stdClass $user user
     * @return int
     */
    private function count_rows(\stdClass $user): int {
        global $DB;
        $count = 0;
        foreach (array_merge(array_keys(provider::COURSE_TABLES), [provider::UNLOCK]) as $table) {
            $count += $DB->count_records($table, ['userid' => $user->id]);
        }
        return $count;
    }

    /**
     * Course rewards export to the course context, unlocks to the user context, the look as a preference.
     */
    public function test_export_rewards(): void {
        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course();
        $user = $this->getDataGenerator()->create_user();
        $this->add_rewards($course, $user);
        $coursecontext = \context_course::instance($course->id);
        $usercontext = \context_user::instance($user->id);

        $contextlist = provider::get_contexts_for_userid($user->id);
        $this->assertEqualsCanonicalizing([$coursecontext->id, $usercontext->id], $contextlist->get_contextids());
        provider::export_user_data(new approved_contextlist($user, 'local_mooblox', $contextlist->get_contextids()));
        provider::export_user_preferences($user->id);

        $data = writer::with_context($coursecontext)->get_data(['MOOBLOX']);
        $this->assertEquals(60, $data->xp->xp);
        $this->assertSame('badge', $data->ledger[0]['source']);
        $this->assertEquals([20261024], $data->days);
        $this->assertSame('gem:1', $data->found[0]['itemkey']);
        $this->assertSame('hat:cap', writer::with_context($usercontext)->get_data(['MOOBLOX'])->unlocks[0]['itemkey']);
        $prefs = writer::with_context(\context_system::instance())->get_user_preferences('local_mooblox');
        $this->assertSame('hat:cap', $prefs->{provider::LOOK}->value);
    }

    /**
     * Deleting by context, by user and by userlist removes only the targeted rows.
     */
    public function test_delete_by_context_user_and_userlist(): void {
        $this->resetAfterTest();
        $gen = $this->getDataGenerator();
        $course = $gen->create_course();
        [$a, $b, $c] = [$gen->create_user(), $gen->create_user(), $gen->create_user()];
        foreach ([$a, $b, $c] as $user) {
            $this->add_rewards($course, $user);
        }
        $coursecontext = \context_course::instance($course->id);

        $userlist = new userlist($coursecontext, 'local_mooblox');
        provider::get_users_in_context($userlist);
        $this->assertEqualsCanonicalizing([$a->id, $b->id, $c->id], $userlist->get_userids());

        $contextlist = provider::get_contexts_for_userid($a->id);
        provider::delete_data_for_user(new approved_contextlist($a, 'local_mooblox', $contextlist->get_contextids()));
        $this->assertSame(0, $this->count_rows($a));
        $this->assertNull(get_user_preferences(provider::LOOK, null, $a->id));
        $this->assertSame(5, $this->count_rows($b));

        provider::delete_data_for_users(new approved_userlist($coursecontext, 'local_mooblox', [$b->id]));
        $this->assertSame(1, $this->count_rows($b));
        $this->assertSame(5, $this->count_rows($c));

        provider::delete_data_for_all_users_in_context($coursecontext);
        $this->assertSame(1, $this->count_rows($c));
        provider::delete_data_for_all_users_in_context(\context_user::instance($c->id));
        $this->assertSame(0, $this->count_rows($c));
    }
}
