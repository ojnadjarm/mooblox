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
 * Everything the world shows about one user's rewards in one course, synced from Moodle on read.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class summary {
    /**
     * Syncs the user, grants the items of finished quests and returns the summary.
     *
     * @param int $courseid course id
     * @param int $userid user id
     * @return array the get_rewards structure
     */
    public static function build(int $courseid, int $userid): array {
        global $DB;
        if (!course_switch::is_on($courseid)) {
            return self::off();
        }
        $facts = (new moodle_fact_source())->load($courseid, $userid);
        (new reconciler(self::fixed($facts)))->sync($courseid, $userid);
        $shape = moodle_course_shape::load($courseid);
        $quests = quest_generator::quests($shape, $facts);
        self::grant_quest_items($courseid, $userid, $quests);

        $xp = $DB->get_record('local_mooblox_xp', ['courseid' => $courseid, 'userid' => $userid]);
        $level = (int) $xp->level;
        $found = array_flip($DB->get_fieldset('local_mooblox_found', 'itemkey', ['courseid' => $courseid, 'userid' => $userid]));
        $unlocked = array_flip(collectible_catalog::unlocked($shape, $facts));
        $collectibles = array_map(fn($item) => $item + [
            'unlocked' => isset($unlocked[$item['key']]),
            'found' => isset($found[$item['key']]),
        ], collectible_catalog::all($shape));

        return [
            'enabled' => true,
            'xp' => (int) $xp->xp,
            'level' => $level,
            'peaklevel' => (int) $xp->peaklevel,
            'levelstart' => level_curve::threshold($level),
            'levelnext' => level_curve::threshold($level + 1),
            'quests' => array_map(
                fn($quest) => ['reward' => (string) $quest['reward'], 'text' => self::quest_text($quest)] + $quest,
                $quests
            ),
            'collectibles' => $collectibles,
            'unlocks' => array_values($DB->get_fieldset('local_mooblox_unlock', 'itemkey', ['userid' => $userid])),
            'look' => wardrobe::look($userid),
            'trophies' => self::trophies($courseid, $facts->badges),
        ];
    }

    /**
     * The summary when rewards are off in the course.
     *
     * @return array
     */
    public static function off(): array {
        return ['enabled' => false, 'xp' => 0, 'level' => 0, 'peaklevel' => 0, 'levelstart' => 0, 'levelnext' => 0,
            'quests' => [], 'collectibles' => [], 'unlocks' => [], 'look' => wardrobe::EMPTY_LOOK, 'trophies' => []];
    }

    /**
     * A fact source that returns facts already loaded, so one read serves the sync and the summary.
     *
     * @param facts $facts loaded facts
     * @return fact_source
     */
    private static function fixed(facts $facts): fact_source {
        return new class ($facts) implements fact_source {
            /**
             * Keeps the facts.
             *
             * @param facts $facts loaded facts
             */
            public function __construct(
                /** @var facts loaded facts */
                private readonly facts $facts,
            ) {
            }

            #[\Override]
            public function load(int $courseid, int $userid): facts {
                return $this->facts;
            }
        };
    }

    /**
     * Unlocks the item of every finished quest the user does not own yet.
     *
     * @param int $courseid course id
     * @param int $userid user id
     * @param array[] $quests quests with progress
     */
    private static function grant_quest_items(int $courseid, int $userid, array $quests): void {
        global $DB;
        $items = array_filter(array_column(array_filter($quests, fn($quest) => $quest['complete']), 'reward'));
        $new = array_diff($items, $DB->get_fieldset('local_mooblox_unlock', 'itemkey', ['userid' => $userid]));
        foreach ($new as $item) {
            $DB->insert_record('local_mooblox_unlock', ['userid' => $userid, 'itemkey' => $item, 'courseid' => $courseid,
                'timeunlocked' => time()]);
        }
    }

    /**
     * The sentence of a quest.
     *
     * @param array $quest quest row
     * @return string
     */
    private static function quest_text(array $quest): string {
        return get_string('quest_' . $quest['kind'], 'local_mooblox', format_string($quest['name']));
    }

    /**
     * The course badges the user holds, as trophies with their image.
     *
     * @param int $courseid course id
     * @param array $issued badge id => time issued
     * @return array[]
     */
    private static function trophies(int $courseid, array $issued): array {
        global $DB;
        if (!$issued) {
            return [];
        }
        $context = \context_course::instance($courseid);
        $names = $DB->get_records_list('badge', 'id', array_keys($issued), 'id', 'id, name');
        $trophies = [];
        foreach ($names as $badge) {
            $image = \moodle_url::make_pluginfile_url($context->id, 'badges', 'badgeimage', $badge->id, '/', 'f3', false);
            $trophies[] = ['badgeid' => (int) $badge->id, 'name' => format_string($badge->name), 'image' => $image->out(false),
                'timeissued' => $issued[$badge->id]];
        }
        return $trophies;
    }
}
