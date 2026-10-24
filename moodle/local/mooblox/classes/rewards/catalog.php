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
 * Cosmetic item ids, mirrored by the client art keys in client/src/rewards/catalog.ts.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class catalog {
    /** @var string[] Items worn on the avatar head. */
    public const HATS = [
        'hat-cap', 'hat-beanie', 'hat-explorer', 'hat-crown', 'hat-wizard', 'hat-pirate',
        'hat-chef', 'hat-astronaut', 'hat-tophat', 'hat-party', 'hat-glasses', 'hat-sunglasses',
    ];

    /** @var string[] Shirt and trouser palettes. */
    public const OUTFITS = [
        'outfit-lava', 'outfit-ocean', 'outfit-forest', 'outfit-sunset', 'outfit-space',
        'outfit-candy', 'outfit-gold', 'outfit-snow', 'outfit-night',
    ];

    /** @var string[] Pets that follow the player. */
    public const PETS = ['pet-cat', 'pet-dog', 'pet-bunny', 'pet-fox', 'pet-panda', 'pet-penguin'];

    /** @var string[] Pedestal styles in the trophy hall. */
    public const TROPHIES = ['trophy-bronze', 'trophy-silver', 'trophy-gold'];

    /**
     * All cosmetic ids in catalog order.
     *
     * @return string[]
     */
    public static function ids(): array {
        return array_merge(self::HATS, self::OUTFITS, self::PETS, self::TROPHIES);
    }

    /**
     * Item a level-up unlocks: a pet every 5 levels, else a hat or outfit, seeded by course and level.
     *
     * @param int $courseid course id
     * @param int $level level reached
     * @param string[] $owned item ids the user already has
     * @return string|null null when every item of the pool is owned
     */
    public static function level_reward(int $courseid, int $level, array $owned): ?string {
        $pool = array_values(array_diff($level % 5 === 0 ? self::PETS : array_merge(self::HATS, self::OUTFITS), $owned));
        return $pool ? $pool[crc32("$courseid:level:$level") % count($pool)] : null;
    }
}
