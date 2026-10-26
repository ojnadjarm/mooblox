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
 * Hook callbacks.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$callbacks = [
    [
        'hook' => \core\hook\navigation\primary_extend::class,
        'callback' => [\local_mooblox\hook_callbacks::class, 'primary_extend'],
    ],
    [
        'hook' => \core\hook\navigation\secondary_extend::class,
        'callback' => [\local_mooblox\hook_callbacks::class, 'secondary_extend'],
    ],
    [
        'hook' => \core\hook\output\before_http_headers::class,
        'callback' => [\local_mooblox\hook_callbacks::class, 'before_http_headers'],
    ],
    [
        'hook' => \core_completion\hook\after_cm_completion_updated::class,
        'callback' => [\local_mooblox\hook_callbacks::class, 'after_cm_completion_updated'],
    ],
];
