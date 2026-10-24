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
 * XP to level curve: level n needs 25 * n * (n + 1) XP.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class level_curve {
    /**
     * XP needed to reach a level.
     *
     * @param int $level level, 0 or more
     * @return int
     */
    public static function threshold(int $level): int {
        return 25 * $level * ($level + 1);
    }

    /**
     * Level reached with an amount of XP.
     *
     * @param int $xp XP
     * @return int
     */
    public static function level(int $xp): int {
        $level = 0;
        while (self::threshold($level + 1) <= $xp) {
            $level++;
        }
        return $level;
    }
}
