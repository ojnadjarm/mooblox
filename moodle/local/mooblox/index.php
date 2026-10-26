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
 * Mooblox hub: a room the kid walks around, with a warp portal to every course they can play.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require('../../config.php');

$from = optional_param('from', 0, PARAM_INT);

require_login(null, false);
if (!get_config('local_mooblox', 'enabled')) {
    throw new moodle_exception('disabled', 'local_mooblox');
}
$context = context_system::instance();

$PAGE->set_context($context);
$PAGE->set_url(new moodle_url('/local/mooblox/index.php'));
$PAGE->set_pagelayout('embedded');
$PAGE->set_title(get_string('hub_title', 'local_mooblox'));
$PAGE->add_body_class('local-mooblox-play');

$rev = get_config('local_mooblox', 'version');
$courses = \local_mooblox\local\course_list::for_user($USER->id);
$config = [
    'mode' => 'hub',
    'wwwroot' => $CFG->wwwroot,
    'courseid' => $from,
    'userid' => (int) $USER->id,
    'sesskey' => sesskey(),
    'firstname' => $USER->firstname,
    'avatar' => (string) get_user_preferences('local_mooblox_avatar', ''),
    'sound' => (string) get_user_preferences('local_mooblox_sound', ''),
    'rev' => (int) $rev,
    'strings' => [],
];
$keys = ['crystals', 'done', 'down', 'empty_text', 'empty_title', 'free', 'gems', 'hint', 'lift_go', 'list', 'new', 'stars', 'title',
    'trophies', 'up'];
foreach ($keys as $key) {
    $config['strings']['hub_' . $key] = get_string('hub_' . $key, 'local_mooblox');
}
$placeholders = ['floor' => (object) ['floor' => '{floor}', 'floors' => '{floors}'], 'level' => '{level}', 'lift' => '{floor}',
    'progress' => '{progress}', 'warping' => '{name}', 'xp' => '{xp}'];
foreach ($placeholders as $key => $a) {
    $config['strings']['hub_' . $key] = get_string('hub_' . $key, 'local_mooblox', $a);
}
$keys = ['sound', 'sound_on', 'sound_off', 'sound_volume', 'look_click', 'fallback_link', 'fallback_retry', 'fallback_text', 'fallback_title'];
foreach ($keys as $key) {
    $config['strings'][$key] = get_string($key, 'local_mooblox');
}
$config['strings']['look_ctrl'] = get_string('look_ctrl', 'local_mooblox', '{ctrl}');
$config['strings']['look_release'] = get_string('look_release', 'local_mooblox', '{ctrl}');

echo $OUTPUT->header();
echo $OUTPUT->render_from_template('local_mooblox/hub', [
    'title' => get_string('hub_title', 'local_mooblox'),
    'courses' => array_map(fn(array $c): array => ['fullname' => $c['fullname'], 'url' => $c['url']], $courses),
    'empty' => get_string('hub_empty_text', 'local_mooblox'),
    'configjson' => json_encode($config, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT),
    'bundleurl' => (new moodle_url('/local/mooblox/client/dist/mooblox.js', ['rev' => $rev]))->out(false),
    'logourl' => $OUTPUT->image_url('logo', 'local_mooblox')->out(false),
    'loading' => get_string('loading', 'local_mooblox'),
    'creditby' => get_string('credit_by', 'local_mooblox'),
    'creditclaude' => get_string('credit_claude', 'local_mooblox'),
]);
echo $OUTPUT->footer();
