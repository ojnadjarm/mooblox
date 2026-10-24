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
 * Tests for the character preference validation.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_mooblox;

use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Tests for the character preference validation.
 *
 * @package    local_mooblox
 * @category   test
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(character::class)]
final class character_test extends \advanced_testcase {
    /**
     * A valid look in the client's field order.
     *
     * @return array
     */
    private static function look(): array {
        return ['v' => 2, 'skin' => 's3', 'hair' => 'afro', 'hairc' => 'blonde', 'eyes' => 'round', 'eyec' => 'green',
            'brows' => 'soft', 'mouth' => 'smile', 'glasses' => 'round', 'glassesc' => 'black', 'top' => 'hoodie', 'topc' => 'red',
            'bottom' => 'shorts', 'bottomc' => 'denim', 'shoes' => 'sneakers', 'shoesc' => 'white'];
    }

    /**
     * A valid look comes back byte for byte; T1302 values stay; anything else becomes ''.
     *
     * @param string $value submitted value
     * @param bool $kept whether the value survives as is
     */
    #[DataProvider('values')]
    public function test_clean(string $value, bool $kept): void {
        $this->assertSame($kept ? $value : '', character::clean($value));
    }

    /**
     * Values for test_clean.
     *
     * @return array
     */
    public static function values(): array {
        $look = self::look();
        return [
            'valid look' => [json_encode($look), true],
            'legacy body' => ['f', true],
            'legacy body and colour' => ['c_green', true],
            'unknown hairstyle' => [json_encode(['hair' => 'mullet'] + $look), false],
            'unknown colour' => [json_encode(['topc' => '#ff0000'] + $look), false],
            'extra key' => [json_encode($look + ['pet' => 'cat']), false],
            'missing key' => [json_encode(array_diff_key($look, ['shoes' => 1])), false],
            'wrong version' => [json_encode(['v' => 1] + $look), false],
            'number id' => [json_encode(['skin' => 3] + $look), false],
            'script' => ['<script>alert(1)</script>', false],
            'broken json' => ['{"v":2,', false],
            'legacy unknown colour' => ['c_gold', false],
        ];
    }

    /**
     * The preference definition routes values through the cleaner, so the web service stores only allowed looks.
     */
    public function test_preference_cleaning(): void {
        $this->resetAfterTest();
        $value = json_encode(self::look());
        $this->assertSame($value, \core_user::clean_preference($value, 'local_mooblox_avatar'));
        $this->assertSame('', \core_user::clean_preference(json_encode(['hair' => 'x'] + self::look()), 'local_mooblox_avatar'));
    }

    /**
     * Every list the fields name exists and the version is 2.
     */
    public function test_catalogue(): void {
        $catalogue = character::catalogue();
        $this->assertSame(2, $catalogue['version']);
        foreach ($catalogue['fields'] as $list) {
            $this->assertNotEmpty($catalogue['lists'][$list]);
        }
        $this->assertContains('blonde', $catalogue['lists']['hairc']);
    }
}
