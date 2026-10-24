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

namespace local_mooblox\external;

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use local_mooblox\local\access;
use local_mooblox\rewards\collector;
use local_mooblox\rewards\course_switch;

/**
 * External function local_mooblox_claim_collectible.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class claim_collectible extends external_api {
    /**
     * Describes the parameters.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid' => new external_value(PARAM_INT, 'Course id'),
            'key' => new external_value(PARAM_RAW_TRIMMED, 'Collectible key, e.g. gem:12'),
        ]);
    }

    /**
     * Picks up an unlocked collectible.
     *
     * @param int $courseid course id
     * @param string $key collectible key
     * @return array
     */
    public static function execute(int $courseid, string $key): array {
        global $USER;
        $params = self::validate_parameters(self::execute_parameters(), ['courseid' => $courseid, 'key' => $key]);
        $context = \context_course::instance($params['courseid']);
        self::validate_context($context);
        access::require_play($context);
        if (!course_switch::is_on($params['courseid'])) {
            throw new \moodle_exception('rewardsoff', 'local_mooblox');
        }
        $found = collector::claim($params['courseid'], $USER->id, $params['key']);
        return ['key' => $params['key'], 'found' => $found];
    }

    /**
     * Describes the return value.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'key' => new external_value(PARAM_RAW, 'Collectible key'),
            'found' => new external_value(PARAM_INT, 'Collectibles found in the course'),
        ]);
    }
}
