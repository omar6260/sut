// Amorçage manuel du PREMIER super-admin (jamais exposé dans l'app). À exécuter par Oumar, une seule fois par projet.
//   Émulateur : FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 node scripts/bootstrap-superadmin.mjs <email-google>
//   Projet réel : GOOGLE_APPLICATION_CREDENTIALS=<clé de service> node scripts/bootstrap-superadmin.mjs <email-google> --project suktum-dev
// Le compte doit d'abord exister (l'utilisateur a fait « Continuer avec Google » dans l'app).
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const email = process.argv[2];
const projectId = process.argv.includes('--project') ? process.argv[process.argv.indexOf('--project') + 1] : 'suktum-dev';
if (!email) { console.error('usage : node scripts/bootstrap-superadmin.mjs <email-google> [--project id]'); process.exit(1); }
initializeApp({ projectId });
const user = await getAuth().getUserByEmail(email);
await getAuth().setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), superadmin: true, country: 'all', domain: 'general', adminName: 'Propriétaire' });
await getAuth().revokeRefreshTokens(user.uid);
await getFirestore().collection('kv_auditlog').add({ owner: 'server', updatedAt: FieldValue.serverTimestamp(), data: { id: `audit_${Date.now()}`, actorName: 'Amorçage manuel', actorRole: 'Script', action: 'Super-admin initial défini', detail: email, createdAt: new Date().toISOString(), server: true } });
console.log(`super-admin : ${email} (uid ${user.uid}) sur ${projectId}. L'utilisateur doit se reconnecter (jeton révoqué).`);
