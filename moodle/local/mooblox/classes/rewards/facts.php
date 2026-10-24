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
 * The Moodle facts of one user in one course that rewards are derived from.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class facts {
    /** @var string Completion ticked by Moodle from activity rules. */
    public const AUTO = 'auto';
    /** @var string Completion whose only rule is viewing. */
    public const VIEW = 'view';
    /** @var string Completion ticked by the student. */
    public const MANUAL = 'manual';

    /**
     * Builds the facts.
     *
     * @param int $courseid course id
     * @param array $completions cmid => ['state' => COMPLETION_*, 'mode' => self::AUTO|VIEW|MANUAL, 'time' => int]
     * @param array $grades grade item id => ['percent' => float 0-100, 'time' => int]
     * @param array $badges badge id => time issued
     * @param int|null $coursecompleted time the course was completed, null when not completed
     */
    public function __construct(
        /** @var int course id */
        public readonly int $courseid,
        /** @var array cmid => completion state, mode and time */
        public readonly array $completions = [],
        /** @var array grade item id => percent and time */
        public readonly array $grades = [],
        /** @var array badge id => time issued */
        public readonly array $badges = [],
        /** @var int|null time the course was completed */
        public readonly ?int $coursecompleted = null,
    ) {
    }
}
