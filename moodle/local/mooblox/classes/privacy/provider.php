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
 * Privacy provider.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_mooblox\privacy;

use core_privacy\local\metadata\collection;
use core_privacy\local\request\approved_contextlist;
use core_privacy\local\request\approved_userlist;
use core_privacy\local\request\contextlist;
use core_privacy\local\request\userlist;
use core_privacy\local\request\writer;

/**
 * Privacy provider for the avatar preference, the only personal data the plugin stores.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class provider implements
    \core_privacy\local\metadata\provider,
    \core_privacy\local\request\core_userlist_provider,
    \core_privacy\local\request\plugin\provider,
    \core_privacy\local\request\user_preference_provider {
    /** Avatar preference name. */
    const AVATAR = 'local_mooblox_avatar';

    /**
     * Describes the stored preference.
     *
     * @param collection $collection collection to add to
     * @return collection
     */
    public static function get_metadata(collection $collection): collection {
        $collection->add_user_preference(self::AVATAR, 'privacy:metadata:preference:avatar');
        return $collection;
    }

    /**
     * Exports the avatar preference of a user.
     *
     * @param int $userid user id
     */
    public static function export_user_preferences(int $userid) {
        $avatar = get_user_preferences(self::AVATAR, null, $userid);
        if ($avatar !== null) {
            $description = get_string('privacy:metadata:preference:avatar', 'local_mooblox');
            writer::export_user_preference('local_mooblox', self::AVATAR, $avatar, $description);
        }
    }

    /**
     * Returns the user context when the user has an avatar preference.
     *
     * @param int $userid user id
     * @return contextlist
     */
    public static function get_contexts_for_userid(int $userid): contextlist {
        $contextlist = new contextlist();
        if (get_user_preferences(self::AVATAR, null, $userid) !== null) {
            $contextlist->add_user_context($userid);
        }
        return $contextlist;
    }

    /**
     * Adds the owner of a user context when they have an avatar preference.
     *
     * @param userlist $userlist list to fill
     */
    public static function get_users_in_context(userlist $userlist) {
        $context = $userlist->get_context();
        if ($context->contextlevel == CONTEXT_USER && get_user_preferences(self::AVATAR, null, $context->instanceid) !== null) {
            $userlist->add_user($context->instanceid);
        }
    }

    /**
     * Nothing beyond the preference, which export_user_preferences writes.
     *
     * @param approved_contextlist $contextlist approved contexts
     */
    public static function export_user_data(approved_contextlist $contextlist) {
    }

    /**
     * Deletes the avatar preference of the owner of a user context.
     *
     * @param \context $context context to delete in
     */
    public static function delete_data_for_all_users_in_context(\context $context) {
        if ($context->contextlevel == CONTEXT_USER) {
            unset_user_preference(self::AVATAR, $context->instanceid);
        }
    }

    /**
     * Deletes the avatar preference of the user when their user context is approved.
     *
     * @param approved_contextlist $contextlist approved contexts
     */
    public static function delete_data_for_user(approved_contextlist $contextlist) {
        foreach ($contextlist->get_contexts() as $context) {
            if ($context->contextlevel == CONTEXT_USER && $context->instanceid == $contextlist->get_user()->id) {
                unset_user_preference(self::AVATAR, $context->instanceid);
            }
        }
    }

    /**
     * Deletes the avatar preference of the approved users of a user context.
     *
     * @param approved_userlist $userlist approved users
     */
    public static function delete_data_for_users(approved_userlist $userlist) {
        $context = $userlist->get_context();
        if ($context->contextlevel == CONTEXT_USER && in_array($context->instanceid, $userlist->get_userids())) {
            unset_user_preference(self::AVATAR, $context->instanceid);
        }
    }
}
