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

namespace local_mooblox\rewards;

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->libdir . '/badgeslib.php');
require_once($CFG->libdir . '/completionlib.php');

/**
 * Reads the shape of a course from Moodle: tracked visible activities, their kind, pass grades, badges.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class moodle_course_shape {
    /** @var string[] Hosts of YouTube links, as the client's player accepts them. */
    private const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtube-nocookie.com'];

    /**
     * Loads the shape.
     *
     * @param int $courseid course id
     * @return course_shape
     */
    public static function load(int $courseid): course_shape {
        global $DB;
        $modinfo = get_fast_modinfo($courseid);
        $videos = self::videos($courseid);
        $passgrades = array_flip(self::pass_grade_quizzes($courseid));
        $sections = [];
        foreach ($modinfo->get_section_info_all() as $section) {
            $cms = [];
            foreach ($modinfo->sections[$section->section] ?? [] as $cmid) {
                $cm = $modinfo->get_cm($cmid);
                if ($cm->completion == COMPLETION_TRACKING_NONE || !$cm->visible || $cm->deletioninprogress) {
                    continue;
                }
                $cms[(int) $cmid] = ['kind' => self::kind($cm, $videos), 'passgrade' => isset($passgrades[$cmid]) && $cm->completionpassgrade];
            }
            $sections[(int) $section->id] = ['name' => get_section_name($courseid, $section), 'cms' => $cms];
        }
        $course = $modinfo->get_course();
        $completion = $course->enablecompletion && $DB->record_exists('course_completion_criteria', ['course' => $courseid]);
        return new course_shape($courseid, $sections, self::badges($courseid), (bool) $completion);
    }

    /**
     * Kind of an activity for quests.
     *
     * @param \cm_info $cm course module
     * @param array $videos cmid => true for video resources and YouTube links
     * @return string
     */
    private static function kind(\cm_info $cm, array $videos): string {
        return match (true) {
            isset($videos[$cm->id]) => course_shape::VIDEO,
            $cm->modname === 'quiz' => course_shape::QUIZ,
            in_array($cm->modname, ['page', 'book']) => course_shape::PAGE,
            default => course_shape::OTHER,
        };
    }

    /**
     * Resources with a video file and URLs to YouTube.
     *
     * @param int $courseid course id
     * @return array cmid => true
     */
    private static function videos(int $courseid): array {
        global $DB;
        $sql = "SELECT DISTINCT cm.id
                  FROM {course_modules} cm
                  JOIN {modules} m ON m.id = cm.module AND m.name = 'resource'
                  JOIN {context} ctx ON ctx.instanceid = cm.id AND ctx.contextlevel = :level
                  JOIN {files} f ON f.contextid = ctx.id AND f.component = 'mod_resource' AND f.filearea = 'content'
                 WHERE cm.course = :courseid AND " . $DB->sql_like('f.mimetype', ':video');
        $ids = $DB->get_fieldset_sql($sql, ['level' => CONTEXT_MODULE, 'courseid' => $courseid, 'video' => 'video/%']);
        $sql = "SELECT cm.id, u.externalurl
                  FROM {course_modules} cm
                  JOIN {modules} m ON m.id = cm.module AND m.name = 'url'
                  JOIN {url} u ON u.id = cm.instance
                 WHERE cm.course = :courseid";
        foreach ($DB->get_records_sql_menu($sql, ['courseid' => $courseid]) as $cmid => $link) {
            if (in_array(strtolower((string) parse_url($link, PHP_URL_HOST)), self::YOUTUBE_HOSTS)) {
                $ids[] = $cmid;
            }
        }
        return array_fill_keys(array_map('intval', $ids), true);
    }

    /**
     * Quizzes whose grade item has a pass grade (pass quizzes when their completion also needs it).
     *
     * @param int $courseid course id
     * @return int[] cmids
     */
    private static function pass_grade_quizzes(int $courseid): array {
        global $DB;
        $sql = "SELECT cm.id
                  FROM {course_modules} cm
                  JOIN {modules} m ON m.id = cm.module AND m.name = 'quiz'
                  JOIN {grade_items} gi ON gi.courseid = cm.course AND gi.itemtype = 'mod' AND gi.itemmodule = 'quiz'
                       AND gi.iteminstance = cm.instance AND gi.itemnumber = 0
                 WHERE cm.course = :courseid AND gi.gradepass > 0";
        return array_map('intval', $DB->get_fieldset_sql($sql, ['courseid' => $courseid]));
    }

    /**
     * Active course badges a student earns by learning (any criterion but manual award).
     *
     * @param int $courseid course id
     * @return array badge id => name
     */
    private static function badges(int $courseid): array {
        global $DB;
        [$statussql, $params] = $DB->get_in_or_equal([BADGE_STATUS_ACTIVE, BADGE_STATUS_ACTIVE_LOCKED], SQL_PARAMS_NAMED);
        [$typesql, $typeparams] = $DB->get_in_or_equal(
            [BADGE_CRITERIA_TYPE_OVERALL, BADGE_CRITERIA_TYPE_MANUAL],
            SQL_PARAMS_NAMED,
            'type',
            false
        );
        $sql = "SELECT b.id, b.name
                  FROM {badge} b
                 WHERE b.courseid = :courseid AND b.type = :coursetype AND b.status $statussql
                       AND EXISTS (SELECT 1 FROM {badge_criteria} bc WHERE bc.badgeid = b.id AND bc.criteriatype $typesql)
              ORDER BY b.id";
        $params += $typeparams + ['courseid' => $courseid, 'coursetype' => BADGE_TYPE_COURSE];
        return array_map('strval', $DB->get_records_sql_menu($sql, $params));
    }
}
