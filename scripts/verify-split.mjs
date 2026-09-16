// Reconstruit le HTML en un seul bloc <script> depuis src/legacy/ et le compare octet par octet au prototype.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assemble } from './build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const original = await readFile(path.join(root, 'legacy', 'suktum-app.html'));
const { html } = await assemble({ mode: 'single' });
const rebuilt = Buffer.from(html);
if (original.equals(rebuilt)) { console.log(`IDENTIQUE (${original.length} octets)`); process.exit(0); }
let i = 0; while (i < original.length && original[i] === rebuilt[i]) i++;
const line = original.subarray(0, i).toString().split('\n').length;
console.error(`DIFFÉRENT : premier écart à l'octet ${i} (ligne ${line}) — original ${original.length} o, reconstruit ${rebuilt.length} o`);
process.exit(1);
