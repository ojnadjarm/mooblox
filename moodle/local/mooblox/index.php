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
 * Mooblox course map: every course the user can play as an island on one sea.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require('../../config.php');

require_login(null, false);
if (!get_config('local_mooblox', 'enabled')) {
    throw new moodle_exception('disabled', 'local_mooblox');
}
$context = context_system::instance();

$PAGE->set_context($context);
$PAGE->set_url(new moodle_url('/local/mooblox/index.php'));
$PAGE->set_pagelayout('embedded');
$PAGE->set_title(get_string('map_title', 'local_mooblox'));
$PAGE->add_body_class('local-mooblox-play');

$rev = get_config('local_mooblox', 'version');
$courses = \local_mooblox\local\course_list::for_user($USER->id);
$config = [
    'mode' => 'map',
    'wwwroot' => $CFG->wwwroot,
    'courseid' => 0,
    'userid' => (int) $USER->id,
    'sesskey' => sesskey(),
    'firstname' => $USER->firstname,
    'avatar' => (string) get_user_preferences('local_mooblox_avatar', ''),
    'sound' => (string) get_user_preferences('local_mooblox_sound', ''),
    'rev' => (int) $rev,
    'strings' => [],
];
$keys = ['back', 'close', 'done', 'empty_text', 'empty_title', 'free', 'hint', 'lastvisit', 'list', 'never', 'play', 'progress',
    'title'];
foreach ($keys as $key) {
    $a = ['lastvisit' => '{when}', 'progress' => '{progress}'][$key] ?? null;
    $config['strings']['map_' . $key] = get_string('map_' . $key, 'local_mooblox', $a);
}
$keys = ['sound', 'sound_on', 'sound_off', 'sound_volume', 'fallback_link', 'fallback_retry', 'fallback_text', 'fallback_title'];
foreach ($keys as $key) {
    $config['strings'][$key] = get_string($key, 'local_mooblox');
}

echo $OUTPUT->header();
echo $OUTPUT->render_from_template('local_mooblox/map', [
    'title' => get_string('map_title', 'local_mooblox'),
    'courses' => array_map(fn(array $c): array => ['fullname' => $c['fullname'], 'url' => $c['url']], $courses),
    'empty' => get_string('map_empty_text', 'local_mooblox'),
    'configjson' => json_encode($config, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT),
    'bundleurl' => (new moodle_url('/local/mooblox/client/dist/mooblox.js', ['rev' => $rev]))->out(false),
]);
echo $OUTPUT->footer();
