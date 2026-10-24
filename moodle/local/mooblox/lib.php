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
 * Library callbacks.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/**
 * Adds the rewards settings page to the course navigation for teachers who manage rewards.
 *
 * @param navigation_node $navigation course navigation node
 * @param stdClass $course course
 * @param context $context course context
 */
function local_mooblox_extend_navigation_course(navigation_node $navigation, stdClass $course, context $context): void {
    if (get_config('local_mooblox', 'gamification') === '0' || !has_capability('local/mooblox:managerewards', $context)) {
        return;
    }
    $url = new moodle_url('/local/mooblox/rewards.php', ['id' => $course->id]);
    $navigation->add(
        get_string('rewardssettings', 'local_mooblox'),
        $url,
        navigation_node::TYPE_SETTING,
        null,
        'local_mooblox_rewards',
        new pix_icon('i/settings', '')
    );
}

/**
 * Returns the user preferences the world may set for the current user.
 *
 * @return array[]
 */
function local_mooblox_user_preferences(): array {
    return [
        'local_mooblox_avatar' => [
            'type' => PARAM_RAW,
            'cleancallback' => [\local_mooblox\character::class, 'clean'],
            'null' => NULL_NOT_ALLOWED,
            'default' => '',
            'permissioncallback' => [core_user::class, 'is_current_user'],
        ],
    ];
}
