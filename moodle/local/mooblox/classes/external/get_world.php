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
 * External function local_mooblox_get_world.
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
use local_mooblox\local\world_builder;

/**
 * External function local_mooblox_get_world.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class get_world extends external_api {
    /**
     * Describes the parameters.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid' => new external_value(PARAM_INT, 'Course id'),
        ]);
    }

    /**
     * Returns the course as world data for the current user.
     *
     * @param int $courseid course id
     * @return array
     */
    public static function execute(int $courseid): array {
        global $USER;

        $params = self::validate_parameters(self::execute_parameters(), [
            'courseid' => $courseid,
        ]);

        $course = get_course($params['courseid']);
        $context = \context_course::instance($course->id);
        self::validate_context($context);
        require_capability('local/mooblox:play', $context);
        if (!get_config('local_mooblox', 'enabled')) {
            throw new \moodle_exception('disabled', 'local_mooblox');
        }

        return world_builder::build($course, $USER);
    }

    /**
     * Describes the return value.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        $dates = new external_multiple_structure(new external_single_structure([
            'label' => new external_value(PARAM_TEXT, 'Date label'),
            'timestamp' => new external_value(PARAM_INT, 'Date timestamp'),
        ]));
        $module = new external_single_structure([
            'id' => new external_value(PARAM_INT, 'Course module id'),
            'modname' => new external_value(PARAM_PLUGIN, 'Module name'),
            'name' => new external_value(PARAM_TEXT, 'Activity name'),
            'url' => new external_value(PARAM_URL, 'View URL, empty when the module has none'),
            'purpose' => new external_value(PARAM_ALPHA, 'Module purpose'),
            'icon' => new external_value(PARAM_URL, 'Module icon URL'),
            'available' => new external_value(PARAM_BOOL, 'Whether the user can open it'),
            'availableinfo' => new external_value(PARAM_RAW, 'Restriction text, empty when none'),
            'completion' => new external_value(PARAM_INT, 'Completion tracking: 0 none, 1 manual, 2 automatic'),
            'state' => new external_value(PARAM_INT, 'Overall completion state'),
            'isautomatic' => new external_value(PARAM_BOOL, 'Whether completion is automatic'),
            'dates' => $dates,
        ]);
        $section = new external_single_structure([
            'id' => new external_value(PARAM_INT, 'Section id'),
            'number' => new external_value(PARAM_INT, 'Section number'),
            'name' => new external_value(PARAM_TEXT, 'Section name'),
            'available' => new external_value(PARAM_BOOL, 'Whether the user can open it'),
            'availableinfo' => new external_value(PARAM_RAW, 'Restriction text, empty when none'),
            'modules' => new external_multiple_structure($module),
        ]);
        return new external_single_structure([
            'courseid' => new external_value(PARAM_INT, 'Course id'),
            'coursename' => new external_value(PARAM_TEXT, 'Course full name'),
            'firstname' => new external_value(PARAM_NOTAGS, 'First name of the user'),
            'sections' => new external_multiple_structure($section),
        ]);
    }
}
