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
use core_external\external_multiple_structure;
use core_external\external_single_structure;
use core_external\external_value;
use local_mooblox\local\access;
use local_mooblox\rewards\summary;

/**
 * External function local_mooblox_get_rewards.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class get_rewards extends external_api {
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
     * Syncs and returns the current user's rewards in a course.
     *
     * @param int $courseid course id
     * @return array
     */
    public static function execute(int $courseid): array {
        global $USER;
        $params = self::validate_parameters(self::execute_parameters(), ['courseid' => $courseid]);
        $context = \context_course::instance($params['courseid']);
        self::validate_context($context);
        access::require_play($context);
        return summary::build($params['courseid'], $USER->id);
    }

    /**
     * Describes the return value.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'enabled' => new external_value(PARAM_BOOL, 'Whether rewards are on in the course'),
            'xp' => new external_value(PARAM_INT, 'XP in the course'),
            'level' => new external_value(PARAM_INT, 'Level in the course'),
            'peaklevel' => new external_value(PARAM_INT, 'Highest level reached'),
            'levelstart' => new external_value(PARAM_INT, 'XP where the current level starts'),
            'levelnext' => new external_value(PARAM_INT, 'XP where the next level starts'),
            'quests' => new external_multiple_structure(new external_single_structure([
                'id' => new external_value(PARAM_RAW, 'Quest id'),
                'kind' => new external_value(PARAM_ALPHA, 'section, video, quiz, page, badge or course'),
                'name' => new external_value(PARAM_TEXT, 'Section or badge name, empty for other kinds'),
                'text' => new external_value(PARAM_TEXT, 'Quest sentence'),
                'done' => new external_value(PARAM_INT, 'Steps done'),
                'total' => new external_value(PARAM_INT, 'Steps in total'),
                'complete' => new external_value(PARAM_BOOL, 'Whether the quest is done'),
                'reward' => new external_value(PARAM_ALPHANUMEXT, 'Item the quest unlocks, empty when none'),
            ])),
            'collectibles' => new external_multiple_structure(new external_single_structure([
                'key' => new external_value(PARAM_RAW, 'Collectible key'),
                'kind' => new external_value(PARAM_ALPHA, 'gem, crystal or star'),
                'sectionid' => new external_value(PARAM_INT, 'Section of the district it lies in'),
                'cmid' => new external_value(PARAM_INT, 'Activity of a gem, 0 otherwise'),
                'unlocked' => new external_value(PARAM_BOOL, 'Whether it shows in the world'),
                'found' => new external_value(PARAM_BOOL, 'Whether the user picked it up'),
            ])),
            'unlocks' => new external_multiple_structure(new external_value(PARAM_ALPHANUMEXT, 'Unlocked item id')),
            'look' => self::look_structure(),
            'trophies' => new external_multiple_structure(new external_single_structure([
                'badgeid' => new external_value(PARAM_INT, 'Badge id'),
                'name' => new external_value(PARAM_TEXT, 'Badge name'),
                'image' => new external_value(PARAM_URL, 'Badge image URL'),
                'timeissued' => new external_value(PARAM_INT, 'When the badge was issued'),
            ])),
        ]);
    }

    /**
     * Describes the worn items.
     *
     * @return external_single_structure
     */
    public static function look_structure(): external_single_structure {
        return new external_single_structure([
            'hat' => new external_value(PARAM_ALPHANUMEXT, 'Hat id, empty when none'),
            'outfit' => new external_value(PARAM_ALPHANUMEXT, 'Outfit id, empty when none'),
            'pet' => new external_value(PARAM_ALPHANUMEXT, 'Pet id, empty when none'),
        ]);
    }
}
