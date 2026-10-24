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
 * Reads and saves the rewards switches of a course (table local_mooblox_course).
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class course_settings {
    /**
     * Form values of a course; a course nobody configured shows the defaults.
     *
     * @param int $courseid course id
     * @return array enabled, manualxp, weekdays, goal, goaltarget
     */
    public static function get(int $courseid): array {
        global $DB;
        $row = $DB->get_record('local_mooblox_course', ['courseid' => $courseid]);
        return [
            'enabled' => (int) course_switch::is_on($courseid),
            'manualxp' => $row ? (int) $row->manualxp : 1,
            'weekdays' => $row ? (int) $row->weekdays : 2,
            'goal' => (int) (!$row || $row->goaltarget === null || (int) $row->goaltarget > 0),
            'goaltarget' => $row ? (int) $row->goaltarget : 0,
        ];
    }

    /**
     * Saves the switches; a goal on with target 0 uses the automatic target.
     *
     * @param int $courseid course id
     * @param \stdClass $data form data
     */
    public static function save(int $courseid, \stdClass $data): void {
        global $DB;
        $target = (int) $data->goaltarget;
        $record = (object) [
            'courseid' => $courseid,
            'enabled' => (int) $data->enabled,
            'manualxp' => (int) $data->manualxp,
            'weekdays' => min(5, max(1, (int) $data->weekdays)),
            'goaltarget' => $data->goal ? ($target > 0 ? $target : null) : 0,
            'timemodified' => time(),
        ];
        $id = $DB->get_field('local_mooblox_course', 'id', ['courseid' => $courseid]);
        if ($id) {
            $record->id = $id;
            $DB->update_record('local_mooblox_course', $record);
        } else {
            $DB->insert_record('local_mooblox_course', $record);
        }
    }
}
