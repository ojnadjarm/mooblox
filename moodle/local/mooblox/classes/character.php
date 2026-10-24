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

namespace local_mooblox;

/**
 * The character look stored in the avatar preference: allow-listed ids from character.json, shared with the client.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class character {
    /** @var string T1302 value: a preset body letter and an optional shirt colour. */
    const LEGACY = '/^[a-r](_(red|orange|yellow|green|teal|blue|purple|pink))?$/';

    /** @var array|null Decoded catalogue. */
    private static ?array $catalogue = null;

    /**
     * Returns the catalogue: version, field => list name, list name => allowed ids.
     *
     * @return array
     */
    public static function catalogue(): array {
        if (self::$catalogue === null) {
            self::$catalogue = json_decode(file_get_contents(__DIR__ . '/../character.json'), true, 4, JSON_THROW_ON_ERROR);
        }
        return self::$catalogue;
    }

    /**
     * Cleans a preference value: a valid look comes back as compact JSON, a T1302 value as is, anything else as ''.
     *
     * @param mixed $value the submitted value
     * @param string $name the preference name
     * @return string
     */
    public static function clean($value, string $name = ''): string {
        if (!is_string($value) || strlen($value) > 1000) {
            return '';
        }
        if (preg_match(self::LEGACY, $value)) {
            return $value;
        }
        $look = json_decode($value, true);
        if (!is_array($look)) {
            return '';
        }
        $catalogue = self::catalogue();
        if (($look['v'] ?? null) !== $catalogue['version'] || count($look) !== count($catalogue['fields']) + 1) {
            return '';
        }
        $clean = ['v' => $catalogue['version']];
        foreach ($catalogue['fields'] as $field => $list) {
            $id = $look[$field] ?? null;
            if (!is_string($id) || !in_array($id, $catalogue['lists'][$list], true)) {
                return '';
            }
            $clean[$field] = $id;
        }
        return json_encode($clean);
    }
}
