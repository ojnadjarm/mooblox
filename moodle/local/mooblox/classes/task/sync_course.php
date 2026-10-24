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
 * Re-syncs every user with stored rewards in one course (custom data: courseid), as after a course reset.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class sync_course extends \core\task\adhoc_task {
    #[\Override]
    public function execute() {
        global $DB;
        $courseid = (int) $this->get_custom_data()->courseid;
        if (!$DB->record_exists('course', ['id' => $courseid]) || !course_switch::is_on($courseid)) {
            return;
        }
        $userids = $DB->get_fieldset('local_mooblox_xp', 'userid', ['courseid' => $courseid]);
        batch_sync::run(array_map(fn($userid) => [$courseid, $userid], $userids));
    }
}
