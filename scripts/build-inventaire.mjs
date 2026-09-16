// Consolide les rapports de lots (docs/inventaire/_lots/lot-NN.md, 4 blocs chacun) en 4 fichiers :
// prefixes.md, classification.md, ecritures-croisees.md, logique-sensible.md.
// Usage : node scripts/build-inventaire.mjs
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lotsDir = path.join(root, 'docs', 'inventaire', '_lots');
const outDir = path.join(root, 'docs', 'inventaire');

const BLOCKS = ['PREFIXES', 'CLASSIFICATION', 'ECRITURES_CROISEES', 'LOGIQUE_SENSIBLE'];
const rows = Object.fromEntries(BLOCKS.map((b) => [b, []]));

const files = (await readdir(lotsDir)).filter((f) => /^lot-\d+\.md$/.test(f)).sort();
for (const f of files) {
  const text = await readFile(path.join(lotsDir, f), 'utf8');
  for (const block of BLOCKS) {
    const m = text.match(new RegExp(`### ${block}\\n([\\s\\S]*?)(?=\\n### |$)`));
    if (!m) { console.warn(`${f} : bloc ${block} absent`); continue; }
    const lines = m[1].split('\n').filter((l) => l.startsWith('|'));
    // Retire l'en-tête, le séparateur et les lignes « vides » `| - | - |`.
    const body = lines.slice(2).filter((l) => !/^\|\s*-\s*\|/.test(l));
    // Normalise : espaces de fin, et « prefixe: » → « prefixe » dans la 1re colonne des blocs par préfixe.
    rows[block].push(...body.map((l) => {
      let line = l.replace(/\s+\|\s*$/, ' |');
      // « `user:` », « user (hors lot, …) », « settings:<groupe> » → nom canonique en 1re colonne.
      if (block === 'PREFIXES' || block === 'CLASSIFICATION') line = line.replace(/^\|\s*`?([A-Za-z0-9_]+)(?::(<[^>|`]*>)?)?`?[^|]*\|/, (m, p, g) => `| ${p}${g ? ':' + g : ''} |`);
      return line;
    }));
  }
}

const byPrefix = (a, b) => a.split('|')[1].trim().localeCompare(b.split('|')[1].trim());
const byLine = (a, b) => parseInt(a.split('|')[1], 10) - parseInt(b.split('|')[1], 10);

// Par préfixe : le DERNIER lot lu gagne (les lots de correction, numérotés 9x, écrasent les lots d'analyse).
const lastWins = (list) => { const m = new Map(); for (const l of list) m.set(l.split('|')[1].trim(), l); return [...m.values()].sort(byPrefix); };
rows.PREFIXES = lastWins(rows.PREFIXES);
rows.CLASSIFICATION = lastWins(rows.CLASSIFICATION);
// Par site : dédoublonnage sur (ligne, préfixe).
const uniqBySite = (list) => { const m = new Map(); for (const l of list) { const c = l.split('|'); m.set(`${c[1].trim()}|${c[3].trim()}`, l); } return [...m.values()].sort(byLine); };
rows.ECRITURES_CROISEES = uniqBySite(rows.ECRITURES_CROISEES);
rows.LOGIQUE_SENSIBLE = uniqBySite(rows.LOGIQUE_SENSIBLE);

const classes = {};
for (const l of rows.CLASSIFICATION) { const c = l.split('|')[2].trim(); classes[c] = (classes[c] || 0) + 1; }

const head = (title, intro) => `# ${title}\n\n${intro}\n\n`;

await writeFile(path.join(outDir, 'prefixes.md'),
  head('Inventaire des préfixes de stockage',
    `Généré par \`node scripts/build-inventaire.mjs\` à partir des lots \`_lots/lot-NN.md\` (analyse par lecture du code, phase 02).\n` +
    `Comptages get/set/list/delete : \`node scripts/extract-prefixes.mjs\` (clés littérales uniquement ; 494 appels à clé calculée non comptés).\n` +
    `Vérification de couverture : \`node scripts/check-inventaire.mjs\`.\n\n**${rows.PREFIXES.length} préfixes.**`) +
  '| Préfixe | Structure de la valeur | shared | get | set | list | delete | Qui écrit | Écriture croisée | Taille max | Médias base64 | Lignes clés |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n' +
  rows.PREFIXES.join('\n') + '\n');

await writeFile(path.join(outDir, 'classification.md'),
  head('Classification de sécurité des préfixes',
    `Classes définies dans \`docs/ARCHITECTURE-CIBLE.md\`. En cas de doute, SERVEUR_SEUL.\n\n` +
    Object.entries(classes).sort((a, b) => b[1] - a[1]).map(([c, n]) => `- **${c}** : ${n}`).join('\n') +
    `\n\nLecture : « PUBLIC_PROPRIETAIRE » ou « PARTICIPANTS » signifie que les **lectures** et les écritures du propriétaire passent par les règles Firestore ; ` +
    `dans presque tous les cas, un ou plusieurs **champs** de ces documents (statut, prix, compteurs) restent SERVEUR_SEUL — voir la justification et \`logique-sensible.md\`.`) +
  '| Préfixe | Classe | Justification |\n|---|---|---|\n' + rows.CLASSIFICATION.join('\n') + '\n');

await writeFile(path.join(outDir, 'ecritures-croisees.md'),
  head('Écritures croisées — un utilisateur modifie une donnée qui appartient à un autre',
    `${rows.ECRITURES_CROISEES.length} sites, triés par ligne. Chacun est un motif lecture → modification → réécriture complète (dernier écrit gagnant) ` +
    `ou une création sous le document d'autrui. Solutions : sous-collection (un document par contributeur), \`increment()\` pour les compteurs, transaction serveur (Cloud Function) pour tout ce qui a une valeur.`) +
  '| Ligne | Fonction | Préfixe | Champ modifié | Qui modifie quoi | Solution proposée |\n|---|---|---|---|---|---|\n' + rows.ECRITURES_CROISEES.join('\n') + '\n');

await writeFile(path.join(outDir, 'logique-sensible.md'),
  head('Logique sensible à migrer côté serveur',
    `${rows.LOGIQUE_SENSIBLE.length} sites, triés par ligne. Périmètre : pièces, achats, commissions, reversements, fonds créateur, badges payants, abonnements, enchères, codes promo, ` +
    `points de fidélité, rôles, sanctions, PIN/2FA/codes de secours, âge et Mode Familial, auto-acceptation. Chaque ligne devient une Cloud Function (phase 06) ou une règle de sécurité.`) +
  '| Ligne | Fonction | Préfixe | Règle métier résumée | Pourquoi côté serveur |\n|---|---|---|---|---|\n' + rows.LOGIQUE_SENSIBLE.join('\n') + '\n');

console.log(`lots : ${files.length} · préfixes : ${rows.PREFIXES.length} · classifications : ${rows.CLASSIFICATION.length} · écritures croisées : ${rows.ECRITURES_CROISEES.length} · logique sensible : ${rows.LOGIQUE_SENSIBLE.length}`);
console.log('classes :', classes);
