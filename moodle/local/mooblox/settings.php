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
 * Plugin administration settings.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

if ($hassiteconfig) {
    $settings = new admin_settingpage('local_mooblox', get_string('pluginname', 'local_mooblox'));
    $ADMIN->add('localplugins', $settings);

    if ($ADMIN->fulltree) {
        $settings->add(new admin_setting_configcheckbox(
            'local_mooblox/enabled',
            get_string('enabled', 'local_mooblox'),
            get_string('enabled_desc', 'local_mooblox'),
            1
        ));
        $settings->add(new admin_setting_configcheckbox(
            'local_mooblox/gamification',
            get_string('gamification', 'local_mooblox'),
            get_string('gamification_desc', 'local_mooblox'),
            1
        ));
        $settings->add(new admin_setting_configcheckbox(
            'local_mooblox/rewardsdefault',
            get_string('rewardsdefault', 'local_mooblox'),
            get_string('rewardsdefault_desc', 'local_mooblox'),
            1
        ));
    }
}
