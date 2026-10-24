@local @local_mooblox
Feature: Students open a course as a MOOBLOX world
  In order to learn by exploring
  As a student
  I need to open the course world from a course tab

  Background:
    Given the following "users" exist:
      | username | firstname | lastname |
      | student1 | Mia       | One      |
    And the following "courses" exist:
      | fullname | shortname |
      | Course 1 | C1        |
    And the following "course enrolments" exist:
      | user     | course | role    |
      | student1 | C1     | student |

  Scenario: A student opens the world from the course tab
    Given I am on the "C1" "Course" page logged in as "student1"
    When I click on "MOOBLOX" "link" in the ".secondary-navigation" "css_element"
    Then "#mooblox-root" "css_element" should exist
    And "#mooblox-config" "css_element" should exist

  Scenario: A student without the play capability gets no tab
    Given the following "permission overrides" exist:
      | capability         | permission | role    | contextlevel | reference |
      | local/mooblox:play | Prohibit   | student | Course       | C1        |
    When I am on the "C1" "Course" page logged in as "student1"
    Then I should not see "MOOBLOX" in the ".secondary-navigation" "css_element"
