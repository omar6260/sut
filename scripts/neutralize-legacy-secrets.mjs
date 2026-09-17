// Phase 05 : vide le corps des fonctions legacy qui vérifiaient ou stockaient des secrets côté client.
// Les fonctions gardent leur nom (onclick=) ; src/platform/legacy-overrides.js fournit la nouvelle implémentation.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'src', 'legacy', 'js');
const NAMES = ['checkAdminPin', 'loadAdminLoginScreen', 'logFailedAdminAccessAttempt', 'changeAdminPin', 'generateBackupCodes', 'loadBackupCodesStatus',
  'changeAdminAccountPassword', 'enforceFirstLoginPasswordChange', 'toggleAdminAccountActive', 'verifyCurrentAdminSessionStillValid', 'confirmWithPinReentry',
  'submitPinVerification', 'submit2FALoginVerification', 'setSecurityPin', 'removeSecurityPin', 'start2FASetup', 'confirm2FASetup', 'disable2FA',
  'render2FACard', 'renderSecurityPinCard', 'verifyTotpCode', 'computeTotpCode', 'generateTotpSecret', 'generateRandomBackupCode',
  'addRegionalAdmin', 'addPayoutSpecialist', 'createCustomRole', 'createTechTeamMember', 'handleGoogleCredentialResponse', 'decodeJwtPayload', 'initGoogleSignIn', 'transferRegionalAdmin', 'resetPayoutSpecialistPassword', 'addModerator'];
let done = 0;
for (const f of (await readdir(dir)).filter((f) => f.endsWith('.js'))) {
  const file = path.join(dir, f);
  const lines = (await readFile(file, 'utf8')).split('\n');
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(async )?function ([A-Za-z0-9_]+)\(/);
    if (!m || !NAMES.includes(m[2])) continue;
    let end = i + 1; while (end < lines.length && lines[end] !== '}') end++;
    if (end >= lines.length) throw new Error(`${f} : fin de ${m[2]} introuvable`);
    const body = [`  /* phase 05 : logique déplacée côté serveur (Cloud Functions + custom claims) — implémentation dans src/platform/legacy-overrides.js */`,
      `  return window.SuktumPlatform && window.SuktumPlatform.legacyStub ? window.SuktumPlatform.legacyStub('${m[2]}') : undefined;`];
    lines.splice(i + 1, end - i - 1, ...body);
    changed = true; done++;
  }
  if (changed) await writeFile(file, lines.join('\n'));
}
// logInAsExistingUser : les blocs `existing.securityPin` / `existing.totpSecret` (secrets qui n'existent plus dans user:) sont retirés.
{
  const file = path.join(dir, '02-auth-session.js');
  let text = await readFile(file, 'utf8');
  const block = (field, screen, pend) => `  if(existing.${field}){\n    ${pend} = { existing, name, country };\n    const input = document.getElementById('${screen}-login-input');\n    if(input) input.value = '';\n    go('${screen}-verify');\n    return false;\n  }\n`;
  for (const [f, sc, pd] of [['securityPin', 'pin', 'pendingPinLogin'], ['totpSecret', 'totp', 'pending2FALogin']]) {
    if (text.includes(block(f, sc, pd))) { text = text.replace(block(f, sc, pd), `  /* phase 05 : ${f} n'est plus stocké côté client — PIN/2FA vérifiés par le serveur (legacy-overrides.js) */\n`); done++; }
  }
  await writeFile(file, text);
}
console.log(`${done} fonctions neutralisées (${NAMES.length} attendues)`);
