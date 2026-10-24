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
 * Backup of the MOOBLOX course data.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/**
 * Backs up the rewards settings of a course and, with user data, the found collectibles and learning days.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class backup_local_mooblox_plugin extends backup_local_plugin {
    /**
     * Defines the settings, found and day elements under the course.
     *
     * @return backup_plugin_element
     */
    protected function define_course_plugin_structure() {
        $plugin = $this->get_plugin_element();
        $wrapper = new backup_nested_element($this->get_recommended_name());
        $plugin->add_child($wrapper);

        $settings = new backup_nested_element('settings', ['id'], ['enabled', 'manualxp', 'goaltarget', 'weekdays',
            'timemodified']);
        $founds = new backup_nested_element('founds');
        $found = new backup_nested_element('found', ['id'], ['userid', 'itemkey', 'timefound']);
        $days = new backup_nested_element('days');
        $day = new backup_nested_element('day', ['id'], ['userid', 'day']);
        $wrapper->add_child($settings);
        $wrapper->add_child($founds);
        $founds->add_child($found);
        $wrapper->add_child($days);
        $days->add_child($day);

        $settings->set_source_table('local_mooblox_course', ['courseid' => backup::VAR_COURSEID]);
        if ($this->get_setting_value('users')) {
            $found->set_source_table('local_mooblox_found', ['courseid' => backup::VAR_COURSEID], 'id ASC');
            $day->set_source_table('local_mooblox_day', ['courseid' => backup::VAR_COURSEID], 'id ASC');
        }
        $found->annotate_ids('user', 'userid');
        $day->annotate_ids('user', 'userid');
        return $plugin;
    }
}
