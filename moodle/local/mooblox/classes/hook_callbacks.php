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
 * Hook callbacks for local_mooblox.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_mooblox;

/**
 * Hook callbacks for local_mooblox.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class hook_callbacks {
    /**
     * Adds the MOOBLOX tab after the course home tab for users who may play.
     *
     * @param \core\hook\navigation\secondary_extend $hook
     */
    public static function secondary_extend(
        \core\hook\navigation\secondary_extend $hook
    ): void {
        global $PAGE, $SITE;

        $course = $PAGE->course;
        if ($course->id == $SITE->id || !get_config('local_mooblox', 'enabled')) {
            return;
        }
        if (!has_capability('local/mooblox:play', \context_course::instance($course->id))) {
            return;
        }
        $view = $hook->get_secondaryview();
        $node = \navigation_node::create(
            get_string('pluginname', 'local_mooblox'),
            new \moodle_url('/local/mooblox/play.php', ['id' => $course->id]),
            \navigation_node::TYPE_CUSTOM,
            null,
            'local_mooblox'
        );
        $keys = $view->children->get_key_list();
        $after = array_search('coursehome', $keys, true);
        $view->add_node($node, $after === false ? null : ($keys[$after + 1] ?? null));
    }
}
