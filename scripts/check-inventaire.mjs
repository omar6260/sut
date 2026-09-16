// Vérifie que docs/inventaire/prefixes.md et classification.md couvrent 100 % des préfixes
// extraits mécaniquement du legacy, et que chaque classe est valide.
// Usage : node scripts/check-inventaire.mjs   (code de sortie 1 si incomplet)
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLASSES = new Set(['PUBLIC_PROPRIETAIRE', 'PRIVE', 'PARTICIPANTS', 'SERVEUR_SEUL', 'ADMIN']);

const extracted = JSON.parse(execFileSync('node', [path.join(root, 'scripts', 'extract-prefixes.mjs'), '--json'], { encoding: 'utf8' }));
const expected = new Set(extracted.prefixes.map((p) => p.prefix));

const tablePrefixes = async (file) => {
  const text = await readFile(path.join(root, 'docs', 'inventaire', file), 'utf8');
  return text.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Préfixe') && !l.startsWith('|---')).map((l) => l.split('|').slice(1).map((c) => c.trim()));
};

let ok = true;
for (const file of ['prefixes.md', 'classification.md']) {
  const rowsList = await tablePrefixes(file).catch(() => null);
  if (!rowsList) { console.error(`${file} : absent`); ok = false; continue; }
  // Un préfixe éclaté en groupes (« settings:<clés API> », …) est couvert par ses groupes.
  const found = new Set(rowsList.flatMap((r) => [r[0], r[0].split(':')[0]]));
  const missing = [...expected].filter((p) => !found.has(p));
  const extra = [...found].filter((p) => !expected.has(p) && !p.startsWith('settings:'));
  console.log(`${file} : ${found.size} préfixes documentés / ${expected.size} extraits` + (missing.length ? ` — MANQUANTS (${missing.length}) : ${missing.join(', ')}` : ' — couverture 100 %'));
  if (extra.length) console.log(`  préfixes documentés non extraits (clé calculée ou sous-clé) : ${extra.join(', ')}`);
  if (missing.length) ok = false;
  if (file === 'classification.md') {
    const bad = rowsList.filter((r) => !CLASSES.has(r[1]));
    if (bad.length) { ok = false; console.error(`  classes invalides : ${bad.map((r) => `${r[0]}=${r[1]}`).join(', ')}`); }
  }
}
for (const file of ['ecritures-croisees.md', 'logique-sensible.md', 'appels-externes.md', 'temps-reel.md', 'ecrans-et-modules.md']) {
  await readFile(path.join(root, 'docs', 'inventaire', file)).then(() => console.log(`${file} : présent`)).catch(() => { ok = false; console.error(`${file} : ABSENT`); });
}
process.exit(ok ? 0 : 1);
