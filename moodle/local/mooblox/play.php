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
 * Full-screen MOOBLOX world of a course.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require('../../config.php');

$id = required_param('id', PARAM_INT);
$course = get_course($id);
require_login($course);
$context = context_course::instance($course->id);
\local_mooblox\local\access::require_play($context);

$PAGE->set_url(new moodle_url('/local/mooblox/play.php', ['id' => $course->id]));
$PAGE->set_pagelayout('embedded');
$PAGE->set_title(format_string($course->fullname, true, ['context' => $context]));
$PAGE->add_body_class('local-mooblox-play');

$rev = get_config('local_mooblox', 'version');
$config = [
    'wwwroot' => $CFG->wwwroot,
    'courseid' => (int) $course->id,
    'sesskey' => sesskey(),
    'firstname' => $USER->firstname,
    'avatar' => (string) get_user_preferences('local_mooblox_avatar', ''),
    'rev' => (int) $rev,
];

echo $OUTPUT->header();
echo $OUTPUT->render_from_template('local_mooblox/play', [
    'configjson' => json_encode($config, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT),
    'bundleurl' => (new moodle_url('/local/mooblox/client/dist/mooblox.js', ['rev' => $rev]))->out(false),
]);
echo $OUTPUT->footer();
