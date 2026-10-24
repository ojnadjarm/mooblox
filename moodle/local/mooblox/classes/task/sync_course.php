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
 * Re-syncs every user with stored rewards or activity completions in one course (custom data: courseid).
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
        $sql = "SELECT userid FROM {local_mooblox_xp} WHERE courseid = :c1
                 UNION
                SELECT cmc.userid
                  FROM {course_modules_completion} cmc
                  JOIN {course_modules} cm ON cm.id = cmc.coursemoduleid
                 WHERE cm.course = :c2";
        $userids = $DB->get_fieldset_sql($sql, ['c1' => $courseid, 'c2' => $courseid]);
        batch_sync::run(array_map(fn($userid) => [$courseid, $userid], $userids));
    }
}
