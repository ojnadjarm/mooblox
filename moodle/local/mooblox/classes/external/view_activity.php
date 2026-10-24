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
 * External function local_mooblox_view_activity.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_mooblox\external;

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;

/**
 * Marks an activity as viewed by dispatching to its module's own view function.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class view_activity extends external_api {
    /** @var array modname => [view function, instance parameter] */
    private const VIEW_FUNCTIONS = [
        'book' => ['mod_book_view_book', 'bookid'],
        'page' => ['mod_page_view_page', 'pageid'],
        'resource' => ['mod_resource_view_resource', 'resourceid'],
        'url' => ['mod_url_view_url', 'urlid'],
    ];

    /**
     * Describes the parameters.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'cmid' => new external_value(PARAM_INT, 'Course module id'),
        ]);
    }

    /**
     * Calls the module view function of an allow-listed activity.
     *
     * @param int $cmid course module id
     * @return array
     */
    public static function execute(int $cmid): array {
        $params = self::validate_parameters(self::execute_parameters(), ['cmid' => $cmid]);

        [$course, $cm] = get_course_and_cm_from_cmid($params['cmid']);
        $context = \context_course::instance($course->id);
        self::validate_context($context);
        require_capability('local/mooblox:play', $context);
        if (!get_config('local_mooblox', 'enabled')) {
            throw new \moodle_exception('disabled', 'local_mooblox');
        }
        if (!isset(self::VIEW_FUNCTIONS[$cm->modname])) {
            throw new \moodle_exception('notviewable', 'local_mooblox');
        }

        [$function, $param] = self::VIEW_FUNCTIONS[$cm->modname];
        $response = external_api::call_external_function($function, [$param => $cm->instance]);
        if ($response['error']) {
            throw new \moodle_exception('generalexceptionmessage', 'error', '', $response['exception']->message);
        }
        return ['status' => (bool) $response['data']['status']];
    }

    /**
     * Describes the return value.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'status' => new external_value(PARAM_BOOL, 'Whether the view was recorded'),
        ]);
    }
}
