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

use core\event\base;

/**
 * Event observers that queue rewards syncs and delete the rows of deleted courses and users.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class observer {
    /**
     * Queues a sync for a completion, grade, badge or course completion event.
     *
     * @param base $event the event
     */
    public static function fact_changed(base $event): void {
        sync_queue::user((int) $event->courseid, (int) $event->relateduserid);
    }

    /**
     * Deletes the rewards of a deleted course.
     *
     * @param \core\event\course_deleted $event the event
     */
    public static function course_deleted(\core\event\course_deleted $event): void {
        cleanup::course((int) $event->objectid);
    }

    /**
     * Deletes the rewards of a deleted user.
     *
     * @param \core\event\user_deleted $event the event
     */
    public static function user_deleted(\core\event\user_deleted $event): void {
        cleanup::user((int) $event->objectid);
    }

    /**
     * Queues a re-sync of a course whose user data was reset.
     *
     * @param \core\event\course_reset_ended $event the event
     */
    public static function course_reset_ended(\core\event\course_reset_ended $event): void {
        sync_queue::course((int) $event->courseid);
    }
}
