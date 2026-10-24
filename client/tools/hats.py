# Builds the 12 MOOBLOX hats as faceted low-poly models (ART-BIBLE §1, §4 palette) and exports one glb.
# blender -b -P tools/hats.py -- public/assets/cosmetics/hats.glb
# Each object is named by its catalog id; origin = top centre of the 0.8 m blocky head, -Y = the face side.
import math
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

PALETTE = {
    'coral': 0xF07A5F, 'coral_dk': 0xC9564A, 'teal': 0x2FA39A, 'teal_dk': 0x1F7A78, 'sun': 0xF6C445, 'sun_dk': 0xD49A2A,
    'cream': 0xF4E6CC, 'cream_dk': 0xD2BC9A, 'sand': 0xF7E2AE, 'sand_dk': 0xE0C38A, 'wood': 0xB97A4A, 'ink': 0x2B2F3A,
    'ink_lt': 0x3E4456, 'purple': 0x8E5AD8, 'purple_dk': 0x6E44B0, 'white': 0xFBF7EE, 'blue': 0x2F7FE0, 'sky': 0x1FA4C9,
    'deep': 0x1F5FA8, 'leaf': 0x5DB761,
}


def linear(hexv):
    """sRGB hex to linear RGBA (glTF COLOR_0 is linear)."""
    def ch(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (ch((hexv >> 16) & 255), ch((hexv >> 8) & 255), ch(hexv & 255), 1.0)


class Hat:
    """Collects coloured parts into one bmesh."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.float_color.new('Color')

    def add(self, part, colour, matrix=Matrix()):
        part.transform(matrix)
        rgba = linear(PALETTE[colour])
        remap = {v: self.bm.verts.new(v.co) for v in part.verts}
        for f in part.faces:
            nf = self.bm.faces.new([remap[v] for v in f.verts])
            for loop in nf.loops:
                loop[self.col] = rgba
        part.free()

    def finish(self):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.collection.objects.link(obj)
        return obj


def ring(bm, a, b, c, z, dx=0.0, dy=0.0):
    """A chamfered square (8 verts): half sizes a (x), b (y), corner chamfer c, at height z."""
    pts = [(a, b - c), (a - c, b), (-(a - c), b), (-a, b - c), (-a, -(b - c)), (-(a - c), -b), (a - c, -b), (a, -(b - c))]
    return [bm.verts.new((x + dx, y + dy, z)) for x, y in pts]


def loft(rings, top=True, bottom=False, tip=None):
    """Faceted shell through chamfered-square rings (a, b, c, z[, dx, dy]); optional caps or a pointed tip."""
    bm = bmesh.new()
    loops = [ring(bm, *r) for r in rings]
    for lo, hi in zip(loops, loops[1:]):
        for i in range(8):
            j = (i + 1) % 8
            bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    if tip:
        apex = bm.verts.new(tip)
        for i in range(8):
            bm.faces.new((loops[-1][i], loops[-1][(i + 1) % 8], apex))
    elif top:
        bm.faces.new(loops[-1])
    if bottom:
        bm.faces.new(list(reversed(loops[0])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def gem(radius, subdiv=1):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)
    return bm


def cone(segments, r1, r2, depth):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=r1, radius2=r2, depth=depth)
    return bm


def slab(points, z0, z1):
    """A flat polygon (x, y) extruded from z0 to z1."""
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, z0)) for x, y in points]
    hi = [bm.verts.new((x, y, z1)) for x, y in points]
    n = len(points)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bm.faces.new(hi)
    bm.faces.new(list(reversed(lo)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def star(r_out, r_in, n=5):
    return [((r_out if i % 2 == 0 else r_in) * math.sin(i * math.pi / n), (r_out if i % 2 == 0 else r_in) * math.cos(i * math.pi / n)) for i in range(2 * n)]


def at(x=0.0, y=0.0, z=0.0):
    return Matrix.Translation((x, y, z))


def rot(deg, axis):
    return Matrix.Rotation(math.radians(deg), 4, axis)


def cap():
    h = Hat('hat-cap')
    h.add(loft([(0.44, 0.44, 0.12, -0.08), (0.44, 0.44, 0.14, 0.1), (0.37, 0.37, 0.14, 0.22), (0.2, 0.2, 0.08, 0.29)]), 'coral')
    h.add(loft([(0.38, 0.22, 0.13, 0.0), (0.38, 0.22, 0.13, 0.04)], bottom=True), 'coral_dk', at(0, -0.52, -0.1) @ rot(-10, 'X'))
    h.add(cone(6, 0.06, 0.04, 0.05), 'sun', at(0, 0, 0.31))
    return h.finish()


def beanie():
    h = Hat('hat-beanie')
    h.add(loft([(0.455, 0.455, 0.13, -0.14), (0.455, 0.455, 0.13, 0.05)]), 'cream')
    h.add(loft([(0.42, 0.42, 0.13, 0.05), (0.41, 0.41, 0.14, 0.2), (0.31, 0.31, 0.12, 0.33), (0.13, 0.13, 0.05, 0.39)]), 'teal')
    h.add(gem(0.12), 'cream', at(0, 0, 0.47))
    return h.finish()


def explorer():
    h = Hat('hat-explorer')
    h.add(loft([(0.64, 0.7, 0.22, -0.1), (0.6, 0.66, 0.2, -0.01)], bottom=True), 'sand_dk')
    h.add(loft([(0.44, 0.44, 0.14, -0.04), (0.43, 0.43, 0.16, 0.18), (0.33, 0.33, 0.14, 0.32), (0.15, 0.15, 0.06, 0.38)]), 'sand')
    h.add(loft([(0.452, 0.452, 0.14, -0.01), (0.448, 0.448, 0.15, 0.09)], top=False), 'wood')
    h.add(cone(6, 0.05, 0.03, 0.05), 'wood', at(0, 0, 0.4))
    return h.finish()


def crown():
    h = Hat('hat-crown')
    h.add(loft([(0.44, 0.44, 0.1, -0.06), (0.44, 0.44, 0.1, 0.14)], top=False), 'sun')
    h.add(loft([(0.4, 0.4, 0.1, -0.02), (0.36, 0.36, 0.12, 0.14), (0.18, 0.18, 0.08, 0.2)]), 'coral')
    for i in range(8):
        a = i * math.pi / 4
        r = 0.44 / max(abs(math.cos(a)), abs(math.sin(a))) * (0.93 if i % 2 else 1)
        h.add(cone(4, 0.09, 0.0, 0.2), 'sun', at(r * math.cos(a) * 0.98, r * math.sin(a) * 0.98, 0.24) @ rot(45, 'Z'))
        h.add(gem(0.035, 0), 'sun_dk', at(r * math.cos(a) * 0.98, r * math.sin(a) * 0.98, 0.36))
    h.add(gem(0.07), 'coral', at(0, -0.455, 0.04))
    h.add(gem(0.055), 'teal', at(-0.455, 0, 0.04))
    h.add(gem(0.055), 'teal', at(0.455, 0, 0.04))
    h.add(gem(0.055), 'blue', at(0, 0.455, 0.04))
    return h.finish()


def wizard():
    h = Hat('hat-wizard')
    h.add(loft([(0.62, 0.62, 0.2, -0.06), (0.6, 0.6, 0.2, 0.0)], bottom=True), 'purple_dk')
    h.add(loft([(0.4, 0.4, 0.12, 0.0), (0.31, 0.31, 0.1, 0.3, 0, 0.02), (0.2, 0.2, 0.07, 0.56, 0, 0.08), (0.1, 0.1, 0.03, 0.78, 0, 0.2)], tip=(0, 0.38, 0.9)), 'purple')
    h.add(loft([(0.41, 0.41, 0.12, 0.0), (0.38, 0.38, 0.115, 0.1)], top=False), 'sun')
    h.add(slab(star(0.1, 0.045), 0, 0.03), 'sun', at(0, -0.31, 0.36) @ rot(90, 'X') @ rot(-14, 'X'))
    h.add(slab(star(0.06, 0.027), 0, 0.02), 'sun', at(0.2, -0.17, 0.52) @ rot(90, 'X') @ rot(-20, 'Y'))
    return h.finish()


def pirate():
    h = Hat('hat-pirate')
    h.add(loft([(0.43, 0.43, 0.12, -0.06), (0.4, 0.4, 0.12, 0.08)]), 'ink')
    arc = [(0.56 * math.cos(math.pi * i / 8), 0.4 * math.sin(math.pi * i / 8)) for i in range(9)]
    d = slab(arc, -0.17, 0.17)
    h.add(d, 'ink_lt', at(0, 0, 0.0) @ rot(90, 'X'))
    trim = [(0.6 * math.cos(math.pi * i / 8), 0.44 * math.sin(math.pi * i / 8)) for i in range(9)]
    trim += [(0.5 * math.cos(math.pi * i / 8), 0.34 * math.sin(math.pi * i / 8)) for i in range(8, -1, -1)]
    h.add(slab(trim, -0.02, 0.02), 'sun', at(0, -0.175, 0.0) @ rot(90, 'X'))
    h.add(slab(trim, -0.02, 0.02), 'sun', at(0, 0.175, 0.0) @ rot(90, 'X'))
    h.add(gem(0.08, 1), 'white', at(0, -0.2, 0.2) @ Matrix.Diagonal((1, 0.4, 1, 1)))
    h.add(slab(star(0.05, 0.02, 4), 0, 0.02), 'ink', at(0, -0.235, 0.2) @ rot(90, 'X'))
    h.add(gem(0.1, 1), 'coral', at(0.3, 0.12, 0.38) @ rot(-40, 'Y') @ Matrix.Diagonal((0.45, 0.5, 1.7, 1)))
    return h.finish()


def chef():
    h = Hat('hat-chef')
    h.add(loft([(0.44, 0.44, 0.12, -0.08), (0.44, 0.44, 0.12, 0.2)], top=False), 'white')
    h.add(loft([(0.43, 0.43, 0.12, 0.2), (0.4, 0.4, 0.12, 0.32)]), 'cream')
    for x, y in ((-0.2, -0.2), (0.2, -0.2), (-0.2, 0.2), (0.2, 0.2)):
        h.add(gem(0.25), 'white', at(x, y, 0.4))
    h.add(gem(0.29), 'white', at(0, 0, 0.55))
    return h.finish()


def astronaut():
    h = Hat('hat-astronaut')
    h.add(loft([(0.47, 0.47, 0.14, -0.34), (0.47, 0.47, 0.16, 0.03), (0.39, 0.39, 0.15, 0.17), (0.2, 0.2, 0.08, 0.23)]), 'white')
    h.add(loft([(0.36, 0.08, 0.06, 0.0), (0.36, 0.08, 0.06, 0.15)], bottom=True), 'sky', at(0, -0.46, -0.02) @ rot(-10, 'X'))
    h.add(loft([(0.475, 0.475, 0.15, -0.36), (0.475, 0.475, 0.15, -0.3)], top=False), 'coral')
    for s in (-1, 1):
        h.add(cone(8, 0.13, 0.11, 0.08), 'coral', at(s * 0.5, 0, -0.42) @ rot(90, 'Y'))
        h.add(cone(8, 0.07, 0.07, 0.04), 'cream_dk', at(s * 0.55, 0, -0.42) @ rot(90, 'Y'))
    h.add(cone(4, 0.018, 0.018, 0.26), 'cream_dk', at(0.2, 0.12, 0.33))
    h.add(gem(0.05), 'sun', at(0.2, 0.12, 0.48))
    return h.finish()


def tophat():
    h = Hat('hat-tophat')
    h.add(loft([(0.57, 0.57, 0.18, -0.04), (0.56, 0.56, 0.18, 0.02)], bottom=True), 'ink')
    h.add(loft([(0.34, 0.34, 0.1, 0.02), (0.33, 0.33, 0.1, 0.3), (0.37, 0.37, 0.11, 0.62)]), 'ink_lt')
    h.add(loft([(0.345, 0.345, 0.1, 0.03), (0.338, 0.338, 0.1, 0.15)], top=False), 'coral')
    h.add(gem(0.06), 'sun', at(0.22, -0.26, 0.09))
    return h.finish()


def party():
    h = Hat('hat-party')
    m = at(0.05, 0, 0.0) @ rot(10, 'Y')
    h.add(loft([(0.27, 0.27, 0.08, -0.02), (0.19, 0.19, 0.055, 0.22)], top=False), 'coral', m.copy())
    h.add(loft([(0.19, 0.19, 0.055, 0.22), (0.11, 0.11, 0.03, 0.44)], top=False), 'sun', m.copy())
    h.add(loft([(0.11, 0.11, 0.03, 0.44), (0.04, 0.04, 0.01, 0.62)]), 'teal', m.copy())
    h.add(gem(0.08), 'cream', m @ at(0, 0, 0.67))
    for i, (x, y) in enumerate(((0.21, -0.12), (-0.13, -0.18), (0.03, 0.2))):
        h.add(slab(star(0.035, 0.015, 4), 0, 0.01), ('purple', 'blue', 'leaf')[i], m @ at(x * 0.95, y * 0.95, 0.12) @ rot(90, 'X'))
    return h.finish()


def frames(name, frame, lens=None, shape=8):
    """Two faceted lens rings in front of the eyes, a bridge and arms to the ears."""
    h = Hat(name)
    eye_z, front = -0.46, -0.44
    for s in (-1, 1):
        cx = s * 0.19
        ang = [2 * math.pi * (i + 0.5) / shape for i in range(shape)]
        bm = bmesh.new()
        layers = []
        for y in (front, front + 0.035):
            outer = [bm.verts.new((cx + 0.15 * math.cos(a), y, eye_z + 0.15 * math.sin(a))) for a in ang]
            inner = [bm.verts.new((cx + 0.11 * math.cos(a), y, eye_z + 0.11 * math.sin(a))) for a in ang]
            layers.append((outer, inner))
        (o0, i0), (o1, i1) = layers
        for i in range(shape):
            j = (i + 1) % shape
            bm.faces.new((o0[i], o0[j], i0[j], i0[i]))
            bm.faces.new((o1[j], o1[i], i1[i], i1[j]))
            bm.faces.new((o0[j], o0[i], o1[i], o1[j]))
            bm.faces.new((i0[i], i0[j], i1[j], i1[i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        h.add(bm, frame)
        if lens:
            disc = [(cx + 0.112 * math.cos(a), eye_z + 0.112 * math.sin(a)) for a in ang]
            h.add(slab(disc, 0.0, 0.012), lens, at(0, front + 0.02, 0) @ rot(90, 'X'))
        h.add(loft([(0.015, 0.2, 0.004, -0.02), (0.015, 0.2, 0.004, 0.02)], bottom=True), frame, at(s * 0.415, -0.24, eye_z + 0.02))
    h.add(loft([(0.05, 0.015, 0.005, -0.015), (0.05, 0.015, 0.005, 0.015)], bottom=True), frame, at(0, front + 0.015, eye_z + 0.04))
    return h.finish()


def main():
    out = sys.argv[sys.argv.index('--') + 1]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for build in (cap, beanie, explorer, crown, wizard, pirate, chef, astronaut, tophat, party):
        build()
    frames('hat-glasses', 'coral')
    frames('hat-sunglasses', 'sun', lens='deep', shape=6)
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.data.objects)
    print('hats', len(bpy.data.objects), 'triangles', tris)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_vertex_color='ACTIVE', export_normals=False,
                              export_texcoords=False, export_materials='NONE', export_apply=True)


main()
