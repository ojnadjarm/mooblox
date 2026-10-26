@local @local_mooblox
Feature: Students pick a course world on the Mooblox map
  In order to choose what to learn
  As a student
  I need a site page with every course I can play

  Background:
    Given the following "users" exist:
      | username | firstname | lastname |
      | student1 | Mia       | One      |
    And the following "courses" exist:
      | fullname | shortname |
      | Course 1 | C1        |
      | Course 2 | C2        |
    And the following "course enrolments" exist:
      | user     | course | role    |
      | student1 | C1     | student |
      | student1 | C2     | student |

  Scenario: A student opens the map from the primary navigation
    Given the following "permission overrides" exist:
      | capability         | permission | role    | contextlevel | reference |
      | local/mooblox:play | Prohibit   | student | Course       | C2        |
    And I log in as "student1"
    When I click on "Mooblox" "link" in the ".primary-navigation" "css_element"
    Then "#mooblox-root" "css_element" should exist
    And "Course 1" "link" should exist
    And "Course 2" "link" should not exist

  Scenario: The map link is gone when Mooblox is off
    Given the following config values are set as admin:
      | enabled | 0 | local_mooblox |
    When I log in as "student1"
    Then I should not see "Mooblox" in the ".primary-navigation" "css_element"
