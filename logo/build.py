"""Build the Mooblox logo (block island + two-colour Baloo 2 wordmark as paths) into logo/svg, the plugin and the client.

Run from anywhere: uv run --with fonttools --with shapely python3 logo/build.py
"""
import json
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from textpath import glyphs  # noqa: E402
from fontTools.pens.basePen import BasePen  # noqa: E402
from fontTools.ttLib import TTFont  # noqa: E402
from fontTools.varLib.instancer import instantiateVariableFont  # noqa: E402
from shapely.geometry import Polygon  # noqa: E402
from shapely.ops import unary_union  # noqa: E402

REPO = os.path.dirname(HERE)
OUT = os.path.join(HERE, 'svg')
PIX = os.path.join(REPO, 'moodle', 'local', 'mooblox', 'pix')
BRAND = os.path.join(REPO, 'client', 'src', 'ui', 'brand')
WORDMARK = os.path.join(REPO, 'client', 'src', 'hub', 'wordmark.json')
INK, CREAM, CREAM_S, TERRA, TERRA_S, TEAL = '#2B2F3A', '#F4E6CC', '#D2BC9A', '#E0844F', '#B4583A', '#2FA39A'
GRASS, WHITE, MOODLE_ICON = '#A1C270', '#FFFBF2', '#212529'
CLOUD = 'M4 55 a5 5 0 0 1 6 -6 a6.5 6.5 0 0 1 12 1 a4.5 4.5 0 0 1 4 5 Z'
TOP, LEFT, RIGHT = 'M32 15 L54 26 L32 37 L10 26Z', 'M10 26 L32 37 L32 61 L10 50Z', 'M32 37 L54 26 L54 50 L32 61Z'
TOWER, DOME = 'M28 9 h8 v14 a4 2 0 0 1 -8 0z', 'M27 9.5 a5 5 0 0 1 10 0z'


def svg(w, h, body, title, size=None):
    sw, sh = size or (w, h)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:g} {h:g}" width="{sw:g}" height="{sh:g}" '
            f'role="img" aria-label="{title}"><title>{title}</title>{body}</svg>\n')


def island(mono=False):
    """Isometric cube island, banded terracotta and cream sides, teal-domed tower, cloud, on a 64 grid."""
    if mono:
        knock = ('<path d="M10 26 L32 37 L54 26 M32 37 V61" fill="none" stroke="#000" stroke-width="2.6" stroke-linejoin="round"/>'
                 '<path d="M10 37 L32 48 L54 37" fill="none" stroke="#000" stroke-width="4"/>'
                 '<path d="M27 10 h10" stroke="#000" stroke-width="2"/>'
                 '<path d="M27 23.5 a5 2.5 0 0 0 10 0" fill="none" stroke="#000" stroke-width="2"/>')
        return (f'<defs><mask id="islm"><rect width="64" height="64" fill="#fff"/>{knock}</mask></defs>'
                f'<g fill="currentColor" mask="url(#islm)"><path d="{TOP}"/><path d="{LEFT}"/><path d="{RIGHT}"/>'
                f'<path d="{TOWER}"/><path d="{DOME}"/><path d="M33 2 v3" stroke="currentColor" stroke-width="2"/></g>')
    o = f'stroke="{INK}" stroke-width="2.6" stroke-linejoin="round"'
    return (f'<path d="{LEFT}" fill="{TERRA}"/><path d="{RIGHT}" fill="{TERRA_S}"/>'
            f'<path d="M10 35 L32 46 L32 51 L10 40Z" fill="{CREAM}"/><path d="M32 46 L54 35 L54 40 L32 51Z" fill="{CREAM_S}"/>'
            f'<path d="{TOP}" fill="{GRASS}"/>'
            f'<path d="M10 26 L32 15 L54 26 L54 50 L32 61 L10 50Z M10 26 L32 37 L54 26 M32 37 V61" fill="none" {o}/>'
            f'<path d="M32 2 v4" stroke="{INK}" stroke-width="2" stroke-linecap="round"/>'
            f'<path d="{TOWER}" fill="{CREAM}" {o}/><path d="{DOME}" fill="{TEAL}" {o}/>'
            f'<rect x="30.7" y="13" width="2.6" height="4.2" rx="1.3" fill="{INK}"/>'
            f'<path d="{CLOUD}" fill="{WHITE}" {o}/>')


def sticker(inner, width):
    """Inner shapes once as a thick rounded white backing (sticker edge), then as themselves."""
    bare = re.sub(r' (fill|stroke|stroke-width)="[^"]*"', '', inner)
    return f'<g fill="{WHITE}" stroke="{WHITE}" stroke-width="{width}" stroke-linejoin="round">{bare}</g>{inner}'


class FlatPen(BasePen):
    """Collects each contour as a polyline, curves cut into short straight steps."""

    def __init__(self, glyphset, steps=6):
        super().__init__(glyphset)
        self.steps, self.contours, self.cur = steps, [], []

    def _moveTo(self, p):
        self.cur = [p]

    def _lineTo(self, p):
        self.cur.append(p)

    def _qCurveToOne(self, c, p):
        a = self.cur[-1]
        for i in range(1, self.steps + 1):
            t = i / self.steps
            self.cur.append(tuple((1 - t) ** 2 * a[k] + 2 * (1 - t) * t * c[k] + t * t * p[k] for k in (0, 1)))

    def _curveToOne(self, c1, c2, p):
        a = self.cur[-1]
        for i in range(1, self.steps + 1):
            t = i / self.steps
            self.cur.append(tuple((1 - t) ** 3 * a[k] + 3 * (1 - t) ** 2 * t * c1[k] + 3 * (1 - t) * t * t * c2[k] + t ** 3 * p[k]
                                  for k in (0, 1)))

    def _closePath(self):
        if len(self.cur) > 2:
            if self.cur[0] == self.cur[-1]:
                self.cur.pop()
            self.contours.append(self.cur)
        self.cur = []

    _endPath = _closePath


def wordmark_3d(size=100, tracking=-0.01):
    """The wordmark as flat polylines (y up, units of the lockup) plus its sticker plate, for the hub's extruded sign."""
    font = instantiateVariableFont(TTFont(os.path.join(HERE, 'fonts', 'Baloo2.ttf')), {'wght': 800})
    gs, cmap, upm = font.getGlyphSet(), font.getBestCmap(), font['head'].unitsPerEm
    s, x, out = size / upm, 0.0, []
    for i, ch in enumerate('Mooblox'):
        pen = FlatPen(gs)
        gs[cmap[ord(ch)]].draw(pen)
        rings = [Polygon([(x + px * s, py * s) for px, py in c]) for c in pen.contours]
        fill = max(rings, key=lambda r: r.area).exterior.is_ccw
        solid = unary_union([r.buffer(0) for r in rings if r.exterior.is_ccw == fill])
        solid = solid.difference(unary_union([r.buffer(0) for r in rings if r.exterior.is_ccw != fill]))
        parts = list(solid.geoms) if solid.geom_type == 'MultiPolygon' else [solid]
        pts = lambda ring: [[round(px, 2), round(py, 2)] for px, py in list(ring.coords)[:-1]]
        out.append({'colour': 'terra' if i < 3 else 'teal',
                    'shapes': [{'outer': pts(p.exterior), 'holes': [pts(h) for h in p.interiors]} for p in parts]})
        x += gs[cmap[ord(ch)]].width * s + tracking * size
    polys = [Polygon(sh['outer']) for g in out for sh in g['shapes']]
    plate = unary_union(polys).buffer(7, join_style='round').simplify(0.4)
    plate = max(plate.geoms, key=lambda g: g.area) if plate.geom_type == 'MultiPolygon' else plate
    ring = [[round(px, 2), round(py, 2)] for px, py in list(plate.exterior.coords)[:-1]]
    with open(WORDMARK, 'w') as f:
        json.dump({'glyphs': out, 'plate': ring}, f, separators=(',', ':'))
        f.write('\n')


def build():
    gl = glyphs(os.path.join(HERE, 'fonts', 'Baloo2.ttf'), 'Mooblox', 100, {'wght': 800}, -0.01)
    b = [min(g['bounds'][i] for g in gl) if i < 2 else max(g['bounds'][i] for g in gl) for i in range(4)]
    h, scale = 128, 2.0
    tx = 64 * scale + 18
    ty = h / 2 - (b[1] + b[3]) / 2 + 4
    w = tx - b[0] + b[2] + 12
    move = f'translate({tx - b[0]:.2f} {ty:.2f})'
    two_tone = ''.join(f'<path d="{g["d"]}" fill="{TERRA if i < 3 else TEAL}"/>' for i, g in enumerate(gl))
    one_tone = ''.join(f'<path d="{g["d"]}" fill="currentColor"/>' for g in gl)
    colour = f'<g transform="scale({scale})">{island()}</g><g transform="{move}">{two_tone}</g>'
    files = {
        'lockup.svg': svg(w + 12, h, f'<g transform="translate(8 0)">{sticker(colour, 14)}</g>', 'Mooblox'),
        'mono.svg': svg(w + 12, h, f'<g transform="translate(8 0)" color="{INK}"><g transform="scale({scale})">{island(True)}</g><g transform="{move}">{one_tone}</g></g>', 'Mooblox, one colour'),
        'icon.svg': svg(64, 64, island(), 'Mooblox icon'),
        'icon-mono.svg': svg(64, 64, f'<g color="{INK}">{island(True)}</g>', 'Mooblox icon, one colour'),
    }
    os.makedirs(OUT, exist_ok=True)
    for name, text in files.items():
        with open(os.path.join(OUT, name), 'w') as f:
            f.write(text)
    # Moodle plugin icon: one colour, 24 px, the core icon ink.
    with open(os.path.join(PIX, 'icon.svg'), 'w') as f:
        f.write(svg(64, 64, f'<g color="{MOODLE_ICON}">{island(True)}</g>', 'Mooblox', (24, 24)))
    shutil.copy(os.path.join(OUT, 'icon.svg'), os.path.join(PIX, 'favicon.svg'))
    shutil.copy(os.path.join(OUT, 'lockup.svg'), os.path.join(PIX, 'logo.svg'))
    os.makedirs(BRAND, exist_ok=True)
    shutil.copy(os.path.join(OUT, 'lockup.svg'), os.path.join(BRAND, 'lockup.svg'))
    wordmark_3d()


build()
