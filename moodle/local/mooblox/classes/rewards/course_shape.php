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
 * The structure of a course that quests and collectibles are generated from: tracked activities only.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class course_shape {
    /** @var string A video file or a YouTube link. */
    public const VIDEO = 'video';
    /** @var string A quiz. */
    public const QUIZ = 'quiz';
    /** @var string A page or a book. */
    public const PAGE = 'page';
    /** @var string Any other activity. */
    public const OTHER = 'other';

    /**
     * Builds the shape.
     *
     * @param int $courseid course id
     * @param array $sections section id => ['name' => string, 'cms' => [cmid => ['kind' => self::*, 'passgrade' => bool]]]
     * @param array $badges active course badge id => name, for badges a student can earn by learning
     * @param bool $completion whether course completion is on
     */
    public function __construct(
        /** @var int course id */
        public readonly int $courseid,
        /** @var array section id => name and tracked cms, in course order */
        public readonly array $sections = [],
        /** @var array badge id => name */
        public readonly array $badges = [],
        /** @var bool whether course completion is on */
        public readonly bool $completion = false,
    ) {
    }

    /**
     * Tracked cms of the whole course in course order.
     *
     * @return array cmid => ['kind', 'passgrade', 'sectionid']
     */
    public function cms(): array {
        $all = [];
        foreach ($this->sections as $sectionid => $section) {
            foreach ($section['cms'] as $cmid => $cm) {
                $all[$cmid] = $cm + ['sectionid' => $sectionid];
            }
        }
        return $all;
    }
}
