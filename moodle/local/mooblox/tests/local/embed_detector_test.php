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
 * Tests for the embed detector.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_mooblox\local;

use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Tests for the embed detector.
 *
 * @package    local_mooblox
 * @category   test
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(embed_detector::class)]
final class embed_detector_test extends \basic_testcase {
    /**
     * Requests, play session flags and the expected result.
     *
     * @return array
     */
    public static function requests_provider(): array {
        return [
            'framed in a play session' => [['HTTP_SEC_FETCH_DEST' => 'iframe'], true, true],
            'framed, header upper case' => [['HTTP_SEC_FETCH_DEST' => 'IFRAME'], true, true],
            'framed outside a play session' => [['HTTP_SEC_FETCH_DEST' => 'iframe'], false, false],
            'top-level page in a play session' => [['HTTP_SEC_FETCH_DEST' => 'document'], true, false],
            'no header in a play session' => [[], true, false],
        ];
    }

    /**
     * Only an iframe load during a play session counts as embedded.
     *
     * @param array $server request server variables
     * @param bool $playsession play session flag
     * @param bool $expected expected result
     */
    #[DataProvider('requests_provider')]
    public function test_is_embedded(array $server, bool $playsession, bool $expected): void {
        $this->assertSame($expected, embed_detector::is_embedded($server, $playsession));
    }
}
