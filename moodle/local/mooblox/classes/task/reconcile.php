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

namespace local_mooblox\task;

use local_mooblox\rewards\batch_sync;
use local_mooblox\rewards\course_switch;

/**
 * Nightly re-sync of every user active in a course in the last 7 days.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class reconcile extends \core\task\scheduled_task {
    /** How far back a user counts as active. */
    const ACTIVE = 7 * DAYSECS;

    #[\Override]
    public function get_name() {
        return get_string('task_reconcile', 'local_mooblox');
    }

    #[\Override]
    public function execute() {
        global $DB;
        $sql = "SELECT ula.id, ula.courseid, ula.userid
                  FROM {user_lastaccess} ula
                  JOIN {user} u ON u.id = ula.userid AND u.deleted = 0
                 WHERE ula.timeaccess >= :since AND ula.courseid > :siteid
              ORDER BY ula.courseid, ula.userid";
        $params = ['since' => time() - self::ACTIVE, 'siteid' => SITEID];
        $on = [];
        $pairs = [];
        foreach ($DB->get_records_sql($sql, $params) as $row) {
            $on[$row->courseid] ??= course_switch::is_on((int) $row->courseid);
            if ($on[$row->courseid]) {
                $pairs[] = [$row->courseid, $row->userid];
            }
        }
        mtrace('local_mooblox reconcile: ' . count($pairs) . ' users, ' . batch_sync::run($pairs) . ' changes');
    }
}
