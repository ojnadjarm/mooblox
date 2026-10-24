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
 * Syncs many users, 200 per transaction.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class batch_sync {
    /** Users per transaction. */
    const BATCH = 200;

    /**
     * Syncs each course and user pair.
     *
     * @param array $pairs list of [courseid, userid]
     * @return int rows written or deleted
     */
    public static function run(array $pairs): int {
        global $DB;
        $reconciler = new reconciler(new moodle_fact_source());
        $changes = 0;
        foreach (array_chunk($pairs, self::BATCH) as $chunk) {
            $transaction = $DB->start_delegated_transaction();
            foreach ($chunk as [$courseid, $userid]) {
                $changes += $reconciler->sync((int) $courseid, (int) $userid);
            }
            $transaction->allow_commit();
        }
        return $changes;
    }
}
