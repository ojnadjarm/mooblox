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

/**
 * Kid-friendly lock reasons from availability trees.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_mooblox\local;

use core_availability\info;

/**
 * Turns the first failed condition of an "all of" restriction into a short sign text; anything else gets Moodle's text.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class lock_reason {
    /** @var int Seconds before an opening date when the sign shows the time instead of the day. */
    private const SAME_DAY = DAYSECS;

    /**
     * Returns the sign text of a locked section or activity.
     *
     * @param \course_modinfo $modinfo the user's modinfo
     * @param string|null $availability availability JSON of the section or activity
     * @param string|\renderable $availableinfo Moodle's restriction info, empty when hidden
     * @param int $userid user id
     * @return string
     */
    public static function text(\course_modinfo $modinfo, ?string $availability, $availableinfo, int $userid): string {
        $tree = $availability ? json_decode($availability) : null;
        if ($tree && ($tree->op ?? '') === '&') {
            $leaves = array_filter($tree->c ?? [], fn($c): bool => isset($c->type));
            $failed = array_filter($leaves, fn($c): bool => self::passes($c, $modinfo, $userid) === false);
            $unknown = array_filter($leaves, fn($c): bool => self::passes($c, $modinfo, $userid) === null);
            foreach ([...$failed, ...$unknown] as $c) {
                $text = self::describe($c, $modinfo);
                if ($text !== null) {
                    return $text;
                }
            }
        }
        $plain = $availableinfo ? trim(html_to_text(info::format_info($availableinfo, $modinfo->get_course()), 0, false)) : '';
        return $plain !== '' ? $plain : get_string('lock_notyet', 'local_mooblox');
    }

    /**
     * Returns the earliest date condition after now in any availability JSON, 0 when none.
     *
     * @param array $availabilities availability JSON strings (null for none)
     * @param int $now current time
     * @return int
     */
    public static function next_change(array $availabilities, int $now): int {
        $times = [];
        foreach ($availabilities as $json) {
            if ($json) {
                self::collect_dates(json_decode($json), $times);
            }
        }
        $future = array_filter($times, fn(int $t): bool => $t > $now);
        return $future ? min($future) : 0;
    }

    /**
     * Whether the user passes a date or completion condition; null for kinds it cannot tell cheaply.
     *
     * @param \stdClass $c condition structure
     * @param \course_modinfo $modinfo the user's modinfo
     * @param int $userid user id
     * @return bool|null
     */
    private static function passes(\stdClass $c, \course_modinfo $modinfo, int $userid): ?bool {
        if ($c->type === 'date' && isset($c->t)) {
            return $c->d === '>=' ? time() >= $c->t : time() < $c->t;
        }
        $cmid = (int) ($c->cm ?? 0);
        if ($c->type === 'completion' && isset($modinfo->cms[$cmid])) {
            $data = (new \completion_info($modinfo->get_course()))->get_data($modinfo->get_cm($cmid), false, $userid);
            $state = (int) $data->completionstate;
            $done = in_array($state, [COMPLETION_COMPLETE, COMPLETION_COMPLETE_PASS], true);
            return match ((int) $c->e) {
                COMPLETION_INCOMPLETE => !$done,
                COMPLETION_COMPLETE => $done || $state === COMPLETION_COMPLETE_FAIL,
                default => $state === (int) $c->e,
            };
        }
        return null;
    }

    /**
     * Returns the sign text of one condition the user does not meet, null when it has no short text.
     *
     * @param \stdClass $c condition structure
     * @param \course_modinfo $modinfo the user's modinfo
     * @return string|null
     */
    private static function describe(\stdClass $c, \course_modinfo $modinfo): ?string {
        global $CFG;
        switch ($c->type) {
            case 'date':
                if ($c->d === '>=') {
                    $sameday = $c->t - time() < self::SAME_DAY;
                    $format = get_string($sameday ? 'strftimegatetime' : 'strftimegateday', 'local_mooblox');
                    return get_string('lock_opens', 'local_mooblox', trim(preg_replace('/\s+/', ' ', userdate($c->t, $format))));
                }
                return get_string('lock_closed', 'local_mooblox');
            case 'completion':
                $cmid = (int) ($c->cm ?? 0);
                if ($cmid === -1) {
                    return get_string('lock_finishprevious', 'local_mooblox');
                }
                if (!isset($modinfo->cms[$cmid]) || (int) $c->e === COMPLETION_INCOMPLETE) {
                    return null;
                }
                $key = (int) $c->e === COMPLETION_COMPLETE_PASS ? 'lock_pass' : 'lock_finish';
                return get_string($key, 'local_mooblox', $modinfo->get_cm($cmid)->get_formatted_name());
            case 'grade':
                require_once($CFG->libdir . '/gradelib.php');
                $item = \grade_item::fetch(['id' => (int) $c->id, 'courseid' => $modinfo->get_course_id()]);
                return $item ? get_string('lock_grade', 'local_mooblox', format_string($item->get_name())) : null;
            case 'group':
            case 'grouping':
            case 'profile':
                return get_string('lock_notforyou', 'local_mooblox');
        }
        return null;
    }

    /**
     * Adds every date condition's time in a tree to `$times`.
     *
     * @param mixed $node tree or condition structure
     * @param int[] $times collected times
     */
    private static function collect_dates($node, array &$times): void {
        if (!is_object($node)) {
            return;
        }
        if (($node->type ?? '') === 'date' && isset($node->t)) {
            $times[] = (int) $node->t;
        }
        foreach ($node->c ?? [] as $child) {
            self::collect_dates($child, $times);
        }
    }
}
