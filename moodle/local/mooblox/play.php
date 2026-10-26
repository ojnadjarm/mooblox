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
$SESSION->local_mooblox_play = true;

$PAGE->set_url(new moodle_url('/local/mooblox/play.php', ['id' => $course->id]));
$PAGE->set_pagelayout('embedded');
$PAGE->set_title(format_string($course->fullname, true, ['context' => $context]));
$PAGE->add_body_class('local-mooblox-play');

$rev = get_config('local_mooblox', 'version');
$config = [
    'wwwroot' => $CFG->wwwroot,
    'courseid' => (int) $course->id,
    'userid' => (int) $USER->id,
    'sesskey' => sesskey(),
    'firstname' => $USER->firstname,
    'avatar' => (string) get_user_preferences('local_mooblox_avatar', ''),
    'sound' => (string) get_user_preferences('local_mooblox_sound', ''),
    'rev' => (int) $rev,
    'huburl' => (new moodle_url('/local/mooblox/index.php', ['from' => $course->id]))->out(false),
    'strings' => [
        'guide' => get_string('guide', 'local_mooblox'),
        'greeting' => get_string('guide_greeting', 'local_mooblox', '{name}'),
        'next' => get_string('guide_next', 'local_mooblox', '{activity}'),
        'alldone' => get_string('guide_alldone', 'local_mooblox'),
        'showme' => get_string('guide_showme', 'local_mooblox'),
        'gate_open' => get_string('gate_open', 'local_mooblox'),
        'lock_notyet' => get_string('lock_notyet', 'local_mooblox'),
        'avatar' => get_string('avatar', 'local_mooblox'),
        'look_click' => get_string('look_click', 'local_mooblox'),
        'look_ctrl' => get_string('look_ctrl', 'local_mooblox', '{ctrl}'),
        'look_release' => get_string('look_release', 'local_mooblox', '{ctrl}'),
    ],
];
foreach (['sound', 'sound_on', 'sound_off', 'sound_volume', 'hub_back', 'hub_back_label'] as $key) {
    $config['strings'][$key] = get_string($key, 'local_mooblox');
}
foreach (['title', 'hair', 'face', 'skin', 'clothes', 'random', 'undo', 'save', 'cancel'] as $key) {
    $config['strings']['creator_' . $key] = get_string('creator_' . $key, 'local_mooblox');
}
foreach (array_keys(\local_mooblox\character::catalogue()['fields']) as $field) {
    $config['strings']['creator_field_' . $field] = get_string('creator_field_' . $field, 'local_mooblox');
}

$placeholders = [
    'badge_earned' => '{badge}',
    'book_earned' => '{date}',
    'book_found' => (object) ['found' => '{found}', 'total' => '{total}'],
    'book_hidden' => null,
    'book_notrophies' => null,
    'book_tab_collection' => null,
    'book_tab_course' => null,
    'book_tab_quests' => null,
    'book_tab_trophies' => null,
    'book_unlocked' => '{item}',
    'book_unlocks' => '{item}',
    'collect_count' => (object) ['found' => '{found}', 'total' => '{total}'],
    'collect_crystal' => null,
    'collect_gem' => null,
    'collect_star' => null,
    'fallback_link' => null,
    'fallback_retry' => null,
    'fallback_text' => null,
    'fallback_title' => null,
    'goal_reached' => null,
    'goal_together' => '{target}',
    'hud_alldone' => null,
    'hud_level' => '{level}',
    'hud_progress' => (object) ['done' => '{done}', 'total' => '{total}'],
    'hud_week' => null,
    'hud_weeks' => '{weeks}',
    'hud_welcome' => null,
    'hud_xp' => (object) ['xp' => '{xp}', 'next' => '{next}'],
    'levelup_skip' => null,
    'levelup_title' => '{level}',
    'levelup_tryon' => null,
    'levelup_unlocked' => '{item}',
    'wardrobe_bylevel' => null,
    'wardrobe_byquest' => '{quest}',
    'wardrobe_hat' => null,
    'wardrobe_none' => null,
    'wardrobe_outfit' => null,
    'wardrobe_pet' => null,
    'wardrobe_tab' => null,
];
foreach (\local_mooblox\rewards\catalog::ids() as $id) {
    $placeholders['item_' . str_replace('-', '_', $id)] = null;
}
foreach ($placeholders as $key => $a) {
    $config['strings'][$key] = get_string($key, 'local_mooblox', $a);
}

echo $OUTPUT->header();
echo $OUTPUT->render_from_template('local_mooblox/play', [
    'configjson' => json_encode($config, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT),
    'bundleurl' => (new moodle_url('/local/mooblox/client/dist/mooblox.js', ['rev' => $rev]))->out(false),
    'logourl' => $OUTPUT->image_url('logo', 'local_mooblox')->out(false),
    'loading' => get_string('loading', 'local_mooblox'),
    'creditby' => get_string('credit_by', 'local_mooblox'),
    'creditclaude' => get_string('credit_claude', 'local_mooblox'),
]);
echo $OUTPUT->footer();
