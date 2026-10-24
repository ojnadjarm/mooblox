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
 * World data builder.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_mooblox\local;

use core\activity_dates;
use core_availability\info;
use core_completion\cm_completion_details;

/**
 * Builds the world DTO of a course for one user from modinfo and completion.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class world_builder {
    /**
     * Returns the course, its sections and the activities the user can see.
     *
     * @param \stdClass $course course record
     * @param \stdClass $user user record
     * @return array
     */
    public static function build(\stdClass $course, \stdClass $user): array {
        global $CFG;
        require_once($CFG->libdir . '/completionlib.php');

        $format = course_get_format($course);
        $modinfo = get_fast_modinfo($course, $user->id);
        $completioninfo = new \completion_info($course);
        $context = \context_course::instance($course->id);

        $sections = [];
        foreach ($modinfo->get_section_info_all() as $section) {
            if (!empty($section->component) || (!$section->uservisible && empty($section->availableinfo))) {
                continue;
            }
            $modules = [];
            foreach ($modinfo->sections[$section->section] ?? [] as $cmid) {
                $cm = $modinfo->get_cm($cmid);
                if (!$cm->uservisible && !$cm->is_visible_on_course_page()) {
                    continue;
                }
                $modules[] = self::module($cm, $completioninfo, $course, $user->id);
            }
            $sections[] = [
                'id' => $section->id,
                'number' => $section->section,
                'name' => $format->get_section_name($section),
                'available' => $section->uservisible,
                'availableinfo' => empty($section->availableinfo) ? '' : info::format_info($section->availableinfo, $course),
                'modules' => $modules,
            ];
        }

        return [
            'courseid' => $course->id,
            'coursename' => format_string($course->fullname, true, ['context' => $context]),
            'firstname' => $user->firstname,
            'sections' => $sections,
        ];
    }

    /**
     * Returns the DTO of one course module.
     *
     * @param \cm_info $cm course module
     * @param \completion_info $completioninfo course completion info
     * @param \stdClass $course course record
     * @param int $userid user id
     * @return array
     */
    private static function module(\cm_info $cm, \completion_info $completioninfo, \stdClass $course, int $userid): array {
        $tracking = $completioninfo->is_enabled($cm);
        $details = $tracking ? cm_completion_details::get_instance($cm, $userid, false) : null;
        $dates = [];
        foreach (activity_dates::get_dates_for_module($cm, $userid) as $date) {
            $dates[] = ['label' => $date['label'], 'timestamp' => $date['timestamp']];
        }
        return [
            'id' => $cm->id,
            'modname' => $cm->modname,
            'name' => $cm->get_formatted_name(),
            'url' => $cm->url ? $cm->url->out(false) : '',
            'purpose' => plugin_supports('mod', $cm->modname, FEATURE_MOD_PURPOSE, MOD_PURPOSE_OTHER),
            'icon' => $cm->get_icon_url()->out(false),
            'available' => $cm->uservisible,
            'availableinfo' => empty($cm->availableinfo) ? '' : info::format_info($cm->availableinfo, $course),
            'completion' => (int) $tracking,
            'state' => $details ? $details->get_overall_completion() : COMPLETION_INCOMPLETE,
            'isautomatic' => $details ? $details->is_automatic() : false,
            'dates' => $dates,
        ];
    }
}
