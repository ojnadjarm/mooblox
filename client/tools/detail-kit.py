# Designed detail for the shared kit (every tier), headless Blender 5, after tools/round-kit.py:
#   blender -b -P tools/round-kit.py -- kit-src <a>; blender -b -P tools/detail-kit.py -- <a> <b>; node tools/pack-kit.mjs <b>
# Per object recipes (ART-BIBLE.md soft/crisp rules): wood tops split into planks with dark seams, crates and carts planked,
# barrel staves seamed and the lid sunk in its rim, house doors in vertical boards, stall tables and sign boards in planks,
# fence posts pointed, lamp posts with two collars. Seams and sunk walls use a darker copy
# of the face's own material (base colour factor), so the kit stays one colormap and the baked vertex colours carry them.
# The imported corner normals ride through the edit as an attribute: untouched faces (pillowy roofs, bevels) keep their shading.
import bpy, colorsys, math, os, sys

import bmesh
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index('--') + 1:]
src, dst = os.path.abspath(args[0]), os.path.abspath(args[1])

SEAM = 0.55   # seam and sunk-wall colour factor
WIDTH = 0.012  # seam width, fraction of the model's size
DEPTH = 0.008  # seam depth, fraction of the model's size


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


def seams(bm, faces, size, slot, any_shape=False):
    """Insets each face by a seam, sinks it a little and paints the seam ring with the darker material slot."""
    faces = [f for f in faces if f.is_valid and (any_shape or rect(f)) and min(e.calc_length() for e in f.edges) > 5 * WIDTH * size]
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
    tag = bm.faces.layers.int.get('board')
    for f in bm.faces:
        f[tag] = 0
    for f in region:
        f[tag] = 1
    bmesh.ops.remove_doubles(bm, verts=list({v for f in region for v in f.verts}), dist=1e-5)
    ps = [v.co.dot(d) for f in bm.faces if f[tag] for v in f.verts]
    lo, hi = min(ps), max(ps)
    cuts = [lo + (hi - lo) * k / n for k in range(1, n)]
    for c in cuts:
        faces = [f for f in bm.faces if f[tag]]
        geom = faces + list({e for f in faces for e in f.edges}) + list({v for f in faces for v in f.verts})
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=d * c, plane_no=d, dist=1e-6)
    on_cut = lambda e: any(all(abs(v.co.dot(d) - c) < 1e-5 for v in e.verts) for c in cuts)
    inner = [e for e in bm.edges if len(e.link_faces) == 2 and all(f[tag] for f in e.link_faces) and not on_cut(e)]
    bmesh.ops.dissolve_edges(bm, edges=inner, use_verts=True)
    seams(bm, [f for f in bm.faces if f[tag]], size, slot, any_shape=True)


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
    elif kind == 'boards':
        for f in [f for f in bm.faces if rect(f) and is_wood(f) and f.calc_area() > 0.04 * size * size]:
            w = min(e.calc_length() for e in f.edges)
            seams(bm, planks(bm, f, max(2, min(4, round(w / (size * 0.12))))), size, slot)
    elif kind == 'barrel':
        lid = [f for f in bm.faces if f.normal.z > 0.9 and f.calc_center_median().z > top * 0.9 and is_wood(f)]
        seams(bm, [f for f in bm.faces if abs(f.normal.z) < 0.6 and is_wood(f)], size, slot)
        sink(bm, lid, size * 0.07, size * 0.03, slot)
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
