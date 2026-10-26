@local @local_mooblox
Feature: Teachers switch MOOBLOX rewards per course
  In order to choose whether my class earns rewards
  As a teacher
  I need a rewards settings page in my course

  Background:
    Given the following "users" exist:
      | username | firstname | lastname |
      | teacher1 | Rita      | Rivera   |
      | student1 | Mia       | One      |
    And the following "courses" exist:
      | fullname | shortname | enablecompletion |
      | Course 1 | C1        | 1                |
    And the following "course enrolments" exist:
      | user     | course | role           |
      | teacher1 | C1     | editingteacher |
      | student1 | C1     | student        |

  Scenario: A teacher switches rewards off and the student's rewards are off
    Given the MOOBLOX rewards of "student1" in "C1" should be on
    And I am on the "C1" "Course" page logged in as "teacher1"
    And I follow "Mooblox rewards"
    When I set the field "Rewards in this course" to "0"
    And I press "Save changes"
    Then I should see "Changes saved"
    And the field "Rewards in this course" matches value "0"
    And the MOOBLOX rewards of "student1" in "C1" should be off

  Scenario: A student gets no rewards settings link
    When I am on the "C1" "Course" page logged in as "student1"
    Then "Mooblox rewards" "link" should not exist
