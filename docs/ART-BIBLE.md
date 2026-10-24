# MOOBLOX art bible

The look of the world client: what makes it premium, the palette, the rules every generator and every round follow, and the
references behind them. Owner direction (2026-10-24): "Low quality polygons can be beautiful art too"; "design is what makes it
premium, not textures"; "this should run effortless on pretty much any device". Kids 8-12, browser, PC and touch.

## 1. The style: deliberate low-poly

Low-poly is the style itself, not a compromise. We aim for the family of Monument Valley, A Short Hike, Townscaper, Alto,
Polytopia and Islanders, with the blocky Roblox-like avatars we already have.

1. **Clean faceted shapes.** Every face is one palette colour under a hand-painted pattern (8.2). Tree crowns are puffy (smooth-shaded) canopies, rocks are big
   angular chunks, roofs are clean prisms. Strong silhouettes that read at 400 px wide.
2. **Light lives in the colours.** Lit faces warm, shaded faces cool, baked ambient occlusion darkens bases and corners, soft
   gradients run across the ground. One soft sun shadow on top, never required for the image to read.
3. **Beauty from colour, shape and composition.** A confident limited palette, a focal point per view, scale contrast, curated
   clusters with breathing room.
4. **Never imitate high detail.** Hand-painted pattern only (Section 8.2), no photo textures, no noise, no fake grime, no bloom or lens effects to "add quality".
5. **The avatars stay.** Kenney blocky kids, cube heads, simple faces (T1365 owns hair, skin and eyes).

**Anti-example: today's xhigh tier.** It puts bevels, ambientCG detail textures and GTAO onto the same shapes and the same
layout. It costs 2-4x the draw calls (135-299 vs 72) and about half the fps (20-29 vs 47-50) on the dev laptop and looks no
more designed. Premium comes from better shapes, better
layout and better colour; texture resolution is never the lever.

## 2. What is wrong with the T1309 island (the baseline)

| Problem | Where you see it |
| --- | --- |
| No focal point: the hub is an empty brown disc with a blue pad | overview and play stills |
| Same height everywhere: flat discs, two-storey houses of one size, no tower, no terrace that reads | overview |
| Uniform scatter: tufts, flowers and rocks sprinkled evenly, so nothing is a place | every district |
| Generic suburban houses repeated in every district: no district identity by silhouette | overview |
| Washed-out colour: white haze sky, grey-white cliffs, flat mid-green everywhere, no colour script | overview |
| Untreated primitives: the plaza and pads are flat circles and boxes with no edge, trim or step | play still |
| Shore is a ring of rocks: no coves, beaches or shallows gradient | overview |

## 3. Composition rules

1. **One focal landmark per view.** The hub has the tallest object in the world (clock tower). Each district has one hero
   landmark, the tallest object in that district, placed where the bridge from the hub points at it.
2. **Scale contrast: big, medium, small.** Per district: 1 landmark (big, 10-16 m), 3-6 medium buildings or kiosks (4-7 m),
   small dressing (0.3-2 m) in clusters. Never fill a district with medium-only objects.
3. **Designed terrain.** Every island has 2-3 terraces (0.8-1.5 m steps) with stairs or ramps, and a plaza that reads from
   above (paved shape, edge trim, centrepiece). Height breaks the disc silhouette; cliffs are banded, not a straight wall.
4. **Paths lead the eye.** Wide straight avenues from the hub to each bridge frame the landmark at their end. Inside a
   district, one loop path joins the activity spots; secondary paths are narrower and lighter.
5. **Curated clusters, not scatter.** Dressing comes in recipes (Section 6). Between clusters keep open lawn; at least 30% of
   each district's walkable ground is calm (one colour, no props).
6. **Readable zones.** A kid must name what a place is for from its silhouette and accent colour alone: activity spots keep
   their purpose colour, district identity comes from the landmark shape and one accent colour repeated 3-5 times
   (roofs, awnings, flags).
7. **Eye-level framing.** At play height the camera sees foreground (planters, lamps, stalls), mid-ground (activity spot,
   NPC) and background (landmark, roofs at different heights, sea and sky). Keep the top corners quiet for the HUD.

## 4. Colour script and palette

Late-morning light everywhere (one time of day for v1): warm sun, cool teal-violet shade, sky clear blue to warm cream.
Each colour has a lit and a shade value; the generator writes lit on up-facing and sun-facing faces, shade on the rest.

| Role | Lit | Shade | Note |
| --- | --- | --- | --- |
| Grass (main) | `#9BCB4E` | `#5FA866` | warm yellow-green to cool green |
| Grass (calm lawn) | `#86C25A` | `#3E8F6E` | slightly cooler, used for open lawns |
| Path terracotta | `#E0844F` | `#B4583A` | avenues and plazas |
| Path edging, trims | `#F4E6CC` | `#D2BC9A` | cream stone, every path and plaza edge |
| Walls | `#F6EAD3` | `#D9C3A5` | cream plaster |
| Roof teal | `#2FA39A` | `#1F7A78` | hub and one district accent |
| Roof coral | `#F07A5F` | `#C9564A` | |
| Roof sunflower | `#F6C445` | `#D49A2A` | |
| Wood | `#B97A4A` | `#8A5636` | bridges, docks, stalls |
| Cliff bands | `#ECC193`, `#D39A6E` | `#A8735C` | 2-3 bands, top lip in grass |
| Rock | `#C7BBC9` | `#8E86A3` | warm lavender-grey, never neutral grey |
| Foliage | `#5DB761` | `#2F8466` | canopy lit / under-canopy |
| Sand | `#F7E2AE` | `#E0C38A` | coves and beaches |
| Water | `#5ED8D2` shallow | `#1F5FA8` deep | `#1FA4C9` mid; foam `#FFFFFF` |
| Sky | `#3A8FDB` zenith, `#7DBDEB` upper | `#FBE3C2` horizon | warm `#FFD39A` glow under and round the sun, `#FFF6DF` sun disc |
| Far sea | `#3F86C6` at the horizon | `#1F5FA8` below | thin `#F3EBD9` line where sea meets sky |
| Clouds | `#FFFBF2` lit, `#FFE2B8` sun side | `#C9C6E0` underside | faceted cumulus, 3-5 lumps, flat bottoms, drifting |
| Shadow tint | `#4B5A8C` | | hemisphere ground colour and baked AO tint |
| Ink | `#2B2F3A` | | sign text, window frames only |

Activity purpose colours stay (they carry meaning): content `#2F7FE0`, assessment `#E5484D`, communication `#F6C445`,
collaboration `#FF9A3C`, interactive `#8E5AD8`. Saturation rule: purpose colours and the district accent are the most
saturated things in a view; everything else sits a step calmer.

### Atmosphere (round 5, the owner's "warm place, alive")

1. **The haze is the sky behind it.** Distance fades every object to the colour the sky dome draws along the same view ray
   (`skyColour`): above the horizon the warm cream, below it the far sea. Far islands melt into the view instead of a
   milky wall; never a flat fog colour.
2. **The sea reaches the horizon** in cobalt, with one bright line at the horizon; the cream lives only in the sky.
3. **Clouds are always in view**: a ring just above an eye-level horizon (4-15 degrees) plus a few higher, drifting slowly.
   Sky and clouds are one mesh, one draw, one program on every tier.
4. **Warm key, cool-violet bounce**: sun `#FFE6BF` from about 38 degrees, hemisphere sky `#DCE8F8` over a violet bounce
   `#8A7290`, so faces turned from the sun stay warm-violet, never grey. Neutral tone mapping keeps the palette's hue.
5. **Life in every view**: gulls wheel over the player's island, water twinkles on the sun side, flags and trees sway.

## 5. Shape language and landmarks

- **Friendly places** (plazas, kiosks, pads): rounded squares, soft arches, chamfered corners.
- **Landmarks**: one vertical, pointed or domed silhouette per district, unique in the world.
- **Nature**: puffy smooth-shaded cones (conifers) and spheres (round trees, bushes), angular chunks (rocks). Trees in clumps of
  3-5 with mixed sizes, never a single lonely tree on open lawn except as a deliberate accent.

### Soft and crisp, per object (round 7, owner: "Not everything needs to be rounded ... depends on the object")

The contrast between soft and crisp is the point. Baked into the shared models for every tier (`tools/round-kit.py`):

| Rule | Objects | How |
| --- | --- | --- |
| Soft | tree crowns, bushes | smooth-shaded normals (puffy), no extra triangles |
| Round | hedges, signs, lamps, barrels, pots, planters, fountains, mushrooms, tents, boats; island rims; plot pads | one bevel + smooth normals; rims a rolled grass lip; pads rounded corners |
| Soft edges | buildings, market stalls, roofs | one chamfer on long edges only (wall corners, eaves, ridges) |
| Bulging | house roofs, landmark domes, tent and keeper's-house roofs, canopies | slopes split 3x3 and pushed out most at mid-slope, smooth-shaded (pillowy); spires keep crisp hips with a flared, curved profile; mansard roofs stay flat |
| Crisp | planks, bridges, docks, fences, stone steps, crates, logs, carts, windows, doors, rocks, small dressing | left sharp |
| Cut stone | island cliffs | columns of chunky blocks: two-facet faces meeting at a ridge, one chamfer on the top edge, seams between columns; grass tongues hang soft over them |

Districts get a theme (from the section's dominant activity purpose, else in order) with a hand-made landmark:

| Theme | Landmark | Accent | Medium pieces |
| --- | --- | --- | --- |
| Hub | Clock tower on a stepped plinth, arched door, flared curved teal roof, rooster vane; fountain centrepiece | teal | market stalls, planters, lamp pairs |
| Library | Podium with a grand stair, four-column portico and pediment, drum of round windows, ribbed dome | teal | book kiosk, reading garden, giant open book |
| Science | Big faceted glass greenhouse dome with white ribs, round-nosed rocket by its gantry | lime / white | telescope, planters, weather mast |
| Sports | Mini stadium ring, curved canopy over the back stand, arched gate, coral flags | coral | goal, bleachers, track loop |
| Arts | Big striped theatre tent with a bulging roof, scalloped valance and arched entrance | sunflower | stage, easels, bunting |
| Harbour / nature | Lighthouse with gallery and domed cap beside a round keeper's house, on a rocky point | red-white | boats, nets, reeds, beach umbrellas |

Landmarks are bespoke models (Blender or composed kit pieces with their own faceted parts), never a recoloured house.

## 6. Set dressing rules

- **Cluster recipes**, placed as units: market corner (2 stalls + crates + barrel + bench + 1 tree); reading nook (bench +
  planter + lamp + bush clump); activity spot (pad with edged rim + signpost + 1 planter + 1 lamp + bench); beach set
  (2 umbrellas + towels + lifebuoy); garden bed (raised planter + flowers in 2 colours + low hedge).
- **Flowers only in beds or along edges**, in 2-3 colours per bed, never sprinkled across lawns.
- **Lamps in pairs** along avenues, at bridge heads and at plaza entries.
- **The spawn plaza is framed, not open lawn** (hub concept): a ring of raised planters just outside the paving (terracotta
  kerb, cream cap rim, puffy clipped hedge blocks, flowers between), cut into runs with walk-through gaps, open at every
  entry, cream square posts at each run end, a lamp pair at each entry, benches inside facing the spawn pad.
- **Island cliffs are designed, not a wall** (overview, district and shore concepts; `world/cliff-wall.ts`): columns 2-3.4 m
  wide of stacked stone in the cliff bands (upper `#ECC193` block under the grass lip, 1-2 lower `#D39A6E` strata each
  stepping out 0.15-0.4 m towards the water), a third of the column tops notched lower, grass tongues hanging from the
  lip on about 60% of columns, lavender toe rocks at the waterline (some with a bush), none under bridges or docks.
- **Shore**: coves with sand, foam rings around rocks and islands, a turquoise-to-cobalt gradient, a dock per island at most,
  reeds and lilies only in sheltered coves.
- **Life** sits where the story is: kids at hangouts and on paths, gulls over docks, ducks in coves, butterflies over beds.
- **Charming details that tell a story**: one per district (a rocket ready to launch, a giant book open on the lawn, a
  painting on an easel, a lost ball by the goal). Small cost, big memory.

## 7. What not to do

1. Uniform random scatter of any prop class.
2. Same-height everything: flat discs, one building size, no terraces.
3. Textures, noise or post effects used to add "quality" to unchanged shapes.
4. Neutral grey or black shadows and rocks; white haze skies.
5. Untreated primitives: a flat disc or box with no edge trim, step or rim.
6. Repeating the same building in every district.
7. Highly saturated colours everywhere (only purpose colours and the district accent are loud).
8. Hiding activity spots behind dressing: the pad and its sign always stay visible from the path.

## 8. Budget-first art rules (every device)

Target: old phones and Chromebooks at 60 fps on the low tier. Low-poly is the style itself, not a compromise: the art rules
above are what make it premium, and they cost almost nothing to render.

1. **Every tier shares the same designed world**: same terrain, landmarks, clusters, palette and composition. Tiers differ only
   in cost: shadows (off on low), density of minor dressing, life count and effects.
2. **Colour by vertex, painted surface by one atlas** (round 7, owner: "everything is plain, the floor is just plain
   colours"). Vertex colours carry the palette and baked AO; one hand-painted greyscale array texture (`world/surface-atlas.ts`,
   14 layers of 512 px, 256 px on low, painted at boot, mip-mapped) adds the texture language on every tier: grass tufts and
   clover, flower meadows, brick courses, flagstones with cracks, plank seams and nails, shingles, plaster, rock facets, cliff
   strata, sand ripples, dirt pebbles. The layer comes from a `surface` tag where a builder knows it (island land), else from
   the vertex colour and slope; it multiplies the colour (never replaces the palette) and fades to plain with distance. No
   photo textures, no noise; no extra draws or materials. Ground decals (meadows, worn dirt, puddles) merge into the land;
   grass tufts and pebbles scatter near the player in one draw.
3. **Lighting is baked in.** Lit/shade per face and AO are written by the generator; real-time light is one hemisphere plus one
   sun. Shadow maps are a tier extra.
4. **No post-processing in the look.** The image is finished before any post pass; bloom, GTAO and DoF are never needed.
5. **Sky and water are cheap shaders**: a gradient sky, flat-shaded water with a vertex-colour depth gradient and foam ring
   meshes; no reflection or refraction passes.
6. **Polygons go to silhouettes.** Landmarks may spend 1-3k triangles each; a tree 30-80, a rock 12-40, a flower bed one
   instanced mesh. Merge static scenery per district, instance repeats; distance drops minor dressing, never landmarks.
7. **Measure every round** on the low tier with all 4 course shapes; draw-call and triangle budgets live in the repo
   `CLAUDE.md` (set by T1366).

## 9. Reference board

| Reference | Link | Take from it |
| --- | --- | --- |
| Monument Valley | https://www.monumentvalleygame.com/ | limited palette per scene, gradient skies, one sculptural focal object |
| A Short Hike | https://ashorthike.com/ · [making-of](https://blog.playstation.com/2021/08/05/crafting-a-tiny-open-world-a-look-behind-the-scenes-at-the-creation-of-a-short-hike/) | tiny world with a peak landmark visible from everywhere; palette sampled from nature |
| Townscaper | [how it works](https://www.gamedeveloper.com/game-platforms/how-townscaper-works-a-story-four-games-in-the-making) | procedural placement of hand-made pieces that always looks designed; roof colour rhythm |
| Bad North | [WFC dioramas](https://80.lv/articles/using-wave-function-collapse-algorithm-for-dioramas) | procedural island dioramas with banded cliffs and readable terraces |
| Alto's Odyssey | https://altosodyssey.com/ | colour script, layered silhouettes, sky gradients doing the mood |
| Polytopia | https://polytopia.io/ | faceted low-poly that reads at tiny size; colour identity per group |
| Islanders | https://store.steampowered.com/app/1046030/ISLANDERS/ | pastel low-poly islands, buildings readable by shape, shallow-to-deep sea |
| Animal Crossing: New Horizons | https://animal-crossing.com/new-horizons/ | cliff tiers, curated decoration, cosy scale contrast |
| Adopt Me (Roblox) | https://www.roblox.com/games/920587237/Adopt-Me | hub with landmark buildings, one district per activity |
| Bee Swarm Simulator (Roblox) | https://www.roblox.com/games/1537690962/Bee-Swarm-Simulator | zones readable from above by colour |
| Brookhaven (Roblox) | https://www.roblox.com/games/4924922222/Brookhaven-RP | town avenues, varied building heights |
| Royale High (Roblox) | https://www.roblox.com/games/735030788/Royale-High | strong colour identity per realm |
| Mobile hand-painted workflow | [80.lv](https://80.lv/articles/studying-hand-painted-texturing-workflow-for-stylized-art) | budget mindset: spend vertices only where they show |

## 10. Concept targets (T1364)

Generated with `concept-img` (google/gemini-3-pro-image, 2K, 16:9); prompts and PNGs in the T1364 research folder, JPEGs at
`~/drop/T1364/concept/`. The two faceted images are the style target; the other five are composition targets only (their
rounded painterly surfaces are not the style).

| Image | Target for |
| --- | --- |
| `facet-play.jpg` | **Style target**, eye-level play view: avenue framing the clock tower, foreground/mid/background |
| `facet-overview.jpg` | **Style target**, whole campus: landmark per district, terraces, turquoise shallows |
| `hub.jpg` | hub plaza composition: radial paving, fountain, tower at the edge, planters, stalls |
| `district.jpg` | district composition: landmark on a terrace, loop path, activity clusters, story detail |
| `shore.jpg` | shoreline: cove, banded cliffs, foam, dock, lighthouse |
| `play.jpg`, `overview.jpg` | painterly variants of the two style targets, for layout comparison |

## 11. Round checklist

Each round's stills (overview 1366, eye-level 1366, play 400) pass when: a focal landmark reads in each view; districts are
nameable by silhouette; no uniform scatter; at least 2 terrain levels per island; palette values from Section 4; the low
tier keeps 60 fps on all 4 shapes and looks like the same world as high.
