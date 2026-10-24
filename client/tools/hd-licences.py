# Rewrites the LICENSES.csv rows of the xhigh assets: python3 tools/hd-licences.py public/assets
# kit-hd/<id>.glb inherits its kit/<id>.glb row (bevelled by tools/bevel-kit.py); detail/*.png credit ambientCG.
import csv, hashlib, io, os, sys

root = sys.argv[1]
path = os.path.join(root, 'LICENSES.csv')
DETAIL = {
    'detail/detail-a.png': 'Grass004 Foliage001 Planks021 Rock030',
    'detail/detail-b.png': 'RoofingTiles006 Plaster001 Bricks059 Ground054',
}

def sha(p):
    return hashlib.sha256(open(os.path.join(root, p), 'rb').read()).hexdigest()[:16]

rows = list(csv.reader(open(path, newline='')))
head, body = rows[0], [r for r in rows[1:] if not r[0].startswith(('kit-hd/', 'detail/'))]
base = {r[0]: r for r in body}
for dirpath, _, files in os.walk(os.path.join(root, 'kit-hd')):
    for f in sorted(files):
        rel = os.path.relpath(os.path.join(dirpath, f), root)
        src = base['kit/' + rel[len('kit-hd/'):]]
        body.append([rel, src[1] + ' (bevelled by tools/bevel-kit.py)', src[2], src[3], src[4], sha(rel)])
for rel, sets in DETAIL.items():
    urls = ' '.join(f'https://ambientcg.com/view?id={s}' for s in sets.split())
    body.append([rel, f'ambientCG {sets} (packed by tools/pack-detail.py)', 'ambientCG (ambientcg.com)', 'CC0-1.0', urls, sha(rel)])
out = io.StringIO()
w = csv.writer(out, quoting=csv.QUOTE_NONNUMERIC, lineterminator='\n')
out.write(','.join(head) + '\n')
for r in body:
    w.writerow(r)
open(path, 'w').write(out.getvalue())
print('rows', len(body))
