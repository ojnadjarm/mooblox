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
 * Gentle learning weeks from a user's learning days: weeks of enough days in a row, freezes that cover a missed week.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class learning_weeks {
    /** @var int learning weeks that earn one freeze */
    const FREEZE_EVERY = 4;
    /** @var int freezes held at most */
    const MAX_FREEZES = 2;

    /**
     * Counts the learning weeks in a row up to the week of today; the current week only adds, never breaks.
     *
     * @param int[] $days learning days as yyyymmdd in the user's timezone
     * @param int $weekdays days that make a learning week (Monday to Sunday)
     * @param int $today today as yyyymmdd in the user's timezone
     * @return array weeks (in a row), welcomeback (the first week after a break), freezes (held now)
     */
    public static function count(array $days, int $weekdays, int $today): array {
        $perweek = [];
        foreach ($days as $day) {
            $week = self::week((int) $day);
            $perweek[$week] = ($perweek[$week] ?? 0) + 1;
        }
        $result = ['weeks' => 0, 'welcomeback' => false, 'freezes' => 0];
        if (!$perweek) {
            return $result;
        }
        $current = self::week($today);
        $streak = $learned = $freezes = 0;
        $broke = $welcome = false;
        for ($week = min(array_keys($perweek)); $week <= $current; $week++) {
            if (($perweek[$week] ?? 0) >= $weekdays) {
                $streak++;
                $learned++;
                $welcome = $broke && $streak === 1;
                if ($learned % self::FREEZE_EVERY === 0) {
                    $freezes = min(self::MAX_FREEZES, $freezes + 1);
                }
            } else if ($week === $current) {
                continue;
            } else if ($freezes > 0) {
                $freezes--;
            } else {
                $broke = $broke || $streak > 0;
                $streak = 0;
                $welcome = false;
            }
        }
        return ['weeks' => $streak, 'welcomeback' => $welcome, 'freezes' => $freezes];
    }

    /**
     * Index of the Monday-to-Sunday week a day falls in.
     *
     * @param int $day yyyymmdd
     * @return int weeks since the week of 1970-01-01
     */
    private static function week(int $day): int {
        $date = \DateTimeImmutable::createFromFormat('!Ymd', (string) $day, new \DateTimeZone('UTC'));
        return intdiv(intdiv($date->getTimestamp(), DAYSECS) + 3, 7);
    }
}
