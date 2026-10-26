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

namespace local_mooblox;

use PHPUnit\Framework\Attributes\CoversClass;

/**
 * Framed activity pages.
 *
 * @package    local_mooblox
 * @category   test
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[CoversClass(hook_callbacks::class)]
final class hook_callbacks_test extends \advanced_testcase {
    /**
     * A framed manual-completion page leaves out Moodle's tick (the panel bar has one; the embedded layout has no heading for it).
     */
    public function test_framed_manual_page_hides_header_completion(): void {
        global $PAGE, $SESSION;
        $this->resetAfterTest();
        $generator = $this->getDataGenerator();
        $course = $generator->create_course(['enablecompletion' => 1]);
        $student = $generator->create_and_enrol($course, 'student');
        $page = $generator->create_module('page', ['course' => $course->id, 'completion' => COMPLETION_TRACKING_MANUAL]);
        $this->setUser($student);
        $PAGE->set_cm(get_fast_modinfo($course)->get_cm($page->cmid));
        $PAGE->set_url('/mod/page/view.php', ['id' => $page->cmid]);
        $SESSION->local_mooblox_play = true;
        $_SERVER['HTTP_SEC_FETCH_DEST'] = 'iframe';

        $renderer = $PAGE->get_renderer('core');
        hook_callbacks::before_http_headers(new \core\hook\output\before_http_headers($renderer));
        unset($_SERVER['HTTP_SEC_FETCH_DEST']);

        $this->assertSame('embedded', $PAGE->pagelayout);
        $this->assertEmpty($PAGE->activityheader->export_for_template($renderer)['completion'] ?? null);
    }
}
