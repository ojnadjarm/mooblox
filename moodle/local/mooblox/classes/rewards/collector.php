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
 * Picks up collectibles: only keys the user has unlocked, once each.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class collector {
    /**
     * Records a collectible as found; claiming it again changes nothing.
     *
     * @param int $courseid course id
     * @param int $userid user id
     * @param string $key collectible key
     * @return int number of collectibles the user has found in the course
     * @throws \moodle_exception when the key is not unlocked
     */
    public static function claim(int $courseid, int $userid, string $key): int {
        global $DB;
        $facts = (new moodle_fact_source())->load($courseid, $userid);
        if (!in_array($key, collectible_catalog::unlocked(moodle_course_shape::load($courseid), $facts), true)) {
            throw new \moodle_exception('collectiblelocked', 'local_mooblox');
        }
        $ids = ['courseid' => $courseid, 'userid' => $userid];
        if (!$DB->record_exists('local_mooblox_found', $ids + ['itemkey' => $key])) {
            $DB->insert_record('local_mooblox_found', $ids + ['itemkey' => $key, 'timefound' => time()]);
        }
        return $DB->count_records('local_mooblox_found', $ids);
    }
}
