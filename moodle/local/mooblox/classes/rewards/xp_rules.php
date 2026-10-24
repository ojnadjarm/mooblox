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

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->libdir . '/completionlib.php');

/**
 * Pure XP rules: facts to the ledger rows they earn.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class xp_rules {
    /** @var array XP per rule. */
    public const XP = [
        facts::AUTO => 10,
        facts::VIEW => 5,
        facts::MANUAL => 3,
        'pass' => 10,
        'grade50' => 5,
        'grade80' => 10,
        'grade100' => 15,
        'badge' => 25,
        'course' => 50,
    ];

    /**
     * Sets the course switches the rules depend on.
     *
     * @param bool $manualxp whether manual completions earn XP
     */
    public function __construct(
        /** @var bool whether manual completions earn XP */
        private readonly bool $manualxp = true,
    ) {
    }

    /**
     * Ledger rows the facts earn, keyed by source:sourceid:kind.
     *
     * @param facts $facts facts of one user in one course
     * @return array key => ['source', 'sourceid', 'kind', 'xp', 'timeearned']
     */
    public function desired(facts $facts): array {
        $rows = [];
        foreach ($facts->completions as $cmid => $c) {
            if ($c['state'] == COMPLETION_INCOMPLETE) {
                continue;
            }
            $xp = ($c['mode'] === facts::MANUAL && !$this->manualxp) ? 0 : self::XP[$c['mode']];
            self::add($rows, 'cm', $cmid, 'complete', $xp, $c['time']);
            if ($c['state'] == COMPLETION_COMPLETE_PASS) {
                self::add($rows, 'cm', $cmid, 'pass', self::XP['pass'], $c['time']);
            }
        }
        foreach ($facts->grades as $itemid => $g) {
            $band = match (true) {
                $g['percent'] >= 100 => 'grade100',
                $g['percent'] >= 80 => 'grade80',
                $g['percent'] >= 50 => 'grade50',
                default => null,
            };
            if ($band) {
                self::add($rows, 'grade', $itemid, $band, self::XP[$band], $g['time']);
            }
        }
        foreach ($facts->badges as $badgeid => $time) {
            self::add($rows, 'badge', $badgeid, 'badge', self::XP['badge'], $time);
        }
        if ($facts->coursecompleted !== null) {
            self::add($rows, 'course', $facts->courseid, 'complete', self::XP['course'], $facts->coursecompleted);
        }
        return $rows;
    }

    /**
     * Hash of the rules and switches; a change triggers a re-sync.
     *
     * @return string
     */
    public function version(): string {
        return sha1(json_encode([self::XP, $this->manualxp]));
    }

    /**
     * Adds one row when it earns XP.
     *
     * @param array $rows rows so far
     * @param string $source cm, grade, badge or course
     * @param int $sourceid id within the source
     * @param string $kind kind of fact
     * @param int $xp XP earned
     * @param int $time time earned
     */
    private static function add(array &$rows, string $source, int $sourceid, string $kind, int $xp, int $time): void {
        if ($xp > 0) {
            $rows["$source:$sourceid:$kind"] = [
                'source' => $source, 'sourceid' => $sourceid, 'kind' => $kind, 'xp' => $xp, 'timeearned' => $time,
            ];
        }
    }
}
