# Soft shape language for the shared kit (every tier), headless Blender 5:
#   blender -b -P tools/round-kit.py -- kit-src <outdir>   then   node tools/pack-kit.mjs <outdir>
# Per object, as the concepts show it (ART-BIBLE.md shape language): soft and crisp side by side is the point.
#   SOFT   trees, bushes: smooth shading only, crowns read puffy at no triangle cost.
#   ROUND  hedges, signs, lamps, barrels, pots, planters, fountains, mushrooms, tents, boats: one bevel + smooth normals.
#   EAVES  buildings, market stalls: one chamfer on long edges only (wall corners, eaves, ridges); windows and doors crisp.
#   CRISP  everything else (planks, bridges, docks, fences, steps, crates, logs, carts, rocks, small dressing): copied.
import bpy, os, shutil, sys

import bmesh

SOFT = ('tree', 'bush')
ROUND = ('hedge', 'sign', 'lantern', 'barrel', 'pot_', 'planter', 'fountain', 'mushroom', 'tent', 'boat', 'canoe')
EAVES = ('building', 'stall-green', 'stall-red')

args = sys.argv[sys.argv.index('--') + 1:]
src, dst = os.path.abspath(args[0]), os.path.abspath(args[1])

def models(root):
    for dirpath, _, files in os.walk(root):
        for f in sorted(files):
            if f.endswith('.glb'):
                yield os.path.relpath(os.path.join(dirpath, f), root)[:-4]

shutil.copytree(src, dst, dirs_exist_ok=True)
total = [0, 0]
for mid in models(src):
    out = os.path.join(dst, mid + '.glb')
    name = mid.split('/')[-1]
    soft = any(k in name for k in SOFT)
    round_ = any(k in name for k in ROUND)
    eaves = any(k in name for k in EAVES)
    if not (soft or round_ or eaves):
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(src, mid + '.glb'))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    size = max(max(o.dimensions) * max(o.matrix_world.to_scale()) for o in meshes)
    before = after = 0
    for o in meshes:
        bpy.ops.object.select_all(action='DESELECT')
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        before += sum(len(p.vertices) - 2 for p in o.data.polygons)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.remove_doubles(threshold=0.0001)
        bpy.ops.object.mode_set(mode='OBJECT')
        if soft or round_:
            bpy.ops.mesh.customdata_custom_splitnormals_clear()
            if 'sharp_edge' in o.data.attributes:
                o.data.attributes.remove(o.data.attributes['sharp_edge'])
        if soft:
            bpy.ops.object.shade_smooth(keep_sharp_edges=False)
        else:
            scale = max(o.matrix_world.to_scale()) or 1
            b = o.modifiers.new('bevel', 'BEVEL')
            b.width = min(0.12, max(0.03, size * 0.03)) / scale
            b.segments = 1
            b.limit_method = 'ANGLE'
            b.angle_limit = 1.2
            if eaves:
                bm = bmesh.new()
                bm.from_mesh(o.data)
                layer = bm.edges.layers.float.get('bevel_weight_edge') or bm.edges.layers.float.new('bevel_weight_edge')
                for e in bm.edges:
                    e[layer] = 1.0 if e.calc_length() * scale > size * 0.25 and e.calc_face_angle(0.0) > 1.2 else 0.0
                bm.to_mesh(o.data)
                bm.free()
                b.limit_method = 'WEIGHT'
            b.use_clamp_overlap = True
            b.harden_normals = True
            bpy.ops.object.modifier_apply(modifier='bevel')
            if round_:
                bpy.ops.object.shade_smooth(keep_sharp_edges=False)
        after += sum(len(p.vertices) - 2 for p in o.data.polygons)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_image_format='AUTO', export_apply=True, export_yup=True)
    total[0] += before
    total[1] += after
    print(f'round {mid} tris {before} -> {after}')
print(f'rounded tris {total[0]} -> {total[1]}')
