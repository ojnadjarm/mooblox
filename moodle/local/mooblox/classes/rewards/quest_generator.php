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
 * Generates the quests of a course from its shape and their progress from the facts.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class quest_generator {
    /** @var array module kind => [quest id, minimum count] */
    private const MODULE_QUESTS = [
        course_shape::VIDEO => ['mod:video', 2],
        course_shape::QUIZ => ['mod:quiz', 2],
        course_shape::PAGE => ['mod:page', 3],
    ];

    /**
     * Quests in display order with their progress and the item each one unlocks.
     *
     * @param course_shape $shape course structure
     * @param facts $facts the user's facts
     * @return array[] each ['id', 'kind', 'name', 'done', 'total', 'complete', 'reward']
     */
    public static function quests(course_shape $shape, facts $facts): array {
        $quests = [];
        foreach ($shape->sections as $sectionid => $section) {
            if ($section['cms']) {
                $quests[] = self::count("sec:$sectionid", 'section', $section['name'], array_keys($section['cms']), $facts);
            }
        }
        $cms = $shape->cms();
        foreach (self::MODULE_QUESTS as $kind => [$id, $minimum]) {
            $match = fn($cm) => $cm['kind'] === $kind && ($kind !== course_shape::QUIZ || $cm['passgrade']);
            $ids = array_keys(array_filter($cms, $match));
            if (count($ids) >= $minimum) {
                $quests[] = $kind === course_shape::QUIZ
                    ? self::quest($id, $kind, '', count(array_filter($ids, fn($cmid) => self::passed($facts, $cmid))), count($ids))
                    : self::count($id, $kind, '', $ids, $facts);
            }
        }
        foreach ($shape->badges as $badgeid => $name) {
            $quests[] = self::quest("badge:$badgeid", 'badge', $name, (int) isset($facts->badges[$badgeid]), 1);
        }
        if ($shape->completion && $cms) {
            $quests[] = self::quest('course', 'course', '', (int) ($facts->coursecompleted !== null), 1);
        }
        $rewards = self::rewards($shape->courseid, array_column($quests, 'id'));
        return array_map(fn($quest) => $quest + ['reward' => $rewards[$quest['id']]], $quests);
    }

    /**
     * Item each quest unlocks: a seeded pick per quest, no item twice in one course, named before the quest is done.
     *
     * @param int $courseid course id
     * @param string[] $questids quest ids in display order
     * @return array quest id => item id, null once the pool is used up
     */
    public static function rewards(int $courseid, array $questids): array {
        $pool = array_merge(catalog::HATS, catalog::OUTFITS);
        $rewards = [];
        foreach ($questids as $id) {
            if (!$pool) {
                $rewards[$id] = null;
                continue;
            }
            $index = crc32("$courseid:quest:$id") % count($pool);
            $rewards[$id] = $pool[$index];
            array_splice($pool, $index, 1);
        }
        return $rewards;
    }

    /**
     * A quest whose progress is the number of complete activities.
     *
     * @param string $id quest id
     * @param string $kind quest kind
     * @param string $name section or badge name
     * @param int[] $cmids activities of the quest
     * @param facts $facts the user's facts
     * @return array
     */
    private static function count(string $id, string $kind, string $name, array $cmids, facts $facts): array {
        return self::quest($id, $kind, $name, count(array_filter($cmids, [$facts, 'is_complete'])), count($cmids));
    }

    /**
     * A quest row.
     *
     * @param string $id quest id
     * @param string $kind quest kind
     * @param string $name section or badge name
     * @param int $done steps done
     * @param int $total steps in total
     * @return array
     */
    private static function quest(string $id, string $kind, string $name, int $done, int $total): array {
        return ['id' => $id, 'kind' => $kind, 'name' => $name, 'done' => $done, 'total' => $total, 'complete' => $done >= $total];
    }

    /**
     * Whether a quiz was passed.
     *
     * @param facts $facts the user's facts
     * @param int $cmid course module id
     * @return bool
     */
    private static function passed(facts $facts, int $cmid): bool {
        return ($facts->completions[$cmid]['state'] ?? COMPLETION_INCOMPLETE) === COMPLETION_COMPLETE_PASS;
    }
}
