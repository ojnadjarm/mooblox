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
 * Behat navigation for local_mooblox.
 *
 * @package    local_mooblox
 * @category   test
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

// NOTE: no MOODLE_INTERNAL test here, this file may be required by behat before including /config.php.

require_once(__DIR__ . '/../../../../lib/behat/behat_base.php');

/**
 * Behat page resolvers for local_mooblox.
 *
 * @package    local_mooblox
 * @category   test
 * @copyright  2026 Oscar Nadjar <oscar.nadjar@gmail.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class behat_local_mooblox extends behat_base {
    /**
     * Resolves "<course shortname>" "local_mooblox > Play|Rewards" to the play or rewards settings page URL.
     *
     * @param string $type page type
     * @param string $identifier course shortname
     * @return moodle_url
     */
    protected function resolve_page_instance_url(string $type, string $identifier): moodle_url {
        switch (strtolower($type)) {
            case 'play':
                return new moodle_url('/local/mooblox/play.php', ['id' => $this->get_course_id($identifier)]);
            case 'rewards':
                return new moodle_url('/local/mooblox/rewards.php', ['id' => $this->get_course_id($identifier)]);
            default:
                throw new Exception('Unrecognised local_mooblox page type "' . $type . '."');
        }
    }

    /**
     * Checks what get_rewards returns to a user: whether rewards are on in a course.
     *
     * @Then /^the MOOBLOX rewards of "(?P<username>[^"]*)" in "(?P<shortname>[^"]*)" should be (?P<state>on|off)$/
     * @param string $username user name
     * @param string $shortname course short name
     * @param string $state on or off
     */
    public function the_mooblox_rewards_should_be(string $username, string $shortname, string $state): void {
        global $DB;
        $userid = $DB->get_field('user', 'id', ['username' => $username], MUST_EXIST);
        $enabled = \local_mooblox\rewards\summary::build($this->get_course_id($shortname), $userid)['enabled'];
        if ($enabled !== ($state === 'on')) {
            throw new \Behat\Mink\Exception\ExpectationException("Rewards of $username are not $state", $this->getSession());
        }
    }
}
