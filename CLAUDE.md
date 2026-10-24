# MOOBLOX: project notes

Personal open-source repo (GPL-3), no remote. Moodle plugin `local_mooblox` in `moodle/local/mooblox`,
world client in `client/`. Design: `ARCHITECTURE.md`. Plan and tickets:
`~/agent-work/research/2026-10-24/T1276/PLAN.md`.

- Moodle target 5.0+ (`requires` 2025041400); dev/test on `~/moodle-envs/5.2` (:8052) through
  `mfixture with 5.2`. Never touch Vass envs.
- Moodle work ends with `/moodle-ci` (`mci quick` while iterating).
- Fixture data and manual-test notes live in `.research/testdata/` (untracked).

## Built

- Phase A (T1277-T1279), 2026-10-24:
  - Repo docs: README, ARCHITECTURE (10 client modules, 6 plugin classes), LICENSE (GPL-3), CREDITS.
  - `local_mooblox` 0.1.0 scaffold from /moodle-pluginskel: `local/mooblox:play` (course context;
    student, teacher, editingteacher, manager), site switch `local_mooblox/enabled` (default on),
    null privacy provider. Not installed permanently on 5.2: use `mfixture with 5.2 moodle/local/mooblox -- <cmd>`.
  - Fixture: `.research/testdata/setup.php` (run from the 5.2 root with `mphp`) builds course
    `mooblox_demo` (id 30 on 5.2): label (s0), page (s1), mp4 resource + YouTube url (s2), 3-question
    true/false quiz (s3), completion on, student `mooblox_student` (Mia). `testing-instructions.md` beside it.
  - No commits yet: the repo has no HEAD, so `mci quick` phpcs-delta is red in place; run it on a copy
    outside git until the first commit.
