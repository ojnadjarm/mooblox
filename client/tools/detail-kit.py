# Designed detail for the shared kit (every tier), headless Blender 5, after tools/round-kit.py:
#   blender -b -P tools/round-kit.py -- kit-src <a>; blender -b -P tools/detail-kit.py -- <a> <b>; node tools/pack-kit.mjs <b>
# Per object recipes (ART-BIBLE.md soft/crisp rules): wood tops split into planks with dark seams, crates and carts planked,
# barrel staves seamed and the lid sunk in its rim, house doors in vertical boards, stall tables and sign boards in planks,
# fence posts pointed, lamp posts with two collars, leaf clumps on broadleaf crowns and hedge tops, sunlit pine tiers,
# moss pads and pebbles on rocks, blossom window boxes and shutter pairs at house windows, inner leaf fans on bushes, clumps on
# planter shrubs, a plant in the pot, hearts on flowers, fountain rims in stone blocks, growth rings and bark plates on the stump,
# logs and embers in the campfire, white spots on mushroom caps, sewn panels on the tent, leaf clumps on the suburb tree, sunlit
# grass tips, fuller flat plants, moss at path stones, rope lashings and a coil on the dock, melon stems, sprouts, cream stripes on
# stall awnings, a finial on the lantern cap, studs on barrel hoops, strata lines on the cliff steps, a planked bridge deck. Seams and
# sunk walls use a darker copy of the face's own material (base colour factor), so the kit stays one colormap and the baked vertex
# colours carry them.
# The imported corner normals ride through the edit as an attribute: untouched faces (pillowy roofs, bevels) keep their shading.
import bpy, colorsys, math, os, sys

import bmesh
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

args = sys.argv[sys.argv.index('--') + 1:]
src, dst = os.path.abspath(args[0]), os.path.abspath(args[1])

SEAM = 0.55   # seam and sunk-wall colour factor
WIDTH = 0.012  # seam width, fraction of the model's size
DEPTH = 0.008  # seam depth, fraction of the model's size
MOSS = (0.16, 0.38, 0.05, 1.0)  # linear moss green on rock tops


def texel(img, mats):
    """Colour lookup of a face's average UV on the colormap (sRGB floats); untextured faces give their material colour."""
    if img is None:
        return lambda face, uv: [c ** (1 / 2.2) for c in base(mats[face.material_index])[:3]]
    w, h = img.size
    px = img.pixels[:]

    def at(face, uv):
        u = sum(l[uv].uv.x for l in face.loops) / len(face.loops)
        v = sum(l[uv].uv.y for l in face.loops) / len(face.loops)
        k = (min(h - 1, int((v % 1) * h)) * w + min(w - 1, int((u % 1) * w))) * 4
        return px[k:k + 3]
    return at


def wood(c):
    h, s, v = colorsys.rgb_to_hsv(*c)
    return 0.02 < h < 0.12 and s > 0.3 and 0.3 < v < 0.95


def base(mat):
    return next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value


def image(mat):
    return next((n.image for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE'), None)


def shade_material(mat):
    """A copy of the material whose base colour is the texture (or its colour) times SEAM (exported as baseColorFactor)."""
    m = mat.copy()
    m.name = mat.name + '-seam'
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    tex = next((n for n in nodes if n.type == 'TEX_IMAGE'), None)
    if tex is None:
        c = bsdf.inputs['Base Color'].default_value
        bsdf.inputs['Base Color'].default_value = (c[0] * SEAM, c[1] * SEAM, c[2] * SEAM, c[3])
        return m
    mix = nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 1.0
    mix.inputs[7].default_value = (SEAM, SEAM, SEAM, 1.0)
    links.new(tex.outputs['Color'], mix.inputs[6])
    links.new(mix.outputs[2], bsdf.inputs['Base Color'])
    return m


def axis(face):
    """Longest edge of a face (plank direction)."""
    return max(face.edges, key=lambda e: e.calc_length())


def planks(bm, face, n):
    """Splits a quad into n strips along its longest edge; returns the strips."""
    if len(face.verts) != 4 or n < 2:
        return [face]
    long = axis(face)
    ends = [e for e in face.edges if e is not long and (e.verts[0] in long.verts or e.verts[1] in long.verts)]
    res = bmesh.ops.subdivide_edges(bm, edges=ends, cuts=n - 1, use_grid_fill=True)
    strips = [f for f in res['geom_inner'] + res['geom'] if isinstance(f, bmesh.types.BMFace)]
    return list({f for f in strips if f.is_valid}) or [face]


def rect(face):
    """A quad with right-angled corners (planks, boards; no slivers or fan pieces)."""
    return len(face.verts) == 4 and all(abs(l.calc_angle() - 1.5708) < 0.15 for l in face.loops)


def paint(bm, faces, slot):
    """Darker material and flat shading on new seam and wall faces."""
    flat = bm.faces.layers.int.get('flat')
    for f in faces:
        f.material_index = slot(f.material_index)
        f[flat] = 1


def seams(bm, faces, size, slot, any_shape=False, short=False):
    """Insets each face by a seam, sinks it a little and paints the seam ring with the darker material slot."""
    faces = [f for f in faces if f.is_valid and (any_shape or rect(f)) and (short or min(e.calc_length() for e in f.edges) > 5 * WIDTH * size)]
    if not faces:
        return
    res = bmesh.ops.inset_individual(bm, faces=faces, thickness=WIDTH * size, depth=-DEPTH * size, use_even_offset=True)
    paint(bm, res['faces'], slot)


def sink(bm, faces, rim, depth, slot):
    """A flat rim of width `rim` round the region, then the region sunk by `depth` with darker walls."""
    bmesh.ops.inset_region(bm, faces=faces, thickness=rim, depth=0.0, use_even_offset=True)
    r2 = bmesh.ops.inset_region(bm, faces=faces, thickness=rim * 0.05, depth=-depth, use_even_offset=True)
    paint(bm, r2['faces'], slot)


def boards(bm, region, d, n, size, slot):
    """Cuts a flat region into n boards across direction d, merges each board to one face and seams it (any outline)."""
    if not region or n < 2:
        return
    ps = [v.co.dot(d) for f in region for v in f.verts]
    lo, hi = min(ps), max(ps)
    blocks(bm, region, [(d * (lo + (hi - lo) * k / n), d) for k in range(1, n)], size, slot)


def blocks(bm, region, planes, size, slot, short=False):
    """Cuts a flat region by planes (point, normal), merges each piece to one face and seams it (any outline)."""
    tag = bm.faces.layers.int.get('board')
    for f in bm.faces:
        f[tag] = 0
    for f in region:
        f[tag] = 1
    bmesh.ops.remove_doubles(bm, verts=list({v for f in region for v in f.verts}), dist=1e-5)
    for co, no in planes:
        faces = [f for f in bm.faces if f[tag]]
        geom = faces + list({e for f in faces for e in f.edges}) + list({v for f in faces for v in f.verts})
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, dist=1e-6)
    on_cut = lambda e: any(all(abs((v.co - co).dot(no)) < 1e-5 for v in e.verts) for co, no in planes)
    inner = [e for e in bm.edges if len(e.link_faces) == 2 and all(f[tag] for f in e.link_faces) and not on_cut(e)]
    bmesh.ops.dissolve_edges(bm, edges=inner, use_verts=True)
    seams(bm, [f for f in bm.faces if f[tag]], size, slot, any_shape=True, short=short)


def point(bm, faces, rise, slot):
    """Pokes each post top and lifts its centre into a low pyramid (a pointed fence post)."""
    res = bmesh.ops.poke(bm, faces=faces)
    for v in res['verts']:
        v.co.z += rise
    paint(bm, res['faces'], lambda i: i)


def collars(bm, post, zs, band, out, slot, uv):
    """Octagonal rings round a post at heights zs, in the darker copy of the post's colour (flat, crisp metal)."""
    vs = [v.co for f in post for v in f.verts]
    cx, cy = sum(v.x for v in vs) / len(vs), sum(v.y for v in vs) / len(vs)
    r = max(Vector((v.x - cx, v.y - cy)).length for v in vs) + out
    mi, luv = slot(post[0].material_index), post[0].loops[0][uv].uv.copy()
    flat = bm.faces.layers.int.get('flat')
    for z in zs:
        m = Matrix.Translation((cx, cy, z + band / 2)) @ Matrix.Rotation(math.pi / 8, 4, 'Z')
        res = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=8, radius1=r, radius2=r, depth=band, matrix=m)
        for f in {f for v in res['verts'] for f in v.link_faces}:
            f.material_index = mi
            f[flat] = 1
            for lo in f.loops:
                lo[uv].uv = luv


def lighter(mat):
    """A sunlit copy of an untextured leaf material: brighter and a little warmer."""
    m = mat.copy()
    m.name = mat.name + '-sun'
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color']
    c = b.default_value
    b.default_value = (min(1, c[0] * 1.45), min(1, c[1] * 1.12), min(1, c[2] * 0.85), c[3])
    return m


def texel_uv(x, y):
    """UV of colormap pixel (x, y) (512 px Kenney colormaps)."""
    return Vector(((x + 0.5) / 512, 1 - (y + 0.5) / 512))


def dome(bm, base, d, r, h, mi, uv, luv=None, smooth=True, sides=6, rot=0.0):
    """An open low-poly dome (one ring of `sides` tris) from `base` along d: a leaf clump when smooth, a pebble when flat."""
    d = d.normalized()
    m = Matrix.Translation(base + d * h / 2) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4() @ Matrix.Rotation(rot, 4, 'Z')
    res = bmesh.ops.create_cone(bm, cap_ends=False, cap_tris=False, segments=sides, radius1=r, radius2=0, depth=h, matrix=m)
    kn, flat = bm.loops.layers.float_vector.get('kn'), bm.faces.layers.int.get('flat')
    for f in {f for v in res['verts'] for f in v.link_faces}:
        f.material_index = mi
        f[flat] = 0 if smooth else 1
        for lo in f.loops:
            if luv is not None:
                lo[uv].uv = luv
            if kn is not None:
                out = lo.vert.co - base - d * (lo.vert.co - base).dot(d)
                lo[kn] = (out.normalized() * 0.75 + d).normalized() if out.length > 1e-6 else d


def block(bm, lo_, hi_, n, mi, uv, luv):
    """A crisp box between corners lo_ and hi_ in the frame (across = n x z, out = n, up = z)."""
    across = Vector((n.y, -n.x, 0)).normalized()
    c = (lo_ + hi_) / 2
    d = hi_ - lo_
    basis = Matrix((across, n, Vector((0, 0, 1)))).transposed().to_4x4()
    m = Matrix.Translation(c) @ basis @ Matrix.Diagonal((abs(d.dot(across)), abs(d.dot(n)), abs(d.z), 1))
    res = bmesh.ops.create_cube(bm, size=1, matrix=m)
    flat = bm.faces.layers.int.get('flat')
    for f in {f for v in res['verts'] for f in v.link_faces}:
        f.material_index = mi
        f[flat] = 1
        for lo in f.loops:
            lo[uv].uv = luv


def crown(bm, leaves, count, rel, mi, seed, uv=None, luv=None):
    """Leaf clusters bulging out of the upper crown, placed by casting at the crown from evenly spread directions."""
    if not leaves:
        return
    vs = list({v for f in leaves for v in f.verts})
    tree = BVHTree.FromPolygons([v.co for v in vs], [[vs.index(v) for v in f.verts] for f in leaves])
    c = sum((v.co for v in vs), Vector()) / len(vs)
    reach = max((v.co - c).length for v in vs)
    r = rel * reach
    for k in range(count):
        z = 0.25 + 0.7 * (k + 0.5) / count
        a = seed + k * 2.39996
        d = Vector((math.cos(a) * math.sqrt(1 - z * z), math.sin(a) * math.sqrt(1 - z * z), z))
        hit = tree.ray_cast(c + d * reach * 2, -d)[0]
        if hit is not None:
            dome(bm, hit - d * r * 0.25, d, r * (0.85 + 0.3 * ((k * 7) % 3) / 2), r * 0.55, mi, uv, luv, rot=k)


def coloured(mats, src, name, rgb):
    """A plain copy of material src in a new linear colour (exported as its base colour factor); returns its slot."""
    m = mats[src].copy()
    m.name = name
    next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = (*rgb, 1.0)
    mats.append(m)
    return len(mats) - 1


def fan(bm, leaves, turns, mi):
    """Inner leaf fans: copies of the blades turned and shrunk about the plant's foot, in the sunlit material (fuller, two-tone)."""
    vs = list({v for f in leaves for v in f.verts})
    kn = bm.loops.layers.float_vector.get('kn')
    foot = Vector((sum(v.co.x for v in vs) / len(vs), sum(v.co.y for v in vs) / len(vs), min(v.co.z for v in vs)))
    for k, (turn, scale) in enumerate(turns):
        res = bmesh.ops.duplicate(bm, geom=leaves)
        new = [g for g in res['geom'] if isinstance(g, bmesh.types.BMVert)]
        m = Matrix.Translation(foot) @ Matrix.Rotation(turn, 4, 'Z') @ Matrix.Diagonal((scale, scale, scale * 1.08, 1)) @ Matrix.Translation(-foot)
        bmesh.ops.transform(bm, matrix=m, verts=new)
        rot = Matrix.Rotation(turn, 3, 'Z')
        for f in [g for g in res['geom'] if isinstance(g, bmesh.types.BMFace)]:
            f.material_index = mi
            if kn is not None:
                for lo in f.loops:
                    lo[kn] = rot @ Vector(lo[kn])


def ring_planes(c, n):
    """n radial planes through c: 2n blocks round a ring."""
    return [(c, Vector((-math.sin(math.pi * k / n), math.cos(math.pi * k / n), 0))) for k in range(n)]


def components(faces):
    """Edge-connected groups of faces."""
    left, out = set(faces), []
    while left:
        stack, group = [left.pop()], []
        while stack:
            f = stack.pop()
            group.append(f)
            for e in f.edges:
                for g in e.link_faces:
                    if g in left:
                        left.remove(g)
                        stack.append(g)
        out.append(group)
    return out


def shutter_pair(bm, tree, g, wh, size, uv, luv):
    """Crisp shutters both sides of a window frame (none when the wall cannot carry the pair), in the roof's green (repainted with it)."""
    a0, a1, z0, z1 = g['box']
    n, across, base = g['n'], g['across'], g['n'] * g['off']
    tol = 0.004 * size

    def offset(a, z):
        h = tree.ray_cast(base + across * a + Vector((0, 0, z)) + n * size, -n)[0]
        return None if h is None else n.dot(h)
    zm, step = (z0 + z1) / 2, 0.02 * wh
    zlo, zhi = z0 - 0.08 * wh, z1 + 0.08 * wh
    pair = []
    for side in (-1, 1):
        edge = a0 if side < 0 else a1
        seq = [offset(edge + side * j * step, zm) for j in range(60)]
        if None in seq[:30]:
            return 0
        frame = max(seq[:30])
        j = next((j for j in range(60) if seq[j] is not None and seq[j] > frame - tol), 60)
        j = next((k for k in range(j, 60) if seq[k] is None or seq[k] < frame - tol), 60)
        if j == 60 or seq[j] is None or frame - seq[j] > 0.5 * wh:
            return 0
        wall, near = seq[j], edge + side * j * step
        sw = next((w for w in (0.5 * (a1 - a0), 0.4 * (a1 - a0), 0.3 * (a1 - a0)) if all(
            (lambda o: o is not None and abs(o - wall) < tol)(offset(near + side * w, z)) for z in (zlo, zm, zhi))), None)
        if sw is None or sw < 0.25 * wh:
            return 0
        pair.append((near, near + side * min(sw, 0.6 * wh), wall, frame))
    for near, far, wall, frame in pair:
        lo_ = across * min(near, far) + n * wall + Vector((0, 0, zlo))
        hi_ = across * max(near, far) + n * (wall + 0.7 * (frame - wall)) + Vector((0, 0, zhi))
        block(bm, lo_, hi_, n, 0, uv, luv)
    return len(pair)


def windows(bm, col, uv, top, size):
    """Window boxes under every glass pane group: a terracotta box heaped with blossom clusters (green would be repainted as roof)."""
    glass = [f for f in bm.faces if abs(f.normal.z) < 0.1 and (lambda c: c[2] > 0.9 and c[2] - c[0] > 0.1 and c[0] > 0.6)(col(f, uv))]
    groups = []
    for f in glass:
        n = f.normal.copy()
        across = Vector((n.y, -n.x, 0)).normalized()
        ps = [v.co for v in f.verts]
        box = [min(p.dot(across) for p in ps), max(p.dot(across) for p in ps), min(p.z for p in ps), max(p.z for p in ps)]
        off = n.dot(f.calc_center_median())
        gap = 0.06 * top
        for g in groups:
            if (g['n'] - n).length < 0.1 and abs(g['off'] - off) < 0.05 * size and box[0] < g['box'][1] + gap and g['box'][0] < box[1] + gap \
                    and box[2] < g['box'][3] + gap and g['box'][2] < box[3] + gap:
                g['box'] = [min(g['box'][0], box[0]), max(g['box'][1], box[1]), min(g['box'][2], box[2]), max(g['box'][3], box[3])]
                break
        else:
            groups.append({'n': n, 'across': across, 'off': off, 'box': box})
    tree = BVHTree.FromBMesh(bm)
    roof = next((f.loops[0][uv].uv.copy() for f in bm.faces if f.normal.z > 0.3 and (lambda c: c[1] > c[0] * 1.4 and c[1] > c[2] * 1.2)(col(f, uv))), None)
    pot = texel_uv(324, 260)
    blooms = [texel_uv(196, 132), texel_uv(68, 132), texel_uv(452, 132), texel_uv(196, 260)]
    count = shutters = 0
    for g in groups:
        a0, a1, z0, z1 = g['box']
        n, across, wh = g['n'], g['across'], g['box'][3] - g['box'][2]
        if wh < 0.05 * top or a1 - a0 < 0.05 * top:
            continue
        pad = 0.2 * wh
        mid = (a0 + a1) / 2
        base = across * mid + n * g['off']
        wall = tree.ray_cast(base + Vector((0, 0, z0 - pad * 1.6)) + n * size, -n)[0]
        frame = tree.ray_cast(base + Vector((0, 0, z0 - pad * 0.5)) + n * size, -n)[0]
        if wall is None:
            continue
        w0 = n.dot(wall)
        out = max(0.0, (n.dot(frame) - w0) if frame is not None else 0.0) + 0.24 * wh
        zt = z0 - pad * 0.9
        half = (a1 - a0) / 2 + pad * 0.7
        lo_ = across * (mid - half) + n * w0 + Vector((0, 0, zt - 0.3 * wh))
        hi_ = across * (mid + half) + n * (w0 + out) + Vector((0, 0, zt))
        block(bm, lo_, hi_, n, 0, uv, pot)
        k = max(3, round(2 * half / (0.34 * wh)))
        r = 0.6 * (2 * half) / k
        for i in range(k):
            p = across * (mid - half + r * 0.9 + (2 * half - 1.8 * r) * i / max(1, k - 1)) + n * (w0 + out * 0.5) + Vector((0, 0, zt + r * 0.15))
            dome(bm, p - Vector((0, 0, r * 0.2)), Vector((0, 0, 1)), r * 1.05, r * 0.6, 0, uv, blooms[(i + count) % len(blooms)], sides=5, rot=i)
        shutters += shutter_pair(bm, tree, g, wh, size, uv, roof) if roof else 0
        count += 1
    print(f'  windows {count} shutters {shutters}')


def rock(bm, size, mats, slot, seed):
    """Moss pads inset on the upward dirt faces (the old grass bits turn moss too), two crisp pebbles at the foot."""
    dirt = next((i for i, m in enumerate(mats) if 'dirt' in m.name.lower()), 0)
    grass = {i for i, m in enumerate(mats) if 'grass' in m.name.lower()}
    tops = [f for f in bm.faces if f.normal.z > 0.75 and f.material_index == dirt and f.calc_area() > 0.01 * size * size]
    if tops:
        moss = mats[dirt].copy()
        moss.name = 'moss'
        next(n for n in moss.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = MOSS
        mats.append(moss)
        for f in tops:
            t = 0.22 * min(e.calc_length() for e in f.edges)
            bmesh.ops.inset_individual(bm, faces=[f], thickness=t, depth=0.004 * size, use_even_offset=False)
            f.material_index = len(mats) - 1
        for f in bm.faces:
            if f.material_index in grass:
                f.material_index = len(mats) - 1
    vs = [v.co for v in bm.verts]
    cx, cy = sum(v.x for v in vs) / len(vs), sum(v.y for v in vs) / len(vs)
    rr = max(Vector((v.x - cx, v.y - cy)).length for v in vs)
    for k in range(2):
        a = seed + k * 2.6
        dome(bm, Vector((cx + math.cos(a) * rr * 0.95, cy + math.sin(a) * rr * 0.95, 0)), Vector((0, 0, 1)), (0.05 + 0.02 * k) * size,
             (0.04 + 0.015 * k) * size, slot(dirt), None, smooth=False, sides=5, rot=a)


def rings(bm, faces, steps, slot):
    """Growth rings: the region inset in turns of (gap, line) widths, each line ring painted in the darker slot."""
    for gap, line in steps:
        bmesh.ops.inset_region(bm, faces=faces, thickness=gap, depth=0.0, use_even_offset=True)
        res = bmesh.ops.inset_region(bm, faces=faces, thickness=line, depth=0.0, use_even_offset=True)
        paint(bm, res['faces'], slot)


def campfire(bm, mats, uv, size):
    """Three crossed logs and a low ember heap inside the stone ring (crisp boxes, a flat dome)."""
    vs = [v.co for v in bm.verts]
    c = Vector(((min(v.x for v in vs) + max(v.x for v in vs)) / 2, (min(v.y for v in vs) + max(v.y for v in vs)) / 2, 0))
    log = coloured(mats, 0, 'campfire-log', (0.36, 0.14, 0.05))
    ember = coloured(mats, 0, 'campfire-ember', (1.0, 0.32, 0.03))
    dome(bm, c, Vector((0, 0, 1)), 0.16 * size, 0.12 * size, ember, uv, Vector((0, 0)), smooth=False, sides=6)
    half, t = 0.2 * size, 0.045 * size
    for k in range(3):
        a = k * math.pi / 3 + 0.3
        n = Vector((math.cos(a), math.sin(a), 0))
        across = Vector((n.y, -n.x, 0))
        z = 0.01 * size + k * 0.6 * t
        block(bm, c - across * half - n * t / 2 + Vector((0, 0, z)), c + across * half + n * t / 2 + Vector((0, 0, z + t)), n, log, uv, Vector((0, 0)))


def spots(bm, caps, uv, white):
    """White spots on each mushroom cap: flat 5-sided domes on its upper side faces."""
    for cap in components(caps):
        side = sorted([f for f in cap if 0.35 < f.normal.z < 0.9], key=lambda f: -f.calc_area())
        vs = [v.co for f in cap for v in f.verts]
        r = max(max(v.x for v in vs) - min(v.x for v in vs), max(v.y for v in vs) - min(v.y for v in vs)) / 2
        for k, f in enumerate(side[:4]):
            n = f.normal.copy()
            dome(bm, f.calc_center_median() - n * 0.02 * r, n, 0.28 * r, 0.1 * r, white, uv, smooth=False, sides=5, rot=k)


def tips(bm, mats, prefix, frac, top):
    """Sunlit blade tips: faces of the leaf material above frac of the height take its lighter copy; returns that slot."""
    li = next(i for i, m in enumerate(mats) if m.name.startswith(prefix))
    mats.append(lighter(mats[li]))
    for f in bm.faces:
        if f.material_index == li and f.calc_center_median().z > frac * top:
            f.material_index = len(mats) - 1
    return li, len(mats) - 1


def stones(bm, mats, size):
    """Paving stones: moss tufts at three stone feet."""
    moss = coloured(mats, 0, 'moss-path', MOSS[:3])
    sides = sorted([f for f in bm.faces if abs(f.normal.z) < 0.3 and f.calc_area() > 0.002 * size * size], key=lambda f: -f.calc_area())
    for k, f in enumerate(sides[:6:2]):
        c, n = f.calc_center_median(), f.normal.copy()
        dome(bm, Vector((c.x, c.y, 0)) + n * 0.02 * size, Vector((0, 0, 1)), 0.035 * size, 0.025 * size, moss, None, sides=5, rot=k)


def dock(bm, slot, uv):
    """Rope lashings round the four piles under their caps and a rope coil on the middle board (crisp, tan colormap texel)."""
    rope = texel_uv(32, 344)
    zt = max(v.co.z for v in bm.verts)
    n = Vector((0, 1, 0))
    for cap in components([f for f in bm.faces if f.normal.z > 0.9 and f.calc_center_median().z > zt - 0.01]):
        vs = [v.co for f in cap for v in f.verts]
        c = Vector((sum(v.x for v in vs) / len(vs), sum(v.y for v in vs) / len(vs), 0))
        posts = [v.co for v in bm.verts if abs(v.co.x - c.x) < 0.17 and abs(v.co.y - c.y) < 0.17 and 0.5 < v.co.z < zt - 0.25]
        hw = max(max(abs(p.x - c.x), abs(p.y - c.y)) for p in posts) + 0.012 if posts else 0.16
        for z in (0.96, 1.03):
            block(bm, c + Vector((-hw, -hw, z)), c + Vector((hw, hw, z + 0.035)), n, 0, uv, rope)
    deck = [f for f in bm.faces if f.normal.z > 0.9 and abs(f.calc_center_median().z - 0.9) < 0.01 and abs(f.calc_center_median().x) < 0.3]
    if deck:
        z = deck[0].calc_center_median().z
        res = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=10, radius1=0.16, radius2=0.16, depth=0.06,
                                    matrix=Matrix.Translation((0, 0.45, z + 0.03)))
        new = {f for v in res['verts'] for f in v.link_faces}
        flat = bm.faces.layers.int.get('flat')
        for f in new:
            f.material_index = 0
            f[flat] = 1
            for lo in f.loops:
                lo[uv].uv = rope
        cap = max(new, key=lambda f: f.calc_center_median().z)
        rings(bm, [cap], [(0.03, 0.012), (0.035, 0.012)], slot)


def bridge(bm, mats, size, top, slot):
    """The sunk stone panel between the end boards becomes 8 cross boards just under them in three warm wood tones, seamed."""
    tones = [coloured(mats, 0, f'deck-{k}', rgb) for k, rgb in enumerate(((0.5, 0.26, 0.11), (0.66, 0.37, 0.16), (0.33, 0.15, 0.06)))]
    deck = [f for f in bm.faces if f.normal.z > 0.9 and mats[f.material_index].name.startswith('stone')]
    for v in {v for f in deck for v in f.verts}:
        v.co.z = top - 0.015 * size
    for f in deck:
        f.material_index = tones[0]
    lo, step = min(v.co.y for f in deck for v in f.verts), extent(deck, Vector((0, 1, 0))) / 8
    boards(bm, deck, Vector((0, 1, 0)), 8, size, slot)
    tag, z = bm.faces.layers.int.get('board'), top - (0.015 + DEPTH) * size
    for f in bm.faces:
        if f[tag] and f.material_index == tones[0] and f.normal.z > 0.9 and abs(f.calc_center_median().z - z) < 1e-3:
            f.material_index = tones[(0, 1, 0, 2, 1, 0, 2, 0)[min(7, int((f.calc_center_median().y - lo) / step))]]


def melon(bm, mats, uv):
    """A stem and a curled leaf on top of each melon (crisp stem, flat leaf)."""
    stem = coloured(mats, 0, 'melon-stem', (0.2, 0.24, 0.04))
    leaf = next(i for i, m in enumerate(mats) if m.name.startswith('leafsDark'))
    for spot in components([f for f in bm.faces if mats[f.material_index].name.startswith('dirt') and f.normal.z > 0.9]):
        vs = [v.co for f in spot for v in f.verts]
        c = sum(vs, Vector()) / len(vs)
        n = Vector((0, 1, 0))
        block(bm, c + Vector((-0.012, -0.012, -0.005)), c + Vector((0.012, 0.012, 0.055)), n, stem, uv, Vector((0, 0)))
        dome(bm, c + Vector((0.035, 0.01, 0.0)), Vector((0.5, 0.15, 1)), 0.055, 0.02, leaf, uv, smooth=False, sides=5, rot=0.4)


def furrow(bm, mats, uv):
    """Sprouts (two crisp leaves each) along the row's ridge and a few dark clods."""
    dirt = next(i for i, m in enumerate(mats) if m.name == 'dirt')
    clod = next(i for i, m in enumerate(mats) if m.name.startswith('dirtDark'))
    ridge = [f for f in bm.faces if f.material_index == dirt and f.normal.z > 0.9]
    zt = max(f.calc_center_median().z for f in ridge)
    vs = [v.co for f in ridge if f.calc_center_median().z > zt - 0.005 for v in f.verts]
    y0, y1 = min(v.y for v in vs), max(v.y for v in vs)
    x0, x1 = min(v.x for v in vs), max(v.x for v in vs)
    ym = (y0 + y1) / 2
    sprout = coloured(mats, 0, 'sprout', (0.12, 0.42, 0.05))
    for k in range(4):
        p = Vector((x0 + (x1 - x0) * (k + 0.5) / 4, ym + (y1 - y0) * (0.12 if k % 2 else -0.12), zt))
        a = k * 1.1
        for s in (-1, 1):
            d = Vector((math.cos(a) * s * 0.8, math.sin(a) * s * 0.8, 1))
            dome(bm, p, d, 0.035, 0.07, sprout, uv, smooth=False, sides=4, rot=a)
    for k in range(3):
        p = Vector((x0 + (x1 - x0) * (k * 0.33 + 0.2), ym + (y1 - y0) * (0.3 if k % 2 else -0.3), zt))
        dome(bm, p - Vector((0, 0, 0.004)), Vector((0, 0, 1)), 0.025, 0.016, clod, uv, smooth=False, sides=5, rot=k)


def stripes(bm, region, d, n, uv, luv):
    """Every other strip across d painted with the colormap texel luv (awning stripes); only the broad upward faces are cut, small
    faces (valance scallops) take the strip of their centre."""
    if not region:
        return
    tag = bm.faces.layers.int.get('board')
    for f in bm.faces:
        f[tag] = 0
    for f in region:
        f[tag] = 2 if f.normal.z > 0.3 else 1
    ps = [v.co.dot(d) for f in region for v in f.verts]
    lo, hi = min(ps), max(ps)
    for k in range(1, n):
        faces = [f for f in bm.faces if f[tag] == 2]
        geom = faces + list({e for f in faces for e in f.edges}) + list({v for f in faces for v in f.verts})
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=d * (lo + (hi - lo) * k / n), plane_no=d, dist=1e-6)
    for f in bm.faces:
        if f[tag] and int((f.calc_center_median().dot(d) - lo) / (hi - lo) * n) % 2:
            for lo_ in f.loops:
                lo_[uv].uv = luv


def lines(bm, region, d, offs, w, slot):
    """Painted joints: the region cut at offset +- w/2 along d for each offset, the thin bands painted in the darker slot (no inset, few tris)."""
    tag = bm.faces.layers.int.get('board')
    for f in bm.faces:
        f[tag] = 0
    for f in region:
        f[tag] = 1
    for o in offs:
        for co in (o - w / 2, o + w / 2):
            faces = [f for f in bm.faces if f[tag]]
            geom = faces + list({e for f in faces for e in f.edges}) + list({v for f in faces for v in f.verts})
            bmesh.ops.bisect_plane(bm, geom=geom, plane_co=d * co, plane_no=d, dist=1e-6)
    paint(bm, [f for f in bm.faces if f[tag] and any(abs(f.calc_center_median().dot(d) - o) < w / 2 for o in offs)], slot)


def plane_groups(faces, size):
    """Faces grouped by plane (normal and offset)."""
    out = {}
    for f in faces:
        n = f.normal
        key = (round(n.x, 1), round(n.y, 1), round(n.z, 1), round(n.dot(f.calc_center_median()) / size, 2))
        out.setdefault(key, []).append(f)
    return list(out.values())


def extent(faces, d):
    ps = [v.co.dot(d) for f in faces for v in f.verts]
    return max(ps) - min(ps)


def recipe(name):
    if name in ('stall-bench', 'stall-stool', 'stall-green', 'stall-red'):
        return 'tops'
    if name in ('crate', 'cart'):
        return 'boards'
    if name == 'barrel':
        return 'barrel'
    if name.startswith('building-type'):
        return 'house'
    if name == 'sign':
        return 'sign'
    if name in ('fence_simple', 'fence_planks', 'fence'):
        return 'fence'
    if name == 'lantern':
        return 'lamp'
    if name in ('tree_oak', 'tree_detailed', 'tree_default', 'tree_fat'):
        return 'tree'
    if name == 'tree_pineRoundA':
        return 'pine'
    if name in ('hedge-large', 'hedge'):
        return 'hedge'
    if name.startswith('rock_'):
        return 'rock'
    if name in ('plant_bushDetailed', 'plant_bushLarge', 'plant_bushSmall'):
        return 'fan'
    if name == 'planter':
        return 'planter'
    if name.startswith('pot_'):
        return 'pot'
    if name.startswith('flower_'):
        return 'flower'
    if name.startswith('fountain-round'):
        return 'fountain'
    if name == 'stump_round':
        return 'stump'
    if name == 'campfire_stones':
        return 'campfire'
    if name.startswith('mushroom_'):
        return 'mushroom'
    if name == 'tent_smallOpen':
        return 'tent'
    if name == 'tree-large':
        return 'suburb-tree'
    if name in ('grass_large', 'grass_leafs', 'grass_leafsLarge'):
        return 'grass'
    if name in ('plant_flatShort', 'plant_flatTall'):
        return 'flat'
    if name == 'path_stone':
        return 'path'
    if name == 'structure-platform-dock':
        return 'dock'
    if name == 'crop_melon':
        return 'melon'
    if name == 'crops_dirtRow':
        return 'furrow'
    if name == 'cliff_steps_rock':
        return 'steps'
    if name == 'bridge_center_wood':
        return 'bridge'
    return None


def dark(c):
    h, s, v = colorsys.rgb_to_hsv(*c)
    return v < 0.4 and s < 0.35


def keep_normals(me):
    """Copies the imported corner normals into an attribute that bmesh carries through the edit."""
    a = me.attributes.new('kn', 'FLOAT_VECTOR', 'CORNER')
    a.data.foreach_set('vector', [x for n in me.corner_normals for x in n.vector])


def restore_normals(me):
    """Custom normals back from the attribute; faces painted flat (new walls, seams, caps) take their face normal."""
    kn, flat = me.attributes['kn'], me.attributes.get('flat')
    ns = []
    for p in me.polygons:
        f = flat is not None and flat.data[p.index].value
        for li in p.loop_indices:
            n = Vector(kn.data[li].vector)
            ns.append(p.normal.copy() if f or n.length < 1e-6 else n.normalized())
    me.normals_split_custom_set(ns)
    for name in ('kn', 'flat', 'board'):
        if name in me.attributes:
            me.attributes.remove(me.attributes[name])


def slots(me):
    """Material slot of the darker copy of slot i, made on first use."""
    made = {}

    def slot(i):
        if i not in made:
            me.materials.append(shade_material(me.materials[i]))
            made[i] = len(me.materials) - 1
        return made[i]
    return slot


def detail(o, kind):
    me = o.data
    keep = kind != 'barrel'
    if keep:
        keep_normals(me)
    img = image(me.materials[0])
    slot = slots(me)
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.layers.int.new('flat')
    bm.faces.layers.int.new('board')
    uv = bm.loops.layers.uv.active
    col = texel(img, me.materials)
    is_wood = (lambda f: wood(col(f, uv))) if img else (lambda f: 'wood' in me.materials[f.material_index].name.lower())
    bmesh.ops.join_triangles(bm, faces=bm.faces[:], angle_face_threshold=0.02, angle_shape_threshold=3.1, cmp_uvs=True)
    size = max(o.dimensions)
    top = max(v.co.z for v in bm.verts)
    if kind == 'tops':
        quads = [f for f in bm.faces if f.normal.z > 0.9 and rect(f) and is_wood(f) and f.calc_area() > 0.02 * size * size]
        for f in quads:
            w = min(e.calc_length() for e in f.edges)
            n = max(2, min(4, round(w / (size * 0.09))))
            seams(bm, planks(bm, f, n), size, slot)
        if not quads:
            levels = plane_groups([f for f in bm.faces if f.normal.z > 0.9 and is_wood(f)], size)
            table = max(levels, key=lambda g: sum(f.calc_area() for f in g), default=[])
            if sum(f.calc_area() for f in table) > 0.05 * size * size:
                d = min((Vector((1, 0, 0)), Vector((0, 1, 0))), key=lambda a: extent(table, a))
                boards(bm, table, d, max(3, min(5, round(extent(table, d) / (size * 0.1)))), size, slot)
        canopy = [f for f in bm.faces if f.calc_center_median().z > 0.6 * top and not is_wood(f) and (lambda c: max(c) - min(c) > 0.3)(col(f, uv))]
        stripes(bm, canopy, Vector((0, 1, 0)), 5, uv, texel_uv(386, 258))
    elif kind == 'boards':
        for f in [f for f in bm.faces if rect(f) and is_wood(f) and f.calc_area() > 0.04 * size * size]:
            w = min(e.calc_length() for e in f.edges)
            seams(bm, planks(bm, f, max(2, min(4, round(w / (size * 0.12))))), size, slot)
    elif kind == 'barrel':
        lid = [f for f in bm.faces if f.normal.z > 0.9 and f.calc_center_median().z > top * 0.9 and is_wood(f)]
        seams(bm, [f for f in bm.faces if abs(f.normal.z) < 0.6 and is_wood(f)], size, slot)
        sink(bm, lid, size * 0.07, size * 0.03, slot)
        hoops = [f for f in bm.faces if abs(f.normal.z) < 0.3 and (lambda c: abs(c[0] - c[1]) < 0.08 and c[2] > c[0] + 0.05)(col(f, uv))]
        for k, f in enumerate(sorted(hoops, key=lambda f: (round(f.calc_center_median().z, 2), math.atan2(f.normal.y, f.normal.x)))):
            if k % 2 == 0:
                n = f.normal.copy()
                dome(bm, f.calc_center_median() - n * 0.005 * size, n, 0.04 * size, 0.025 * size, f.material_index, uv, f.loops[0][uv].uv.copy(), smooth=False, sides=4)
        for f in bm.faces:
            f.smooth = True
    elif kind == 'house':
        low = [f for f in bm.faces if abs(f.normal.z) < 0.1 and dark(col(f, uv)) and f.calc_center_median().z < top * 0.45]
        for door in plane_groups(low, size):
            across = Vector((door[0].normal.y, -door[0].normal.x, 0)).normalized()
            w, h = extent(door, across), extent(door, Vector((0, 0, 1)))
            if h > 0.12 * top and h > 1.2 * w:
                print(f'  door {w:.2f} x {h:.2f}')
                boards(bm, door, across, 3, size * 0.5, slot)
        windows(bm, col, uv, top, size)
    elif kind == 'sign':
        board = [f for f in bm.faces if abs(f.normal.y) > 0.97 and f.material_index == 1]
        for side in plane_groups(board, size):
            boards(bm, side, Vector((0, 0, 1)), 3, size * 0.6, slot)
    elif kind == 'fence':
        tops = [f for f in bm.faces if f.normal.z > 0.9 and is_wood(f) and f.calc_center_median().z > top * 0.8]
        tops = [f for f in tops if max(e.calc_length() for e in f.edges) < 0.15 * size]
        point(bm, tops, 0.035 * size, slot)
    elif kind == 'lamp':
        s = top / 1.56
        post = [f for f in bm.faces if abs(f.normal.z) < 0.3 and all(Vector((v.co.x, v.co.y)).length < 0.045 * s for v in f.verts)
                and all(0.6 * s < v.co.z < 1.32 * s for v in f.verts) and extent([f], Vector((0, 0, 1))) > 0.3 * s]
        collars(bm, post, (0.74 * s, 1.15 * s), 0.035 * s, 0.01 * s, slot, uv)
        cap = max(bm.faces, key=lambda f: f.calc_center_median().z)
        dome(bm, Vector((0, 0, top - 0.004 * s)), Vector((0, 0, 1)), 0.03 * s, 0.07 * s, cap.material_index, uv, cap.loops[0][uv].uv.copy(), smooth=False)
    elif kind in ('tree', 'pine'):
        li = next(i for i, m in enumerate(me.materials) if m.name.startswith('leafs'))
        me.materials.append(lighter(me.materials[li]))
        sun = len(me.materials) - 1
        leaves = [f for f in bm.faces if f.material_index == li]
        if kind == 'pine':
            for f in leaves:
                if f.normal.z > 0.35:
                    f.material_index = sun
        else:
            crown(bm, leaves, 9 if o.name.endswith('detailed') else 7, 0.26, sun, len(o.name))
    elif kind == 'hedge':
        green = [f for f in bm.faces if f.normal.z > 0.7 and (lambda c: c[1] > c[0] + 0.25)(col(f, uv))]
        if green:
            vs = [v.co for f in green for v in f.verts]
            ax = Vector((1, 0, 0)) if max(v.x for v in vs) - min(v.x for v in vs) > max(v.y for v in vs) - min(v.y for v in vs) else Vector((0, 1, 0))
            side = Vector((ax.y, ax.x, 0))
            lo_, hi_ = min(v.dot(ax) for v in vs), max(v.dot(ax) for v in vs)
            mid = sum((v.dot(side) for v in vs)) / len(vs)
            w = max(v.co.dot(side) for v in bm.verts) - min(v.co.dot(side) for v in bm.verts)
            tree = BVHTree.FromBMesh(bm)
            k = max(2, min(4, round((hi_ - lo_) / w * 1.6)))
            for i in range(k):
                t = lo_ + (hi_ - lo_) * (i + 0.5) / k
                p = ax * t + side * (mid + w * 0.12 * (1 if i % 2 else -1)) + Vector((0, 0, top + 1))
                hit = tree.ray_cast(p, Vector((0, 0, -1)))[0]
                if hit is not None:
                    dome(bm, hit - Vector((0, 0, 0.04 * w)), Vector((0, 0, 1)), 0.32 * w, 0.14 * w, green[0].material_index, uv, texel_uv(484, 264), rot=i)
    elif kind == 'rock':
        rock(bm, size, me.materials, slot, len(o.name))
    elif kind == 'fan':
        li = next((i for i, m in enumerate(me.materials) if m.name.startswith('grass')), 0)
        me.materials.append(lighter(me.materials[li]))
        sun = len(me.materials) - 1
        leaves = [f for f in bm.faces if f.material_index == li]
        fan(bm, leaves, [(0.55, 0.74)] if o.name.endswith('Detailed') else [(0.55, 0.8), (1.1, 0.58)], sun)
    elif kind == 'planter':
        greens = [f for f in bm.faces if (lambda c: c[1] > c[0] + 0.25 and c[1] > c[2] + 0.1)(col(f, uv))]
        lit = [f for f in greens if f.normal.z > 0.9]
        luv = lit[0].loops[0][uv].uv.copy() if lit else None
        for k, shrub in enumerate(components(greens)):
            crown(bm, shrub, 4, 0.42, shrub[0].material_index, k * 1.3, uv, luv)
        rim = [f for f in bm.faces if f.normal.z > 0.9 and f.calc_center_median().z > 0.2 * top
               and (lambda c: abs(c[0] - c[1]) < 0.08 and c[2] > c[0] + 0.03)(col(f, uv))]
        d = max((Vector((1, 0, 0)), Vector((0, 1, 0))), key=lambda a: extent(rim, a)) if rim else None
        boards(bm, rim, d, 4, size, slot)
    elif kind == 'pot':
        soil = [f for f in bm.faces if f.normal.z > 0.9 and me.materials[f.material_index].name.startswith('woodBarkDark')]
        if soil:
            vs = [v.co for f in soil for v in f.verts]
            c = sum(vs, Vector()) / len(vs)
            r = max(Vector((v.x - c.x, v.y - c.y)).length for v in vs)
            leaf = coloured(me.materials, 0, 'leafs-pot', (0.09, 0.34, 0.06))
            sun = coloured(me.materials, 0, 'leafs-pot-sun', (0.2, 0.5, 0.08))
            up = Vector((0, 0, 1))
            for k in range(5):
                a = k * 2 * math.pi / 5 + 0.3
                out = Vector((math.cos(a), math.sin(a), 0))
                dome(bm, c + out * r * 0.5 - up * 0.01, out * 0.7 + up, r * 0.45, r * 0.65, leaf, uv, rot=k)
            dome(bm, c, up, r * 0.55, r * 0.7, sun, uv)
    elif kind == 'flower':
        head = [f for f in bm.faces if f.normal.z > 0.9 and not me.materials[f.material_index].name.startswith('grass')]
        if head:
            zt = max(f.calc_center_median().z for f in head)
            vs = [v.co for f in head if f.calc_center_median().z > zt - 0.005 for v in f.verts]
            c = sum(vs, Vector()) / len(vs)
            r = max(Vector((v.x - c.x, v.y - c.y)).length for v in vs)
            yellow = any('Yellow' in m.name for m in me.materials)
            heart = coloured(me.materials, 0, 'flower-heart', (0.42, 0.16, 0.03) if yellow else (1.0, 0.62, 0.05))
            dome(bm, c - Vector((0, 0, r * 0.1)), Vector((0, 0, 1)), r * 0.6, r * 0.4, heart, uv, sides=5)
    elif kind == 'fountain' and top > 0.05:
        vs = [v.co for v in bm.verts]
        c = Vector((sum(v.x for v in vs) / len(vs), sum(v.y for v in vs) / len(vs), 0))
        far = [f for f in bm.faces if f.normal.z > 0.95 and f.calc_center_median().z > 0.5 * top
               and all(Vector((v.co.x - c.x, v.co.y - c.y)).length > 0.3 * size for v in f.verts)]
        rim = max(plane_groups(far, size), key=lambda g: sum(f.calc_area() for f in g), default=[])
        if rim:
            blocks(bm, rim, ring_planes(c, 8), size * 0.5, slot, short=True)
    elif kind == 'stump':
        inner = next(i for i, m in enumerate(me.materials) if m.name.startswith('woodInner'))
        core = [f for f in bm.faces if f.material_index == inner and f.normal.z > 0.95]
        r = max(Vector((v.co.x, v.co.y)).length for f in core for v in f.verts)
        rings(bm, core, [(0.1 * r, 0.08 * r), (0.18 * r, 0.08 * r)], slot)
        seams(bm, [f for f in bm.faces if f.material_index != inner and abs(f.normal.z) < 0.6 and not f[bm.faces.layers.int.get('flat')]],
              size, slot, any_shape=True, short=True)
    elif kind == 'campfire':
        campfire(bm, me.materials, uv, size)
    elif kind == 'mushroom':
        spots(bm, [f for f in bm.faces if f.material_index == 1], uv, 0)
    elif kind == 'tent':
        for side in plane_groups([f for f in bm.faces if f.material_index == 0 and f.normal.z > 0.5], size):
            if sum(f.calc_area() for f in side) > 0.1 * size * size:
                boards(bm, side, Vector((0, 1, 0)), 3, size, slot)
    elif kind == 'suburb-tree':
        greens = [f for f in bm.faces if (lambda c: c[1] > c[0] + 0.15 and c[1] > c[2])(col(f, uv))]
        if greens:
            lit = max(greens, key=lambda f: sum(col(f, uv)))
            crown(bm, greens, 7, 0.24, greens[0].material_index, 2.0, uv, lit.loops[0][uv].uv.copy())
    elif kind == 'grass':
        li, sun = tips(bm, me.materials, 'grass', 0.55, top)
        if o.name.endswith('leafs'):
            fan(bm, [f for f in bm.faces if f.material_index in (li, sun)], [(0.8, 0.72)], sun)
    elif kind == 'flat':
        li, sun = tips(bm, me.materials, 'leafsGreen', 0.6, top)
        fan(bm, [f for f in bm.faces if f.material_index in (li, sun)], [(0.785, 0.78)], sun)
    elif kind == 'path':
        stones(bm, me.materials, size)
    elif kind == 'dock':
        dock(bm, slot, uv)
    elif kind == 'melon':
        melon(bm, me.materials, uv)
    elif kind == 'furrow':
        furrow(bm, me.materials, uv)
    elif kind == 'steps':
        dirt = [f for f in bm.faces if me.materials[f.material_index].name == 'dirt' and abs(f.normal.z) < 0.3]
        lines(bm, dirt, Vector((0, 0, 1)), [0.36 * top, 0.68 * top], 1.6 * WIDTH * size, slot)
    elif kind == 'bridge':
        bridge(bm, me.materials, size, top, slot)
    bm.to_mesh(me)
    bm.free()
    if keep:
        restore_normals(me)
    else:
        bpy.context.view_layer.objects.active = o
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    me.update()


def models(root):
    for dirpath, _, files in os.walk(root):
        for f in sorted(files):
            if f.endswith('.glb'):
                yield os.path.relpath(os.path.join(dirpath, f), root)[:-4]


if os.path.abspath(src) != os.path.abspath(dst):
    import shutil
    shutil.copytree(src, dst, dirs_exist_ok=True)
for mid in models(src):
    name = mid.split('/')[-1]
    kind = recipe(name)
    if not kind:
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(src, mid + '.glb'))
    before = after = 0
    for o in [o for o in bpy.context.scene.objects if o.type == 'MESH']:
        before += sum(len(p.vertices) - 2 for p in o.data.polygons)
        detail(o, kind)
        after += sum(len(p.vertices) - 2 for p in o.data.polygons)
    bpy.ops.export_scene.gltf(filepath=os.path.join(dst, mid + '.glb'), export_format='GLB', export_image_format='AUTO', export_apply=True, export_yup=True)
    print(f'detail {mid} {kind} tris {before} -> {after}')
