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
 * The courses a user can enter as Mooblox worlds.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_mooblox\local;

/**
 * The courses a user can enter as Mooblox worlds, with progress and rewards for the hub.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class course_list {
    /** Longest course summary, in characters. */
    const SUMMARY_LENGTH = 160;

    /**
     * Returns the user's active courses where they may play, in the site's course order (sort order, then id): a visit never moves one.
     *
     * @param int $userid user id
     * @return array[] rows of id, fullname, summary, image, progress (-1 = not tracked), completed, lastaccess, url and the
     *     course_rewards fields
     */
    public static function for_user(int $userid): array {
        global $DB;

        if (!get_config('local_mooblox', 'enabled')) {
            return [];
        }
        $courses = enrol_get_all_users_courses($userid, true, ['summary', 'summaryformat', 'enablecompletion']);
        usort($courses, fn($a, $b) => [(int) $a->sortorder, (int) $a->id] <=> [(int) $b->sortorder, (int) $b->id]);
        $lastaccess = $DB->get_records_menu('user_lastaccess', ['userid' => $userid], '', 'courseid, timeaccess');
        $rows = [];
        foreach ($courses as $course) {
            $context = \context_course::instance($course->id);
            if (!$course->visible && !has_capability('moodle/course:viewhiddencourses', $context, $userid)) {
                continue;
            }
            if (!has_capability('local/mooblox:play', $context, $userid)) {
                continue;
            }
            $progress = \core_completion\progress::get_course_progress_percentage($course, $userid);
            $progress = $progress === null ? -1 : (int) floor($progress);
            $summary = format_text((string) $course->summary, $course->summaryformat, ['context' => $context]);
            $summary = html_entity_decode(strip_tags(str_replace('<', ' <', $summary)), ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $summary = preg_replace('/\s+/u', ' ', $summary);
            $image = \core_course\external\course_summary_exporter::get_course_image($course);
            $rows[] = [
                'id' => (int) $course->id,
                'fullname' => format_string($course->fullname, true, ['context' => $context]),
                'summary' => shorten_text(trim($summary), self::SUMMARY_LENGTH),
                'image' => $image ? (string) $image : '',
                'progress' => $progress,
                'completed' => $progress === 100 || (new \completion_info($course))->is_course_complete($userid),
                'lastaccess' => (int) ($lastaccess[$course->id] ?? 0),
                'url' => (new \moodle_url('/local/mooblox/play.php', ['id' => $course->id]))->out(false),
            ] + course_rewards::for_course((int) $course->id, $userid);
        }
        return $rows;
    }
}
