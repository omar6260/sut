// Authentification (phase 05) : Google (lien/récupération), PIN et 2FA vérifiés serveur, rôles en claims.
// Chargé avant le legacy ; utilisé par legacy-overrides.js. Aucune vérification de secret côté client.
(function () {
  const PLATFORM = (window.SuktumPlatform = window.SuktumPlatform || {});
  const fb = window.firebase;
  const REGION = 'europe-west1';
  let functions;
  const call = async (name, data) => {
    if (!functions) { functions = fb.app().functions(REGION); if (PLATFORM.env.local) functions.useEmulator('localhost', 5001); }
    try {
      const result = (await functions.httpsCallable(name)(data ?? {})).data;
      // Convention serveur : `touched` = clés legacy modifiées → on invalide le cache de l'adaptateur.
      if (result && Array.isArray(result.touched) && window.storage && window.storage._cache) for (const k of result.touched) { window.storage._cache.delete('s:' + k); window.storage._cache.delete('p:' + k); }
      return result;
    } catch (e) { const err = new Error(e.message || 'Erreur serveur'); err.code = e.code; throw err; }
  };

  const googleProvider = () => new fb.auth.GoogleAuthProvider();
  // Règle : un compte anonyme qui possède déjà un nom LIE Google (même uid, données conservées) ; un compte anonyme vierge
  // (nouvel appareil) se CONNECTE avec Google pour retrouver ses noms. Si ce Google est déjà lié ailleurs → connexion.
  async function withGoogle(linkFn, signInFn) {
    const auth = PLATFORM.auth;
    const user = auth.currentUser;
    if (user && user.isAnonymous) {
      const mine = await call('myUsernames');
      if (mine.usernames.length > 0) {
        try { return finishGoogle((await linkFn(user)).user); }
        catch (e) { if (e.code !== 'auth/credential-already-in-use') throw e; }
      }
    }
    return finishGoogle((await signInFn(auth)).user);
  }
  const signInWithGoogle = () => withGoogle((u) => u.linkWithPopup(googleProvider()), (a) => a.signInWithPopup(googleProvider()));
  async function finishGoogle(user) {
    await user.getIdToken(true);
    const mine = await call('myUsernames');
    return { email: user.email, uid: user.uid, ...mine };
  }
  // Tests sur émulateur uniquement : jeton Google factice accepté par l'émulateur Auth.
  async function signInWithGoogleForTests(payload) {
    if (!PLATFORM.env.local) throw new Error('réservé à l’émulateur');
    const cred = fb.auth.GoogleAuthProvider.credential(JSON.stringify({ sub: payload.sub, email: payload.email, email_verified: true, name: payload.name || payload.email }));
    return withGoogle((u) => u.linkWithCredential(cred), (a) => a.signInWithCredential(cred));
  }

  async function claims() {
    const user = PLATFORM.auth.currentUser;
    if (!user) return {};
    return (await user.getIdTokenResult()).claims || {};
  }
  async function adminRole() {
    const c = await claims();
    const role = ['superadmin', 'dg', 'moderator', 'payouts', 'techteam'].find((r) => c[r] === true);
    return role ? { role, country: c.country || 'all', domain: c.domain || 'general', name: c.adminName || 'Administrateur' } : null;
  }
  async function reauthenticate() {
    const user = PLATFORM.auth.currentUser;
    if (!user) return false;
    const providers = (user.providerData || []).map((p) => p.providerId);
    if (!providers.includes('google.com')) return true; // compte anonyme : pas de ré-authentification possible avant liaison Google
    try { await user.reauthenticateWithPopup(googleProvider()); return true; } catch { return false; }
  }

  PLATFORM.legacyStub = function (name) { if (typeof showToast === 'function') showToast('Cette action est gérée par les rôles du compte (super-admin)'); console.info('[phase 05] fonction legacy neutralisée :', name); };
  PLATFORM.api = { call };
  PLATFORM.authApi = { signInWithGoogle, signInWithGoogleForTests, claims, adminRole, reauthenticate,
    registerUsername: (username, ageBracket) => call('registerUsername', { username, ageBracket }),
    myUsernames: () => call('myUsernames'),
    setPin: (pin) => call('setPin', { pin }), verifyPin: (pin) => call('verifyPin', { pin }),
    setupTotp: () => call('setupTotp'), confirmTotp: (code) => call('confirmTotp', { code }), verifyTotp: (code) => call('verifyTotpCode', { code }), disableTotp: () => call('disableTotp'),
    setRole: (data) => call('setRole', data) };
})();
