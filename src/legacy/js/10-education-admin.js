/* ---------- ADMIN — ESPACE ÉDUCATION ---------- */
async function approveTrainerRequest(id){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function rejectTrainerRequest(id){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function notifyFollowersOfNewCourse(trainerUsername, courseId, courseTitle){
  const trainer = await safeGet('user:' + trainerUsername, true);
  const followers = (trainer && trainer.followers) || [];
  for(const follower of followers){
    await createNotification(follower, 'new_course', trainerUsername, courseId, courseTitle);
  }
}
async function approveCourse(courseId){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function suspendCourse(courseId){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function deleteCourseCompletely(courseId){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function approveEnrollment(enrollmentKey){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function rejectEnrollment(enrollmentKey){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function approveFlaggedLesson(lessonKey){
  const l = await safeGet(lessonKey, true);
  if(!l) return;
  l.aiFlagged = false;
  await saveWithRetry(lessonKey, l, true);
  showToast('Leçon approuvée, visible aux élèves ✓');
  await logAdminAction('Leçon approuvée après signalement IA', l.title);
  await loadEducationAdmin();
}
async function deleteFlaggedLesson(lessonKey, title){
  const ok = confirm('Supprimer définitivement la leçon "' + title + '" ?');
  if(!ok) return;
  await window.storage.delete(lessonKey, true).catch(() => {});
  showToast('Leçon supprimée');
  await logAdminAction('Leçon supprimée après signalement IA', title);
  await loadEducationAdmin();
}
/* ---------- SUIVI D'ACTIVITÉ DES FORMATEURS ---------- */
async function recordTrainerSnapshotsIfNeeded(){
  const todayStr = new Date().toISOString().slice(0,10);
  const lastSnapshotDay = await safeGet('settings:lastTrainerSnapshot', true);
  if(lastSnapshotDay === todayStr) return;
  await saveWithRetry('settings:lastTrainerSnapshot', todayStr, true);
  const allUsers = await fetchUsers();
  const trainers = allUsers.filter(u => u.isTrainer);
  for(const t of trainers){
    const activity = await computeTrainerActivity(t.username);
    await saveWithRetry('trainersnapshot:' + t.username + '__' + todayStr, {
      username: t.username, followers: (t.followers||[]).length, activeStudentCount: activity.activeStudentCount, totalPublications: activity.totalPublications, date: todayStr
    }, true);
  }
}
async function fetchTrainerSnapshots(username){
  const keys = await safeList('trainersnapshot:' + username + '__', true);
  const list = [];
  for(const k of keys){ const s = await safeGet(k, true); if(s) list.push(s); }
  list.sort((a,b) => a.date.localeCompare(b.date));
  return list;
}
async function ensureOwnTrainerSnapshot(username){
  const todayStr = new Date().toISOString().slice(0,10);
  const existing = await safeGet('trainersnapshot:' + username + '__' + todayStr, true);
  if(existing) return;
  const activity = await computeTrainerActivity(username);
  const t = await safeGet('user:' + username, true);
  await saveWithRetry('trainersnapshot:' + username + '__' + todayStr, {
    username, followers: (t && t.followers ? t.followers.length : 0), activeStudentCount: activity.activeStudentCount, totalPublications: activity.totalPublications, date: todayStr
  }, true);
}
function renderGrowthChartSvg(snapshots, key, color, label){
  if(snapshots.length < 2){
    return '<p style="font-size:11.5px; color:rgba(245,239,227,0.4); margin:0;">Historique encore trop court pour un graphique — revenez dans quelques jours.</p>';
  }
  const values = snapshots.map(s => s[key] || 0);
  const maxVal = Math.max(...values, 1);
  const w = 300, h = 90, pad = 6;
  const stepX = (w - pad*2) / (values.length - 1);
  const points = values.map((v, i) => {
    const x = pad + i * stepX;
    const y = h - pad - (v / maxVal) * (h - pad*2);
    return x + ',' + y;
  }).join(' ');
  return '<svg viewBox="0 0 '+w+' '+h+'" style="width:100%; height:90px;">' +
    '<polyline points="'+points+'" fill="none" stroke="'+color+'" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
    '</svg>' +
    '<div style="display:flex; justify-content:space-between; font-size:10.5px; color:rgba(245,239,227,0.4);"><span>'+snapshots[0].date+'</span><span>'+label+' actuel : <strong style="color:'+color+';">'+values[values.length-1]+'</strong></span></div>';
}
async function renderTrainerGrowthChart(){
  const el = document.getElementById('trainer-growth-chart');
  if(!el) return;
  await ensureOwnTrainerSnapshot(currentUser);
  const snapshots = await fetchTrainerSnapshots(currentUser);
  el.innerHTML =
    '<p style="margin:0 0 4px; font-size:11px; color:var(--gold); text-transform:uppercase; letter-spacing:.04em;">📈 Évolution de mes effectifs</p>' +
    renderGrowthChartSvg(snapshots, 'activeStudentCount', 'var(--lagoon)', 'Étudiants') +
    '<p style="margin:10px 0 4px; font-size:11px; color:var(--gold); text-transform:uppercase; letter-spacing:.04em;">📢 Évolution de mon activité</p>' +
    renderGrowthChartSvg(snapshots, 'totalPublications', 'var(--gold)', 'Publications');
}
async function computeTrainerActivity(username){
  const allCourses = await fetchCourses(true);
  const myCourses = allCourses.filter(c => c.trainerUsername === username);
  let lessonCount = 0, videoCount = 0, exerciseCount = 0, quizCount = 0, lastActivity = null;
  for(const c of myCourses){
    const lessons = await fetchLessonsForCourse(c.id);
    lessonCount += lessons.length;
    lessons.forEach(l => { if(!lastActivity || new Date(l.createdAt) > new Date(lastActivity)) lastActivity = l.createdAt; });
    const videos = await fetchCourseVideos(c.id);
    videoCount += videos.length;
    videos.forEach(v => { if(!lastActivity || new Date(v.createdAt) > new Date(lastActivity)) lastActivity = v.createdAt; });
    const exercises = await fetchExercisesForCourse(c.id);
    exerciseCount += exercises.length;
    exercises.forEach(ex => { if(!lastActivity || new Date(ex.createdAt) > new Date(lastActivity)) lastActivity = ex.createdAt; });
    const quizzes = await fetchCourseQuizzes(c.id);
    quizCount += quizzes.length;
    quizzes.forEach(q => { if(!lastActivity || new Date(q.createdAt) > new Date(lastActivity)) lastActivity = q.createdAt; });
    if(!lastActivity || new Date(c.createdAt) > new Date(lastActivity)) lastActivity = c.createdAt;
  }
  const totalPublications = lessonCount + videoCount + exerciseCount + quizCount;
  const enrollmentKeys = await safeList('enrollment:', true);
  const myCourseIds = new Set(myCourses.map(c => c.id));
  const activeStudents = new Set();
  for(const k of enrollmentKeys){
    const e = await safeGet(k, true);
    if(e && e.status === 'approved' && myCourseIds.has(e.courseId)) activeStudents.add(e.studentUsername);
  }
  return { courseCount: myCourses.length, lessonCount, videoCount, exerciseCount, quizCount, totalPublications, activeStudentCount: activeStudents.size, lastActivity };
}
async function renderAdminTrainersList(){
  const el = document.getElementById('admin-trainers-list');
  if(!el) return;
  await recordTrainerSnapshotsIfNeeded();
  const allUsers = await fetchUsers();
  let trainers = allUsers.filter(u => u.isTrainer);
  if(adminScope !== 'all') trainers = trainers.filter(u => u.country === adminScope);
  if(trainers.length === 0){ el.innerHTML = '<div class="empty">Aucun formateur validé pour l’instant.</div>'; return; }
  const pubCounts = {};
  const studentCounts = {};
  for(const t of trainers){
    const activity = await computeTrainerActivity(t.username);
    pubCounts[t.username] = activity.totalPublications;
    studentCounts[t.username] = activity.activeStudentCount;
  }
  el.innerHTML = trainers.map(t =>
    '<div class="card" style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="openTrainerDetail(\''+escapeHtml(t.username)+'\')">' +
    smallAvatarBadge(t.username, 32) +
    '<div style="flex:1;"><strong style="font-size:13px;">@'+escapeHtml(t.username)+'</strong>' +
    '<p style="margin:2px 0 0; font-size:11.5px; color:rgba(245,239,227,0.55);">'+(t.followers||[]).length+' abonné(s) · '+escapeHtml(t.trainerSubject||'')+'</p>' +
    '<p style="margin:2px 0 0; font-size:11.5px; color:var(--lagoon); font-weight:600;">🎓 '+studentCounts[t.username]+' élève(s)/étudiant(s) inscrit(s)</p>' +
    '<p style="margin:2px 0 0; font-size:11.5px; color:var(--gold);">📢 '+pubCounts[t.username]+' publication(s)</p></div>' +
    '</div>'
  ).join('');
  await checkTrainerPaymentReminder();
}
async function checkTrainerPaymentReminder(){
  const banner = document.getElementById('trainer-payment-reminder-banner');
  if(!banner || adminScope !== 'all' || isModerator) { if(banner) banner.style.display = 'none'; return; }
  const currentMonthKey = new Date().toISOString().slice(0,7);
  const lastShownMonth = await safeGet('settings:lastTrainerPaymentReminder', true);
  const allUsers = await fetchUsers();
  const trainerCount = allUsers.filter(u => u.isTrainer).length;
  if(lastShownMonth === currentMonthKey || trainerCount === 0){ banner.style.display = 'none'; return; }
  banner.style.display = 'block';
  banner.innerHTML = '📅 Rappel mensuel : pensez à reverser vos '+trainerCount+' formateur(s) ce mois-ci. ' +
    '<span style="text-decoration:underline; cursor:pointer;" onclick="dismissTrainerPaymentReminder()">Marquer comme vu</span>';
}
async function dismissTrainerPaymentReminder(){
  await saveWithRetry('settings:lastTrainerPaymentReminder', new Date().toISOString().slice(0,7), true);
  document.getElementById('trainer-payment-reminder-banner').style.display = 'none';
}
async function openTrainerDetail(username){
  document.getElementById('trainer-detail-title').textContent = '@' + username;
  go('trainer-detail');
  const el = document.getElementById('trainer-detail-content');
  el.innerHTML = '<p style="font-size:13px; color:rgba(245,239,227,0.5);">Chargement...</p>';
  const t = await safeGet('user:' + username, true);
  if(!t){ el.innerHTML = '<div class="empty">Formateur introuvable.</div>'; return; }
  const activity = await computeTrainerActivity(username);
  const snapshots = await fetchTrainerSnapshots(username);
  const ratingInfo = await computeTrainerRatingAverage(username);
  const allCoursesForTrainer = (await fetchCourses(true)).filter(c => c.trainerUsername === username);
  const studentNames = new Set();
  for(const c of allCoursesForTrainer){
    const keys = await safeList('enrollment:' + c.id + '__', true);
    for(const k of keys){ const e = await safeGet(k, true); if(e && e.status === 'approved') studentNames.add(e.studentUsername); }
  }
  const currentFollowers = (t.followers||[]).length;
  let trendHtml = '';
  if(snapshots.length > 1){
    const oldest = snapshots[0];
    const delta = currentFollowers - oldest.followers;
    const trendColor = delta > 0 ? 'var(--lagoon)' : (delta < 0 ? 'var(--coral)' : 'rgba(245,239,227,0.5)');
    const trendIcon = delta > 0 ? '📈' : (delta < 0 ? '📉' : '➡️');
    trendHtml = '<p style="margin:4px 0 0; font-size:12.5px; color:'+trendColor+';">'+trendIcon+' '+(delta >= 0 ? '+' : '')+delta+' depuis le '+oldest.date+'</p>';
  } else {
    trendHtml = '<p style="margin:4px 0 0; font-size:11.5px; color:rgba(245,239,227,0.4);">Historique encore trop court pour une tendance.</p>';
  }
  el.innerHTML =
    '<div style="display:flex; align-items:center; gap:12px; margin-bottom:14px;">' +
    (t.photo ? '<img src="'+t.photo+'" style="width:60px; height:60px; border-radius:50%; object-fit:cover;">' : smallAvatarBadge(username, 60)) +
    '<strong style="font-size:15px; font-family:\'Baloo 2\';">@'+escapeHtml(username)+'</strong>' +
    '</div>' +
    '<div class="card" style="margin-bottom:14px;">' +
    '<p style="margin:0 0 4px; font-size:13px;">💳 Numéro de reversement : <strong>'+(t.trainerPaymentNumber ? escapeHtml(t.trainerPaymentNumber) : 'non renseigné')+'</strong></p>' +
    '<p style="margin:0; font-size:13px;">📚 Matière : '+escapeHtml(t.trainerSubject||'—')+'</p>' +
    '</div>' +
    '<div class="card" style="margin-bottom:14px;">' +
    '<p style="margin:0 0 4px; font-size:13px;">👥 <strong>'+currentFollowers+'</strong> abonné(s)</p>' +
    (ratingInfo ? '<p style="margin:0 0 4px; font-size:13px;">⭐ <strong>'+ratingInfo.average.toFixed(1)+'</strong>/5 ('+ratingInfo.count+' avis)</p>' : '') +
    trendHtml +
    '<p style="margin:10px 0 4px; font-size:13px;">📚 <strong>'+activity.courseCount+'</strong> cours</p>' +
    '<p style="margin:0 0 4px; font-size:14px; color:var(--gold); font-weight:700;">📢 <strong>'+activity.totalPublications+'</strong> publication(s) au total</p>' +
    '<p style="margin:0 0 4px; font-size:11.5px; color:rgba(245,239,227,0.55);">'+activity.lessonCount+' leçon(s) · '+activity.videoCount+' vidéo(s) · '+activity.exerciseCount+' exercice(s) · '+activity.quizCount+' QCM</p>' +
    '<p style="margin:0; font-size:13px;">🎓 <strong>'+activity.activeStudentCount+'</strong> étudiant(s) actif(s)</p>' +
    '<p style="margin:10px 0 0; font-size:12px; color:rgba(245,239,227,0.55);">Dernière activité : '+(activity.lastActivity ? new Date(activity.lastActivity).toLocaleDateString('fr-FR') : 'aucune')+'</p>' +
    ((t.trainerMissedConferenceCount || 0) > 0 ? '<p style="margin:10px 0 0; font-size:12.5px; color:'+((t.trainerMissedConferenceCount||0) >= 3 ? 'var(--coral)' : 'rgba(245,239,227,0.6)')+';">📡 '+t.trainerMissedConferenceCount+' conférence(s) programmée(s) mais jamais tenue(s)'+((t.trainerMissedConferenceCount||0) >= 3 ? ' — à surveiller' : '')+'</p>' : '') +
    '</div>' +
    '<div class="eyebrow">👥 Ses étudiants ('+studentNames.size+')</div>' +
    (studentNames.size === 0 ? '<div class="empty">Aucun étudiant pour l’instant.</div>' : [...studentNames].sort().map(s =>
      '<div class="card" style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="openUserProfile(\''+escapeHtml(s)+'\')">' + smallAvatarBadge(s, 26) + '<span style="font-size:12.5px;">@'+escapeHtml(s)+'</span></div>'
    ).join('')) +
    '<button class="btn btn-outline" style="width:100%; margin:16px 0 10px; '+(t.verified?'border-color:var(--lagoon); color:var(--lagoon);':'')+'" onclick="toggleTrainerVerified(\''+escapeHtml(username)+'\')">'+(t.verified ? '✓ Formateur vérifié — retirer' : '✓ Accorder le badge Vérifié')+'</button>' +
    '<button class="btn btn-outline" style="width:100%; margin-bottom:10px;" onclick="openThread(\''+escapeHtml(username)+'\')">💬 Envoyer un message</button>' +
    '<button class="btn btn-outline" style="width:100%; margin-bottom:10px;" onclick="openUserDetail(\''+escapeHtml(username)+'\')">⚠️ Gérer le compte (avertir / suspendre / bannir)</button>' +
    '<button class="btn btn-outline" style="width:100%; margin-bottom:10px;" onclick="generateTrainerAISummary(\''+escapeHtml(username)+'\')">🧠 Résumé IA — continuer à le payer ?</button>' +
    '<p id="trainer-ai-summary-result" style="font-size:12.5px; color:var(--cream); margin:0 0 16px; line-height:1.6; white-space:pre-line;"></p>' +
    '<button class="btn btn-outline" style="width:100%; border-color:var(--coral); color:var(--coral);" onclick="excludeTrainer(\''+escapeHtml(username)+'\')">🚫 Exclure ce formateur</button>';
}
async function toggleTrainerVerified(username){
  const t = await safeGet('user:' + username, true);
  if(!t) return;
  t.verified = !t.verified;
  await saveWithRetry('user:' + username, t, true);
  showToast(t.verified ? 'Badge Vérifié accordé ✓' : 'Badge Vérifié retiré');
  await logAdminAction(t.verified ? 'Badge Vérifié accordé' : 'Badge Vérifié retiré', '@' + username);
  await openTrainerDetail(username);
}
async function generateTrainerAISummary(username){
  const resultEl = document.getElementById('trainer-ai-summary-result');
  resultEl.textContent = '…';
  try{
    const t = await safeGet('user:' + username, true);
    const activity = await computeTrainerActivity(username);
    const snapshots = await fetchTrainerSnapshots(username);
    const followerTrend = snapshots.length > 1 ? ((t.followers||[]).length - snapshots[0].followers) : 'inconnue (historique trop court)';
    const prompt = "Tu aides le propriétaire de Suktum à décider s'il doit continuer à payer un formateur de son Espace Éducation. Voici les données réelles de ce formateur :\n\n" +
      "Abonnés actuels : " + (t.followers||[]).length + "\nÉvolution des abonnés : " + followerTrend + "\nCours créés : " + activity.courseCount + "\nLeçons publiées : " + activity.lessonCount + "\nÉtudiants actifs : " + activity.activeStudentCount + "\nDernière activité : " + (activity.lastActivity || 'aucune') +
      "\n\nEn 3-4 phrases courtes et directes, donne une évaluation honnête : ce formateur est-il actif ou semble-t-il à l'abandon ? Recommande de continuer à le payer, de le surveiller, ou d'envisager de l'exclure. Ne donne aucun chiffre que tu n'as pas reçu ci-dessus.";
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 300, messages: [{ role: "user", content: prompt }] })
    });
    const data = await response.json();
    const summary = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    resultEl.textContent = summary ? '🧠 ' + summary : 'Résumé indisponible pour le moment.';
  } catch(e){
    resultEl.textContent = 'Résumé indisponible (connexion).';
  }
}
async function excludeTrainer(username){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function loadEducationAdmin(){
  const reqEl = document.getElementById('admin-trainer-requests');
  if(!reqEl) return;
  await renderAdminTrainersList();
  await renderActivationCodeBatches();
  await populateCsvImportCourseSelect();

  const badgesEl = document.getElementById('admin-all-badges-list');
  if(badgesEl){
    const keys = await safeList('badge:', true);
    const badges = [];
    for(const k of keys){
      const b = await safeGet(k, true);
      if(!b) continue;
      if(adminScope !== 'all'){
        const trainerRecord = await safeGet('user:' + b.trainerUsername, true);
        if(!trainerRecord || trainerRecord.country !== adminScope) continue;
      }
      badges.push(b);
    }
    badges.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    badgesEl.innerHTML = badges.length === 0 ? '<div class="empty">Aucun badge décerné pour l’instant.</div>' : badges.slice(0, 30).map(b =>
      '<div class="card"><p style="margin:0 0 4px; font-size:13px;">'+escapeHtml(b.badgeName)+'</p>' +
      '<p style="margin:0 0 4px; font-size:12px; color:rgba(245,239,227,0.6);">@'+escapeHtml(b.trainerUsername)+' → @'+escapeHtml(b.studentUsername)+'</p>' +
      (b.message ? '<p style="margin:0 0 4px; font-size:11.5px; color:rgba(245,239,227,0.5); font-style:italic;">'+escapeHtml(b.message)+'</p>' : '') +
      '<p style="margin:0; font-size:10.5px; color:rgba(245,239,227,0.4);">'+new Date(b.createdAt).toLocaleDateString('fr-FR')+'</p></div>'
    ).join('');
  }

  const flaggedEl = document.getElementById('admin-flagged-lessons');
  if(flaggedEl){
    const lessonKeys = await safeList('lesson:', true);
    const flaggedWithKeys = [];
    for(const k of lessonKeys){ const l = await safeGet(k, true); if(l && l.aiFlagged) flaggedWithKeys.push({ storageKey: k, ...l }); }
    flaggedEl.innerHTML = flaggedWithKeys.length === 0 ? '<div class="empty">Aucune leçon signalée par l’IA pour l’instant.</div>' : flaggedWithKeys.map(l =>
      '<div class="card" style="border-color:var(--coral);"><p style="margin:0 0 4px; font-size:13px; font-weight:600;">'+escapeHtml(l.title)+'</p>' +
      '<p style="margin:0 0 6px; font-size:12px; color:rgba(245,239,227,0.6); white-space:pre-line;">'+escapeHtml((l.content||'').slice(0,150))+'</p>' +
      '<p style="margin:0 0 10px; font-size:11.5px; color:var(--coral); font-style:italic;">Raison IA : '+escapeHtml(l.aiFlagReason||'non précisée')+'</p>' +
      '<div style="display:flex; gap:8px; flex-wrap:wrap;"><button class="btn btn-outline btn-sm" onclick="approveFlaggedLesson(\''+l.storageKey+'\')">✓ Approuver quand même</button>' +
      '<button class="btn btn-outline btn-sm" onclick="deleteFlaggedLesson(\''+l.storageKey+'\', \''+escapeHtml(l.title).replace(/'/g,"\\'")+'\')">🗑️ Supprimer</button></div></div>'
    ).join('');
  }

  const confEl = document.getElementById('admin-conferences-pending');
  if(confEl){
    let pendingConfs = (await fetchLives()).filter(l => l.isEducational && l.status === 'pending');
    if(adminScope !== 'all') pendingConfs = pendingConfs.filter(l => l.country === adminScope);
    confEl.innerHTML = pendingConfs.length === 0 ? '<div class="empty">Aucune conférence en attente.</div>' : pendingConfs.map(l =>
      '<div class="card"><p style="margin:0 0 10px; font-size:13px; display:flex; align-items:center; gap:8px;">' + smallAvatarBadge(l.username, 24) + '<strong>@'+escapeHtml(l.username)+'</strong> demande à organiser une conférence'+(l.country ? ' — '+escapeHtml(l.country) : '')+'</p>' +
      '<div style="display:flex; gap:8px; flex-wrap:wrap;"><button class="btn btn-outline btn-sm" onclick="approveLive(\''+l.id+'\')">✓ Valider</button>' +
      '<button class="btn btn-outline btn-sm" onclick="rejectLive(\''+l.id+'\')">✕ Refuser</button></div></div>'
    ).join('');
  }

  let requests = (await fetchTrainerRequests()).filter(r => r.status === 'pending');
  if(adminScope !== 'all') requests = requests.filter(r => r.country === adminScope);
  reqEl.innerHTML = requests.length === 0 ? '<div class="empty">Aucune candidature en attente.</div>' : requests.map(r =>
    '<div class="card"><p style="margin:0 0 4px; font-size:13px;">@'+escapeHtml(r.username)+' — '+escapeHtml(r.subject)+(r.country ? ' · '+escapeHtml(r.country) : '')+'</p>' +
    '<p style="margin:0 0 10px; font-size:12px; color:rgba(245,239,227,0.55); font-style:italic;">« '+escapeHtml(r.bio)+' »</p>' +
    (r.diplomaData ? '<a href="'+r.diplomaData+'" target="_blank" style="display:inline-block; margin-bottom:10px; font-size:12px; color:var(--gold); text-decoration:underline;">🎓 Voir le diplôme joint ('+escapeHtml(r.diplomaName||'fichier')+')</a><br>' : '<p style="margin:0 0 10px; font-size:11.5px; color:rgba(245,239,227,0.4);">Aucun diplôme joint.</p>') +
    '<div style="display:flex; gap:8px; flex-wrap:wrap;"><button class="btn btn-outline btn-sm" onclick="approveTrainerRequest(\''+r.id+'\')">✓ Valider</button>' +
    '<button class="btn btn-outline btn-sm" onclick="rejectTrainerRequest(\''+r.id+'\')">✕ Refuser</button></div></div>'
  ).join('');

  let allCourses = await fetchCourses(true);
  if(adminScope !== 'all') allCourses = allCourses.filter(c => c.country === adminScope);
  const pendingCourses = allCourses.filter(c => c.status === 'pending_review');
  const pendingEl = document.getElementById('admin-courses-pending');
  pendingEl.innerHTML = pendingCourses.length === 0 ? '<div class="empty">Aucun cours en attente.</div>' : pendingCourses.map(c =>
    '<div class="card"><p style="margin:0 0 4px; font-size:13px;">'+escapeHtml(c.title)+' — @'+escapeHtml(c.trainerUsername)+'</p>' +
    '<p style="margin:0 0 10px; font-size:12px; color:rgba(245,239,227,0.55);">'+escapeHtml(c.description||'')+' — '+c.price.toLocaleString('fr-FR')+' FCFA</p>' +
    '<button class="btn btn-outline btn-sm" onclick="approveCourse(\''+c.id+'\')">✓ Valider et publier</button></div>'
  ).join('');

  const publishedCourses = allCourses.filter(c => c.status === 'active' || c.status === 'suspended');
  const pubEl = document.getElementById('admin-courses-published');
  pubEl.innerHTML = publishedCourses.length === 0 ? '<div class="empty">Aucun cours publié.</div>' : publishedCourses.map(c =>
    '<div class="card">' +
    '<p style="margin:0 0 8px; font-size:12.5px;">'+escapeHtml(c.title)+' — @'+escapeHtml(c.trainerUsername)+' · '+(c.status==='suspended'?'⏸ Suspendu':'🟢 Actif')+'</p>' +
    '<div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:6px;">' +
    '<button class="btn btn-outline btn-sm" onclick="suspendCourse(\''+c.id+'\')">'+(c.status==='suspended'?'Réactiver':'Suspendre')+'</button>' +
    '<button class="btn btn-outline btn-sm" onclick="deleteCourseCompletely(\''+c.id+'\')">🗑️ Supprimer définitivement</button>' +
    '</div>' +
    aiProviderChoiceHtml('adminsummary-'+c.id) +
    '<button class="btn btn-outline btn-sm" style="width:100%; margin-bottom:6px;" onclick="generateCourseAISummary(\''+c.id+'\', \'admin-course-summary-'+c.id+'\', \'adminsummary-'+c.id+'\')">🧠 Résumé IA</button>' +
    '<p id="admin-course-summary-'+c.id+'" style="font-size:11.5px; color:var(--cream); margin:0; line-height:1.5; white-space:pre-line;"></p>' +
    '</div>'
  ).join('');

  const removalEl = document.getElementById('admin-student-removals');
  if(removalEl){
    let removals = (await fetchStudentRemovalRequests()).filter(r => r.status === 'pending');
    removalEl.innerHTML = removals.length === 0 ? '<div class="empty">Aucune demande de retrait en attente.</div>' : removals.map(r =>
      '<div class="card"><p style="margin:0 0 4px; font-size:13px;">@'+escapeHtml(r.studentUsername)+' — demandé par @'+escapeHtml(r.requestedBy)+'</p>' +
      '<p style="margin:0 0 10px; font-size:12px; color:rgba(245,239,227,0.6); font-style:italic;">« '+escapeHtml(r.reason)+' »</p>' +
      '<div style="display:flex; gap:8px; flex-wrap:wrap;"><button class="btn btn-outline btn-sm" onclick="approveStudentRemoval(\''+r.storageKey+'\')">✓ Approuver le retrait</button>' +
      '<button class="btn btn-outline btn-sm" onclick="rejectStudentRemoval(\''+r.storageKey+'\')">✕ Refuser</button></div></div>'
    ).join('');
  }

  const stateReqEl = document.getElementById('admin-state-funded-requests');
  if(stateReqEl){
    let stateRequests = (await fetchStateFundedRequests()).filter(r => r.status === 'pending');
    stateReqEl.innerHTML = stateRequests.length === 0 ? '<div class="empty">Aucune demande en attente.</div>' : stateRequests.map(r =>
      '<div class="card"><p style="margin:0 0 4px; font-size:13px;">@'+escapeHtml(r.username)+(r.country ? ' · '+escapeHtml(r.country) : '')+'</p>' +
      '<p style="margin:0 0 10px; font-size:12px; color:rgba(245,239,227,0.55); font-style:italic;">« '+escapeHtml(r.reason)+' »</p>' +
      '<div style="display:flex; gap:8px; flex-wrap:wrap;"><button class="btn btn-outline btn-sm" onclick="approveStateFundedRequest(\''+r.id+'\')">✓ Approuver</button>' +
      '<button class="btn btn-outline btn-sm" onclick="rejectStateFundedRequest(\''+r.id+'\')">✕ Refuser</button></div></div>'
    ).join('');
  }
  const stateListEl = document.getElementById('admin-state-funded-list');
  if(stateListEl){
    const allUsersForState = await fetchUsers();
    const funded = allUsersForState.filter(u => u.stateFunded);
    stateListEl.innerHTML = funded.length === 0 ? '<div class="empty">Aucun compte financé pour l’instant.</div>' : funded.map(u =>
      '<div class="card" style="display:flex; justify-content:space-between; align-items:center;"><span style="font-size:13px;">@'+escapeHtml(u.username)+'</span>' +
      '<button class="btn btn-outline btn-sm" onclick="revokeStateFundedAccess(\''+escapeHtml(u.username)+'\')">Retirer</button></div>'
    ).join('');
  }

  const subPriceInput = document.getElementById('edu-sub-price-input');
  if(subPriceInput) subPriceInput.value = await getEducationSubPrice();

  const subReqEl = document.getElementById('admin-edusub-requests');
  if(subReqEl){
    let subRequests = (await fetchEduSubRequests()).filter(r => r.status === 'pending');
    if(adminScope !== 'all') subRequests = subRequests.filter(r => r.country === adminScope);
    subReqEl.innerHTML = subRequests.length === 0 ? '<div class="empty">Aucune demande en attente.</div>' : subRequests.map(r =>
      '<div class="card"><p style="margin:0 0 10px; font-size:13px;">@'+escapeHtml(r.username)+' — '+r.price.toLocaleString('fr-FR')+' FCFA'+(r.country ? ' · '+escapeHtml(r.country) : '')+'</p>' +
      '<div style="display:flex; gap:8px; flex-wrap:wrap;"><button class="btn btn-outline btn-sm" onclick="approveEduSubRequest(\''+r.id+'\')">✓ Paiement reçu, activer</button>' +
      '<button class="btn btn-outline btn-sm" onclick="rejectEduSubRequest(\''+r.id+'\')">✕ Rejeter</button></div></div>'
    ).join('');
  }

  const enrollEl = document.getElementById('admin-enrollments-pending');
  if(enrollEl){
    const keys = await safeList('enrollment:', true);
    const pendingEnrollments = [];
    for(const k of keys){ const e = await safeGet(k, true); if(e && e.status === 'pending' && (adminScope === 'all' || e.country === adminScope)) pendingEnrollments.push({key: k, ...e}); }
    enrollEl.innerHTML = pendingEnrollments.length === 0 ? '<div class="empty">Aucune inscription en attente.</div>' : pendingEnrollments.map(e =>
      '<div class="card"><p style="margin:0 0 10px; font-size:13px;">@'+escapeHtml(e.studentUsername)+' → cours de @'+escapeHtml(e.trainerUsername)+' — '+e.price.toLocaleString('fr-FR')+' FCFA</p>' +
      '<div style="display:flex; gap:8px; flex-wrap:wrap;"><button class="btn btn-outline btn-sm" onclick="approveEnrollment(\''+e.key+'\')">✓ Paiement reçu, valider</button>' +
      '<button class="btn btn-outline btn-sm" onclick="rejectEnrollment(\''+e.key+'\')">✕ Rejeter</button></div></div>'
    ).join('');
  }
}
async function loadSearchRecommendationAdmin(){
  const el = document.getElementById('search-reco-keywords');
  if(!el) return;
  const reco = await safeGet('settings:search_recommendation', true);
  if(reco){
    document.getElementById('search-reco-keywords').value = (reco.keywords || []).join(', ');
    document.getElementById('search-reco-username').value = reco.username || '';
    document.getElementById('search-reco-text').value = reco.text || '';
  }
}
