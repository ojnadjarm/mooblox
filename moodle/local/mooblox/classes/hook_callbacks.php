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
     * Adds the Mooblox hub to the primary navigation for logged-in users.
     *
     * @param \core\hook\navigation\primary_extend $hook
     */
    public static function primary_extend(
        \core\hook\navigation\primary_extend $hook
    ): void {
        if (!isloggedin() || isguestuser() || !get_config('local_mooblox', 'enabled')) {
            return;
        }
        $hook->get_primaryview()->add(
            get_string('pluginname', 'local_mooblox'),
            new \moodle_url('/local/mooblox/index.php'),
            \navigation_node::TYPE_ROOTNODE,
            null,
            'local_mooblox'
        );
    }

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

    /**
     * Switches pages framed by the world to the embedded layout.
     *
     * @param \core\hook\output\before_http_headers $hook
     */
    public static function before_http_headers(
        \core\hook\output\before_http_headers $hook
    ): void {
        global $PAGE, $SESSION;

        if (local\embed_detector::is_embedded($_SERVER, !empty($SESSION->local_mooblox_play))) {
            $PAGE->set_pagelayout('embedded');
            $PAGE->add_body_class('local-mooblox-framed');
            if ($PAGE->cm && $PAGE->cm->completion == COMPLETION_TRACKING_MANUAL) {
                // The panel bar has the tick; Moodle's needs the page heading the embedded layout lacks.
                $PAGE->activityheader->set_hidecompletion(true);
            }
        }
    }

    /**
     * Queues a rewards sync for the user whose activity completion changed, bulk updates included.
     *
     * @param \core_completion\hook\after_cm_completion_updated $hook
     */
    public static function after_cm_completion_updated(
        \core_completion\hook\after_cm_completion_updated $hook
    ): void {
        rewards\sync_queue::user((int) $hook->cm->course, (int) $hook->data->userid);
    }
}
