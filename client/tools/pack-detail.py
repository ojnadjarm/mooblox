# Packs CC0 ambientCG 1K sets into two greyscale detail atlases for the xhigh tier:
#   python3 tools/pack-detail.py <unzipped ambientCG dir> public/assets/detail
# Channel per surface = 60% contrast-stretched colour luminance (x AO) + 40% displacement, centred on 0.5.
# detail-a.png RGBA = grass, foliage, wood, rock; detail-b.png RGBA = roof, plaster, brick, ground.
import sys, os
import numpy as np
from PIL import Image

SETS = [['Grass004', 'Foliage001', 'Planks021', 'Rock030'], ['RoofingTiles006', 'Plaster001', 'Bricks059', 'Ground054']]
SIZE = 512
src, dst = sys.argv[1], sys.argv[2]

def channel(name):
    def load(kind):
        p = os.path.join(src, name, f'{name}_1K-JPG_{kind}.jpg')
        return np.asarray(Image.open(p).convert('L').resize((SIZE, SIZE), Image.LANCZOS), dtype=np.float32) / 255 if os.path.exists(p) else None
    lum = load('Color')
    ao = load('AmbientOcclusion')
    disp = load('Displacement')
    if ao is not None:
        lum = lum * (0.5 + 0.5 * ao)
    def stretch(a):
        lo, hi = np.percentile(a, 2), np.percentile(a, 98)
        return np.clip((a - lo) / max(hi - lo, 1e-3), 0, 1)
    v = 0.6 * stretch(lum) + 0.4 * (stretch(disp) if disp is not None else stretch(lum))
    return np.clip(v - v.mean() + 0.5, 0, 1)

os.makedirs(dst, exist_ok=True)
for i, names in enumerate(SETS):
    rgba = np.stack([channel(n) for n in names], axis=-1)
    Image.fromarray((rgba * 255).round().astype(np.uint8), 'RGBA').save(os.path.join(dst, f'detail-{"ab"[i]}.png'), optimize=True)
    print('packed', names)
