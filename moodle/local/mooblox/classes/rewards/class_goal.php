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

/**
 * The weekly class goal of a course: activities the class finishes together, one shared count, never per student.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class class_goal {
    /** @var int classes smaller than this get no goal (a small class would reveal who did not help) */
    const MIN_STUDENTS = 5;

    /**
     * The goal of the week holding $now, or null when it is off or the class is too small.
     *
     * @param int $courseid course id
     * @param int $now time inside the week, server timezone (0 = now)
     * @return array|null week (yyyyww), target, progress, reached, timereached
     */
    public static function state(int $courseid, int $now = 0): ?array {
        global $DB;
        $settings = course_settings::get($courseid);
        if (!$settings['goal']) {
            return null;
        }
        $now = $now ?: time();
        $monday = (new \DateTimeImmutable('@' . $now))->setTimezone(\core_date::get_server_timezone_object())
            ->modify('monday this week')->setTime(0, 0);
        $week = (int) $monday->format('oW');
        $cache = \cache::make('local_mooblox', 'classgoal');
        $key = $courseid . '_' . $week;
        $counts = $cache->get($key);
        if ($counts === false) {
            $students = count_enrolled_users(\context_course::instance($courseid), 'moodle/course:isincompletionreports', 0, true);
            $progress = $DB->count_records_select(
                'local_mooblox_ledger',
                "courseid = :courseid AND source = 'cm' AND kind = 'complete' AND timeearned >= :start AND timeearned < :end",
                ['courseid' => $courseid, 'start' => $monday->getTimestamp(), 'end' => $monday->modify('+1 week')->getTimestamp()]
            );
            $counts = ['students' => $students, 'progress' => $progress];
            $cache->set($key, $counts);
        }
        if ($counts['students'] < self::MIN_STUDENTS) {
            return null;
        }
        $row = $DB->get_record('local_mooblox_goal', ['courseid' => $courseid, 'week' => $week]);
        $target = $row ? (int) $row->target : ($settings['goaltarget'] ?: self::target($counts['students']));
        if (!$row && $counts['progress'] >= $target) {
            $row = (object) ['courseid' => $courseid, 'week' => $week, 'target' => $target, 'reached' => 1, 'timereached' => $now];
            try {
                $row->id = $DB->insert_record('local_mooblox_goal', $row);
            } catch (\dml_write_exception $e) {
                $row = $DB->get_record('local_mooblox_goal', ['courseid' => $courseid, 'week' => $week], '*', MUST_EXIST);
            }
        }
        return ['week' => $week, 'target' => $target, 'progress' => min($counts['progress'], $target), 'reached' => (bool) $row,
            'timereached' => $row ? (int) $row->timereached : 0];
    }

    /**
     * The automatic target: six in ten students finishing two activities, at least 5.
     *
     * @param int $students active students
     * @return int
     */
    public static function target(int $students): int {
        return max(5, (int) round(0.6 * $students * 2));
    }
}
