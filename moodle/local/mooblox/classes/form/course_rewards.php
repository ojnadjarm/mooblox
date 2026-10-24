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

namespace local_mooblox\form;

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->libdir . '/formslib.php');

/**
 * Course rewards switches: rewards, manual-tick XP, learning days per week, class goal.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class course_rewards extends \moodleform {
    #[\Override]
    protected function definition(): void {
        $mform = $this->_form;
        $mform->addElement('hidden', 'id');
        $mform->setType('id', PARAM_INT);
        $mform->addElement('advcheckbox', 'enabled', get_string('rewardsenabled', 'local_mooblox'), '', null, [0, 1]);
        $mform->addElement('advcheckbox', 'manualxp', get_string('manualxp', 'local_mooblox'), '', null, [0, 1]);
        $mform->addHelpButton('manualxp', 'manualxp', 'local_mooblox');
        $mform->addElement('select', 'weekdays', get_string('weekdays', 'local_mooblox'), array_combine(range(1, 5), range(1, 5)));
        $mform->addHelpButton('weekdays', 'weekdays', 'local_mooblox');
        $mform->addElement('advcheckbox', 'goal', get_string('goal', 'local_mooblox'), '', null, [0, 1]);
        $mform->addHelpButton('goal', 'goal', 'local_mooblox');
        $mform->addElement('text', 'goaltarget', get_string('goaltarget', 'local_mooblox'), ['size' => 4]);
        $mform->setType('goaltarget', PARAM_INT);
        $mform->addHelpButton('goaltarget', 'goaltarget', 'local_mooblox');
        $mform->hideIf('goaltarget', 'goal');
        $this->add_action_buttons();
    }

    #[\Override]
    public function validation($data, $files): array {
        $errors = parent::validation($data, $files);
        if (!empty($data['goal']) && (int) $data['goaltarget'] < 0) {
            $errors['goaltarget'] = get_string('error');
        }
        return $errors;
    }
}
