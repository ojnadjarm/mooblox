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
 * Course rewards settings page.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require(__DIR__ . '/../../config.php');

use local_mooblox\form\course_rewards;
use local_mooblox\rewards\course_settings;

$courseid = required_param('id', PARAM_INT);
$course = get_course($courseid);
require_login($course);
$context = context_course::instance($course->id);
require_capability('local/mooblox:managerewards', $context);

$url = new moodle_url('/local/mooblox/rewards.php', ['id' => $course->id]);
$PAGE->set_url($url);
$PAGE->set_context($context);
$PAGE->set_pagelayout('incourse');
$PAGE->set_title(get_string('rewardssettings', 'local_mooblox'));
$PAGE->set_heading(format_string($course->fullname));

$form = new course_rewards($url);
if ($form->is_cancelled()) {
    redirect(course_get_url($course));
} else if ($data = $form->get_data()) {
    course_settings::save($course->id, $data);
    redirect($url, get_string('changessaved'), null, \core\output\notification::NOTIFY_SUCCESS);
}
$form->set_data(['id' => $course->id] + course_settings::get($course->id));

echo $OUTPUT->header();
echo $OUTPUT->heading(get_string('rewardssettings', 'local_mooblox'));
$form->display();
echo $OUTPUT->footer();
