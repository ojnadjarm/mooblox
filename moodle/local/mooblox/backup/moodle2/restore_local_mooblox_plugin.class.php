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
 * Restore of the MOOBLOX course data.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/**
 * Restores the rewards settings, found collectibles (keys remapped to the new activities and sections) and learning days,
 * then queues a course re-sync that rebuilds the ledger and XP from the restored completions.
 *
 * @package    local_mooblox
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class restore_local_mooblox_plugin extends restore_local_plugin {
    /** @var array found rows waiting for the activity and section mappings */
    private array $found = [];

    /**
     * Defines the settings path and, with user data, the found and day paths.
     *
     * @return restore_path_element[]
     */
    protected function define_course_plugin_structure() {
        $paths = [new restore_path_element('local_mooblox_settings', $this->get_pathfor('/settings'))];
        if ($this->get_setting_value('users')) {
            $paths[] = new restore_path_element('local_mooblox_found', $this->get_pathfor('/founds/found'));
            $paths[] = new restore_path_element('local_mooblox_day', $this->get_pathfor('/days/day'));
        }
        return $paths;
    }

    /**
     * Restores the course settings, replacing those of an existing target course.
     *
     * @param array $data the settings from the backup
     */
    public function process_local_mooblox_settings($data) {
        global $DB;
        $data = (object) $data;
        unset($data->id);
        $data->courseid = $this->task->get_courseid();
        $existing = $DB->get_field('local_mooblox_course', 'id', ['courseid' => $data->courseid]);
        if ($existing) {
            $data->id = $existing;
            $DB->update_record('local_mooblox_course', $data);
        } else {
            $DB->insert_record('local_mooblox_course', $data);
        }
    }

    /**
     * Keeps a found row until the activities and sections are restored.
     *
     * @param array $data the row from the backup
     */
    public function process_local_mooblox_found($data) {
        $userid = $this->get_mappingid('user', $data['userid']);
        if ($userid) {
            $this->found[] = ['userid' => $userid, 'itemkey' => $data['itemkey'], 'timefound' => $data['timefound']];
        }
    }

    /**
     * Restores a learning day.
     *
     * @param array $data the row from the backup
     */
    public function process_local_mooblox_day($data) {
        global $DB;
        $row = ['courseid' => $this->task->get_courseid(), 'userid' => $this->get_mappingid('user', $data['userid']),
            'day' => $data['day']];
        if ($row['userid'] && !$DB->record_exists('local_mooblox_day', $row)) {
            $DB->insert_record('local_mooblox_day', $row);
        }
    }

    /**
     * Writes the found rows with remapped keys and queues the course re-sync.
     */
    public function after_restore_course() {
        global $DB;
        $courseid = $this->task->get_courseid();
        foreach ($this->found as $row) {
            $row['itemkey'] = $this->remap_key($row['itemkey']);
            $row['courseid'] = $courseid;
            $exists = $DB->record_exists('local_mooblox_found', ['courseid' => $courseid, 'userid' => $row['userid'],
                'itemkey' => $row['itemkey']]);
            if ($row['itemkey'] !== null && !$exists) {
                $DB->insert_record('local_mooblox_found', $row);
            }
        }
        \local_mooblox\rewards\sync_queue::course($courseid);
    }

    /**
     * Maps gem:<cmid> and crystal:<sectionid> to the restored ids; other keys stay.
     *
     * @param string $key key from the backup
     * @return string|null new key, null when its activity or section was not restored
     */
    private function remap_key(string $key): ?string {
        $types = ['gem' => 'course_module', 'crystal' => 'course_section'];
        [$prefix, $id] = array_pad(explode(':', $key, 2), 2, '');
        if (!isset($types[$prefix])) {
            return $key;
        }
        $newid = $this->get_mappingid($types[$prefix], $id);
        return $newid ? "$prefix:$newid" : null;
    }
}
