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
 * Tells whether rewards are on for a course: the site switches, then the course row (no row or null means on).
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class course_switch {
    /**
     * Whether rewards are on in a course.
     *
     * @param int $courseid course id
     * @return bool
     */
    public static function is_on(int $courseid): bool {
        global $DB;
        $siteon = get_config('local_mooblox', 'enabled') && get_config('local_mooblox', 'gamification') !== '0';
        if ($courseid <= SITEID || !$siteon) {
            return false;
        }
        $enabled = $DB->get_field('local_mooblox_course', 'enabled', ['courseid' => $courseid]);
        if ($enabled === false || $enabled === null) {
            return get_config('local_mooblox', 'rewardsdefault') !== '0';
        }
        return (bool) $enabled;
    }
}
