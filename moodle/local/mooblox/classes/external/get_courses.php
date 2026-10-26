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
 * External function local_mooblox_get_courses.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_mooblox\external;

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_multiple_structure;
use core_external\external_single_structure;
use core_external\external_value;
use local_mooblox\local\course_list;

/**
 * External function local_mooblox_get_courses.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class get_courses extends external_api {
    /**
     * Describes the parameters.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([]);
    }

    /**
     * Returns the current user's courses where Mooblox is available.
     *
     * @return array
     */
    public static function execute(): array {
        global $USER;
        self::validate_context(\context_system::instance());
        if (!get_config('local_mooblox', 'enabled')) {
            throw new \moodle_exception('disabled', 'local_mooblox');
        }
        return course_list::for_user($USER->id);
    }

    /**
     * Describes the return value.
     *
     * @return external_multiple_structure
     */
    public static function execute_returns(): external_multiple_structure {
        return new external_multiple_structure(new external_single_structure([
            'id' => new external_value(PARAM_INT, 'Course id'),
            'fullname' => new external_value(PARAM_TEXT, 'Course name'),
            'summary' => new external_value(PARAM_TEXT, 'Short plain-text summary'),
            'image' => new external_value(PARAM_URL, 'Course image URL, empty when none'),
            'progress' => new external_value(PARAM_INT, 'Activities done in percent, -1 when completion is not tracked'),
            'completed' => new external_value(PARAM_BOOL, 'Whether the course or all its tracked activities are done'),
            'lastaccess' => new external_value(PARAM_INT, 'Last visit to the course, 0 when never'),
            'url' => new external_value(PARAM_URL, 'URL of the course world'),
            'xp' => new external_value(PARAM_INT, 'XP earned in the course'),
            'level' => new external_value(PARAM_INT, 'Level reached in the course'),
            'gems' => new external_value(PARAM_INT, 'Gems found in the course'),
            'gemstotal' => new external_value(PARAM_INT, 'Gems the course holds'),
            'crystals' => new external_value(PARAM_INT, 'Crystals found in the course'),
            'stars' => new external_value(PARAM_INT, 'Stars found in the course'),
            'trophies' => new external_multiple_structure(new external_single_structure([
                'badgeid' => new external_value(PARAM_INT, 'Badge id'),
                'name' => new external_value(PARAM_TEXT, 'Badge name'),
                'image' => new external_value(PARAM_URL, 'Badge image URL'),
                'timeissued' => new external_value(PARAM_INT, 'When the badge was issued'),
            ]), 'Course badges the user holds, oldest first'),
        ]));
    }
}
