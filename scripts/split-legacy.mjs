// Découpe legacy/suktum-app.html en src/legacy/ SANS modifier une ligne (copier-coller par plages).
// Plages issues de docs/inventaire/ecrans-et-modules.md. Preuve : scripts/verify-split.mjs → IDENTIQUE.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = await readFile(path.join(root, 'legacy', 'suktum-app.html'), 'utf8');
const lines = src.split('\n'); // le fichier finit par \n → dernier élément ''
const L = (n) => lines[n - 1]; // accès 1-based

// Frontières (vérifiées) : <style> l.44 … </style> l.233 ; <script> l.6893 … </script> l.37409
const STYLE_OPEN = 44, STYLE_CLOSE = 233, SCRIPT_OPEN = 6893, SCRIPT_CLOSE = 37409;
if (L(STYLE_OPEN) !== '<style>' || L(STYLE_CLOSE) !== '</style>' || L(SCRIPT_OPEN) !== '<script>' || L(SCRIPT_CLOSE) !== '</script>') {
  throw new Error('frontières inattendues : le prototype a changé ?');
}

// Début de chaque fichier JS (ligne 1-based, inclusive). Chaque coupe tombe sur une déclaration de premier niveau.
export const JS_PARTS = [
  [6894, '01-socle'],
  [7205, '02-auth-session'],
  [8002, '03-preferences'],
  [8621, '04-navigation'],
  [8840, '05-feed-publication'],
  [11245, '06-recherche-notifications'],
  [11860, '07-stories-video'],
  [12730, '08-feed-interactions'],
  [15272, '09-discover'],
  [15394, '10-education-admin'],
  [15877, '11-profil'],
  [16441, '12-education-noyau'],
  [17102, '13-education-cours'],
  [20916, '14-boutique-vendeur'],
  [22148, '15-createur-divers'],
  [23541, '16-live-monetisation'],
  [26243, '17-boutique-catalogue-commandes'],
  [27690, '18-messagerie-support'],
  [28794, '19-backoffice'],
  [37407, '20-init'],
];

const out = path.join(root, 'src', 'legacy');
await rm(path.join(out, 'js'), { recursive: true, force: true });
await mkdir(path.join(out, 'js'), { recursive: true });

// 1. CSS
await writeFile(path.join(out, 'styles.css'), lines.slice(STYLE_OPEN, STYLE_CLOSE - 1).join('\n') + '\n');

// 2. Gabarit HTML : tout sauf le contenu des blocs style et script, remplacés par des marqueurs.
const template = [
  ...lines.slice(0, STYLE_OPEN - 1), '<!-- @@STYLES@@ -->',
  ...lines.slice(STYLE_CLOSE, SCRIPT_OPEN - 1), '<!-- @@SCRIPTS@@ -->',
  ...lines.slice(SCRIPT_CLOSE),
].join('\n');
await writeFile(path.join(out, 'index.template.html'), template);

// 3. JS par domaine, avec contrôle de coupe et de syntaxe.
const TOP = /^(async function |function |let |const |var |\/\*|\/\/|\(function|document\.|window\.|[A-Za-z_$][\w$]*\s*\(|[A-Za-z_$][\w$.]*\s*=)/;
for (let i = 0; i < JS_PARTS.length; i++) {
  const [start, name] = JS_PARTS[i];
  const end = i + 1 < JS_PARTS.length ? JS_PARTS[i + 1][0] - 1 : SCRIPT_CLOSE - 1;
  if (!TOP.test(L(start))) throw new Error(`coupe l.${start} (${name}) : pas une déclaration de premier niveau : ${L(start).slice(0, 60)}`);
  let p = start - 1; while (p > SCRIPT_OPEN && L(p).trim() === '') p--;
  if (i > 0 && /^\s/.test(L(p))) throw new Error(`coupe l.${start} (${name}) : la ligne précédente (l.${p}) est indentée, coupe au milieu d'un bloc ?`);
  const file = path.join(out, 'js', `${name}.js`);
  await writeFile(file, lines.slice(start - 1, end).join('\n') + '\n');
  execFileSync('node', ['--check', file]); // lève si la coupe casse la syntaxe
  console.log(`${name}.js : l.${start}-${end} (${end - start + 1} lignes) — syntaxe OK`);
}
console.log('styles.css, index.template.html, ' + JS_PARTS.length + ' fichiers JS écrits dans src/legacy/');
