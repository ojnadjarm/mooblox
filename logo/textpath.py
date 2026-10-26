"""Turn a string into SVG path data with a given font instance."""
import sys, json
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

def glyphs(font_path, text, size, axes=None, tracking=0.0):
    f = TTFont(font_path)
    if axes and 'fvar' in f:
        f = instantiateVariableFont(f, axes)
    gs, cmap, upm = f.getGlyphSet(), f.getBestCmap(), f['head'].unitsPerEm
    s = size / upm
    x, out = 0.0, []
    for ch in text:
        g = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        gs[g].draw(TransformPen(pen, (s, 0, 0, -s, x, 0)))
        bp = BoundsPen(gs); gs[g].draw(bp)
        b = bp.bounds or (0, 0, 0, 0)
        out.append({'ch': ch, 'd': pen.getCommands(), 'x': x, 'adv': gs[g].width * s,
                    'bounds': [x + b[0] * s, -b[3] * s, x + b[2] * s, -b[1] * s]})
        x += gs[g].width * s + tracking * size
    return out

if __name__ == '__main__':
    a = json.loads(sys.argv[1])
    print(json.dumps(glyphs(a['font'], a['text'], a['size'], a.get('axes'), a.get('tracking', 0))))
