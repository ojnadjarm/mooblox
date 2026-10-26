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
| Impact Sounds 1.0, Interface Sounds 1.0, RPG Audio 1.0, Music Jingles 1.0 | Kenney | CC0 | Footsteps (grass, stone, wood), jump, land, bump, panel open/close, book and pages, clicks, prompt, emote, wardrobe rustle, gem/crystal/star pickups, XP, Guide, completion, level-up and class-goal jingles (`audio/*.ogg` + `.m4a`, `client/tools/intake-audio.mjs`) |
| Happy Lullaby (song17) | cynicmusic (OpenGameArt) | CC0 | Plaza loop (`audio/music-hub`), https://opengameart.org/content/happy-lullaby-song17 |
| Bluebonnet (looped), Catmint (looped) | Kistol (OpenGameArt) | CC0 | District loops (`audio/music-bluebonnet`, `audio/music-catmint`), https://opengameart.org/content/bluebonnet, https://opengameart.org/content/catmint |
| Dog barking mono | Brandon Morris (HaelDB, OpenGameArt) | CC0 (dual OGA-BY 3.0 / CC0; CC0 chosen) | Dog barks (`audio/bark-*`), https://opengameart.org/content/dog-barking-mono |
| Solo Seagull Sound Effects | Rango Mango (OpenGameArt) | CC0 | Gull calls (`audio/gull-*`), https://opengameart.org/content/solo-seagull-sound-effects |
| Meow; Cat purr & meow; Kitten mew | IgnasD; Kerzoven; AntumDeluge (OpenGameArt) | CC0 | Cat meows (`audio/meow-*`), https://opengameart.org/content/meow, https://opengameart.org/content/cat-purr-meow, https://opengameart.org/content/kitten-mew |
| Water waves | transitking (OpenGameArt) | CC0 | Breaking waves (`audio/wave-*`), https://opengameart.org/content/water-waves |
| Sea and river wave sounds | RandomMind (OpenGameArt) | CC0 | Shore bed loop (`audio/bed-shore`), https://opengameart.org/content/sea-and-river-wave-sounds |
| Ambient bird sounds | isaiah658 (OpenGameArt) | CC0 | Birdsong bed loop (`audio/bed-birds`), https://opengameart.org/content/ambient-bird-sounds |
| Fireplace Sound loop | PagDev (OpenGameArt) | CC0 | Campfire bed loop (`audio/bed-fire`), https://opengameart.org/content/fireplace-sound-loop |
| Fire Crackling | AntumDeluge (OpenGameArt) | CC0 | Campfire crackle pops (`audio/crackle-*`), https://opengameart.org/content/fire-crackling |
| Duck quacks | MOOBLOX contributors | CC0 | Synthesised by `client/tools/intake-audio.mjs` (`audio/quack-*`) |
| Fountain water | MOOBLOX contributors | CC0 | Synthesised at run time (filtered noise, `client/src/audio/water.ts`), no file |
| Baloo 2 | Ek Type (The Baloo 2 Project Authors) | SIL OFL 1.1 (`logo/fonts/OFL.txt`) | Mooblox wordmark, outlined to paths by `logo/build.py` (the font is not shipped to browsers), https://github.com/EkType/Baloo2 |
| Mooblox logo | MOOBLOX contributors | GPL-3.0 (this repo) | `logo/svg/`, plugin `pix/` (icon, favicon, loading-screen lockup), client `src/ui/brand/lockup.svg` (hub sign, HUD mark, fallback card) |
