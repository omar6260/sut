// Surcharges d'identité du legacy (phase 05). Chargé APRÈS les scripts legacy et AVANT 20-init.js :
// les fonctions globales sont réassignées, les écrans et les textes restent ceux du prototype.
(function () {
  const P = window.SuktumPlatform;
  if (window.__SUKTUM_STORAGE_INJECTED || !P || !P.authApi || !P.env) return; // pas de plateforme (tests mémoire) → legacy intact
  const A = P.authApi;
  const original = { completeOnboarding: window.completeOnboarding, logInAsExistingUser: window.logInAsExistingUser };
  let pendingLogin = null; // { existing, name, country, requiresPin, requiresTotp }

  // ---- Inscription / connexion par nom d'utilisateur (D1) ----
  window.completeOnboarding = async function () {
    const name = document.getElementById('onboard-username').value.trim();
    if (!name) { showToast('Choisissez un nom d’utilisateur'); return; }
    const check = validateUsernameFormat(name);
    if (!check.valid) { showToast(check.reason); return; }
    const minor = document.getElementById('onboard-age-minor-btn').dataset.selected === 'true';
    const adult = document.getElementById('onboard-age-adult-btn').dataset.selected === 'true';
    const existing = await safeGet('user:' + name, true);
    if (!existing && !minor && !adult) { showToast(t('onboard_age_required')); return; }
    let r;
    try { r = await A.registerUsername(name, minor ? '13-17' : '18+'); }
    catch (e) { showToast(e.message || 'Impossible de réserver ce nom pour l’instant'); return; }
    if (r.status === 'taken') {
      showToast('Ce nom est déjà utilisé. Si c’est votre compte, continuez avec Google pour le retrouver.');
      const area = document.getElementById('google-signin-area'); if (area) area.scrollIntoView({ block: 'center' });
      return;
    }
    return original.completeOnboarding();
  };

  // Connexion à un compte existant : seulement s'il appartient au compte Firebase courant (même appareil ou Google).
  window.logInAsExistingUser = async function (existing, name, country) {
    const mine = await A.myUsernames();
    if (!mine.usernames.map((u) => u.toLowerCase()).includes(name.toLowerCase())) {
      showToast('Ce nom est déjà utilisé. Si c’est votre compte, continuez avec Google pour le retrouver.');
      return false;
    }
    if (mine.requiresPin || mine.requiresTotp) {
      pendingLogin = { existing, name, country, requiresPin: mine.requiresPin, requiresTotp: mine.requiresTotp };
      if (mine.requiresPin) { const i = document.getElementById('pin-login-input'); if (i) i.value = ''; go('pin-verify'); }
      else { const i = document.getElementById('totp-login-input'); if (i) i.value = ''; go('totp-verify'); }
      return false;
    }
    return original.logInAsExistingUser(existing, name, country);
  };
  window.submitPinVerification = async function () {
    if (!pendingLogin) return;
    const entered = document.getElementById('pin-login-input').value.trim();
    try { await A.verifyPin(entered); } catch (e) { showToast(e.message || 'Code incorrect'); return; }
    if (pendingLogin.requiresTotp) { const i = document.getElementById('totp-login-input'); if (i) i.value = ''; go('totp-verify'); return; }
    const p = pendingLogin; pendingLogin = null;
    await original.logInAsExistingUser(p.existing, p.name, p.country);
  };
  window.submit2FALoginVerification = async function () {
    if (!pendingLogin) return;
    const entered = document.getElementById('totp-login-input').value.trim().replace(/\s/g, '');
    try { await A.verifyTotp(entered); } catch (e) { showToast(e.message || 'Code incorrect'); return; }
    const p = pendingLogin; pendingLogin = null;
    await original.logInAsExistingUser(p.existing, p.name, p.country);
  };

  // ---- Google : lien du compte ou récupération sur un nouvel appareil ----
  window.initGoogleSignIn = function () {
    const btn = document.getElementById('google-signin-button');
    const status = document.getElementById('google-signin-status');
    if (!btn) return;
    btn.innerHTML = '<button type="button" class="btn btn-outline" style="width:260px;" onclick="signInWithGoogleSuktum()">Continuer avec Google</button>';
    if (status) status.textContent = '';
  };
  window.signInWithGoogleSuktum = async function (result) {
    const status = document.getElementById('google-signin-status');
    try {
      const r = result || await A.signInWithGoogle();
      googleSignInEmail = r.email || null;
      if (r.usernames.length > 0) {
        const username = r.usernames[0];
        const area = document.getElementById('google-account-recovery-area');
        const rbtn = document.getElementById('google-recovery-btn');
        rbtn.textContent = 'Continuer en tant que @' + username;
        rbtn.dataset.username = username;
        area.style.display = 'block';
        if (status) status.textContent = '✓ Connecté avec ' + (r.email || 'Google');
        return;
      }
      const candidate = sanitizeUsernameCandidate((r.email || 'suktum').split('@')[0]);
      document.getElementById('onboard-username').value = candidate;
      if (status) status.textContent = '✓ Connecté avec ' + (r.email || 'Google') + ' — choisissez votre pays puis appuyez sur Commencer.';
    } catch (e) {
      if (status) status.textContent = 'Connexion Google indisponible pour l’instant.';
    }
  };

  // ---- Code de sécurité et double authentification (côté compte) : jamais dans user: ----
  window.setSecurityPin = async function () {
    const pin = document.getElementById('new-security-pin').value.trim();
    if (!/^[0-9]{4,6}$/.test(pin)) { showToast('Le code doit contenir 4 à 6 chiffres'); return; }
    try { await A.setPin(pin); } catch (e) { showToast(e.message); return; }
    showToast('Code de sécurité activé ✓'); await renderSecurityPinCard();
  };
  window.removeSecurityPin = async function () {
    try { await A.setPin(null); } catch (e) { showToast(e.message); return; }
    showToast('Code de sécurité retiré'); await renderSecurityPinCard();
  };
  window.renderSecurityPinCard = async function () {
    const el = document.getElementById('security-pin-card'); if (!el) return;
    const me = await safeGet('user:' + currentUser, true);
    if (!(await isHighVisibilityAccount(me))) { el.innerHTML = '<p style="font-size:12px; color:rgba(245,239,227,0.5); margin:0;">Réservé aux comptes à forte visibilité (identité vérifiée, vendeur recommandé, ou formateur vérifié).</p>'; return; }
    const { requiresPin } = await A.myUsernames();
    el.innerHTML = requiresPin
      ? '<p style="font-size:12.5px; color:var(--lagoon); margin:0 0 10px;">✓ Un code de sécurité protège actuellement votre compte à la connexion.</p><button class="btn btn-outline btn-sm" onclick="removeSecurityPin()">Retirer le code de sécurité</button>'
      : '<p style="font-size:12px; color:rgba(245,239,227,0.6); margin:0 0 10px;">Ajoutez un code demandé à chaque connexion sur un nouvel appareil, en plus de votre nom d’utilisateur.</p><input type="password" id="new-security-pin" placeholder="Code à 4-6 chiffres" inputmode="numeric" maxlength="6"><button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="setSecurityPin()">Activer le code de sécurité</button>';
  };
  let pendingTotp = null;
  window.start2FASetup = async function () {
    try { pendingTotp = await A.setupTotp(); } catch (e) { showToast(e.message); return; }
    await render2FACard();
  };
  window.confirm2FASetup = async function () {
    const entered = document.getElementById('totp-confirm-input').value.trim();
    try { await A.confirmTotp(entered); } catch (e) { showToast('Code incorrect — vérifiez votre application d’authentification'); return; }
    pendingTotp = null; showToast('Double authentification activée ✓'); await render2FACard();
  };
  window.disable2FA = async function () {
    if (!confirm('Désactiver la double authentification ? Votre compte sera protégé uniquement par le nom d’utilisateur et le code PIN si vous en avez un.')) return;
    try { await A.disableTotp(); } catch (e) { showToast(e.message); return; }
    showToast('Double authentification désactivée'); await render2FACard();
  };
  window.render2FACard = async function () {
    const el = document.getElementById('two-factor-auth-card'); if (!el) return;
    const { requiresTotp } = await A.myUsernames();
    if (requiresTotp) el.innerHTML = '<p style="margin:0 0 10px; font-size:12.5px; color:var(--lagoon);">✓ Double authentification activée — un code de votre application d’authentification sera demandé à chaque connexion.</p><button class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral);" onclick="disable2FA()">Désactiver</button>';
    else if (pendingTotp) el.innerHTML = '<p style="font-size:11.5px; color:rgba(245,239,227,0.5); margin:0 0 10px;">Entrez cette clé dans une application comme Google Authenticator, puis saisissez le code affiché pour confirmer.</p><div class="card" style="margin-bottom:10px;"><p style="margin:0; font-size:13px; font-family:monospace; word-break:break-all;">' + escapeHtml(pendingTotp.secret) + '</p></div><label style="margin-top:0;">Code à 6 chiffres</label><input type="text" id="totp-confirm-input" placeholder="000000" maxlength="6"><button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="confirm2FASetup()">Confirmer et activer</button>';
    else el.innerHTML = '<p style="font-size:11.5px; color:rgba(245,239,227,0.5); margin:0 0 10px;">Ajoutez un vrai code temporaire à 6 chiffres, généré par une application d’authentification — distinct de votre code PIN.</p><button class="btn btn-primary btn-sm" onclick="start2FASetup()">Activer la double authentification</button>';
  };

  // ---- Back-office : accès par claims, plus aucun secret côté client ----
  async function openAdminIfAllowed() {
    const role = await A.adminRole();
    if (!role) { showToast('Accès réservé à l’équipe Suktum'); return false; }
    adminScope = role.role === 'superadmin' ? 'all' : role.country;
    isModerator = role.role === 'moderator';
    isPayoutSpecialist = role.role === 'payouts';
    isTechTeamMember = role.role === 'techteam';
    currentTechTeamName = isTechTeamMember ? role.name : null;
    document.body.classList.toggle('techteam-mode', isTechTeamMember);
    currentAdminDomain = role.role === 'moderator' ? (role.domain === 'general' ? 'moderation' : role.domain) : role.domain;
    currentAdminName = role.name;
    isGenuineOwnerSession = role.role === 'superadmin';
    currentCustomRoleDomains = null;
    currentAdminPasswordHash = 'claims'; // valeur non secrète : signale « session admin ouverte » aux écrans legacy
    await logAdminLogin(role.role === 'superadmin' ? 'Propriétaire' : role.role + (role.country !== 'all' ? ' — ' + role.country : ''));
    go('admin');
    return true;
  }
  let taps = 0, tapTimer = null;
  window.handleAvatarTap = function () {
    taps++; if (tapTimer) clearTimeout(tapTimer);
    tapTimer = setTimeout(() => { taps = 0; }, 2000);
    if (taps >= 5) { taps = 0; clearTimeout(tapTimer); openAdminIfAllowed(); }
  };
  window.loadAdminLoginScreen = async function () { await openAdminIfAllowed() || go('profile'); };
  window.checkAdminPin = async function () { await openAdminIfAllowed(); };
  window.verifyCurrentAdminSessionStillValid = async function () {
    const role = await A.adminRole();
    if (!role) { showToast('Votre accès a été révoqué'); currentAdminPasswordHash = null; go('profile'); return false; }
    return true;
  };
  window.confirmWithPinReentry = async function () {
    const ok = await A.reauthenticate();
    if (!ok) showToast('Confirmation impossible — reconnectez-vous avec Google');
    return ok;
  };
  // Gestion des mots de passe d'équipe : remplacée par les rôles (setRole) — voir phase 06 pour les écrans.
  for (const fn of ['changeAdminPin', 'generateBackupCodes', 'changeAdminAccountPassword', 'enforceFirstLoginPasswordChange']) {
    window[fn] = async function () { showToast('Les accès de l’équipe sont gérés par les rôles du compte (super-admin)'); };
  }
})();
