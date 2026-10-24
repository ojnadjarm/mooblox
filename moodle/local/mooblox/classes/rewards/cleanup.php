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

/**
 * Deletes the rewards rows of a deleted course or user; unlocks are global per user and outlive a course.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class cleanup {
    /** Tables keyed by course. */
    const COURSE_TABLES = ['local_mooblox_course', 'local_mooblox_ledger', 'local_mooblox_xp', 'local_mooblox_day',
        'local_mooblox_found', 'local_mooblox_goal'];

    /** Tables keyed by user. */
    const USER_TABLES = ['local_mooblox_ledger', 'local_mooblox_xp', 'local_mooblox_day', 'local_mooblox_unlock',
        'local_mooblox_found'];

    /**
     * Deletes every rewards row of a course.
     *
     * @param int $courseid course id
     */
    public static function course(int $courseid): void {
        global $DB;
        foreach (self::COURSE_TABLES as $table) {
            $DB->delete_records($table, ['courseid' => $courseid]);
        }
    }

    /**
     * Deletes every rewards row of a user.
     *
     * @param int $userid user id
     */
    public static function user(int $userid): void {
        global $DB;
        foreach (self::USER_TABLES as $table) {
            $DB->delete_records($table, ['userid' => $userid]);
        }
    }
}
