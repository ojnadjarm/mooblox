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
 * What a user has earned in one course, for the hub.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_mooblox\local;

use local_mooblox\rewards\collectible_catalog;
use local_mooblox\rewards\course_switch;
use local_mooblox\rewards\moodle_course_shape;

defined('MOODLE_INTERNAL') || die();

require_once($CFG->libdir . '/badgeslib.php');

/**
 * What a user has earned in one course (XP, level, collectibles, badges), read from the stored rewards without recomputing them.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class course_rewards {
    /** Nothing earned: rewards off in the course or never visited. */
    const NONE = ['xp' => 0, 'level' => 0, 'gems' => 0, 'gemstotal' => 0, 'crystals' => 0, 'stars' => 0, 'trophies' => []];

    /**
     * Returns the user's stored rewards in a course.
     *
     * @param int $courseid course id
     * @param int $userid user id
     * @return array xp, level, gems, gemstotal, crystals, stars and trophies (badgeid, name, image, timeissued)
     */
    public static function for_course(int $courseid, int $userid): array {
        global $DB;
        if (!course_switch::is_on($courseid)) {
            return self::NONE;
        }
        $xp = $DB->get_record('local_mooblox_xp', ['courseid' => $courseid, 'userid' => $userid], 'xp, level');
        $found = ['gem' => 0, 'crystal' => 0, 'star' => 0];
        foreach ($DB->get_fieldset('local_mooblox_found', 'itemkey', ['courseid' => $courseid, 'userid' => $userid]) as $key) {
            $kind = strstr($key, ':', true);
            if (isset($found[$kind])) {
                $found[$kind]++;
            }
        }
        $all = collectible_catalog::all(moodle_course_shape::load($courseid));
        return [
            'xp' => $xp ? (int) $xp->xp : 0,
            'level' => $xp ? (int) $xp->level : 0,
            'gems' => $found['gem'],
            'gemstotal' => count(array_filter($all, fn(array $item): bool => $item['kind'] === 'gem')),
            'crystals' => $found['crystal'],
            'stars' => $found['star'],
            'trophies' => self::trophies($courseid, $userid),
        ];
    }

    /**
     * Course badges the user holds, oldest first.
     *
     * @param int $courseid course id
     * @param int $userid user id
     * @return array[] badgeid, name, image, timeissued
     */
    private static function trophies(int $courseid, int $userid): array {
        global $DB;
        $sql = "SELECT b.id, b.name, bi.dateissued
                  FROM {badge_issued} bi
                  JOIN {badge} b ON b.id = bi.badgeid
                 WHERE b.courseid = :courseid AND b.type = :type AND bi.userid = :userid
              ORDER BY bi.dateissued, b.id";
        $badges = $DB->get_records_sql($sql, ['courseid' => $courseid, 'type' => BADGE_TYPE_COURSE, 'userid' => $userid]);
        $context = \context_course::instance($courseid);
        $trophies = [];
        foreach ($badges as $badge) {
            $image = \moodle_url::make_pluginfile_url($context->id, 'badges', 'badgeimage', $badge->id, '/', 'f3', false);
            $trophies[] = ['badgeid' => (int) $badge->id, 'name' => format_string($badge->name, true, ['context' => $context]),
                'image' => $image->out(false), 'timeissued' => (int) $badge->dateissued];
        }
        return $trophies;
    }
}
