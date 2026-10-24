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

use local_mooblox\rewards\course_switch;
use local_mooblox\rewards\moodle_fact_source;
use local_mooblox\rewards\reconciler;

/**
 * Syncs the rewards of one user in one course (custom data: courseid, userid).
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class sync_user extends \core\task\adhoc_task {
    #[\Override]
    public function execute() {
        global $DB;
        $data = $this->get_custom_data();
        $courseid = (int) $data->courseid;
        $userid = (int) $data->userid;
        $exists = $DB->record_exists('course', ['id' => $courseid])
            && $DB->record_exists('user', ['id' => $userid, 'deleted' => 0]);
        if (!$exists || !course_switch::is_on($courseid)) {
            return;
        }
        (new reconciler(new moodle_fact_source()))->sync($courseid, $userid);
    }
}
