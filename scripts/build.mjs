// Assemble le frontend dans dist/index.html à partir de src/legacy/ (phase 03+).
//   node scripts/build.mjs            → un seul bloc <script> (concaténation, identique au prototype)
//   node scripts/build.mjs --multi    → un <script src="js/NN-….js"> par fichier, dans l'ordre
// Repli : si src/legacy/index.template.html n'existe pas, copie du prototype tel quel.
import { readdir, readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'src', 'legacy');
const distDir = path.join(root, 'dist');
const multi = process.argv.includes('--multi');
const VENDOR = ['firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-firestore-compat.js', 'firebase-storage-compat.js'];

export async function assemble({ mode = 'single' } = {}) {
  const template = await readFile(path.join(srcDir, 'index.template.html'), 'utf8');
  const css = await readFile(path.join(srcDir, 'styles.css'), 'utf8');
  const jsFiles = (await readdir(path.join(srcDir, 'js'))).filter((f) => f.endsWith('.js')).sort();
  const styles = '<style>\n' + css + '</style>';
  // Scripts plateforme (phase 04+) : SDK Firebase (bundles compat servis localement) puis src/platform, AVANT le legacy.
  const platformDir = path.join(root, 'src', 'platform');
  const platformFiles = ['firebase-config.local.js', 'storage-keys.js', 'storage-adapter.js', 'boot.js'].filter((f) => existsSync(path.join(platformDir, f)));
  if (existsSync(path.join(platformDir, 'boot.js')) && !existsSync(path.join(platformDir, 'firebase-config.local.js'))) {
    throw new Error('src/platform/firebase-config.local.js manquant : copier firebase-config.example.js et le renseigner (npx firebase apps:sdkconfig WEB)');
  }
  const vendor = VENDOR.map((f) => `<script src="vendor/${f}"></script>`).join('\n');
  const platform = platformFiles.map((f) => `<script src="platform/${f}"></script>`).join('\n');
  let scripts;
  if (mode === 'multi') {
    scripts = [vendor, platform, ...jsFiles.map((f) => `<script src="js/${f}"></script>`)].filter(Boolean).join('\n');
  } else {
    const parts = [];
    for (const f of jsFiles) parts.push(await readFile(path.join(srcDir, 'js', f), 'utf8'));
    scripts = '<script>\n' + parts.join('') + '</script>';
    if (mode === 'single-platform') scripts = [vendor, platform, scripts].filter(Boolean).join('\n');
  }
  // Fonction de remplacement : le JS contient des motifs `$&`, `$'` que String.replace interpréterait.
  const html = template.replace('<!-- @@STYLES@@ -->', () => styles).replace('<!-- @@SCRIPTS@@ -->', () => scripts);
  return { html, jsFiles };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await mkdir(distDir, { recursive: true });
  let html, mode;
  if (existsSync(path.join(srcDir, 'index.template.html'))) {
    mode = multi ? 'multi' : 'single';
    const r = await assemble({ mode });
    html = r.html;
    for (const d of ['js', 'platform', 'vendor']) await rm(path.join(distDir, d), { recursive: true, force: true });
    if (multi) {
      await cp(path.join(srcDir, 'js'), path.join(distDir, 'js'), { recursive: true });
      await cp(path.join(root, 'src', 'platform'), path.join(distDir, 'platform'), { recursive: true, filter: (src) => !src.endsWith('.example.js') && !src.endsWith('README.md') });
      await mkdir(path.join(distDir, 'vendor'), { recursive: true });
      for (const f of VENDOR) await cp(path.join(root, 'node_modules', 'firebase', f), path.join(distDir, 'vendor', f));
    }
  } else {
    html = await readFile(path.join(root, 'legacy', 'suktum-app.html'), 'utf8');
    mode = 'copie du prototype (src/legacy vide)';
  }
  await writeFile(path.join(distDir, 'index.html'), html);
  console.log(`build : dist/index.html — mode ${mode} — ${(Buffer.byteLength(html) / 1024).toFixed(0)} Ko`);
}
