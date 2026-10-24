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
require_once($CFG->libdir . '/completionlib.php');
require_once($CFG->libdir . '/gradelib.php');
require_once($CFG->libdir . '/badgeslib.php');

/**
 * Facts from Moodle's completion, gradebook and badge tables, one query each.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class moodle_fact_source implements fact_source {
    #[\Override]
    public function load(int $courseid, int $userid): facts {
        return new facts(
            $courseid,
            $this->completions($courseid, $userid),
            $this->grades($courseid, $userid),
            $this->badges($courseid, $userid),
            $this->coursecompleted($courseid, $userid),
        );
    }

    /**
     * Activity completions with their completion mode.
     *
     * @param int $courseid course id
     * @param int $userid user id
     * @return array cmid => ['state', 'mode', 'time']
     */
    private function completions(int $courseid, int $userid): array {
        global $DB;
        $cms = get_fast_modinfo($courseid)->get_cms();
        $sql = "SELECT cmc.coursemoduleid, cmc.completionstate, cmc.timemodified
                  FROM {course_modules_completion} cmc
                  JOIN {course_modules} cm ON cm.id = cmc.coursemoduleid
                 WHERE cm.course = :courseid AND cmc.userid = :userid";
        $result = [];
        foreach ($DB->get_records_sql($sql, ['courseid' => $courseid, 'userid' => $userid]) as $row) {
            $cm = $cms[$row->coursemoduleid] ?? null;
            if (!$cm || $cm->completion == COMPLETION_TRACKING_NONE || $cm->deletioninprogress) {
                continue;
            }
            $result[(int) $row->coursemoduleid] = [
                'state' => (int) $row->completionstate,
                'mode' => self::mode($cm),
                'time' => (int) $row->timemodified,
            ];
        }
        return $result;
    }

    /**
     * How a course module gets completed.
     *
     * @param \cm_info $cm course module
     * @return string facts::AUTO, VIEW or MANUAL
     */
    private static function mode(\cm_info $cm): string {
        if ($cm->completion == COMPLETION_TRACKING_MANUAL) {
            return facts::MANUAL;
        }
        $viewonly = $cm->completionview && $cm->completiongradeitemnumber === null && !$cm->completionpassgrade
            && empty($cm->customdata['customcompletionrules']);
        return $viewonly ? facts::VIEW : facts::AUTO;
    }

    /**
     * Visible final grades of activity grade items as percentages.
     *
     * @param int $courseid course id
     * @param int $userid user id
     * @return array grade item id => ['percent', 'time']
     */
    private function grades(int $courseid, int $userid): array {
        global $DB;
        $sql = "SELECT gi.id, gg.finalgrade, gi.grademin, gi.grademax, gg.timemodified, gg.timecreated
                  FROM {grade_grades} gg
                  JOIN {grade_items} gi ON gi.id = gg.itemid
                 WHERE gi.courseid = :courseid AND gg.userid = :userid AND gi.itemtype = 'mod'
                       AND gi.gradetype = :gradetype AND gi.grademax > gi.grademin AND gg.finalgrade IS NOT NULL
                       AND gi.hidden = 0 AND gg.hidden = 0";
        $params = ['courseid' => $courseid, 'userid' => $userid, 'gradetype' => GRADE_TYPE_VALUE];
        $result = [];
        foreach ($DB->get_records_sql($sql, $params) as $row) {
            $result[(int) $row->id] = [
                'percent' => 100 * ($row->finalgrade - $row->grademin) / ($row->grademax - $row->grademin),
                'time' => (int) ($row->timemodified ?? $row->timecreated),
            ];
        }
        return $result;
    }

    /**
     * Course badges the user holds.
     *
     * @param int $courseid course id
     * @param int $userid user id
     * @return array badge id => time issued
     */
    private function badges(int $courseid, int $userid): array {
        global $DB;
        $sql = "SELECT b.id, bi.dateissued
                  FROM {badge_issued} bi
                  JOIN {badge} b ON b.id = bi.badgeid
                 WHERE b.courseid = :courseid AND b.type = :type AND bi.userid = :userid";
        $params = ['courseid' => $courseid, 'type' => BADGE_TYPE_COURSE, 'userid' => $userid];
        return array_map('intval', $DB->get_records_sql_menu($sql, $params));
    }

    /**
     * Time the user completed the course.
     *
     * @param int $courseid course id
     * @param int $userid user id
     * @return int|null null when not completed
     */
    private function coursecompleted(int $courseid, int $userid): ?int {
        global $DB;
        $select = 'course = :course AND userid = :userid AND timecompleted IS NOT NULL';
        $time = $DB->get_field_select('course_completions', 'timecompleted', $select, ['course' => $courseid, 'userid' => $userid]);
        return $time ? (int) $time : null;
    }
}
