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
 * The cosmetics a user wears: hat, outfit and pet, each one the user has unlocked.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class wardrobe {
    /** @var string Preference holding the worn items as JSON. */
    public const PREFERENCE = 'local_mooblox_look';

    /** @var array Nothing worn. */
    public const EMPTY_LOOK = ['hat' => '', 'outfit' => '', 'pet' => ''];

    /**
     * The items the user wears.
     *
     * @param int $userid user id
     * @return array hat, outfit, pet ('' when none)
     */
    public static function look(int $userid): array {
        $saved = json_decode((string) get_user_preferences(self::PREFERENCE, '', $userid), true);
        return array_map('strval', array_intersect_key(is_array($saved) ? $saved : [], self::EMPTY_LOOK) + self::EMPTY_LOOK);
    }

    /**
     * Wears the given items; '' takes a slot off.
     *
     * @param int $userid user id
     * @param array $look hat, outfit, pet
     * @return array the saved look
     * @throws \moodle_exception when an item is not of its slot or not unlocked
     */
    public static function set_look(int $userid, array $look): array {
        global $DB;
        $slots = ['hat' => catalog::HATS, 'outfit' => catalog::OUTFITS, 'pet' => catalog::PETS];
        $owned = $DB->get_fieldset('local_mooblox_unlock', 'itemkey', ['userid' => $userid]);
        $look = array_intersect_key($look, self::EMPTY_LOOK) + self::EMPTY_LOOK;
        foreach ($look as $slot => $item) {
            if ($item !== '' && (!in_array($item, $slots[$slot], true) || !in_array($item, $owned, true))) {
                throw new \moodle_exception('itemlocked', 'local_mooblox');
            }
        }
        set_user_preference(self::PREFERENCE, json_encode($look), $userid);
        return $look;
    }
}
