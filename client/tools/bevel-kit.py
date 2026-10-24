# Bevelled xhigh variants of every kit model, headless Blender 5:
#   blender -b -P tools/bevel-kit.py -- public/assets/kit public/assets/kit-hd
# Per glb: merge by distance, bevel sharp edges (~1.5% of the model size, 2 segments), harden normals, export with the
# colormap embedded. Models listed in SKIP stay base-only (the client falls back to kit/).
import bpy, os, sys

SKIP = {
    # Flat cards: a bevel only adds rims to single-sided planes.
    'pirate/flag-pennant',
}
# Small dressing placed by the hundred (flowers, bushes, stepping stones, hedges, rim cliffs): bevels there cost
# triangles nobody sees, so they stay base-only.
SKIP_PREFIX = ('nature/flower_', 'nature/plant_', 'nature/path_stone', 'nature/cliff_large', 'town/hedge', 'nature/grass', 'nature/lily')

args = sys.argv[sys.argv.index('--') + 1:]
src, dst = os.path.abspath(args[0]), os.path.abspath(args[1])

def models(root):
    for dirpath, _, files in os.walk(root):
        for f in sorted(files):
            if f.endswith('.glb'):
                yield os.path.relpath(os.path.join(dirpath, f), root)[:-4]

done = 0
for mid in models(src):
    if mid in SKIP or mid.startswith(SKIP_PREFIX):
        print('skip', mid)
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(src, mid + '.glb'))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not meshes:
        continue
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
        scale = max(o.matrix_world.to_scale()) or 1
        b = o.modifiers.new('bevel', 'BEVEL')
        b.width = size * 0.015 / scale
        b.segments = 2
        b.limit_method = 'ANGLE'
        b.angle_limit = 0.61
        b.use_clamp_overlap = True
        b.harden_normals = True
        bpy.ops.object.modifier_apply(modifier='bevel')
        after += sum(len(p.vertices) - 2 for p in o.data.polygons)
    out = os.path.join(dst, mid + '.glb')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_image_format='AUTO', export_apply=True, export_yup=True)
    done += 1
    print(f'bevel {mid} tris {before} -> {after}')
print('bevelled', done)
