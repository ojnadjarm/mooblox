# Mooblox logo

Design B (T1400, picked by the owner 2026-10-26): a block island with a teal-domed tower and a two-colour Baloo 2 wordmark.

| File | Use |
|---|---|
| `svg/lockup.svg` | Colour lockup with a white sticker edge: README, loading screen, HUD mark, fallback card |
| `svg/mono.svg` | One-colour lockup (`currentColor`, ink `#2B2F3A`) |
| `svg/icon.svg` | Colour icon: favicon of `play.php` and `index.php` |
| `svg/icon-mono.svg` | One-colour icon |

Rebuild every copy (`svg/`, `moodle/local/mooblox/pix/{icon,favicon,logo}.svg`, `client/src/ui/brand/lockup.svg`) and the
hub sign's letter outlines (`client/src/hub/wordmark.json`: flattened glyph shapes with holes, plus the sticker plate):

    uv run --with fonttools --with shapely python3 logo/build.py

The wordmark is outlined to SVG paths (`textpath.py`, fontTools), so no file needs the font at run time. The font
`fonts/Baloo2.ttf` (variable, set to weight 800) is here only for the build, under the SIL Open Font License 1.1
(`fonts/OFL.txt`, Copyright 2019 The Baloo 2 Project Authors). The plugin icon `pix/icon.svg` is the one-colour icon at
24 px in Moodle's icon ink `#212529`.
