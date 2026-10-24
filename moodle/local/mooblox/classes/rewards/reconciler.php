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
 * Brings the stored ledger, XP cache, learning days and unlocks of one user in one course in line with the facts.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class reconciler {
    /**
     * Sets the fact source.
     *
     * @param fact_source $source where the facts come from
     */
    public function __construct(
        /** @var fact_source where the facts come from */
        private readonly fact_source $source,
    ) {
    }

    /**
     * Syncs one user in one course; a second run with the same facts changes nothing.
     *
     * @param int $courseid course id
     * @param int $userid user id
     * @return int number of rows written or deleted
     */
    public function sync(int $courseid, int $userid): int {
        global $DB;
        $manualxp = $DB->get_field('local_mooblox_course', 'manualxp', ['courseid' => $courseid]);
        $rules = new xp_rules($manualxp === false || (bool) $manualxp);
        $desired = $rules->desired($this->source->load($courseid, $userid));
        $ids = ['courseid' => $courseid, 'userid' => $userid];

        $transaction = $DB->start_delegated_transaction();
        $stored = [];
        foreach ($DB->get_records('local_mooblox_ledger', $ids) as $row) {
            $stored["$row->source:$row->sourceid:$row->kind"] = $row;
        }
        $changes = 0;
        foreach (array_diff_key($stored, $desired) as $row) {
            $DB->delete_records('local_mooblox_ledger', ['id' => $row->id]);
            $changes++;
        }
        $newtimes = [];
        foreach ($desired as $key => $row) {
            if (!isset($stored[$key])) {
                $DB->insert_record('local_mooblox_ledger', $ids + $row);
                $newtimes[] = $row['timeearned'];
                $changes++;
            } else if ((int) $stored[$key]->xp !== $row['xp']) {
                $DB->set_field('local_mooblox_ledger', 'xp', $row['xp'], ['id' => $stored[$key]->id]);
                $changes++;
            }
        }
        $changes += $this->add_days($courseid, $userid, $newtimes);
        [$oldpeak, $newpeak, $written] = $this->write_cache($ids, array_sum(array_column($desired, 'xp')), $rules->version());
        $changes += $written + $this->grant_unlocks($courseid, $userid, $oldpeak, $newpeak);
        $transaction->allow_commit();
        return $changes;
    }

    /**
     * Records the learning days, in the user's timezone, of newly earned rows.
     *
     * @param int $courseid course id
     * @param int $userid user id
     * @param int[] $times times earned
     * @return int days added
     */
    private function add_days(int $courseid, int $userid, array $times): int {
        global $DB;
        if (!$times) {
            return 0;
        }
        $tz = \core_date::get_user_timezone_object($DB->get_field('user', 'timezone', ['id' => $userid]));
        $known = $DB->get_fieldset('local_mooblox_day', 'day', ['courseid' => $courseid, 'userid' => $userid]);
        $days = [];
        foreach ($times as $time) {
            $days[(int) (new \DateTime('@' . $time))->setTimezone($tz)->format('Ymd')] = true;
        }
        $new = array_diff(array_keys($days), array_map('intval', $known));
        foreach ($new as $day) {
            $DB->insert_record('local_mooblox_day', ['courseid' => $courseid, 'userid' => $userid, 'day' => $day]);
        }
        return count($new);
    }

    /**
     * Rewrites the XP cache when it differs; the peak level never goes down.
     *
     * @param array $ids courseid and userid
     * @param int $xp total XP
     * @param string $version rules version
     * @return array [old peak level, new peak level, rows written]
     */
    private function write_cache(array $ids, int $xp, string $version): array {
        global $DB;
        $level = level_curve::level($xp);
        $cache = $DB->get_record('local_mooblox_xp', $ids);
        $oldpeak = $cache ? (int) $cache->peaklevel : 0;
        $values = ['xp' => $xp, 'level' => $level, 'peaklevel' => max($oldpeak, $level), 'rulesversion' => $version];
        if ($cache && array_diff_assoc($values, (array) $cache) === []) {
            return [$oldpeak, $oldpeak, 0];
        }
        $record = (object) ($ids + $values + ['timecomputed' => time()]);
        if ($cache) {
            $record->id = $cache->id;
            $DB->update_record('local_mooblox_xp', $record);
        } else {
            $DB->insert_record('local_mooblox_xp', $record);
        }
        return [$oldpeak, $values['peaklevel'], 1];
    }

    /**
     * Unlocks one cosmetic per new peak level.
     *
     * @param int $courseid course id
     * @param int $userid user id
     * @param int $oldpeak peak level before the sync
     * @param int $newpeak peak level after the sync
     * @return int items unlocked
     */
    private function grant_unlocks(int $courseid, int $userid, int $oldpeak, int $newpeak): int {
        global $DB;
        if ($newpeak <= $oldpeak) {
            return 0;
        }
        $owned = $DB->get_fieldset('local_mooblox_unlock', 'itemkey', ['userid' => $userid]);
        $granted = 0;
        for ($level = $oldpeak + 1; $level <= $newpeak; $level++) {
            $item = catalog::level_reward($courseid, $level, $owned);
            if ($item !== null) {
                $DB->insert_record('local_mooblox_unlock', ['userid' => $userid, 'itemkey' => $item,
                    'courseid' => $courseid, 'timeunlocked' => time()]);
                $owned[] = $item;
                $granted++;
            }
        }
        return $granted;
    }
}
