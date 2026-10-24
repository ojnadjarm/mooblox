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

use local_mooblox\task\sync_course;
use local_mooblox\task\sync_user;

/**
 * Queues deduplicated background syncs of a user or a whole course when rewards are on.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class sync_queue {
    /**
     * Queues a sync of one user in one course unless the same one is already waiting.
     *
     * @param int $courseid course id
     * @param int $userid user id
     */
    public static function user(int $courseid, int $userid): void {
        if ($userid <= 0 || !course_switch::is_on($courseid)) {
            return;
        }
        $task = new sync_user();
        $task->set_custom_data(['courseid' => $courseid, 'userid' => $userid]);
        \core\task\manager::queue_adhoc_task($task, true);
    }

    /**
     * Queues a re-sync of every user with stored rewards in a course unless one is already waiting.
     *
     * @param int $courseid course id
     */
    public static function course(int $courseid): void {
        if (!course_switch::is_on($courseid)) {
            return;
        }
        $task = new sync_course();
        $task->set_custom_data(['courseid' => $courseid]);
        \core\task\manager::queue_adhoc_task($task, true);
    }
}
