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
}
