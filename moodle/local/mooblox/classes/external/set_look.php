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
use local_mooblox\rewards\wardrobe;

/**
 * External function local_mooblox_set_look.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class set_look extends external_api {
    /**
     * Describes the parameters.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'hat' => new external_value(PARAM_ALPHANUMEXT, 'Hat id, empty for none', VALUE_DEFAULT, ''),
            'outfit' => new external_value(PARAM_ALPHANUMEXT, 'Outfit id, empty for none', VALUE_DEFAULT, ''),
            'pet' => new external_value(PARAM_ALPHANUMEXT, 'Pet id, empty for none', VALUE_DEFAULT, ''),
        ]);
    }

    /**
     * Wears unlocked items.
     *
     * @param string $hat hat id
     * @param string $outfit outfit id
     * @param string $pet pet id
     * @return array the saved look
     */
    public static function execute(string $hat = '', string $outfit = '', string $pet = ''): array {
        global $USER;
        $params = self::validate_parameters(self::execute_parameters(), ['hat' => $hat, 'outfit' => $outfit, 'pet' => $pet]);
        self::validate_context(\context_user::instance($USER->id));
        return wardrobe::set_look($USER->id, $params);
    }

    /**
     * Describes the return value.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return get_rewards::look_structure();
    }
}
