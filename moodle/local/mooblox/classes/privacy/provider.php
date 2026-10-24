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
use core_privacy\local\request\transform;
use core_privacy\local\request\userlist;
use core_privacy\local\request\writer;

/**
 * Privacy provider for the rewards tables (course context, unlocks in the user context) and the two preferences.
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

    /** Worn cosmetics preference name. */
    const LOOK = 'local_mooblox_look';

    /** Per-course user tables and their personal fields. */
    const COURSE_TABLES = [
        'local_mooblox_ledger' => ['courseid', 'userid', 'source', 'sourceid', 'kind', 'xp', 'timeearned'],
        'local_mooblox_xp' => ['courseid', 'userid', 'xp', 'level', 'peaklevel', 'timecomputed'],
        'local_mooblox_day' => ['courseid', 'userid', 'day'],
        'local_mooblox_found' => ['courseid', 'userid', 'itemkey', 'timefound'],
    ];

    /** Unlock table, global per user. */
    const UNLOCK = 'local_mooblox_unlock';

    /**
     * Describes the stored tables and preferences.
     *
     * @param collection $collection collection to add to
     * @return collection
     */
    public static function get_metadata(collection $collection): collection {
        $collection->add_database_table('local_mooblox_ledger', [
            'courseid' => 'privacy:metadata:courseid',
            'userid' => 'privacy:metadata:userid',
            'source' => 'privacy:metadata:source',
            'sourceid' => 'privacy:metadata:sourceid',
            'kind' => 'privacy:metadata:kind',
            'xp' => 'privacy:metadata:xp',
            'timeearned' => 'privacy:metadata:timeearned',
        ], 'privacy:metadata:local_mooblox_ledger');
        $collection->add_database_table('local_mooblox_xp', [
            'courseid' => 'privacy:metadata:courseid',
            'userid' => 'privacy:metadata:userid',
            'xp' => 'privacy:metadata:xp',
            'level' => 'privacy:metadata:level',
            'peaklevel' => 'privacy:metadata:peaklevel',
            'timecomputed' => 'privacy:metadata:timecomputed',
        ], 'privacy:metadata:local_mooblox_xp');
        $collection->add_database_table('local_mooblox_day', [
            'courseid' => 'privacy:metadata:courseid',
            'userid' => 'privacy:metadata:userid',
            'day' => 'privacy:metadata:day',
        ], 'privacy:metadata:local_mooblox_day');
        $collection->add_database_table('local_mooblox_found', [
            'courseid' => 'privacy:metadata:courseid',
            'userid' => 'privacy:metadata:userid',
            'itemkey' => 'privacy:metadata:itemkey',
            'timefound' => 'privacy:metadata:timefound',
        ], 'privacy:metadata:local_mooblox_found');
        $collection->add_database_table('local_mooblox_unlock', [
            'userid' => 'privacy:metadata:userid',
            'itemkey' => 'privacy:metadata:itemkey',
            'courseid' => 'privacy:metadata:courseid',
            'timeunlocked' => 'privacy:metadata:timeunlocked',
        ], 'privacy:metadata:local_mooblox_unlock');
        $collection->add_user_preference(self::AVATAR, 'privacy:metadata:preference:avatar');
        $collection->add_user_preference(self::LOOK, 'privacy:metadata:preference:look');
        return $collection;
    }

    /**
     * Exports the avatar and look preferences of a user.
     *
     * @param int $userid user id
     */
    public static function export_user_preferences(int $userid) {
        foreach ([self::AVATAR => 'avatar', self::LOOK => 'look'] as $name => $key) {
            $value = get_user_preferences($name, null, $userid);
            if ($value !== null) {
                $description = get_string('privacy:metadata:preference:' . $key, 'local_mooblox');
                writer::export_user_preference('local_mooblox', $name, $value, $description);
            }
        }
    }

    /**
     * Returns the courses with rewards rows of the user, and their user context when they hold unlocks or preferences.
     *
     * @param int $userid user id
     * @return contextlist
     */
    public static function get_contexts_for_userid(int $userid): contextlist {
        $contextlist = new contextlist();
        foreach (array_keys(self::COURSE_TABLES) as $table) {
            $sql = "SELECT ctx.id
                      FROM {context} ctx
                      JOIN {" . $table . "} t ON t.courseid = ctx.instanceid AND ctx.contextlevel = :level
                     WHERE t.userid = :userid";
            $contextlist->add_from_sql($sql, ['level' => CONTEXT_COURSE, 'userid' => $userid]);
        }
        if (self::has_user_data($userid)) {
            $contextlist->add_user_context($userid);
        }
        return $contextlist;
    }

    /**
     * Adds the users with rewards rows in a course, or the owner of a user context with unlocks or preferences.
     *
     * @param userlist $userlist list to fill
     */
    public static function get_users_in_context(userlist $userlist) {
        $context = $userlist->get_context();
        if ($context instanceof \context_course) {
            foreach (array_keys(self::COURSE_TABLES) as $table) {
                $sql = "SELECT userid FROM {" . $table . "} WHERE courseid = :courseid";
                $userlist->add_from_sql('userid', $sql, ['courseid' => $context->instanceid]);
            }
        } else if ($context instanceof \context_user && self::has_user_data($context->instanceid)) {
            $userlist->add_user($context->instanceid);
        }
    }

    /**
     * Exports XP, level, ledger, learning days and found items per course, and unlocks in the user context.
     *
     * @param approved_contextlist $contextlist approved contexts
     */
    public static function export_user_data(approved_contextlist $contextlist) {
        global $DB;
        $userid = $contextlist->get_user()->id;
        $subcontext = [get_string('pluginname', 'local_mooblox')];
        foreach ($contextlist->get_contexts() as $context) {
            if ($context instanceof \context_course) {
                $ids = ['courseid' => $context->instanceid, 'userid' => $userid];
                $xp = $DB->get_record('local_mooblox_xp', $ids, 'xp, level, peaklevel');
                $cms = get_fast_modinfo($context->instanceid, $userid)->get_cms();
                $ledger = [];
                foreach ($DB->get_records('local_mooblox_ledger', $ids, 'timeearned, id') as $row) {
                    $ledger[] = [
                        'source' => $row->source,
                        'activity' => $row->source === 'cm' && isset($cms[$row->sourceid]) ? $cms[$row->sourceid]->name : null,
                        'kind' => $row->kind,
                        'xp' => $row->xp,
                        'timeearned' => transform::datetime($row->timeearned),
                    ];
                }
                $found = [];
                foreach ($DB->get_records('local_mooblox_found', $ids, 'timefound, id') as $row) {
                    $found[] = ['itemkey' => $row->itemkey, 'timefound' => transform::datetime($row->timefound)];
                }
                $data = (object) [
                    'xp' => $xp ?: null,
                    'ledger' => $ledger,
                    'days' => $DB->get_fieldset('local_mooblox_day', 'day', $ids),
                    'found' => $found,
                ];
                writer::with_context($context)->export_data($subcontext, $data);
            } else if ($context instanceof \context_user && $context->instanceid == $userid) {
                $unlocks = [];
                foreach ($DB->get_records(self::UNLOCK, ['userid' => $userid], 'timeunlocked, id') as $row) {
                    $unlocks[] = ['itemkey' => $row->itemkey, 'timeunlocked' => transform::datetime($row->timeunlocked)];
                }
                if ($unlocks) {
                    writer::with_context($context)->export_data($subcontext, (object) ['unlocks' => $unlocks]);
                }
            }
        }
    }

    /**
     * Deletes every user's rewards in a course, or the unlocks and preferences of the owner of a user context.
     *
     * @param \context $context context to delete in
     */
    public static function delete_data_for_all_users_in_context(\context $context) {
        global $DB;
        if ($context instanceof \context_course) {
            foreach (array_keys(self::COURSE_TABLES) as $table) {
                $DB->delete_records($table, ['courseid' => $context->instanceid]);
            }
        } else if ($context instanceof \context_user) {
            self::delete_user_data($context->instanceid);
        }
    }

    /**
     * Deletes the user's data in each approved context.
     *
     * @param approved_contextlist $contextlist approved contexts
     */
    public static function delete_data_for_user(approved_contextlist $contextlist) {
        global $DB;
        $userid = $contextlist->get_user()->id;
        foreach ($contextlist->get_contexts() as $context) {
            if ($context instanceof \context_course) {
                foreach (array_keys(self::COURSE_TABLES) as $table) {
                    $DB->delete_records($table, ['courseid' => $context->instanceid, 'userid' => $userid]);
                }
            } else if ($context instanceof \context_user && $context->instanceid == $userid) {
                self::delete_user_data($userid);
            }
        }
    }

    /**
     * Deletes the data of the approved users in one context.
     *
     * @param approved_userlist $userlist approved users
     */
    public static function delete_data_for_users(approved_userlist $userlist) {
        global $DB;
        $context = $userlist->get_context();
        $userids = $userlist->get_userids();
        if (!$userids) {
            return;
        }
        if ($context instanceof \context_course) {
            [$insql, $params] = $DB->get_in_or_equal($userids, SQL_PARAMS_NAMED);
            $params['courseid'] = $context->instanceid;
            foreach (array_keys(self::COURSE_TABLES) as $table) {
                $DB->delete_records_select($table, "courseid = :courseid AND userid $insql", $params);
            }
        } else if ($context instanceof \context_user && in_array($context->instanceid, $userids)) {
            self::delete_user_data($context->instanceid);
        }
    }

    /**
     * Whether the user holds unlocks or one of the preferences.
     *
     * @param int $userid user id
     * @return bool
     */
    private static function has_user_data(int $userid): bool {
        global $DB;
        return $DB->record_exists(self::UNLOCK, ['userid' => $userid])
            || get_user_preferences(self::AVATAR, null, $userid) !== null
            || get_user_preferences(self::LOOK, null, $userid) !== null;
    }

    /**
     * Deletes the unlocks and preferences of a user.
     *
     * @param int $userid user id
     */
    private static function delete_user_data(int $userid): void {
        global $DB;
        $DB->delete_records(self::UNLOCK, ['userid' => $userid]);
        unset_user_preference(self::AVATAR, $userid);
        unset_user_preference(self::LOOK, $userid);
    }
}
