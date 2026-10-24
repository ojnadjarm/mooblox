# MOOBLOX

A Roblox-look 3D island for kids (8-12) in the browser. Each Moodle course becomes the world:
one zone per section, one prop per activity, progress kept by Moodle itself.

- `moodle/local/mooblox`: the Moodle plugin `local_mooblox` (Moodle 5.0+). It serves the client
  full-screen from the Moodle site (`/local/mooblox/play.php?id=<courseid>`) and exposes two
  small ajax web service facades.
- `client/`: the TypeScript + three.js world client, built with Vite into the plugin.

Moodle is the only backend: same origin, the student's own session, no tokens, no hosting.

Design: [ARCHITECTURE.md](ARCHITECTURE.md). Third-party assets and code: [CREDITS.md](CREDITS.md).

## Licence

GPL-3.0-or-later, see [LICENSE](LICENSE).
