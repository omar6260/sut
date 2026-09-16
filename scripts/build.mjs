// Assemble le frontend dans dist/index.html.
//
// Phase 00 → 02 : src/legacy est vide, on copie le prototype tel quel.
// Phase 03+     : src/legacy contient le legacy découpé en fichiers ordonnés
//                 (00-head.html, 10-css.html, 20-markup.html, 30-js-storage.js …),
//                 concaténés dans l'ordre lexicographique. Les .js sont enveloppés
//                 dans une balise <script> ; les .html/.css sont insérés tels quels.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const legacyFile = path.join(root, 'legacy', 'suktum-app.html');
const srcDir = path.join(root, 'src', 'legacy');
const distDir = path.join(root, 'dist');
const out = path.join(distDir, 'index.html');

const parts = (await readdir(srcDir))
  .filter((f) => /\.(html|css|js)$/.test(f))
  .sort();

let html;
let mode;
if (parts.length === 0) {
  html = await readFile(legacyFile, 'utf8');
  mode = 'copie du prototype (src/legacy vide)';
} else {
  const chunks = [];
  for (const f of parts) {
    const content = await readFile(path.join(srcDir, f), 'utf8');
    if (f.endsWith('.js')) chunks.push(`<script>\n${content}\n</script>`);
    else if (f.endsWith('.css')) chunks.push(`<style>\n${content}\n</style>`);
    else chunks.push(content);
  }
  html = chunks.join('\n');
  mode = `${parts.length} fichiers de src/legacy`;
}

await mkdir(distDir, { recursive: true });
await writeFile(out, html);
console.log(`build : ${path.relative(root, out)} — ${mode} — ${(Buffer.byteLength(html) / 1024).toFixed(0)} Ko`);
