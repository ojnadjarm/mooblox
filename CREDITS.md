# Credits

Third-party code and assets used by MOOBLOX. Every asset file gets a row in `client/public/assets/LICENSES.csv` (built by `client/tools/intake-assets.mjs`).

| Name | Author | Licence | Use |
|---|---|---|---|
| three.js | three.js authors | MIT | Renderer and scene |
| three-mesh-bvh | Garrett Johnson | MIT | Character capsule collision (`characterMovement` example) |
| Blocky Characters 2.0 | Kenney | CC0 | Avatars (`kenney-blocky.glb`, `skins/`) |
| Prototype Bits 1.1, City Builder Bits 1.0 | KayKit (Kay Lousberg) | CC0 | World pieces (`kaykit-prototype.glb`, `kaykit-city.glb`) |
| Cube Pets 2.0 | Kenney | CC0 | Pets (`cosmetics/pets.glb`: cat, dog, bunny, fox, panda, penguin; `client/tools/intake-cosmetics.mjs`) |
| MOOBLOX hats | MOOBLOX contributors | CC0 | 12 hats and glasses (`cosmetics/hats.glb`, built by `client/tools/hats.py` in Blender) |
| Universal Animation Library | Quaternius | CC0 | Not shipped: Kenney avatars are node-animated, not on its skeleton |
| Impact Sounds 1.0, Interface Sounds 1.0, RPG Audio 1.0, Music Jingles 1.0 | Kenney | CC0 | Footsteps (grass, stone, wood), jump, land, panel open/close, XP, Guide, completion and level-up jingles (`audio/*.ogg` + `.m4a`, `client/tools/intake-audio.mjs`) |
| Happy Lullaby (song17) | cynicmusic (OpenGameArt) | CC0 | Plaza loop (`audio/music-hub`), https://opengameart.org/content/happy-lullaby-song17 |
| Bluebonnet (looped), Catmint (looped) | Kistol (OpenGameArt) | CC0 | District loops (`audio/music-bluebonnet`, `audio/music-catmint`), https://opengameart.org/content/bluebonnet, https://opengameart.org/content/catmint |
| Fountain water | MOOBLOX contributors | CC0 | Synthesised at run time (filtered noise, `client/src/audio/water.ts`), no file |
