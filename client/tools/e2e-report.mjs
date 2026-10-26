// T1376: matrix.csv + findings page from runner rows. node tools/e2e-report.mjs <rows.csv> <matrix.csv> <bugs.json> <dropdir> [stills dir under rows.csv's dir]
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const [rowsPath, matrixPath, bugsPath, drop, stillsDir = 'stills'] = process.argv.slice(2);
const parse = (line) => [...line.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1]);
const lines = readFileSync(rowsPath, 'utf8').trim().split('\n').slice(1);
const rows = lines.map(parse).map(([course, mod, flow, result, severity, repro, evidence]) => ({ course, mod, flow, result, severity, repro, evidence }));
writeFileSync(matrixPath, readFileSync(rowsPath, 'utf8'));
const bugs = existsSync(bugsPath) ? JSON.parse(readFileSync(bugsPath, 'utf8')) : [];
mkdirSync(join(drop, 'stills'), { recursive: true });
const src = dirname(rowsPath);
const copy = (p) => { if (p && existsSync(join(src, p))) copyFileSync(join(src, p), join(drop, 'stills', basename(p))); return `stills/${basename(p)}`; };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const courses = [...new Set(rows.map((r) => r.course))];
const kinds = ['pass', 'fail', 'not-shown', 'unsupported', 'untested'];
const count = (list, k) => list.filter((r) => r.result === k).length;
const summary = courses.map((c) => { const l = rows.filter((r) => r.course === c); return `<tr><th>${esc(c.replace('mooblox_e2e_', ''))}</th>${kinds.map((k) => `<td>${count(l, k)}</td>`).join('')}<td>${l.length}</td></tr>`; }).join('');
const total = `<tr class="total"><th>all</th>${kinds.map((k) => `<td>${count(rows, k)}</td>`).join('')}<td>${rows.length}</td></tr>`;
const bugCards = bugs.map((b, i) => `<article class="bug ${esc(b.severity)}"><h3>${i + 1}. ${esc(b.title)} <span>${esc(b.severity)}</span></h3><p>${esc(b.repro)}</p>
  ${(b.stills ?? []).map((s) => `<a href="${copy(s)}"><img loading="lazy" src="${copy(s)}" alt="${esc(b.title)}"></a>`).join('')}</article>`).join('');
const fails = rows.filter((r) => r.result !== 'pass').map((r) => `<tr class="${esc(r.result)}"><td>${esc(r.course.replace('mooblox_e2e_', ''))}</td><td>${esc(r.mod)}</td><td>${esc(r.flow)}</td><td>${esc(r.result)}</td><td>${esc(r.severity)}</td><td>${esc(r.repro)}</td></tr>`).join('');
const enterStills = courses.map((c) => [`${stillsDir}/${c}-enter-1366.jpg`, `${stillsDir}/${c}-enter-400.jpg`]).flat().filter((p) => existsSync(join(src, p)))
  .map((p) => `<figure><a href="${copy(p)}"><img loading="lazy" src="${copy(p)}" alt="${esc(p)}"></a><figcaption>${esc(basename(p, '.jpg'))}</figcaption></figure>`).join('');

writeFileSync(join(drop, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>T1376 MOOBLOX e2e courses</title><style>
*{box-sizing:border-box}body{margin:0;font:16px/1.45 system-ui,sans-serif;background:#f6f4ef;color:#222}
main{max-width:1200px;margin:0 auto;padding:24px clamp(12px,4vw,40px)}h1{font-size:clamp(1.4rem,3vw,2rem);margin:.2em 0}
.wrap{overflow-x:auto;max-width:100%}table{border-collapse:collapse;width:100%;font-size:.9rem}td,th{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}.fails td{overflow-wrap:anywhere}
.total{font-weight:700}.bug{background:#fff;border-left:6px solid #999;border-radius:8px;padding:12px 16px;margin:14px 0}.bug.blocker,.bug.high{border-color:#c0392b}.bug.medium{border-color:#e67e22}.bug.low{border-color:#2980b9}
.bug h3{margin:0 0 6px;font-size:1.05rem}.bug h3 span{font-weight:400;color:#666;font-size:.85rem}.bug img{max-width:100%;width:min(100%,520px);margin:6px 8px 0 0;border-radius:6px;border:1px solid #ccc}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr));gap:12px}figure{margin:0}figure img{width:100%;border-radius:6px;border:1px solid #ccc}figcaption{font-size:.8rem;color:#555}
tr.fail td:nth-child(4){color:#c0392b;font-weight:600}tr.not-shown td:nth-child(4){color:#e67e22;font-weight:600}
@media (max-width:600px){.fails td:nth-child(6){display:none}.fails th:nth-child(6){display:none}}
</style></head><body><main>
<h1>MOOBLOX end-to-end courses (T1376)</h1>
<p>${courses.length} courses (3 small, 3 medium) played as students in play.php on Moodle 5.2, plus teacher and second-student runs. Matrix rows: ${rows.length}.</p>
<h2>Matrix summary</h2><div class="wrap"><table><tr><th>course</th>${kinds.map((k) => `<th>${k.replace('-', '&#8209;')}</th>`).join('')}<th>rows</th></tr>${summary}${total}</table></div>
<h2>Top bugs</h2>${bugCards || '<p>None.</p>'}
<h2>Every row that did not pass</h2><div class="wrap"><table class="fails"><tr><th>course</th><th>mod</th><th>flow</th><th>result</th><th>severity</th><th>repro</th></tr>${fails}</table></div>
<h2>Each course on entry (1366 and 400)</h2><div class="grid">${enterStills}</div>
</main></body></html>`);
console.log(`rows ${rows.length}: ${kinds.map((k) => `${k} ${count(rows, k)}`).join(', ')}`);
