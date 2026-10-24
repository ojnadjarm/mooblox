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
 * The collectibles of a course (gems, crystals, stars) and which of them a user has unlocked.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class collectible_catalog {
    /** @var int Tracked activities per bonus star in a section. */
    private const CMS_PER_STAR = 3;

    /**
     * Every collectible of the course in course order.
     *
     * @param course_shape $shape course structure
     * @return array[] each ['key', 'kind', 'sectionid', 'cmid']; cmid is 0 for crystals and stars
     */
    public static function all(course_shape $shape): array {
        $all = [];
        foreach ($shape->sections as $sectionid => $section) {
            foreach (array_keys($section['cms']) as $cmid) {
                $all[] = ['key' => "gem:$cmid", 'kind' => 'gem', 'sectionid' => $sectionid, 'cmid' => $cmid];
            }
            if ($section['cms']) {
                $all[] = ['key' => "crystal:$sectionid", 'kind' => 'crystal', 'sectionid' => $sectionid, 'cmid' => 0];
            }
            for ($n = 1; $n <= intdiv(count($section['cms']), self::CMS_PER_STAR); $n++) {
                $all[] = ['key' => "star:$sectionid:$n", 'kind' => 'star', 'sectionid' => $sectionid, 'cmid' => 0];
            }
        }
        return $all;
    }

    /**
     * Keys the user has unlocked: a gem per complete activity, a crystal per finished section, stars at half a section.
     *
     * @param course_shape $shape course structure
     * @param facts $facts the user's facts
     * @return string[]
     */
    public static function unlocked(course_shape $shape, facts $facts): array {
        $keys = [];
        foreach (self::all($shape) as $item) {
            $cmids = array_keys($shape->sections[$item['sectionid']]['cms']);
            $done = count(array_filter($cmids, [$facts, 'is_complete']));
            $open = match ($item['kind']) {
                'gem' => $facts->is_complete($item['cmid']),
                'crystal' => $done === count($cmids),
                'star' => 2 * $done >= count($cmids),
            };
            if ($open) {
                $keys[] = $item['key'];
            }
        }
        return $keys;
    }
}
