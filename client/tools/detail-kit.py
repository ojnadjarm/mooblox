# Designed detail for the shared kit (every tier), headless Blender 5, after tools/round-kit.py:
#   blender -b -P tools/round-kit.py -- kit-src <a>; blender -b -P tools/detail-kit.py -- <a> <b>; node tools/pack-kit.mjs <b>
# Per object recipes (ART-BIBLE.md soft/crisp rules): wood tops split into planks with dark seams, crates and carts planked,
# barrel staves seamed and the lid sunk in its rim. Seams and sunk walls use a darker copy
# of the face's own material (base colour factor), so the kit stays one colormap and the baked vertex colours carry them.
import bpy, colorsys, os, sys

import bmesh

args = sys.argv[sys.argv.index('--') + 1:]
src, dst = os.path.abspath(args[0]), os.path.abspath(args[1])

SEAM = 0.55   # seam and sunk-wall colour factor
WIDTH = 0.012  # seam width, fraction of the model's size
DEPTH = 0.008  # seam depth, fraction of the model's size


def texel(img):
    """Colour lookup of a face's average UV on the colormap (sRGB floats)."""
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


def shade_material(mat):
    """A copy of the material whose base colour is the texture times SEAM (exported as baseColorFactor)."""
    m = mat.copy()
    m.name = mat.name + '-seam'
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    tex = next(n for n in nodes if n.type == 'TEX_IMAGE')
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


def seams(bm, faces, size, slot):
    """Insets each face by a seam, sinks it a little and paints the seam ring with the darker material slot."""
    faces = [f for f in faces if f.is_valid and rect(f) and min(e.calc_length() for e in f.edges) > 5 * WIDTH * size]
    if not faces:
        return
    res = bmesh.ops.inset_individual(bm, faces=faces, thickness=WIDTH * size, depth=-DEPTH * size, use_even_offset=True)
    for f in res['faces']:
        f.material_index = slot


def sink(bm, faces, rim, depth, slot):
    """A flat rim of width `rim` round the region, then the region sunk by `depth` with darker walls."""
    bmesh.ops.inset_region(bm, faces=faces, thickness=rim, depth=0.0, use_even_offset=True)
    r2 = bmesh.ops.inset_region(bm, faces=faces, thickness=rim * 0.05, depth=-depth, use_even_offset=True)
    for f in r2['faces']:
        f.material_index = slot


def recipe(name):
    if name in ('stall-bench', 'stall-stool', 'stall-green', 'stall-red'):
        return 'tops'
    if name in ('crate', 'cart'):
        return 'boards'
    if name == 'barrel':
        return 'barrel'
    return None


def detail(o, kind):
    me = o.data
    mat = me.materials[0]
    img = next(n for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE').image
    me.materials.append(shade_material(mat))
    slot = len(me.materials) - 1
    bm = bmesh.new()
    bm.from_mesh(me)
    uv = bm.loops.layers.uv.active
    col = texel(img)
    bmesh.ops.join_triangles(bm, faces=bm.faces[:], angle_face_threshold=0.02, angle_shape_threshold=3.1, cmp_uvs=True)
    size = max(o.dimensions)
    top = max(v.co.z for v in bm.verts)
    if kind == 'tops':
        for f in [f for f in bm.faces if f.normal.z > 0.9 and rect(f) and wood(col(f, uv)) and f.calc_area() > 0.02 * size * size]:
            w = min(e.calc_length() for e in f.edges)
            n = max(2, min(4, round(w / (size * 0.09))))
            seams(bm, planks(bm, f, n), size, slot)
    elif kind == 'boards':
        for f in [f for f in bm.faces if rect(f) and wood(col(f, uv)) and f.calc_area() > 0.04 * size * size]:
            w = min(e.calc_length() for e in f.edges)
            seams(bm, planks(bm, f, max(2, min(4, round(w / (size * 0.12))))), size, slot)
    elif kind == 'barrel':
        lid = [f for f in bm.faces if f.normal.z > 0.9 and f.calc_center_median().z > top * 0.9 and wood(col(f, uv))]
        seams(bm, [f for f in bm.faces if abs(f.normal.z) < 0.6 and wood(col(f, uv))], size, slot)
        sink(bm, lid, size * 0.07, size * 0.03, slot)
        for f in bm.faces:
            f.smooth = True
    bm.to_mesh(me)
    bm.free()
    if kind == 'barrel':
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
