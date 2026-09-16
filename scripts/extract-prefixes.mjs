// Extraction mécanique des préfixes de stockage du legacy.
// Usage : node scripts/extract-prefixes.mjs [--json]
// Compte, pour chaque préfixe, les appels par opération (get/set/list/delete) et le paramètre shared.
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('../legacy/suktum-app.html', import.meta.url), 'utf8');
const lines = src.split('\n');

// Un appel de stockage : safeGet / saveWithRetry / safeList / window.storage.{get,set,list,delete}
// suivi d'une clé littérale, concaténée ou gabarit commençant par `<prefixe>:`.
const CALL = /(safeGet|saveWithRetry|safeList|window\.storage\.(?:get|set|list|delete))\(\s*(['"`])([a-zA-Z0-9_]+):/g;
const OPS = { safeGet: 'get', saveWithRetry: 'set', safeList: 'list', 'window.storage.get': 'get', 'window.storage.set': 'set', 'window.storage.list': 'list', 'window.storage.delete': 'delete' };

const prefixes = new Map();
const touch = (p) => { if (!prefixes.has(p)) prefixes.set(p, { get: 0, set: 0, list: 0, delete: 0, sharedTrue: 0, sharedFalse: 0, sharedUnknown: 0, lines: new Set() }); return prefixes.get(p); };

lines.forEach((line, i) => {
  for (const m of line.matchAll(CALL)) {
    const rec = touch(m[3]);
    rec[OPS[m[1]]]++;
    rec.lines.add(i + 1);
    // Paramètre shared : on regarde la fin de l'appel sur la même ligne (heuristique).
    const rest = line.slice(m.index);
    const closing = rest.match(/,\s*(true|false)\s*\)/);
    if (closing) rec[closing[1] === 'true' ? 'sharedTrue' : 'sharedFalse']++; else rec.sharedUnknown++;
  }
});

// Clés construites hors de l'appel :  const xKey = 'prefixe:' + …  puis safeGet(xKey, …).
// On les compte comme préfixes (sans ventilation par opération : la variable peut servir à get et set).
const NOT_PREFIXES = new Set(['data', 'http', 'https', 'blob', 'mailto', 'tel']); // faux positifs (dataUrl, URL)
const ASSIGN = /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(['"`])([a-zA-Z0-9_]+):/g;
lines.forEach((line, i) => {
  for (const m of line.matchAll(ASSIGN)) {
    if (NOT_PREFIXES.has(m[2])) continue;
    const rec = touch(m[2]);
    rec.viaVariable = (rec.viaVariable || 0) + 1;
    rec.lines.add(i + 1);
  }
});

// Préfixes construits dynamiquement : safeGet(k, …) où k vient d'une liste — signalés à part.
const dynamic = [];
lines.forEach((line, i) => {
  if (/(safeGet|saveWithRetry|safeList|window\.storage\.(?:get|set|list|delete))\(\s*[a-zA-Z_$][\w$.]*\s*[,)]/.test(line)) dynamic.push(i + 1);
});

const rows = [...prefixes.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([p, r]) => ({ prefix: p, viaVariable: 0, ...r, lines: [...r.lines].sort((a, b) => a - b) }));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ prefixes: rows, dynamicCallLines: dynamic }, null, 2));
} else {
  console.log(`${rows.length} préfixes littéraux ; ${dynamic.length} appels avec clé calculée (variable)`);
  console.log('prefix\tget\tset\tlist\tdelete\tviaVariable\tshared=true\tshared=false\tshared=?\tpremière ligne');
  for (const r of rows) console.log([r.prefix, r.get, r.set, r.list, r.delete, r.viaVariable, r.sharedTrue, r.sharedFalse, r.sharedUnknown, r.lines[0]].join('\t'));
}
