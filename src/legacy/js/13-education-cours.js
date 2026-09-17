/* ---------- SUGGESTIONS DE COURS PERSONNALISÉES ---------- */
async function renderCourseSuggestions(){
  const el = document.getElementById('course-suggestions-list');
  const labelEl = document.getElementById('course-suggestions-label');
  if(!el || !labelEl) return;
  const enrollmentKeys = await safeList('enrollment:', true);
  const myCourseIds = new Set();
  const myLevels = new Set();
  const myClasses = new Set();
  for(const k of enrollmentKeys){
    const e = await safeGet(k, true);
    if(e && e.studentUsername === currentUser && e.status === 'approved') myCourseIds.add(e.courseId);
  }
  const allCourses = (await fetchCourses()).filter(c => c.status === 'active');
  for(const c of allCourses){
    if(myCourseIds.has(c.id)){
      if(c.schoolLevel) myLevels.add(c.schoolLevel);
      if(c.schoolClass) myClasses.add(c.schoolClass);
    }
  }
  if(myLevels.size === 0){ labelEl.style.display = 'none'; el.innerHTML = ''; return; }
  const suggestions = allCourses
    .filter(c => !myCourseIds.has(c.id) && c.schoolLevel && myLevels.has(c.schoolLevel))
    .sort((a, b) => {
      const aClassMatch = a.schoolClass && myClasses.has(a.schoolClass) ? 1 : 0;
      const bClassMatch = b.schoolClass && myClasses.has(b.schoolClass) ? 1 : 0;
      return bClassMatch - aClassMatch;
    })
    .slice(0, 5);
  if(suggestions.length === 0){ labelEl.style.display = 'none'; el.innerHTML = ''; return; }
  labelEl.style.display = 'block';
  el.innerHTML = suggestions.map(c =>
    '<div class="card" style="cursor:pointer;" onclick="openCourseDetail(\''+c.id+'\')">' +
    '<p style="margin:0 0 4px; font-size:13px; font-weight:600;">'+escapeHtml(c.title)+'</p>' +
    '<p style="margin:0; font-size:11.5px; color:rgba(245,239,227,0.5);">'+escapeHtml(c.schoolLevel)+(c.schoolClass ? ' — '+escapeHtml(c.schoolClass) : '')+' · @'+escapeHtml(c.trainerUsername)+'</p>' +
    '</div>'
  ).join('');
}
async function renderMyLearning(){
  const el = document.getElementById('my-learning-list');
  if(!el) return;
  const me = await safeGet('user:' + currentUser, true);
  const hiddenIds = new Set((me && me.hiddenCourseIds) || []);
  const enrollmentKeys = await safeList('enrollment:', true);
  const myCourses = [];
  for(const k of enrollmentKeys){
    const enr = await safeGet(k, true).catch(() => null);
    if(!enr || enr.username !== currentUser || enr.status !== 'approved') continue;
    if(hiddenIds.has(enr.courseId)) continue;
    const course = await safeGet('course:' + enr.courseId, true).catch(() => null);
    if(course) myCourses.push({ course, enr });
  }
  if(myCourses.length === 0){ el.innerHTML = '<div class="empty">Aucun cours suivi pour l’instant.</div>'; return; }
  el.innerHTML = myCourses.map(({course, enr}) =>
    '<div class="card" style="position:relative; padding-right:40px; margin-bottom:10px; cursor:pointer;" onclick="openCourseDetail(\''+course.id+'\')">' +
    '<span onclick="event.stopPropagation(); openMyLearningKebabMenu(\''+course.id+'\')" style="position:absolute; top:8px; right:8px; font-size:18px; cursor:pointer; padding:6px; line-height:1;">⋮</span>' +
    '<p style="margin:0 0 4px; font-size:13.5px; font-weight:600;">'+escapeHtml(course.title)+'</p>' +
    '<p style="margin:0 0 6px; font-size:12px; color:rgba(245,239,227,0.6);">Par @'+escapeHtml(course.trainerUsername)+'</p>' +
    (enr.markedCompleted ? '<p style="margin:0; font-size:12px; color:var(--lagoon);">✓ Marqué comme terminé par vous</p>' : '') +
    '</div>'
  ).join('');
}
async function openMyLearningKebabMenu(courseId){
  const enr = await safeGet('enrollment:' + courseId + '__' + currentUser, true);
  if(!enr) return;
  const items = [];
  items.push({ icon: '🎓', label: 'Télécharger le certificat', action: 'closeGenericKebabMenu(); openCourseCertificate(\''+courseId+'\')' });
  const certCode = await safeGet('certcodelookup:' + courseId + '__' + currentUser, true).catch(() => null);
  if(certCode){
    items.push({ icon: '🔍', label: 'Vérifier l’authenticité', action: 'closeGenericKebabMenu(); shareCertificateVerificationCode(\''+courseId+'\')' });
  }
  items.push(enr.markedCompleted
    ? { icon: '↩️', label: 'Marquer comme en cours', action: 'closeGenericKebabMenu(); setCourseCompletedStatus(\''+courseId+'\', false)' }
    : { icon: '✓', label: 'Marquer comme terminé', action: 'closeGenericKebabMenu(); setCourseCompletedStatus(\''+courseId+'\', true)' });
  items.push({ icon: '📤', label: 'Partager ma progression', action: 'closeGenericKebabMenu(); shareEducationProgress(\''+courseId+'\')' });
  items.push({ icon: '🗑️', label: 'Retirer de la liste', action: 'closeGenericKebabMenu(); hideCourseFromMyLearning(\''+courseId+'\')' });
  openGenericKebabMenu(items);
}
async function shareCertificateVerificationCode(courseId){
  const code = await safeGet('certcodelookup:' + courseId + '__' + currentUser, true).catch(() => null);
  const course = await safeGet('course:' + courseId, true);
  if(!code || !course) return;
  const text = 'Suktum — Vérification de certificat\n\nCode : ' + code + '\nCours : ' + course.title + '\n\nPour vérifier l’authenticité, entrez ce code dans l’outil de vérification Suktum.';
  if(navigator.share){ await navigator.share({ title: 'Suktum', text }); return; }
  if(navigator.clipboard){ await navigator.clipboard.writeText(text); showToast('Code copié ✓'); return; }
  showToast('Partage indisponible sur cet appareil');
}
async function setCourseCompletedStatus(courseId, completed){
  const enr = await safeGet('enrollment:' + courseId + '__' + currentUser, true);
  if(!enr) return;
  enr.markedCompleted = completed;
  await saveWithRetry('enrollment:' + courseId + '__' + currentUser, enr, true);
  showToast(completed ? 'Cours marqué comme terminé ✓' : 'Cours remis en cours');
  await renderMyLearning();
}
async function shareEducationProgress(courseId){
  const course = await safeGet('course:' + courseId, true);
  const enr = await safeGet('enrollment:' + courseId + '__' + currentUser, true);
  if(!course || !enr) return;
  const text = (enr.markedCompleted ? '✓ J’ai terminé le cours « ' : '📚 Je suis le cours « ') + course.title + ' » avec @' + course.trainerUsername + ' sur Suktum !';
  if(navigator.share){ await navigator.share({ title: 'Suktum', text }); return; }
  if(navigator.clipboard){ await navigator.clipboard.writeText(text); showToast('Texte copié ✓'); return; }
  showToast('Partage indisponible sur cet appareil');
}
async function hideCourseFromMyLearning(courseId){
  const me = await safeGet('user:' + currentUser, true);
  const hiddenIds = new Set((me && me.hiddenCourseIds) || []);
  hiddenIds.add(courseId);
  me.hiddenCourseIds = Array.from(hiddenIds);
  await saveWithRetry('user:' + currentUser, me, true);
  showToast('Retiré de votre liste — votre inscription et votre progression restent intactes');
  await renderMyLearning();
}
async function renderEducationHub(){
  await ensureTrialStarted(currentUser);
  const gateEl = document.getElementById('edu-subscription-gate');
  const unlockedEl = document.getElementById('edu-hub-unlocked-content');
  const active = await isEducationSubActive(currentUser);
  if(!active){
    const price = await getEducationSubPrice();
    const req = (await fetchEduSubRequests()).find(r => r.username === currentUser && r.status === 'pending');
    const stateReq = (await fetchStateFundedRequests()).find(r => r.username === currentUser && r.status === 'pending');
    gateEl.style.display = 'block';
    unlockedEl.style.display = 'none';
    gateEl.innerHTML = '<div class="card" style="border-color:var(--gold); text-align:center; padding:24px 18px;">' +
      '<div style="font-size:36px; margin-bottom:10px;">🔒</div>' +
      '<p style="margin:0 0 10px; font-size:14px;">L’accès à l’Espace Éducation nécessite un abonnement mensuel.</p>' +
      '<p style="margin:0 0 16px; font-size:18px; color:var(--gold); font-family:\'Baloo 2\'; font-weight:700;">'+(await formatPriceIndicative(price))+' / mois</p>' +
      (req ? '<p style="margin:0 0 14px; font-size:12.5px; color:var(--gold);">⏳ Votre paiement est en attente de validation.</p>'
           : '<button class="btn btn-primary" style="width:100%; margin-bottom:14px;" onclick="subscribeToEducationSpace()">S’abonner maintenant</button>') +
      '<div style="border-top:1px solid var(--line); padding-top:14px;">' +
      (stateReq ? '<p style="margin:0; font-size:12px; color:var(--gold);">⏳ Demande de prise en charge par l’État en attente.</p>'
                : '<p style="margin:0 0 8px; font-size:11.5px; color:rgba(245,239,227,0.5);">Pris en charge par un programme officiel ?</p><button class="btn btn-outline btn-sm" style="width:100%;" onclick="requestStateFundedAccess()">🏛️ Demander un accès financé par l’État</button>') +
      '<div style="margin-top:12px;"><p style="margin:0 0 8px; font-size:11.5px; color:rgba(245,239,227,0.5);">Vous avez un code d’activation ?</p>' +
      '<div style="display:flex; gap:8px;"><input type="text" id="activation-code-input" placeholder="Ex : SUKTUM-AB12CD" style="margin:0; flex:1;"><button class="btn btn-outline btn-sm" onclick="redeemActivationCode()">Activer</button></div></div>' +
      '</div></div>';
    return;
  }
  gateEl.style.display = 'none';
  unlockedEl.style.display = 'block';
  await renderTrialBanner();
  await renderEduSubscriptionStatusCard();
  await renderStudentStatusCard();
  await renderCourseSuggestions();
  const confEl = document.getElementById('education-conferences-list');
  if(confEl){
    const approvedConfs = (await fetchLives()).filter(l => l.isEducational && l.status === 'approved');
    confEl.innerHTML = approvedConfs.length === 0 ? '<div class="empty">Aucune conférence en direct pour l’instant.</div>' : approvedConfs.map(l =>
      '<div class="card" style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="openLiveView(\''+l.id+'\')">' + smallAvatarBadge(l.username, 30) +
      '<div style="flex:1;"><span style="font-size:13px;">🔴 Conférence de @'+escapeHtml(l.username)+'</span>' +
      (l.scheduledTime ? '<p style="margin:2px 0 0; font-size:11px; color:var(--gold);">⏰ '+new Date(l.scheduledTime).toLocaleString('fr-FR', {dateStyle:'short', timeStyle:'short'})+'</p>' : '') +
      '</div></div>'
    ).join('');
    await checkConferenceReminders();
    await checkScheduledCourseReminders();
    await checkSubscriptionRenewalReminder();
    await checkTrialExpiryReminder();
    await checkLateExerciseReminders();
    await updateEducationStreak();
    await renderEducationStreakBadge();
  }
  const el = document.getElementById('education-trainer-status-card');
  const me = await safeGet('user:' + currentUser, true);
  if(me && me.isTrainer){
    el.innerHTML = '<p style="margin:0 0 10px; font-size:13px; color:var(--lagoon);">✓ Vous êtes formateur validé.</p>' +
      '<button class="btn btn-primary" style="width:100%;" onclick="go(\'trainer-dashboard\')">🎓 Mon espace formateur</button>';
    return;
  }
  const requests = await fetchTrainerRequests();
  const pending = requests.find(r => r.username === currentUser && r.status === 'pending');
  if(pending){
    el.innerHTML = '<p style="margin:0; font-size:13px; color:var(--gold);">⏳ Candidature formateur en attente de validation.</p>';
    return;
  }
  el.innerHTML = '<p style="margin:0 0 10px; font-size:12.5px; color:rgba(245,239,227,0.6);">Vous êtes formateur, professeur, ou souhaitez enseigner ?</p>' +
    '<button class="btn btn-outline" style="width:100%;" onclick="go(\'become-trainer\')">Devenir formateur</button>';
}
async function checkConferenceReminders(){
  const now = new Date();
  const conferences = (await fetchLives()).filter(l => l.isEducational && l.status === 'approved' && l.scheduledTime && !l.reminderSent);
  for(const conf of conferences){
    const scheduled = new Date(conf.scheduledTime);
    const minutesUntil = (scheduled - now) / 60000;
    if(minutesUntil <= 15 && minutesUntil > -30){
      const allCourses = (await fetchCourses(true)).filter(c => c.trainerUsername === conf.username);
      const courseIds = new Set(allCourses.map(c => c.id));
      const enrollmentKeys = await safeList('enrollment:', true);
      const students = new Set();
      for(const k of enrollmentKeys){
        const e = await safeGet(k, true);
        if(e && e.status === 'approved' && courseIds.has(e.courseId)) students.add(e.studentUsername);
      }
      for(const student of students){
        await createNotification(student, 'conference_reminder', conf.username, conf.id);
      }
      conf.reminderSent = true;
      await saveWithRetry('live:' + conf.id, conf, true);
    }
  }
}
async function notifyStudentsTrainerIsLive(trainerUsername, liveId){
  const allCourses = await fetchCourses(true);
  const trainerCourseIds = new Set(allCourses.filter(c => c.trainerUsername === trainerUsername).map(c => c.id));
  const enrollmentKeys = await safeList('enrollment:', true);
  const students = new Set();
  for(const k of enrollmentKeys){
    const e = await safeGet(k, true);
    if(e && e.status === 'approved' && trainerCourseIds.has(e.courseId)) students.add(e.studentUsername);
  }
  for(const student of students){
    await createNotification(student, 'trainer_live', trainerUsername, liveId);
  }
}
async function fetchCourses(includeAll){
  const keys = await safeList('course:', true);
  const list = [];
  for(const k of keys){ const c = await safeGet(k, true); if(c && (includeAll || c.status === 'active')) list.push(c); }
  return list;
}
function setEducationLevelFilter(level){
  selectedEducationLevelFilter = (selectedEducationLevelFilter === level) ? '' : level;
  renderEducationCourses();
}
let selectedEducationLevelFilter = '';
async function renderEducationCourses(){
  if(!(await requireEducationSubscription())) return;
  const el = document.getElementById('education-courses-list');
  const query = (document.getElementById('education-courses-search').value || '').trim().toLowerCase();
  let courses = await fetchCourses(false);
  const trainerSubjects = {};
  const trainerPhotos = {};
  const trainerRatings = {};
  const trainerVerified = {};
  for(const c of courses){
    if(!(c.trainerUsername in trainerSubjects)){
      const t = await safeGet('user:' + c.trainerUsername, true);
      trainerSubjects[c.trainerUsername] = (t && t.trainerSubject) || '';
      trainerPhotos[c.trainerUsername] = (t && t.photo) || null;
      trainerRatings[c.trainerUsername] = await computeTrainerRatingAverage(c.trainerUsername);
      trainerVerified[c.trainerUsername] = !!(t && t.verified);
    }
  }
  const filtersEl = document.getElementById('education-level-filters');
  if(filtersEl){
    const levels = ['Primaire', 'Collège', 'Lycée', 'Supérieur'];
    filtersEl.innerHTML = levels.map(lvl =>
      '<button onclick="setEducationLevelFilter(\''+lvl+'\')" style="flex-shrink:0; border:1px solid '+(selectedEducationLevelFilter===lvl?'var(--gold)':'var(--line)')+'; background:'+(selectedEducationLevelFilter===lvl?'var(--gold)':'transparent')+'; color:'+(selectedEducationLevelFilter===lvl?'var(--night)':'var(--cream)')+'; border-radius:16px; padding:6px 14px; font-size:12px; font-family:\'Baloo 2\'; font-weight:600;">'+lvl+'</button>'
    ).join('');
  }
  if(selectedEducationLevelFilter){
    courses = courses.filter(c => c.schoolLevel === selectedEducationLevelFilter);
  }
  if(query){
    const filtered = [];
    for(const c of courses){
      let matches = c.trainerUsername.toLowerCase().includes(query) ||
        c.title.toLowerCase().includes(query) ||
        trainerSubjects[c.trainerUsername].toLowerCase().includes(query) ||
        (c.schoolLevel && c.schoolLevel.toLowerCase().includes(query)) ||
        (c.schoolClass && c.schoolClass.toLowerCase().includes(query));
      if(!matches){
        const lessons = await fetchLessonsForCourse(c.id);
        matches = lessons.some(l => !l.aiFlagged && (l.title.toLowerCase().includes(query) || l.content.toLowerCase().includes(query)));
      }
      if(matches) filtered.push(c);
    }
    courses = filtered;
  }
  if(courses.length === 0){ el.innerHTML = '<div class="empty">'+(query || selectedEducationLevelFilter ? 'Aucun résultat.' : 'Aucun cours disponible pour l’instant.')+'</div>'; return; }
  const priceLabels = {};
  for(const c of courses){ priceLabels[c.id] = await formatPriceIndicative(c.price); }
  el.innerHTML = courses.map(c => {
    const rating = trainerRatings[c.trainerUsername];
    const levelLabel = c.schoolLevel ? (c.schoolLevel + (c.schoolClass ? ' · '+c.schoolClass : '')) : '';
    return '<div class="card" style="display:flex; align-items:center; gap:12px; cursor:pointer;" onclick="openCourseDetail(\''+c.id+'\')">' +
    (trainerPhotos[c.trainerUsername] ? '<img src="'+trainerPhotos[c.trainerUsername]+'" style="width:44px; height:44px; border-radius:50%; object-fit:cover; flex-shrink:0;">' : smallAvatarBadge(c.trainerUsername, 44)) +
    '<div style="flex:1; min-width:0;">' +
    '<p style="margin:0 0 4px; font-size:13.5px; font-weight:600;">'+escapeHtml(c.title)+'</p>' +
    (levelLabel ? '<span style="display:inline-block; background:rgba(47,184,166,0.15); border:1px solid var(--lagoon); border-radius:10px; padding:2px 8px; font-size:10.5px; color:var(--lagoon); margin-bottom:4px;">'+escapeHtml(levelLabel)+'</span>' : '') +
    '<p style="margin:0 0 4px; font-size:12px; color:rgba(245,239,227,0.6);">Par @'+escapeHtml(c.trainerUsername)+(trainerVerified[c.trainerUsername] ? ' ✓' : '')+(trainerSubjects[c.trainerUsername] ? ' · '+escapeHtml(trainerSubjects[c.trainerUsername]) : '')+'</p>' +
    (rating ? '<p style="margin:0 0 4px; font-size:11.5px; color:var(--gold);">⭐ '+rating.average.toFixed(1)+' ('+rating.count+' avis)</p>' : '') +
    '<p style="margin:0; font-size:13px; color:var(--gold);">'+priceLabels[c.id]+'</p>' +
    '</div></div>';
  }).join('');
}
let currentCourseDetailId = null;
async function leaveCourseAsStudent(courseId){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function fetchEnrollment(courseId, username){
  return await safeGet('enrollment:' + courseId + '__' + username, true);
}
async function openCourseDetail(courseId){
  if(!(await requireEducationSubscription())) return;
  currentCourseDetailId = courseId;
  const c = await safeGet('course:' + courseId, true);
  if(!c){ showToast('Cours introuvable'); return; }
  document.getElementById('course-detail-title').textContent = c.title;
  const enrollment = await fetchEnrollment(courseId, currentUser);
  let isApproved = enrollment && enrollment.status === 'approved';
  let trialJustExpired = false;
  if(isApproved && enrollment.trialEnrollment){
    const meCheck = await safeGet('user:' + currentUser, true);
    const realSub = await safeGet('edusubscription:' + currentUser, true);
    const hasRealSub = realSub && new Date(realSub.expiresAt) > new Date();
    if(!(meCheck && meCheck.stateFunded) && !hasRealSub && !isTrialStillActive(meCheck)){
      isApproved = false;
      trialJustExpired = true;
    }
  }
  const lessons = (await fetchLessonsForCourse(courseId)).filter(l => !l.aiFlagged).sort((a,b) => (b.pinned?1:0) - (a.pinned?1:0));
  const exercises = await fetchExercisesForCourse(courseId);
  const exerciseSubmitted = {};
  for(const ex of exercises){
    const sub = await safeGet('submission:' + ex.id + '__' + currentUser, true);
    exerciseSubmitted[ex.id] = !!sub;
  }
  const courseVideos = (await fetchCourseVideos(courseId)).filter(v => !v.mediaFlagged);
  const coursePodcasts = await fetchCoursePodcasts(courseId);
  const fullExams = await fetchFullExams(courseId);
  const pronunciationChallenges = await fetchPronunciationChallenges(courseId);
  const quizzes = await fetchCourseQuizzes(courseId);
  const myQuizResults = {};
  for(const q of quizzes){
    const sub = await safeGet('quizsubmission:' + q.id + '__' + currentUser, true);
    if(sub) myQuizResults[q.id] = sub;
  }
  const myExamResults = isApproved ? await fetchExamResultsForStudent(courseId, currentUser) : [];
  const contests = await fetchContestsForCourse(courseId);
  const myBadges = isApproved ? await fetchStudentBadges(courseId, currentUser) : [];
  const faqItems = await fetchCourseFaq(courseId);
  const myEnrollment = isApproved ? await safeGet('enrollment:' + courseId + '__' + currentUser, true) : null;
  const myCompletedLessons = (myEnrollment && myEnrollment.completedLessons) || [];
  const el = document.getElementById('course-detail-content');
  const trainerInfo = await safeGet('user:' + c.trainerUsername, true);
  let html = '<div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">' +
    (trainerInfo && trainerInfo.photo ? '<img src="'+trainerInfo.photo+'" style="width:56px; height:56px; border-radius:50%; object-fit:cover;">' : smallAvatarBadge(c.trainerUsername, 56)) +
    '<div><p style="margin:0; font-size:14px; font-weight:600;">@'+escapeHtml(c.trainerUsername)+(trainerInfo && trainerInfo.verified ? ' <span style="color:var(--lagoon);">✓ Vérifié</span>' : '')+'</p>' +
    (trainerInfo && trainerInfo.trainerSubject ? '<p style="margin:2px 0 0; font-size:12px; color:rgba(245,239,227,0.6);">'+escapeHtml(trainerInfo.trainerSubject)+'</p>' : '') +
    '</div></div>' +
    (Array.isArray(c.coTrainers) && c.coTrainers.length > 0 ? '<p style="margin:0 0 12px; font-size:12px; color:rgba(245,239,227,0.6);">🤝 Co-enseigné avec '+c.coTrainers.map(u => '@'+escapeHtml(u)).join(', ')+'</p>' : '') +
    (c.schoolLevel ? '<span style="display:inline-block; background:rgba(47,184,166,0.15); border:1px solid var(--lagoon); border-radius:10px; padding:3px 10px; font-size:11px; color:var(--lagoon); margin-bottom:12px;">'+escapeHtml(c.schoolLevel)+(c.schoolClass ? ' · '+escapeHtml(c.schoolClass) : '')+'</span><br>' : '') +
    (c.examTarget ? '<span style="display:inline-block; background:rgba(242,183,5,0.15); border:1px solid var(--gold); border-radius:10px; padding:3px 10px; font-size:11px; color:var(--gold); margin-bottom:12px;">🎯 '+escapeHtml(c.examTarget)+'</span><br>' : '') +
    ((c.scheduleDay !== null && c.scheduleDay !== undefined && c.scheduleTime) ? '<p style="margin:0 0 12px; font-size:12.5px; color:var(--lagoon);">📅 Chaque '+WEEKDAY_NAMES_FR[c.scheduleDay]+' à '+escapeHtml(c.scheduleTime)+'</p>' : '') +
    '<p style="margin:0 0 14px; font-size:13.5px;">'+escapeHtml(c.description||'')+'</p>' +
    '<p style="margin:0 0 14px; font-size:16px; color:var(--gold); font-family:\'Baloo 2\'; font-weight:700;">'+(await formatPriceIndicative(c.price))+'</p>';
  if(isApproved){
    html += '<p style="margin:0 0 10px; font-size:12.5px; color:var(--lagoon);">✓ Vous êtes inscrit(e) à ce cours.</p>' +
      (myBadges.length > 0 ? '<div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">' +
        myBadges.map(b => '<span style="background:rgba(242,183,5,0.15); border:1px solid var(--gold); border-radius:20px; padding:6px 12px; font-size:12px;">'+escapeHtml(b.badgeName)+'</span>').join('') +
        '</div>' : '') +
      '<div class="eyebrow">Leçons</div>' +
      (lessons.length === 0 ? '<div class="empty">Le formateur n’a pas encore ajouté de leçon.</div>' : lessons.map(l =>
        '<div class="card"'+(l.pinned ? ' style="border-color:var(--gold);"' : '')+'><strong style="font-size:13px;">'+(l.pinned ? '📌 ' : '')+escapeHtml(l.title)+'</strong><p style="margin:6px 0 0; font-size:13px; white-space:pre-line;">'+escapeHtml(l.content)+'</p>'+renderLessonAttachmentHtml(l)+
        '<button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="openLessonPrint(\''+l.id+'\', \''+courseId+'\')">🖨️ Imprimer cette leçon</button>' +
        (isApproved ? (myCompletedLessons.includes(l.id)
          ? '<span style="margin-left:8px; font-size:12px; color:var(--lagoon);">✓ Terminée</span>'
          : '<button class="btn btn-outline btn-sm" style="margin-top:8px; margin-left:6px; border-color:var(--lagoon); color:var(--lagoon);" onclick="markLessonComplete(\''+courseId+'\', \''+l.id+'\')">✓ Marquer comme terminée</button>') : '') +
        '<div style="margin-top:10px; display:flex; gap:6px;">' +
        '<input type="text" id="vocab-word-'+l.id+'" placeholder="Un mot ou une notion à retenir..." style="margin:0; flex:1;">' +
        '<button class="btn btn-outline btn-sm" onclick="addVocabWord(\''+l.id+'\', \''+escapeHtml(l.title)+'\')">📖 Épingler</button>' +
        '</div></div>'
      ).join('')) +
      '<div class="eyebrow" style="margin-top:14px;">📝 Examens</div>' +
      (fullExams.length === 0 ? '<div class="empty">Aucun examen pour l’instant.</div>' : await renderFullExamsListForStudent(fullExams)) +
      '<div class="eyebrow" style="margin-top:14px;">🎥 Vidéothèque</div>' +
      (courseVideos.length === 0 ? '<div class="empty">Aucune vidéo pour l’instant.</div>' : courseVideos.map(v => {
        const nextEpisode = (v.seriesName && v.episodeNumber) ? courseVideos.find(other => other.seriesName === v.seriesName && other.episodeNumber === v.episodeNumber + 1) : null;
        return '<div class="card"><strong style="font-size:13px;">'+escapeHtml(v.title)+'</strong>' +
        (v.seriesName ? '<p style="margin:2px 0 0; font-size:11px; color:var(--lagoon);">📺 '+escapeHtml(v.seriesName)+(v.episodeNumber ? ' — Épisode '+v.episodeNumber : '')+'</p>' : '') +
        '<video id="coursevideo_'+v.id+'" controls style="width:100%; border-radius:10px; margin-top:8px;" src="'+v.data+'" data-original-src="'+v.data+'"'+(v.altAudioData ? ' data-alt-src="'+v.altAudioData+'" data-alt-label="'+escapeHtml(v.altAudioLabel)+'"' : '')+'></video>' +
        (v.altAudioData ? '<button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="toggleVideoLanguage(\''+v.id+'\')">🌐 <span id="coursevideo_'+v.id+'_langlabel">Original</span></button>' : '') +
        '<button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="generateAndShowCourseVideoSubtitles(\''+courseId+'\', \''+v.id+'\')">💬 Sous-titres</button>' +
        '<div id="coursevideo_'+v.id+'_subtitles" style="margin-top:8px; font-size:12.5px; color:rgba(245,239,227,0.7); line-height:1.5;"></div>' +
        '<button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="startCourseVideoRemixRecording(\''+courseId+'\', '+v.id+')">🔄 Remixer cette vidéo</button>' +
        ((v.chapters && v.chapters.length > 0) ? '<div style="margin-top:8px;">' + v.chapters.map(c =>
          '<span onclick="document.getElementById(\'coursevideo_'+v.id+'\').currentTime='+c.seconds+'; document.getElementById(\'coursevideo_'+v.id+'\').play();" style="display:inline-block; background:rgba(47,184,166,0.15); color:var(--lagoon); font-size:11px; padding:3px 9px; border-radius:8px; margin:0 4px 4px 0; cursor:pointer;">▶ '+c.label+' — '+escapeHtml(c.title)+'</span>'
        ).join('') + '</div>' : '') +
        (nextEpisode ? '<button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="document.getElementById(\'coursevideo_'+nextEpisode.id+'\').scrollIntoView({behavior:\'smooth\'}); document.getElementById(\'coursevideo_'+nextEpisode.id+'\').play();">▶ Épisode suivant : '+escapeHtml(nextEpisode.title)+'</button>' : '') +
        '</div>';
      }).join('')) +
      '<div class="eyebrow" style="margin-top:14px;">🎙️ Podcasts</div>' +
      (coursePodcasts.length === 0 ? '<div class="empty">Aucun épisode pour l’instant.</div>' : coursePodcasts.map(pc =>
        '<div class="card"><strong style="font-size:13px;">'+escapeHtml(pc.title)+'</strong><audio controls style="width:100%; margin-top:8px;" src="'+pc.data+'"></audio></div>'
      ).join('')) +
      '<div class="eyebrow" style="margin-top:14px;">📝 Exercices</div>' +
      (exercises.length === 0 ? '<div class="empty">Aucun exercice pour l’instant.</div>' : exercises.map(ex => {
        const isLate = ex.deadline && !exerciseSubmitted[ex.id] && new Date(ex.deadline) < new Date();
        return '<div class="card" style="cursor:pointer;'+(isLate?' border-color:var(--coral);':'')+'" onclick="openExerciseDetail(\''+ex.id+'\', \''+courseId+'\')"><strong style="font-size:13px;">'+escapeHtml(ex.title)+'</strong>' +
        (ex.deadline ? '<p style="margin:4px 0 0; font-size:11.5px; color:'+(isLate?'var(--coral)':'rgba(245,239,227,0.5)')+';">'+(isLate?'⚠️ En retard — ':'')+'À rendre avant le '+new Date(ex.deadline).toLocaleDateString('fr-FR')+'</p>' : '') +
        '</div>';
      }).join('')) +
      '<div class="eyebrow" style="margin-top:14px;">📋 Résultats d’examens</div>' +
      (myExamResults.length === 0 ? '<div class="empty">Aucun résultat pour l’instant.</div>' : myExamResults.map(r =>
        '<div class="card"><p style="margin:0 0 4px; font-size:13px; font-weight:600;">'+escapeHtml(r.examTitle)+'</p>' +
        '<p style="margin:0; font-size:14px; color:var(--gold); font-family:\'Baloo 2\'; font-weight:700;">'+r.score+'/20</p>' +
        (r.comment ? '<p style="margin:4px 0 0; font-size:12px; font-style:italic; color:rgba(245,239,227,0.6);">'+escapeHtml(r.comment)+'</p>' : '') +
        '</div>'
      ).join('')) +
      '<div class="eyebrow" style="margin-top:14px;">🏆 Concours</div>' +
      (contests.length === 0 ? '<div class="empty">Aucun concours pour l’instant.</div>' : contests.map(ct =>
        '<div class="card" style="cursor:pointer;" onclick="openContestDetail(\''+ct.id+'\', \''+courseId+'\')"><strong style="font-size:13px;">'+escapeHtml(ct.title)+'</strong>' +
        (ct.status === 'closed' ? '<p style="margin:4px 0 0; font-size:11.5px; color:var(--gold);">🏆 Classement publié</p>' : '<p style="margin:4px 0 0; font-size:11.5px; color:rgba(245,239,227,0.5);">Ouvert aux participations</p>') +
        '</div>'
      ).join('')) +
      '<div class="eyebrow" style="margin-top:14px;">📝 Document en direct du formateur</div>' +
      '<input type="text" id="live-doc-search" placeholder="Rechercher dans le texte..." oninput="filterLiveDocView()" style="margin-bottom:10px;">' +
      '<div class="card"><p id="live-doc-viewer" style="margin:0; font-size:13px; white-space:pre-line; line-height:1.6;"></p></div>' +
      '<div class="eyebrow" style="margin-top:14px;">✅ QCM / Quiz</div>' +
      (quizzes.length === 0 ? '<div class="empty">Aucun quiz pour l’instant.</div>' : quizzes.map(q => {
        const result = myQuizResults[q.id];
        return '<div class="card" style="cursor:pointer;" onclick="openCourseQuiz(\''+q.id+'\', \''+courseId+'\')"><strong style="font-size:13px;">'+escapeHtml(q.title)+'</strong>' +
          (result ? '<p style="margin:4px 0 0; font-size:12px; color:'+(result.correct?'var(--lagoon)':'var(--coral)')+';">'+(result.correct?'✓ Bonne réponse':'✕ Réponse incorrecte')+'</p>' : '<p style="margin:4px 0 0; font-size:11.5px; color:rgba(245,239,227,0.5);">Pas encore répondu</p>') +
          '</div>';
      }).join('')) +
      '<div class="eyebrow" style="margin-top:14px;">👥 Mes groupes de travail</div>' +
      '<div id="student-course-groups-list"></div>' +
      (pronunciationChallenges.length > 0 ? '<div class="eyebrow" style="margin-top:14px;">🗣️ Défis de prononciation</div>' +
        pronunciationChallenges.map(p =>
          '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 8px; font-size:14px; font-weight:600;">'+escapeHtml(p.term)+'</p>' +
          '<button class="btn btn-outline btn-sm" onclick="startPronunciationAttempt(\''+escapeHtml(p.term).replace(/'/g,"\\'")+'\', \'pron-result-'+p.id+'\')">🎙️ Parler</button>' +
          '<p id="pron-result-'+p.id+'" style="margin:8px 0 0; font-size:12.5px; color:rgba(245,239,227,0.6);"></p></div>'
        ).join('') : '') +
      '<div class="eyebrow" style="margin-top:14px;">❓ FAQ</div>' +
      (faqItems.length === 0 ? '<div class="empty">Aucune question fréquente pour l’instant.</div>' : faqItems.map(f =>
        '<div class="card"><p style="margin:0 0 6px; font-size:13px; font-weight:600;">'+escapeHtml(f.question)+'</p>' +
        '<p style="margin:0; font-size:12.5px; color:rgba(245,239,227,0.7);">'+escapeHtml(f.answer)+'</p></div>'
      ).join('')) +
      '<div class="eyebrow" style="margin-top:14px;">💬 Chat du cours</div>' +
      '<div id="student-course-chat-messages" style="display:flex; flex-direction:column; gap:8px; max-height:280px; overflow-y:auto; margin-bottom:10px;"></div>' +
      '<div style="display:flex; gap:8px; margin-bottom:16px;">' +
      '<input type="text" id="student-course-chat-input" placeholder="Écrire un message..." style="margin:0;">' +
      '<button id="student-chat-voice-btn" onclick="toggleCourseChatVoiceRecording(false)" style="background:none; border:1px solid var(--line); border-radius:10px; color:var(--cream); font-size:16px; padding:0 12px;">🎤</button>' +
      '<button class="btn btn-lagoon btn-sm" onclick="sendCourseChatMessage(\'student-course-chat-input\', false)">Envoyer</button>' +
      '</div>' +
      '<button class="btn btn-outline" style="width:100%; margin-bottom:16px;" onclick="openCourseCertificate(\''+courseId+'\')">🎓 Voir mon attestation</button>' +
      '<button class="btn btn-outline" style="width:100%; margin-bottom:16px;" onclick="openStudyBuddyFinder(\''+courseId+'\')">🧑‍🎓 Trouver un binôme de révision</button>' +
      '<button class="btn btn-outline" style="width:100%; margin-bottom:16px;" onclick="openCourseGroupChat(\''+courseId+'\')">💬 Discussion entre élèves</button>' +
      '<button class="btn btn-outline" style="width:100%; margin-bottom:16px;" onclick="openCourseSharedNotes(\''+courseId+'\')">📝 Notes de cours partagées</button>' +
      '<button class="btn btn-outline" style="width:100%; margin-bottom:16px; border-color:var(--coral); color:var(--coral);" onclick="leaveCourseAsStudent(\''+courseId+'\')">🚪 Quitter ce cours</button>' +
      '<div class="eyebrow">🎯 Mon objectif personnel</div>' +
      '<div id="course-goal-section" style="margin-bottom:16px;"></div>' +
      '<div class="eyebrow">⭐ Noter ce formateur</div>' +
      '<div id="course-rating-section"></div>';
  } else if(enrollment && enrollment.status === 'pending'){
    html += '<p style="margin:0; font-size:13px; color:var(--gold);">⏳ Inscription en attente de validation du paiement.</p>';
  } else {
    if(trialJustExpired){
      html += '<div class="card" style="border-color:var(--coral); margin-bottom:14px;"><p style="margin:0; font-size:13px; color:var(--coral);">🔒 Votre essai gratuit est terminé.</p><p style="margin:6px 0 0; font-size:12px; color:rgba(245,239,227,0.6);">Payez '+c.price.toLocaleString('fr-FR')+' FCFA pour continuer à accéder à ce cours.</p></div>';
    }
    const freePreviewLessons = lessons.filter(l => l.freePreview);
    if(freePreviewLessons.length > 0){
      html += '<div class="eyebrow">🆓 Aperçu gratuit</div>' + freePreviewLessons.map(l =>
        '<div class="card"><strong style="font-size:13px;">'+escapeHtml(l.title)+'</strong><p style="margin:6px 0 0; font-size:13px; white-space:pre-line;">'+escapeHtml(l.content)+'</p>'+renderLessonAttachmentHtml(l)+'</div>'
      ).join('');
    }
    html += '<button class="btn btn-primary" style="width:100%;" onclick="enrollInCourse(\''+courseId+'\')">S’inscrire à ce cours</button>';
  }
  el.innerHTML = html;
  go('course-detail');
  stopLiveDocPolling();
  stopCourseChatPolling();
  if(isApproved){
    await refreshLiveDocView(courseId);
    liveDocPollInterval = setInterval(() => refreshLiveDocView(courseId), 4000);
    await renderStudentCourseChat();
    courseChatPollInterval = setInterval(renderStudentCourseChat, 4000);
    await renderStudentWorkGroups(courseId);
    await renderCourseGoalSection(courseId);
    await renderCourseRatingSection(courseId, c.trainerUsername);
  }
}
async function markLessonComplete(courseId, lessonId){
  const enrollmentKey = 'enrollment:' + courseId + '__' + currentUser;
  const enrollment = await safeGet(enrollmentKey, true);
  if(!enrollment) return;
  const completed = enrollment.completedLessons || [];
  if(completed.includes(lessonId)) return;
  completed.push(lessonId);
  enrollment.completedLessons = completed;
  await saveWithRetry(enrollmentKey, enrollment, true);
  showToast('Leçon marquée comme terminée ✓');
  await openCourseDetail(courseId);
}
async function enrollInCourse(courseId){
  const c = await safeGet('course:' + courseId, true);
  if(!c) return;
  const readOnlyDomains = (await safeGet('settings:readOnlyDomains', true)) || [];
  if(readOnlyDomains.includes('education')){ showToast('Le département Éducation est temporairement en lecture seule — réessayez plus tard'); return; }
  const me = (await safeGet('user:' + currentUser, true)) || {username: currentUser, createdAt: new Date().toISOString()};
  if(!me.isStudent){
    me.isStudent = true;
    me.studentSince = new Date().toISOString();
    if(c.schoolLevel){
      me.studentLevel = c.schoolLevel;
      me.studentType = (c.schoolLevel === 'Supérieur') ? 'Étudiant' : 'Élève';
    }
    await saveWithRetry('user:' + currentUser, me, true);
  }
  if(me.stateFunded){
    await saveWithRetry('enrollment:' + courseId + '__' + currentUser, {
      courseId, studentUsername: currentUser, trainerUsername: c.trainerUsername, price: c.price,
      country: currentUserCountry, status: 'approved', stateFunded: true, createdAt: new Date().toISOString()
    }, true);
    await createFollowRelationship(currentUser, c.trainerUsername);
    showToast('Inscription automatiquement validée — accès financé par l’État ✓');
    await openCourseDetail(courseId);
    return;
  }
  if(isTrialStillActive(me) && !(await safeGet('edusubscription:' + currentUser, true))){
    await saveWithRetry('enrollment:' + courseId + '__' + currentUser, {
      courseId, studentUsername: currentUser, trainerUsername: c.trainerUsername, price: c.price,
      country: currentUserCountry, status: 'approved', trialEnrollment: true, createdAt: new Date().toISOString()
    }, true);
    await createFollowRelationship(currentUser, c.trainerUsername);
    showToast('Accès gratuit pendant votre essai — profitez-en pour découvrir ce cours ✓');
    await openCourseDetail(courseId);
    return;
  }
  const priorLeaveKeys = await safeList('courseleave:' + courseId + '__' + currentUser + '__', true);
  let priorPaidLeave = null;
  for(const k of priorLeaveKeys){
    const l = await safeGet(k, true);
    if(l && l.wasPaid && (!priorPaidLeave || new Date(l.leftAt) > new Date(priorPaidLeave.leftAt))) priorPaidLeave = l;
  }
  if(priorPaidLeave){
    await saveWithRetry('enrollment:' + courseId + '__' + currentUser, {
      courseId, studentUsername: currentUser, trainerUsername: c.trainerUsername, price: priorPaidLeave.pricePaid,
      country: currentUserCountry, status: 'approved', reEnrollment: true, createdAt: new Date().toISOString()
    }, true);
    await createFollowRelationship(currentUser, c.trainerUsername);
    showToast('Réinscription validée — vous aviez déjà payé ce cours, aucun nouveau paiement requis ✓');
    if(c.trainerUsername) await createNotification(c.trainerUsername, 'student_reenrolled', currentUser, courseId, c.title);
    await openCourseDetail(courseId);
    return;
  }
  const instructions = await getPaymentInstructions(currentUserCountry);
  const enrollmentKey = 'enrollment:' + courseId + '__' + currentUser;
  await saveWithRetry(enrollmentKey, {
    courseId, studentUsername: currentUser, trainerUsername: c.trainerUsername, price: c.price,
    country: currentUserCountry, status: 'pending', createdAt: new Date().toISOString()
  }, true);
  if(await isAutoApproveEnrollmentEnabled()){
    await approveEnrollment(enrollmentKey);
    await logAdminAction('Inscription au cours approuvée automatiquement', '@' + currentUser + ' — ' + c.title);
    showToast('Inscription validée automatiquement ✓');
    await openCourseDetail(courseId);
    return;
  }
  alert('Pour rejoindre "' + c.title + '" (' + c.price.toLocaleString('fr-FR') + ' FCFA) :\n\n' + instructions);
  showToast('Inscription envoyée — en attente de validation ✓');
  await openCourseDetail(courseId);
}
/* ---------- EXERCICES ET CORRECTIONS ---------- */
async function gatherEnrolledCourseContent(){
  const allCourses = await fetchCourses(true);
  const enrolledCourses = [];
  for(const c of allCourses){
    const enrollKeys = await safeList('enrollment:' + c.id + '__', true);
    for(const k of enrollKeys){
      const e = await safeGet(k, true);
      if(e && e.studentUsername === currentUser && e.status === 'approved'){ enrolledCourses.push(c); break; }
    }
  }
  const chunks = [];
  for(const c of enrolledCourses){
    const lessonKeys = await safeList('lesson:' + c.id + '__', true);
    for(const k of lessonKeys.slice(0, 30)){
      const l = await safeGet(k, true).catch(() => null);
      if(l && l.content && !l.aiFlagged && l.validatedForSearch){
        let vec = await safeGet('contentembedding:lesson:' + k.replace('lesson:', ''), true).catch(() => null);
        if(!vec){ vec = await getContentEmbedding(l.title + ' — ' + l.content).catch(() => null); if(vec) await saveWithRetry('contentembedding:lesson:' + k.replace('lesson:', ''), vec, true).catch(() => {}); }
        chunks.push({ courseId: c.id, course: c.title, chapter: l.title, text: l.content.slice(0, 800), embedding: vec });
      }
    }
    const exercises = await fetchExercisesForCourse(c.id);
    for(const ex of exercises.slice(0, 30)){
      if(ex.question && ex.validatedForSearch){
        const text = ex.question.slice(0, 400) + (ex.correction ? '\nCorrection : ' + ex.correction.slice(0, 400) : '');
        let vec = await safeGet('contentembedding:exercise:' + c.id + '__' + ex.id.split('__').pop(), true).catch(() => null);
        if(!vec){ vec = await getContentEmbedding(ex.title + ' — ' + text).catch(() => null); }
        chunks.push({ courseId: c.id, course: c.title, chapter: 'Exercice : ' + ex.title, text, embedding: vec });
      }
    }
  }
  return { enrolledCount: enrolledCourses.length, chunks };
}
async function askCourseSearchAssistant(){
  const question = document.getElementById('course-search-question-input').value.trim();
  if(!question){ showToast('Écrivez votre question d’abord'); return; }
  const resultEl = document.getElementById('course-search-result');
  resultEl.innerHTML = '<p style="font-size:12px; color:rgba(245,239,227,0.5);">Recherche dans vos cours...</p>';
  const { enrolledCount, chunks } = await gatherEnrolledCourseContent();
  if(enrolledCount === 0){
    resultEl.innerHTML = '<div class="empty">Vous n’êtes inscrit(e) à aucun cours pour l’instant. Explorez l’espace éducation pour en rejoindre un.</div>';
    return;
  }
  if(chunks.length === 0){
    resultEl.innerHTML = '<div class="empty">Vos cours ne contiennent pas encore assez de contenu texte pour cette recherche.</div>';
    return;
  }
  // Vraie étape de récupération sémantique : embedding de la question, similarité cosinus, on ne garde que les meilleurs
  const questionVec = await getContentEmbedding(question);
  let topChunks;
  if(questionVec){
    const scored = chunks.map(c => ({ ...c, score: c.embedding ? cosineSimilarity(questionVec, c.embedding) : 0 }));
    scored.sort((a,b) => b.score - a.score);
    topChunks = scored.slice(0, 5);
  } else {
    topChunks = chunks.slice(0, 5); // repli si les embeddings sont indisponibles (ex. pas de clé Gemini)
  }
  const contentBlock = topChunks.map((c,i) => '['+i+'] Cours : '+c.course+' — Chapitre : '+c.chapter+'\n'+c.text).join('\n\n');
  const guidedMode = document.getElementById('course-search-guided-mode-checkbox').checked;
  const systemInstruction = "Tu es un assistant de recherche pédagogique pour un élève de Suktum. Règles strictes et non négociables : réponds UNIQUEMENT à partir des extraits de cours fournis par l'utilisateur, jamais à partir de connaissances générales ou d'internet. Si la réponse s'y trouve, cite précisément le cours et le chapitre entre parenthèses à la fin. Si la réponse ne s'y trouve PAS, dis-le honnêtement en une phrase et invite l'élève à explorer d'autres cours ou à poser la question à un enseignant via les consultations ou les lives — n'invente jamais de contenu, même partiellement." +
    (guidedMode ? " Mode guidé activé : ne donne JAMAIS la réponse finale ou la solution directe d'un exercice. À la place, pose une question de relance ou explique la méthode à suivre, pour que l'élève trouve la réponse par lui-même." : "");
  const userContent = "Extraits réels de mes cours :\n\n" + contentBlock.slice(0, 6000) + "\n\nMa question : " + question;
  const provider = getAIProviderChoice('dailysummary');
  const answer = await callAIProviderStrict(systemInstruction, userContent, 350, provider).catch(() => null);
  const bestScore = topChunks[0] ? topChunks[0].score : 0;
  const wasFound = bestScore > 0.3;
  const logId = 'search_' + Date.now();
  await saveWithRetry('coursesearchlog:' + logId, { id: logId, username: currentUser, question, wasFound, bestScore, createdAt: new Date().toISOString() }, true).catch(() => {});
  const bestCourseId = wasFound ? topChunks[0].courseId : null;
  resultEl.innerHTML = answer
    ? '<div class="card" style="border-color:var(--lagoon);"><p style="margin:0 0 10px; font-size:13px; line-height:1.6; white-space:pre-line;">'+escapeHtml(answer)+'</p>' +
      (bestCourseId ? '<button class="btn btn-outline btn-sm" style="width:100%;" onclick="openCourseDetail(\''+bestCourseId+'\')">📖 Ouvrir le cours correspondant</button>' : '') +
      '</div>'
    : '<div class="empty">Réponse indisponible pour le moment — réessayez plus tard.</div>';
}
async function fetchExercisesForCourse(courseId){
  const keys = await safeList('exercise:' + courseId + '__', true);
  const list = [];
  for(const k of keys){ const ex = await safeGet(k, true); if(ex) list.push(ex); }
  list.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  return list;
}
async function addExerciseToCourse(){
  const title = document.getElementById('new-exercise-title').value.trim();
  const question = document.getElementById('new-exercise-question').value.trim();
  const correction = document.getElementById('new-exercise-correction').value.trim();
  const deadline = document.getElementById('new-exercise-deadline').value;
  if(!title || !question || !correction){ showToast('Renseignez le titre, la consigne et le corrigé'); return; }
  const ts = Date.now();
  const id = 'exercise_' + currentManagedCourseId + '__' + ts;
  await saveWithRetry('exercise:' + currentManagedCourseId + '__' + ts, {
    id, courseId: currentManagedCourseId, title, question, correction, deadline: deadline || null, createdAt: new Date().toISOString()
  }, true);
  const vec = await getContentEmbedding(title + ' — ' + question + ' — ' + correction).catch(() => null);
  if(vec) await saveWithRetry('contentembedding:exercise:' + currentManagedCourseId + '__' + ts, vec, true).catch(() => {});
  const enrolledStudents = await fetchApprovedStudentsForCourse(currentManagedCourseId);
  for(const student of enrolledStudents){
    await createNotification(student, 'new_exercise', currentUser, id, title);
  }
  document.getElementById('new-exercise-title').value = '';
  document.getElementById('new-exercise-question').value = '';
  document.getElementById('new-exercise-correction').value = '';
  document.getElementById('new-exercise-deadline').value = '';
  showToast('Exercice ajouté ✓');
  await renderManageCourseExercises();
}
async function renderManageCourseExercises(){
  const el = document.getElementById('manage-course-exercises');
  const exercises = await fetchExercisesForCourse(currentManagedCourseId);
  if(exercises.length === 0){ el.innerHTML = '<div class="empty">Aucun exercice pour l’instant.</div>'; return; }
  const subKeys = await safeList('submission:', true);
  el.innerHTML = '';
  for(const ex of exercises){
    let submittedCount = 0, gradedCount = 0;
    for(const k of subKeys){
      if(!k.startsWith('submission:' + ex.id + '__')) continue;
      const s = await safeGet(k, true);
      if(s){ submittedCount++; if(s.status === 'graded') gradedCount++; }
    }
    el.innerHTML += '<div class="card" style="cursor:pointer;" onclick="openGradeExercise(\''+ex.id+'\')">' +
      '<p style="margin:0 0 4px; font-size:13px; font-weight:600;">'+escapeHtml(ex.title)+'</p>' +
      (ex.deadline ? '<p style="margin:0 0 4px; font-size:11.5px; color:rgba(245,239,227,0.5);">Date limite : '+new Date(ex.deadline).toLocaleDateString('fr-FR')+'</p>' : '') +
      '<p style="margin:0 0 4px; font-size:12px; color:rgba(245,239,227,0.55);">'+submittedCount+' copie(s) reçue(s) · '+gradedCount+' corrigée(s)</p>' +
      '<p style="margin:0 0 6px; font-size:11px; color:'+(ex.validatedForSearch ? 'var(--lagoon)' : 'rgba(245,239,227,0.4)')+';">'+(ex.validatedForSearch ? '✓ Validé pour la recherche IA' : '○ Pas encore validé pour la recherche IA')+'</p>' +
      '<button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); toggleExerciseSearchValidation(\''+ex.id+'\')">'+(ex.validatedForSearch ? 'Retirer de la recherche' : '✓ Valider pour la recherche')+'</button>' +
      '</div>';
  }
}
async function toggleExerciseSearchValidation(exerciseId){
  const key = 'exercise:' + currentManagedCourseId + '__' + exerciseId.split('__').pop();
  const ex = await safeGet(key, true);
  if(!ex) return;
  ex.validatedForSearch = !ex.validatedForSearch;
  await saveWithRetry(key, ex, true);
  showToast(ex.validatedForSearch ? 'Validé pour la recherche IA ✓' : 'Retiré de la recherche IA');
  await renderManageCourseExercises();
}
let currentGradingExerciseId = null;
async function openGradeExercise(exerciseId){
  currentGradingExerciseId = exerciseId;
  const ex = await findExerciseById(exerciseId);
  document.getElementById('grade-exercise-title').textContent = ex ? ex.title : 'Copies';
  go('grade-exercise');
  await renderGradeExerciseSubmissions();
}
async function findExerciseById(exerciseId){
  const exercises = await fetchExercisesForCourse(currentManagedCourseId);
  return exercises.find(e => e.id === exerciseId);
}
async function renderGradeExerciseSubmissions(){
  const el = document.getElementById('grade-exercise-submissions');
  const keys = await safeList('submission:' + currentGradingExerciseId + '__', true);
  const submissions = [];
  for(const k of keys){ const s = await safeGet(k, true); if(s) submissions.push({storageKey: k, ...s}); }
  if(submissions.length === 0){ el.innerHTML = '<div class="empty">Aucune copie reçue pour l’instant.</div>'; return; }
  el.innerHTML = submissions.map(s =>
    '<div class="card">' +
    '<p style="margin:0 0 4px; font-size:13px; font-weight:600;">@'+escapeHtml(s.studentUsername)+(s.status==='graded' ? ' — Note : '+escapeHtml(String(s.score))+'/20' : ' — ⏳ À corriger')+'</p>' +
    '<p style="margin:0 0 10px; font-size:12.5px; white-space:pre-line;">'+escapeHtml(s.answer)+'</p>' +
    (s.status === 'graded'
      ? (s.feedback ? '<p style="margin:0; font-size:12px; color:rgba(245,239,227,0.55); font-style:italic;">Commentaire : '+escapeHtml(s.feedback)+'</p>' : '')
      : aiProviderChoiceHtml('grade-'+s.studentUsername) +
        '<div id="ai-suggestion-'+s.studentUsername+'" style="margin-bottom:8px; font-size:12px; color:var(--gold); white-space:pre-line;"></div>' +
        '<button class="btn btn-outline btn-sm" style="margin-bottom:8px;" onclick="suggestGradeWithAI(\''+escapeHtml(s.studentUsername)+'\')">🧠 Suggestion IA</button>' +
        '<input type="number" min="0" max="20" id="grade-score-'+s.studentUsername+'" placeholder="Note /20" style="margin-bottom:8px;"><input type="text" id="grade-feedback-'+s.studentUsername+'" placeholder="Commentaire (optionnel)" style="margin-bottom:8px;"><button class="btn btn-primary btn-sm" onclick="submitGrade(\''+s.storageKey+'\', \''+escapeHtml(s.studentUsername)+'\')">Valider la note</button>') +
    '</div>'
  ).join('');
}
async function generateCourseAISummary(courseIdParam, resultElId, providerIdPrefix){
  const courseId = courseIdParam || currentManagedCourseId;
  const el = document.getElementById(resultElId || 'course-ai-summary-result');
  if(!el) return;
  const c = await safeGet('course:' + courseId, true);
  const lessons = (await fetchLessonsForCourse(courseId)).filter(l => !l.aiFlagged);
  if(!c || lessons.length === 0){ el.textContent = 'Ajoutez au moins une leçon pour générer un résumé.'; return; }
  el.textContent = '⏳ Génération en cours...';
  try{
    const lessonsText = lessons.map((l, i) => 'Leçon ' + (i+1) + ' — ' + l.title + ' :\n' + l.content).join('\n\n');
    const prompt = "Voici le contenu complet d'un cours intitulé « " + c.title + " » (" + lessons.length + " leçon(s)) :\n\n" + lessonsText +
      "\n\nRédige un résumé clair et structuré de ce cours en français, en 5-8 phrases, qui donne une vue d'ensemble utile à un élève ou un parent avant de s'inscrire. Ne rien inventer au-delà du contenu fourni.";
    const provider = providerIdPrefix ? getAIProviderChoice(providerIdPrefix) : 'claude';
    const summary = await callAIProvider(prompt, 500, provider);
    el.textContent = summary ? '🧠 ' + (provider==='gemini'?'(Gemini) ':'') + summary : 'Résumé indisponible pour le moment.';
  }catch(e){
    el.textContent = 'Résumé indisponible (connexion).';
  }
}
let lastAiGradeSuggestions = {};
async function suggestGradeWithAI(studentUsername){
  const el = document.getElementById('ai-suggestion-' + studentUsername);
  if(!el) return;
  const submissions = await safeList('submission:' + currentGradingExerciseId + '__', true);
  const key = submissions.find(k => k.endsWith('__' + studentUsername));
  const s = key ? await safeGet(key, true) : null;
  const ex = await findExerciseById(currentGradingExerciseId);
  if(!s || !ex){ el.textContent = 'Introuvable.'; return; }
  el.textContent = '⏳ Analyse en cours...';
  try{
    const prompt = "Tu aides un formateur à corriger un exercice. Voici la consigne, le corrigé officiel, et la réponse de l'élève.\n\n" +
      "CONSIGNE : " + ex.question + "\n\nCORRIGÉ OFFICIEL : " + ex.correction + "\n\nRÉPONSE DE L'ÉLÈVE : " + s.answer +
      "\n\nRéponds UNIQUEMENT en JSON strict, sans aucun texte autour, au format : {\"score\": <note sur 20, nombre entier>, \"feedback\": \"<commentaire court en français, 1-2 phrases>\"}";
    const provider = getAIProviderChoice('grade-' + studentUsername);
    const text = await callAIProvider(prompt, 200, provider);
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    lastAiGradeSuggestions[studentUsername] = parsed.score;
    el.innerHTML = '🧠 Suggestion '+(provider==='gemini'?'Gemini':'Claude')+' : <strong>'+parsed.score+'/20</strong> — '+escapeHtml(parsed.feedback);
    const scoreInput = document.getElementById('grade-score-' + studentUsername);
    const feedbackInput = document.getElementById('grade-feedback-' + studentUsername);
    if(scoreInput && !scoreInput.value) scoreInput.value = parsed.score;
    if(feedbackInput && !feedbackInput.value) feedbackInput.value = parsed.feedback;
  }catch(e){
    el.textContent = 'Suggestion IA indisponible pour le moment.';
  }
}
async function submitGrade(storageKey, studentUsername){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}

/* ---------- EXERCICES — VUE ÉTUDIANT ---------- */
let currentStudentExerciseId = null;
async function openExerciseDetail(exerciseId, courseId){
  if(!(await requireEducationSubscription())) return;
  currentStudentExerciseId = exerciseId;
  currentManagedCourseId = courseId;
  const exercises = await fetchExercisesForCourse(courseId);
  const ex = exercises.find(e => e.id === exerciseId);
  if(!ex){ showToast('Exercice introuvable'); return; }
  document.getElementById('exercise-detail-title').textContent = ex.title;
  const submission = await safeGet('submission:' + exerciseId + '__' + currentUser, true);
  const el = document.getElementById('exercise-detail-content');
  const isPastDeadline = ex.deadline && !submission && new Date(ex.deadline) < new Date();
  let html = (ex.deadline ? '<p style="margin:0 0 12px; font-size:12.5px; color:'+(isPastDeadline?'var(--coral)':'var(--gold)')+';">'+(isPastDeadline?'⚠️ En retard — ':'⏰ ')+'À rendre avant le '+new Date(ex.deadline).toLocaleDateString('fr-FR')+'</p>' : '') +
    '<p style="margin:0 0 16px; font-size:13.5px; white-space:pre-line;">'+escapeHtml(ex.question)+'</p>';
  if(submission && submission.status === 'graded'){
    html += '<p style="margin:0 0 10px; font-size:16px; color:var(--gold); font-family:\'Baloo 2\'; font-weight:700;">Note : '+submission.score+'/20</p>' +
      (submission.feedback ? '<p style="margin:0 0 14px; font-size:13px; font-style:italic;">Commentaire du formateur : '+escapeHtml(submission.feedback)+'</p>' : '') +
      '<div class="eyebrow">📖 Corrigé</div>' +
      '<div class="card"><p style="margin:0; font-size:13px; white-space:pre-line;">'+escapeHtml(ex.correction)+'</p></div>';
  } else if(submission){
    html += '<p style="margin:0; font-size:13px; color:var(--gold);">⏳ Votre copie a été envoyée, en attente de correction.</p>' +
      '<div class="card" style="margin-top:10px;"><p style="margin:0; font-size:12.5px; color:rgba(245,239,227,0.6);">Votre réponse :</p><p style="margin:6px 0 0; font-size:13px; white-space:pre-line;">'+escapeHtml(submission.answer)+'</p></div>';
  } else {
    html += '<label style="margin-top:0;">Votre réponse</label>' +
      '<textarea id="exercise-answer-input" placeholder="Rédigez votre réponse..." style="min-height:120px;"></textarea>' +
      '<button class="btn btn-primary" style="margin-top:14px; width:100%;" onclick="submitExerciseAnswer(\''+exerciseId+'\')">Envoyer ma réponse</button>';
  }
  el.innerHTML = html;
  go('exercise-detail');
}
async function submitExerciseAnswer(exerciseId){
  const answer = document.getElementById('exercise-answer-input').value.trim();
  if(!answer){ showToast('Écrivez votre réponse avant d’envoyer'); return; }
  const c = await safeGet('course:' + currentManagedCourseId, true);
  await saveWithRetry('submission:' + exerciseId + '__' + currentUser, {
    exerciseId, courseId: currentManagedCourseId, studentUsername: currentUser, trainerUsername: c ? c.trainerUsername : null,
    answer, status: 'submitted', createdAt: new Date().toISOString()
  }, true);
  showToast('Réponse envoyée — en attente de correction ✓');
  await openExerciseDetail(exerciseId, currentManagedCourseId);
}
async function fetchLessonsForCourse(courseId){
  const keys = await safeList('lesson:' + courseId + '__', true);
  const list = [];
  for(const k of keys){ const l = await safeGet(k, true); if(l) list.push(l); }
  list.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  return list;
}

/* ---------- ESPACE FORMATEUR ---------- */
const SCHOOL_CLASS_OPTIONS = {
  'Collège': ['6ème', '5ème', '4ème', '3ème'],
  'Lycée': ['Seconde', 'Première', 'Terminale']
};
function updateCourseClassOptions(){
  const level = document.getElementById('new-course-level').value;
  const wrapper = document.getElementById('new-course-class-wrapper');
  const classSelect = document.getElementById('new-course-class');
  const options = SCHOOL_CLASS_OPTIONS[level];
  if(options){
    wrapper.style.display = 'block';
    classSelect.innerHTML = '<option value="">Toutes classes</option>' + options.map(c => '<option value="'+c+'">'+c+'</option>').join('');
  } else {
    wrapper.style.display = 'none';
    classSelect.innerHTML = '';
  }
}
async function createCourse(){
  const title = document.getElementById('new-course-title').value.trim();
  const desc = document.getElementById('new-course-desc').value.trim();
  const price = parseInt(document.getElementById('new-course-price').value, 10);
  const schoolLevel = document.getElementById('new-course-level').value;
  const schoolClass = document.getElementById('new-course-class') ? document.getElementById('new-course-class').value : '';
  const examTarget = document.getElementById('new-course-exam-target').value;
  if(!title || isNaN(price) || price <= 0){ showToast('Renseignez au moins un titre et un prix valide'); return; }
  const me = await safeGet('user:' + currentUser, true);
  const id = 'course_' + Date.now();
  const isInstantActive = !!(me && me.isAdminTrainer);
  await saveWithRetry('course:' + id, {
    id, trainerUsername: currentUser, title, description: desc, price, country: currentUserCountry,
    schoolLevel: schoolLevel || null, schoolClass: schoolClass || null, examTarget: examTarget || null,
    status: isInstantActive ? 'active' : 'pending_review', createdAt: new Date().toISOString()
  }, true);
  document.getElementById('new-course-title').value = '';
  document.getElementById('new-course-desc').value = '';
  document.getElementById('new-course-price').value = '';
  document.getElementById('new-course-level').value = '';
  document.getElementById('new-course-exam-target').value = '';
  updateCourseClassOptions();
  if(isInstantActive){
    await notifyFollowersOfNewCourse(currentUser, id, title);
    showToast('Cours publié ✓');
  } else {
    showToast('Cours envoyé pour validation avant publication ✓');
  }
  await renderTrainerDashboard();
}
async function updateTrainerPaymentNumber(){
  const number = document.getElementById('trainer-payment-update-input').value.trim();
  if(!number){ showToast('Entrez un numéro valide'); return; }
  const me = await safeGet('user:' + currentUser, true);
  if(!me) return;
  me.trainerPaymentNumber = number;
  await saveWithRetry('user:' + currentUser, me, true);
  document.getElementById('trainer-payment-update-input').value = '';
  showToast('Numéro mis à jour ✓');
}
async function renderTrainerStatsCard(allCourses){
  const statsEl = document.getElementById('trainer-stats-card');
  if(!statsEl) return;
  const myCourses = allCourses.filter(c => c.trainerUsername === currentUser);
  const activity = await computeTrainerActivity(currentUser);

  statsEl.innerHTML =
    '<p style="margin:0 0 4px; font-size:11px; color:var(--gold); text-transform:uppercase; letter-spacing:.04em;">📊 Mes statistiques</p>' +
    '<p style="margin:0 0 4px; font-size:13px;">👥 <strong>'+activity.activeStudentCount+'</strong> étudiant(s) actif(s)</p>' +
    '<p style="margin:0 0 4px; font-size:13px;">📚 <strong>'+myCourses.length+'</strong> cours</p>' +
    '<p style="margin:0 0 4px; font-size:14px; color:var(--gold); font-weight:700;">📢 <strong>'+activity.totalPublications+'</strong> publication(s) au total</p>' +
    '<p style="margin:0 0 8px; font-size:11.5px; color:rgba(245,239,227,0.55);">'+activity.lessonCount+' leçon(s) · '+activity.videoCount+' vidéo(s) · '+activity.exerciseCount+' exercice(s) · '+activity.quizCount+' QCM</p>' +
    '<p style="margin:8px 0 0; font-size:11px; color:rgba(245,239,227,0.4);">Les montants des paiements sont gérés uniquement par l’administration.</p>';
}
async function renderTrainerDashboard(){
  if(!(await requireEducationSubscription())) return;
  const el = document.getElementById('trainer-courses-list');
  if(!el) return;
  const allCourses = await fetchCourses(true);
  await renderTrainerStatsCard(allCourses);
  await renderTrainerMissedConferencesStat();
  await renderTrainerGrowthChart();
  await renderTrainerConferences();
  const myCourses = allCourses.filter(c => c.trainerUsername === currentUser || (Array.isArray(c.coTrainers) && c.coTrainers.includes(currentUser)));
  const statusLabels = { pending_review: '⏳ En attente de validation', active: '🟢 Publié', suspended: '⏸ Suspendu' };
  if(myCourses.length === 0){ el.innerHTML = '<div class="empty">Aucun cours pour l’instant.</div>'; return; }
  el.innerHTML = myCourses.map(c =>
    '<div class="card" style="cursor:pointer;" onclick="openManageCourse(\''+c.id+'\')">' +
    '<p style="margin:0 0 4px; font-size:13.5px; font-weight:600;">'+escapeHtml(c.title)+(c.schoolLevel ? ' · '+escapeHtml(c.schoolLevel)+(c.schoolClass ? ' ('+escapeHtml(c.schoolClass)+')' : '') : '')+'</p>' +
    '<p style="margin:0; font-size:12px; color:rgba(245,239,227,0.55);">'+(statusLabels[c.status]||c.status)+' · '+c.price.toLocaleString('fr-FR')+' FCFA</p>' +
    '</div>'
  ).join('');
  await renderTrainerAllStudentsList(myCourses);
}
/* ---------- LISTE COMPLÈTE DES ÉLÈVES AVEC NOTES (PDF / EXCEL) ---------- */
async function buildStudentsReportRows(coursesOverride){
  let myCourses;
  if(coursesOverride){
    myCourses = coursesOverride;
  } else {
    const allCourses = await fetchCourses(true);
    myCourses = allCourses.filter(c => c.trainerUsername === currentUser || (Array.isArray(c.coTrainers) && c.coTrainers.includes(currentUser)));
  }
  const rows = [];
  for(const c of myCourses){
    const enrollKeys = await safeList('enrollment:' + c.id + '__', true);
    const exercises = await fetchExercisesForCourse(c.id);
    const fullExams = await fetchFullExams(c.id);
    for(const k of enrollKeys){
      const e = await safeGet(k, true);
      if(!e || e.status !== 'approved') continue;
      const grades = [];
      for(const ex of exercises){
        const sub = await safeGet('submission:' + ex.id + '__' + e.studentUsername, true);
        if(sub && sub.status === 'graded' && typeof sub.score === 'number') grades.push(sub.score);
      }
      const examResultKeys = await safeList('examresult:' + c.id + '__' + e.studentUsername + '__', true);
      for(const rk of examResultKeys){
        const r = await safeGet(rk, true);
        if(r && typeof r.score === 'number') grades.push(r.score);
      }
      for(const fe of fullExams){
        const fsub = await safeGet('fullexamsubmission:' + fe.id + '__' + e.studentUsername, true);
        if(fsub && fsub.status === 'graded' && typeof fsub.totalScore === 'number') grades.push(fsub.totalScore);
      }
      const average = grades.length > 0 ? (grades.reduce((s,g) => s+g, 0) / grades.length).toFixed(1) : null;
      const niveau = c.schoolLevel ? (c.schoolClass ? c.schoolLevel + ' — ' + c.schoolClass : c.schoolLevel) : '—';
      rows.push({ student: e.studentUsername, niveau, course: c.title, trainer: c.trainerUsername, gradesCount: grades.length, average });
    }
  }
  rows.sort((a,b) => a.student.localeCompare(b.student));
  return rows;
}
let currentStudentsReportCourses = null; // null = propres cours du formateur connecté ; tableau = liste explicite (mode admin)
let currentStudentsReportIsAdmin = false;
async function openStudentsReport(){
  currentStudentsReportCourses = null;
  currentStudentsReportIsAdmin = false;
  go('students-report');
  const el = document.getElementById('students-report-content');
  el.innerHTML = '<p style="font-size:13px; color:rgba(245,239,227,0.5);">Chargement...</p>';
  const rows = await buildStudentsReportRows();
  const now = new Date().toLocaleDateString('fr-FR');
  if(rows.length === 0){ el.innerHTML = '<div class="empty">Aucun élève inscrit pour l’instant.</div>'; return; }
  el.innerHTML =
    '<div style="text-align:center; margin-bottom:16px;">' +
    '<p style="margin:0; font-size:11px; color:rgba(245,239,227,0.5);">SUKTUM — Espace Éducation</p>' +
    '<h2 style="margin:6px 0 4px; font-size:18px; font-family:\'Baloo 2\';">Liste des élèves et notes</h2>' +
    '<p style="margin:0; font-size:11.5px; color:rgba(245,239,227,0.5);">@'+escapeHtml(currentUser)+' · Édité le '+now+' · '+rows.length+' inscription(s)</p>' +
    '</div>' +
    rows.map(r =>
      '<div class="card" style="margin-bottom:8px;">' +
      '<p style="margin:0 0 4px; font-size:13px; font-weight:600;">@'+escapeHtml(r.student)+'</p>' +
      '<p style="margin:0 0 2px; font-size:12px;">Cours : '+escapeHtml(r.course)+'</p>' +
      '<p style="margin:0 0 2px; font-size:12px;">Niveau : '+escapeHtml(r.niveau)+'</p>' +
      '<p style="margin:0; font-size:12px;">Moyenne : '+(r.average !== null ? r.average+'/20 ('+r.gradesCount+' note(s))' : 'Aucune note pour l’instant')+'</p>' +
      '</div>'
    ).join('');
}
async function openStudentsReportAdmin(){
  const allCourses = await fetchCourses(true);
  const scopedCourses = adminScope === 'all' ? allCourses : allCourses.filter(c => c.country === adminScope);
  currentStudentsReportCourses = scopedCourses;
  currentStudentsReportIsAdmin = true;
  go('students-report');
  const el = document.getElementById('students-report-content');
  el.innerHTML = '<p style="font-size:13px; color:rgba(245,239,227,0.5);">Chargement...</p>';
  const rows = await buildStudentsReportRows(scopedCourses);
  const now = new Date().toLocaleDateString('fr-FR');
  if(rows.length === 0){ el.innerHTML = '<div class="empty">Aucun élève inscrit pour l’instant.</div>'; return; }
  el.innerHTML =
    '<div style="text-align:center; margin-bottom:16px;">' +
    '<p style="margin:0; font-size:11px; color:rgba(245,239,227,0.5);">SUKTUM — Espace Éducation</p>' +
    '<h2 style="margin:6px 0 4px; font-size:18px; font-family:\'Baloo 2\';">Liste des élèves et notes — tous formateurs</h2>' +
    '<p style="margin:0; font-size:11.5px; color:rgba(245,239,227,0.5);">'+(adminScope === 'all' ? 'Tous pays' : escapeHtml(adminScope))+' · Édité le '+now+' · '+rows.length+' inscription(s)</p>' +
    '</div>' +
    rows.map(r =>
      '<div class="card" style="margin-bottom:8px;">' +
      '<p style="margin:0 0 4px; font-size:13px; font-weight:600;">@'+escapeHtml(r.student)+'</p>' +
      '<p style="margin:0 0 2px; font-size:12px;">Formateur : @'+escapeHtml(r.trainer)+'</p>' +
      '<p style="margin:0 0 2px; font-size:12px;">Cours : '+escapeHtml(r.course)+'</p>' +
      '<p style="margin:0 0 2px; font-size:12px;">Niveau : '+escapeHtml(r.niveau)+'</p>' +
      '<p style="margin:0; font-size:12px;">Moyenne : '+(r.average !== null ? r.average+'/20 ('+r.gradesCount+' note(s))' : 'Aucune note pour l’instant')+'</p>' +
      '</div>'
    ).join('');
}
function csvEscapeField(value){
  const str = String(value === null || value === undefined ? '' : value);
  if(/[",\n;]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}
async function downloadStudentsReportExcel(){
  const rows = await buildStudentsReportRows(currentStudentsReportCourses);
  if(rows.length === 0){ showToast('Aucun élève à exporter'); return; }
  const header = currentStudentsReportIsAdmin
    ? ['Élève', 'Formateur', 'Niveau', 'Cours', 'Nombre de notes', 'Moyenne sur 20']
    : ['Élève', 'Niveau', 'Cours', 'Nombre de notes', 'Moyenne sur 20'];
  const lines = [header.map(csvEscapeField).join(';')];
  rows.forEach(r => {
    const fields = currentStudentsReportIsAdmin
      ? [r.student, r.trainer, r.niveau, r.course, r.gradesCount, r.average !== null ? r.average : '']
      : [r.student, r.niveau, r.course, r.gradesCount, r.average !== null ? r.average : ''];
    lines.push(fields.map(csvEscapeField).join(';'));
  });
  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'suktum-eleves-notes-' + new Date().toISOString().slice(0,10) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Fichier téléchargé ✓ — s’ouvre directement dans Excel');
}
async function renderTrainerAllStudentsList(myCourses){
  const el = document.getElementById('trainer-all-students-list');
  if(!el) return;
  const studentCourses = {}; // username -> [titres de cours]
  for(const c of myCourses){
    const keys = await safeList('enrollment:' + c.id + '__', true);
    for(const k of keys){
      const e = await safeGet(k, true);
      if(e && e.status === 'approved'){
        if(!studentCourses[e.studentUsername]) studentCourses[e.studentUsername] = [];
        studentCourses[e.studentUsername].push(c.title);
      }
    }
  }
  const usernames = Object.keys(studentCourses).sort();
  if(usernames.length === 0){ el.innerHTML = '<div class="empty">Aucun étudiant inscrit pour l’instant.</div>'; return; }
  el.innerHTML = usernames.map(u =>
    '<div class="card" style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="openUserProfile(\''+escapeHtml(u)+'\')">' + smallAvatarBadge(u, 30) +
    '<div style="flex:1;"><strong style="font-size:13px;">@'+escapeHtml(u)+'</strong>' +
    '<p style="margin:2px 0 0; font-size:11.5px; color:rgba(245,239,227,0.55);">'+studentCourses[u].map(escapeHtml).join(', ')+'</p></div>' +
    '</div>'
  ).join('');
}
let currentManagedCourseId = null;
async function openManageCourse(courseId){
  currentManagedCourseId = courseId;
  const c = await safeGet('course:' + courseId, true);
  const isCoTrainer = c && Array.isArray(c.coTrainers) && c.coTrainers.includes(currentUser);
  const isActiveSubstitute = c && c.substituteTrainer === currentUser && c.substituteEndDate && new Date(c.substituteEndDate) >= new Date();
  if(!c || (c.trainerUsername !== currentUser && !isCoTrainer && !isActiveSubstitute)){ showToast('Cours introuvable'); return; }
  document.getElementById('manage-course-title').textContent = c.title + (c.trainerUsername !== currentUser ? (isActiveSubstitute ? ' (remplacement)' : ' (co-enseigné)') : '');
  const minAvgInput = document.getElementById('cert-min-average');
  const minAttInput = document.getElementById('cert-min-attendance');
  if(minAvgInput) minAvgInput.value = (c.certMinAverage !== undefined && c.certMinAverage !== null) ? c.certMinAverage : '';
  if(minAttInput) minAttInput.value = (c.certMinAttendance !== undefined && c.certMinAttendance !== null) ? c.certMinAttendance : '';
  go('manage-course');
  await renderManageCourseLessons();
  await renderManageCourseVideos();
  await renderManageCoursePodcasts();
  await loadCourseSchedule();
  await renderCoTrainerManager();
  await renderSubstituteCard();
  await renderLessonTemplateOptions();
  await renderManageCourseExercises();
  await populateExamStudentSelect();
  await renderManageCourseExamResults();
  await renderManageCourseContests();
  await renderManageCourseStudents();
  await renderCourseAttritionHistory(currentManagedCourseId);
  await loadLiveDocEditor();
  stopManageCourseChatPolling();
  await renderManageCourseChat();
  manageCourseChatPollInterval = setInterval(renderManageCourseChat, 4000);
  await renderManageCourseFaq();
  await renderManageCourseQuizzes();
  await renderManageCourseWorkGroups();
  await renderManageCourseChallenge();
  renderExamBuilderQuestionsList();
  await renderManageCourseFullExams();
  await renderManageCourseLateStudents();
  await populateBadgeStudentSelect();
  await renderManageCourseBadges();
}
async function loadLiveDocEditor(){
  const doc = await safeGet('livedoc:' + currentManagedCourseId, true);
  document.getElementById('live-doc-editor').value = (doc && doc.content) || '';
  const statusEl = document.getElementById('live-doc-status');
  statusEl.textContent = doc && doc.updatedAt ? 'Dernière publication : ' + new Date(doc.updatedAt).toLocaleTimeString('fr-FR') : '';
}
async function publishLiveDoc(){
  const content = document.getElementById('live-doc-editor').value;
  await saveWithRetry('livedoc:' + currentManagedCourseId, { content, updatedAt: new Date().toISOString() }, true);
  document.getElementById('live-doc-status').textContent = 'Publié à ' + new Date().toLocaleTimeString('fr-FR');
  showToast('Document publié — vos élèves le voient maintenant ✓');
}

/* ---------- DOCUMENT EN DIRECT — VUE ÉTUDIANT ---------- */
/* ---------- CHAT PUBLIC DU COURS ---------- */
let courseChatPollInterval = null;
let manageCourseChatPollInterval = null;
function stopCourseChatPolling(){
  if(courseChatPollInterval){ clearInterval(courseChatPollInterval); courseChatPollInterval = null; }
}
function stopManageCourseChatPolling(){
  if(manageCourseChatPollInterval){ clearInterval(manageCourseChatPollInterval); manageCourseChatPollInterval = null; }
}
/* ---------- FAQ DU COURS ---------- */
/* ---------- AVIS ET NOTES DES FORMATEURS ---------- */
async function fetchTrainerRatings(trainerUsername){
  const keys = await safeList('trainerrating:' + trainerUsername + '__', true);
  const list = [];
  for(const k of keys){ const r = await safeGet(k, true); if(r) list.push(r); }
  return list;
}
async function computeTrainerRatingAverage(trainerUsername){
  const ratings = await fetchTrainerRatings(trainerUsername);
  if(ratings.length === 0) return null;
  const avg = ratings.reduce((s,r) => s + r.stars, 0) / ratings.length;
  return { average: avg, count: ratings.length };
}
async function renderCourseRatingSection(courseId, trainerUsername){
  const el = document.getElementById('course-rating-section');
  if(!el) return;
  const existing = await safeGet('trainerrating:' + trainerUsername + '__' + currentUser, true);
  if(existing){
    el.innerHTML = '<div class="card"><p style="margin:0 0 4px; font-size:13px;">Votre note : '+'⭐'.repeat(existing.stars)+'</p>' +
      (existing.comment ? '<p style="margin:0; font-size:12.5px; color:rgba(245,239,227,0.6); font-style:italic;">'+escapeHtml(existing.comment)+'</p>' : '') +
      '</div>';
    return;
  }
  el.innerHTML = '<div class="card">' +
    '<div id="rating-stars-picker" style="display:flex; gap:6px; margin-bottom:10px; font-size:24px;">' +
    [1,2,3,4,5].map(n => '<span data-star="'+n+'" onclick="selectRatingStar('+n+')" style="cursor:pointer; opacity:0.35;">⭐</span>').join('') +
    '</div>' +
    '<textarea id="rating-comment-input" placeholder="Un commentaire (optionnel)..."></textarea>' +
    '<button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="submitTrainerRating(\''+escapeHtml(trainerUsername)+'\', \''+courseId+'\')">Envoyer ma note</button>' +
    '</div>';
}
let selectedRatingStars = 0;
function selectRatingStar(n){
  selectedRatingStars = n;
  document.querySelectorAll('#rating-stars-picker span').forEach(s => {
    s.style.opacity = parseInt(s.dataset.star, 10) <= n ? '1' : '0.35';
  });
}
async function submitTrainerRating(trainerUsername, courseId){
  if(selectedRatingStars === 0){ showToast('Choisissez au moins une étoile'); return; }
  const comment = document.getElementById('rating-comment-input').value.trim();
  await saveWithRetry('trainerrating:' + trainerUsername + '__' + currentUser, {
    trainerUsername, studentUsername: currentUser, courseId, stars: selectedRatingStars, comment, createdAt: new Date().toISOString()
  }, true);
  showToast('Merci pour votre avis ✓');
  selectedRatingStars = 0;
  await renderCourseRatingSection(courseId, trainerUsername);
}
/* ---------- BADGES DÉCERNÉS PAR LE FORMATEUR ---------- */
async function populateBadgeStudentSelect(){
  const sel = document.getElementById('new-badge-student');
  if(!sel) return;
  const keys = await safeList('enrollment:' + currentManagedCourseId + '__', true);
  const students = [];
  for(const k of keys){ const e = await safeGet(k, true); if(e && e.status === 'approved') students.push(e.studentUsername); }
  sel.innerHTML = students.length === 0 ? '<option value="">Aucun élève inscrit</option>' : students.map(u => '<option value="'+escapeHtml(u)+'">@'+escapeHtml(u)+'</option>').join('');
}
async function awardStudentBadge(){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function fetchStudentBadges(courseId, studentUsername){
  const keys = await safeList('badge:' + courseId + '__' + studentUsername + '__', true);
  const list = [];
  for(const k of keys){ const b = await safeGet(k, true); if(b) list.push(b); }
  list.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  return list;
}
async function renderManageCourseBadges(){
  const el = document.getElementById('manage-course-badges-list');
  if(!el) return;
  const keys = await safeList('badge:' + currentManagedCourseId + '__', true);
  const badges = [];
  for(const k of keys){ const b = await safeGet(k, true); if(b) badges.push(b); }
  badges.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  if(badges.length === 0){ el.innerHTML = '<div class="empty">Aucun badge décerné pour l’instant.</div>'; return; }
  el.innerHTML = badges.map(b =>
    '<div class="card"><p style="margin:0 0 4px; font-size:13px;">'+escapeHtml(b.badgeName)+' → @'+escapeHtml(b.studentUsername)+'</p>' +
    (b.message ? '<p style="margin:0; font-size:12px; color:rgba(245,239,227,0.6); font-style:italic;">'+escapeHtml(b.message)+'</p>' : '') +
    '</div>'
  ).join('');
}
/* ---------- EXAMEN COMPLET (PLUSIEURS QUESTIONS, TOUS TYPES) ---------- */
let currentGradingExamId = null;
async function openFullExamSubmissions(examId){
  currentGradingExamId = examId;
  go('grade-full-exam');
  const keys = await safeList('fullexam:', true);
  let exam = null;
  for(const k of keys){ const e = await safeGet(k, true); if(e && e.id === examId){ exam = e; break; } }
  if(!exam){ showToast('Examen introuvable'); return; }
  document.getElementById('grade-exam-title').textContent = exam.title;
  const enrollmentKeys = await safeList('enrollment:', true);
  const students = [];
  for(const k of enrollmentKeys){
    const e = await safeGet(k, true);
    if(e && e.courseId === exam.courseId && e.status === 'approved') students.push(e.studentUsername);
  }
  const el = document.getElementById('grade-exam-submissions');
  const parts = [];
  for(const student of students){
    const sub = await safeGet('fullexamsubmission:' + examId + '__' + student, true);
    if(!sub) continue;
    let qcmAutoScore = 0, qcmCount = 0;
    exam.questions.forEach((q, i) => {
      if(q.type === 'qcm'){
        qcmCount++;
        if(sub.answers[i] && sub.answers[i].selectedIndex === q.correctIndex) qcmAutoScore++;
      }
    });
    parts.push('<div class="card"><p style="margin:0 0 8px; font-size:13px; font-weight:600;">@'+escapeHtml(student)+'</p>' +
      (qcmCount > 0 ? '<p style="margin:0 0 8px; font-size:12px; color:var(--lagoon);">✓ QCM auto-corrigés : '+qcmAutoScore+'/'+qcmCount+' bonnes réponses</p>' : '') +
      exam.questions.map((q, i) => q.type === 'open'
        ? '<div style="margin-bottom:10px; padding:8px; background:rgba(245,239,227,0.05); border-radius:8px;">' +
          '<p style="margin:0 0 4px; font-size:11.5px; color:rgba(245,239,227,0.5);">Q'+(i+1)+'. '+escapeHtml(q.question)+'</p>' +
          '<p style="margin:0 0 8px; font-size:13px;">'+escapeHtml(sub.answers[i].text)+'</p>' +
          (sub.status !== 'graded' ? '<button class="btn btn-outline btn-sm" onclick="suggestFullExamAnswer(\''+examId+'\', \''+escapeHtml(student)+'\', '+i+')">🧠 Suggestion IA</button><div id="examq-suggestion-'+examId+'-'+escapeHtml(student)+'-'+i+'" style="margin-top:6px; font-size:11.5px; color:var(--gold);"></div>' : '') +
          '</div>'
        : ''
      ).join('') +
      (sub.status === 'graded'
        ? '<p style="margin:0; font-size:13px; color:var(--lagoon); font-weight:600;">✓ Note finale : '+sub.totalScore+'/20</p>'
        : '<label style="margin-top:0;">Note finale sur 20</label><input type="number" min="0" max="20" id="examfinal-'+examId+'-'+escapeHtml(student)+'" placeholder="Ex : 14"><button class="btn btn-primary btn-sm" style="margin-top:8px;" onclick="submitFullExamGrade(\''+examId+'\', \''+escapeHtml(student)+'\')">Valider la note finale</button>') +
      '</div>');
  }
  el.innerHTML = parts.length === 0 ? '<div class="empty">Aucune copie reçue pour l’instant.</div>' : parts.join('');
}
async function suggestFullExamAnswer(examId, student, questionIndex){
  const el = document.getElementById('examq-suggestion-' + examId + '-' + student + '-' + questionIndex);
  const keys = await safeList('fullexam:', true);
  let exam = null;
  for(const k of keys){ const e = await safeGet(k, true); if(e && e.id === examId){ exam = e; break; } }
  const sub = await safeGet('fullexamsubmission:' + examId + '__' + student, true);
  if(!exam || !sub || !el) return;
  el.textContent = '⏳ Analyse en cours...';
  try{
    const prompt = "Tu aides un formateur à évaluer la réponse d'un élève à une question ouverte (dissertation, cas pratique, calcul...). Voici la question et la réponse :\n\n" +
      "QUESTION : " + exam.questions[questionIndex].question + "\n\nRÉPONSE DE L'ÉLÈVE : " + sub.answers[questionIndex].text +
      "\n\nDonne un avis bref (2-3 phrases) sur la qualité de cette réponse pour aider le formateur à noter, sans donner de note chiffrée toi-même.";
    const feedback = await callAIProvider(prompt, 250, await getGovernanceAIProvider());
    el.textContent = feedback ? '🧠 ' + feedback : 'Suggestion indisponible.';
  }catch(e){
    el.textContent = 'Suggestion indisponible (connexion).';
  }
}
async function submitFullExamGrade(examId, student){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
let examBuilderQuestions = [];
function toggleExamQuestionTypeFields(){
  const type = document.getElementById('exam-q-type').value;
  document.getElementById('exam-q-qcm-fields').style.display = type === 'qcm' ? 'block' : 'none';
}
function addQuestionToExamBuilder(){
  const type = document.getElementById('exam-q-type').value;
  const question = document.getElementById('exam-q-text').value.trim();
  if(!question){ showToast('Écrivez l’énoncé de la question'); return; }
  if(type === 'qcm'){
    const options = [0,1,2,3].map(i => document.getElementById('exam-q-option-'+i).value.trim()).filter(Boolean);
    if(options.length < 2){ showToast('Renseignez au moins 2 options pour un QCM'); return; }
    const correctIndex = parseInt(document.getElementById('exam-q-correct').value, 10);
    if(correctIndex >= options.length){ showToast('La bonne réponse choisie n’a pas de texte renseigné'); return; }
    examBuilderQuestions.push({ type: 'qcm', question, options, correctIndex });
  } else {
    examBuilderQuestions.push({ type: 'open', question });
  }
  document.getElementById('exam-q-text').value = '';
  [0,1,2,3].forEach(i => { document.getElementById('exam-q-option-'+i).value = ''; });
  renderExamBuilderQuestionsList();
  showToast('Question ajoutée à l’examen ✓');
}
function removeQuestionFromExamBuilder(index){
  examBuilderQuestions.splice(index, 1);
  renderExamBuilderQuestionsList();
}
function renderExamBuilderQuestionsList(){
  const el = document.getElementById('exam-builder-questions-list');
  if(!el) return;
  el.innerHTML = examBuilderQuestions.length === 0 ? '<p style="font-size:11.5px; color:rgba(245,239,227,0.4); margin:0;">Aucune question ajoutée pour l’instant.</p>' : examBuilderQuestions.map((q, i) =>
    '<div class="card" style="padding:8px 12px; margin-bottom:6px;"><p style="margin:0; font-size:12px;">'+(i+1)+'. ['+(q.type==='qcm'?'QCM':'Réponse libre')+'] '+escapeHtml(q.question.slice(0,60))+(q.question.length>60?'...':'')+' <span onclick="removeQuestionFromExamBuilder('+i+')" style="color:var(--coral); cursor:pointer; float:right;">🗑️</span></p></div>'
  ).join('');
}
async function publishFullExam(){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function renderFullExamsListForStudent(fullExams){
  const parts = [];
  for(const ex of fullExams){
    const submission = await safeGet('fullexamsubmission:' + ex.id + '__' + currentUser, true);
    parts.push(
      '<div class="card"><p style="margin:0 0 4px; font-size:13px; font-weight:600;">'+escapeHtml(ex.title)+'</p>' +
      (ex.description ? '<p style="margin:0 0 8px; font-size:12px; color:rgba(245,239,227,0.6);">'+escapeHtml(ex.description)+'</p>' : '') +
      '<p style="margin:0 0 10px; font-size:11.5px; color:rgba(245,239,227,0.5);">'+ex.questions.length+' question(s)</p>' +
      (submission
        ? (submission.status === 'graded'
          ? '<p style="margin:0; font-size:12.5px; color:var(--lagoon);">✓ Corrigé — note : '+submission.totalScore+'/20</p>'
          : '<p style="margin:0; font-size:12.5px; color:var(--gold);">⏳ Copie envoyée, en attente de correction</p>')
        : '<button class="btn btn-primary btn-sm" onclick="openTakeFullExam(\''+ex.id+'\')">Passer l’examen</button>') +
      '</div>'
    );
  }
  return parts.join('');
}
let currentTakeExamId = null;
async function openTakeFullExam(examId){
  const keys = await safeList('fullexam:', true);
  let exam = null;
  for(const k of keys){ const e = await safeGet(k, true); if(e && e.id === examId){ exam = e; break; } }
  if(!exam){ showToast('Examen introuvable'); return; }
  currentTakeExamId = examId;
  go('take-full-exam');
  setExamLockMode(true);
  document.getElementById('take-exam-title').textContent = exam.title;
  document.getElementById('take-exam-desc').textContent = exam.description || '';
  document.getElementById('take-exam-questions').innerHTML = exam.questions.map((q, i) =>
    '<div class="card" style="margin-bottom:10px;"><p style="margin:0 0 8px; font-size:13px;">'+(i+1)+'. '+escapeHtml(q.question)+'</p>' +
    (q.type === 'qcm'
      ? q.options.map((opt, oi) => '<label style="display:flex; align-items:center; gap:8px; margin-bottom:6px; font-size:13px;"><input type="radio" name="exam-answer-'+i+'" value="'+oi+'" style="width:auto;">'+escapeHtml(opt)+'</label>').join('')
      : '<textarea id="exam-answer-'+i+'" placeholder="Votre réponse..." style="min-height:80px;"></textarea>') +
    '</div>'
  ).join('');
}
async function submitFullExam(){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function fetchFullExams(courseId){
  const keys = await safeList('fullexam:' + courseId + '__', true);
  const list = [];
  for(const k of keys){ const e = await safeGet(k, true); if(e) list.push(e); }
  list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return list;
}
async function renderManageCourseFullExams(){
  const el = document.getElementById('manage-course-full-exams-list');
  if(!el) return;
  const exams = await fetchFullExams(currentManagedCourseId);
  if(exams.length === 0){ el.innerHTML = ''; return; }
  el.innerHTML = '<div class="eyebrow">Examens publiés</div>' + exams.map(ex =>
    '<div class="card"><p style="margin:0 0 6px; font-size:13px; font-weight:600;">'+escapeHtml(ex.title)+'</p>' +
    '<p style="margin:0 0 8px; font-size:11.5px; color:rgba(245,239,227,0.5);">'+ex.questions.length+' question(s)</p>' +
    '<button class="btn btn-outline btn-sm" onclick="openFullExamSubmissions(\''+ex.id+'\')">📋 Voir les copies</button></div>'
  ).join('');
}
/* ---------- QCM / QUIZ AUTO-CORRIGÉ ---------- */
async function createCourseQuiz(){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function fetchCourseQuizzes(courseId){
  const keys = await safeList('quiz:' + courseId + '__', true);
  const list = [];
  for(const k of keys){ const q = await safeGet(k, true); if(q) list.push(q); }
  list.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  return list;
}
async function renderManageCourseQuizzes(){
  const el = document.getElementById('manage-course-quizzes-list');
  if(!el) return;
  const quizzes = await fetchCourseQuizzes(currentManagedCourseId);
  if(quizzes.length === 0){ el.innerHTML = '<div class="empty">Aucun QCM pour l’instant.</div>'; return; }
  el.innerHTML = quizzes.map(q =>
    '<div class="card"><p style="margin:0 0 4px; font-size:13px; font-weight:600;">'+escapeHtml(q.title)+'</p>' +
    '<p style="margin:0; font-size:12px; color:rgba(245,239,227,0.6);">Bonne réponse : '+escapeHtml(q.options[q.correctIndex])+'</p></div>'
  ).join('');
}
async function openCourseQuiz(quizId, courseId){
  if(!(await requireEducationSubscription())) return;
  go('course-quiz');
  const el = document.getElementById('course-quiz-content');
  const quizzes = await fetchCourseQuizzes(courseId);
  const q = quizzes.find(x => x.id === quizId);
  if(!q){ el.innerHTML = '<div class="empty">Quiz introuvable.</div>'; return; }
  const existing = await safeGet('quizsubmission:' + quizId + '__' + currentUser, true);
  const letters = ['A','B','C','D'];
  if(existing){
    el.innerHTML =
      '<p style="margin:0 0 16px; font-size:14px; font-weight:600;">'+escapeHtml(q.question)+'</p>' +
      q.options.map((opt, i) => {
        const isCorrect = i === q.correctIndex;
        const wasSelected = i === existing.selectedIndex;
        const color = isCorrect ? 'var(--lagoon)' : (wasSelected ? 'var(--coral)' : 'var(--line)');
        return '<div style="border:1px solid '+color+'; border-radius:10px; padding:10px 12px; margin-bottom:8px; font-size:13px;">'+letters[i]+'. '+escapeHtml(opt)+(isCorrect ? ' ✓' : (wasSelected ? ' ✕' : ''))+'</div>';
      }).join('') +
      '<p style="margin:12px 0 0; font-size:14px; color:'+(existing.correct?'var(--lagoon)':'var(--coral)')+'; font-weight:700;">'+(existing.correct ? '✓ Bonne réponse !' : '✕ Réponse incorrecte')+'</p>';
  } else {
    el.innerHTML =
      '<p style="margin:0 0 16px; font-size:14px; font-weight:600;">'+escapeHtml(q.question)+'</p>' +
      q.options.map((opt, i) =>
        '<button class="btn btn-outline" style="width:100%; margin-bottom:8px; text-align:left;" onclick="submitQuizAnswer(\''+quizId+'\', \''+courseId+'\', '+i+')">'+letters[i]+'. '+escapeHtml(opt)+'</button>'
      ).join('');
  }
}
async function submitQuizAnswer(quizId, courseId, selectedIndex){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function fetchCourseFaq(courseId){
  return (await safeGet('coursefaq:' + courseId, true)) || [];
}
async function addCourseFaqItem(){
  const question = document.getElementById('new-faq-question').value.trim();
  const answer = document.getElementById('new-faq-answer').value.trim();
  if(!question || !answer){ showToast('Renseignez la question et la réponse'); return; }
  const faq = await fetchCourseFaq(currentManagedCourseId);
  faq.push({ question, answer, createdAt: new Date().toISOString() });
  await saveWithRetry('coursefaq:' + currentManagedCourseId, faq, true);
  document.getElementById('new-faq-question').value = '';
  document.getElementById('new-faq-answer').value = '';
  showToast('Ajouté à la FAQ ✓');
  await renderManageCourseFaq();
}
async function removeCourseFaqItem(index){
  const faq = await fetchCourseFaq(currentManagedCourseId);
  faq.splice(index, 1);
  await saveWithRetry('coursefaq:' + currentManagedCourseId, faq, true);
  await renderManageCourseFaq();
}
async function renderManageCourseFaq(){
  const el = document.getElementById('manage-course-faq-list');
  if(!el) return;
  const faq = await fetchCourseFaq(currentManagedCourseId);
  if(faq.length === 0){ el.innerHTML = '<div class="empty">Aucune question ajoutée pour l’instant.</div>'; return; }
  el.innerHTML = faq.map((f, i) =>
    '<div class="card"><p style="margin:0 0 6px; font-size:13px; font-weight:600;">'+escapeHtml(f.question)+'</p>' +
    '<p style="margin:0 0 8px; font-size:12.5px; color:rgba(245,239,227,0.7);">'+escapeHtml(f.answer)+'</p>' +
    '<button class="btn btn-outline btn-sm" onclick="removeCourseFaqItem('+i+')">Retirer</button></div>'
  ).join('');
}
/* ---------- DISCUSSION ENTRE ÉLÈVES (SANS LE FORMATEUR) ---------- */
let currentGroupChatCourseId = null;
let courseGroupChatPollInterval = null;
let currentCourseNotesCourseId = null;
async function openCourseSharedNotes(courseId){
  const enrollment = await safeGet('enrollment:' + courseId + '__' + currentUser, true);
  if(!enrollment || enrollment.status !== 'approved'){ showToast('Réservé aux élèves inscrits à ce cours'); return; }
  const c = await safeGet('course:' + courseId, true);
  if(c && c.trainerUsername === currentUser){ showToast('Cet espace est réservé aux élèves, sans le formateur'); return; }
  currentCourseNotesCourseId = courseId;
  go('course-shared-notes');
  const notes = await safeGet('coursenotes:' + courseId, true);
  document.getElementById('course-shared-notes-content').value = notes ? notes.content : '';
  document.getElementById('course-shared-notes-lastedit').textContent = notes && notes.lastEditedBy
    ? 'Dernière modification par @' + notes.lastEditedBy + ' le ' + new Date(notes.lastEditedAt).toLocaleString('fr-FR')
    : 'Aucune note enregistrée pour l’instant — soyez le premier à contribuer.';
}
async function saveCourseSharedNotes(){
  if(!currentCourseNotesCourseId) return;
  const content = document.getElementById('course-shared-notes-content').value;
  const previous = await safeGet('coursenotes:' + currentCourseNotesCourseId, true);
  if(previous && previous.content && previous.content.trim()){
    const versionId = currentCourseNotesCourseId + '__' + Date.now();
    await saveWithRetry('coursenotesversion:' + versionId, {
      courseId: currentCourseNotesCourseId, content: previous.content,
      editedBy: previous.lastEditedBy, editedAt: previous.lastEditedAt
    }, true);
  }
  await saveWithRetry('coursenotes:' + currentCourseNotesCourseId, {
    content, lastEditedBy: currentUser, lastEditedAt: new Date().toISOString()
  }, true);
  showToast('Notes enregistrées ✓');
  document.getElementById('course-shared-notes-lastedit').textContent = 'Dernière modification par @' + currentUser + ' le ' + new Date().toLocaleString('fr-FR');
  const students = await fetchApprovedStudentsForCourse(currentCourseNotesCourseId);
  for(const s of students){
    if(s !== currentUser) await createNotification(s, 'course_notes_updated', currentUser, currentCourseNotesCourseId, null);
  }
}
function exportCourseNotes(){
  if(!currentCourseNotesCourseId) return;
  const content = document.getElementById('course-shared-notes-content').value;
  if(!content.trim()){ showToast('Aucune note à exporter pour l’instant'); return; }
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'notes-cours-suktum-' + currentCourseNotesCourseId + '-' + new Date().toISOString().slice(0,10) + '.txt';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Notes téléchargées ✓');
}
async function openCourseNotesHistory(){
  if(!currentCourseNotesCourseId) return;
  go('course-notes-history');
  const keys = await safeList('coursenotesversion:' + currentCourseNotesCourseId + '__', true);
  const versions = [];
  for(const k of keys){ const v = await safeGet(k, true); if(v) versions.push(v); }
  versions.sort((a,b) => new Date(b.editedAt) - new Date(a.editedAt));
  const el = document.getElementById('course-notes-history-list');
  if(versions.length === 0){ el.innerHTML = '<div class="empty">Aucune version antérieure — c’est la toute première contribution.</div>'; return; }
  el.innerHTML = versions.map((v, i) =>
    '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 6px; font-size:12px; color:var(--gold);">Par @'+escapeHtml(v.editedBy)+' le '+new Date(v.editedAt).toLocaleString('fr-FR')+'</p>' +
    '<p style="margin:0 0 8px; font-size:12.5px; white-space:pre-wrap; max-height:120px; overflow-y:auto; color:rgba(245,239,227,0.7);">'+escapeHtml(v.content)+'</p>' +
    '<button class="btn btn-outline btn-sm" onclick="restoreCourseNotesVersion('+i+')">Restaurer cette version</button></div>'
  ).join('');
  window.__loadedNotesVersions = versions;
}
function restoreCourseNotesVersion(index){
  const v = window.__loadedNotesVersions[index];
  if(!v) return;
  if(!confirm('Restaurer cette version ? Le contenu actuel sera remplacé (mais conservé dans l’historique).')) return;
  go('course-shared-notes');
  document.getElementById('course-shared-notes-content').value = v.content;
  showToast('Version restaurée — pensez à enregistrer pour la conserver');
}
async function openCourseGroupChat(courseId){
  const enrollment = await safeGet('enrollment:' + courseId + '__' + currentUser, true);
  if(!enrollment || enrollment.status !== 'approved'){ showToast('Réservé aux élèves inscrits à ce cours'); return; }
  const c = await safeGet('course:' + courseId, true);
  if(c && c.trainerUsername === currentUser){ showToast('Cet espace est réservé aux élèves, sans le formateur'); return; }
  currentGroupChatCourseId = courseId;
  document.getElementById('course-group-chat-title').textContent = '💬 Discussion entre élèves' + (c ? ' — ' + c.title : '');
  go('course-group-chat');
  await renderCourseGroupChat();
  await renderCourseGroupChatNotifPreference();
  if(courseGroupChatPollInterval) clearInterval(courseGroupChatPollInterval);
  courseGroupChatPollInterval = setInterval(renderCourseGroupChat, 4000);
}
function stopCourseGroupChatPolling(){
  if(courseGroupChatPollInterval){ clearInterval(courseGroupChatPollInterval); courseGroupChatPollInterval = null; }
}
async function renderCourseGroupChatNotifPreference(){
  const btn = document.getElementById('course-group-chat-notif-btn');
  if(!btn || !currentUser || !currentGroupChatCourseId) return;
  const pref = await safeGet('coursegroupchatnotifypref:' + currentUser + '__' + currentGroupChatCourseId, false).catch(() => null);
  const notifyAll = !pref || pref.notifyAll !== false;
  btn.textContent = notifyAll ? '🔔 Notifié(e) de chaque message' : '🔕 Notifications limitées pour ce cours';
}
async function toggleCourseGroupChatNotifPreference(){
  if(!currentUser || !currentGroupChatCourseId) return;
  const pref = (await safeGet('coursegroupchatnotifypref:' + currentUser + '__' + currentGroupChatCourseId, false).catch(() => null)) || { notifyAll: true };
  pref.notifyAll = !pref.notifyAll;
  await saveWithRetry('coursegroupchatnotifypref:' + currentUser + '__' + currentGroupChatCourseId, pref, false);
  showToast(pref.notifyAll ? 'Vous serez notifié(e) de chaque message ✓' : 'Notifications limitées pour ce cours ✓');
  await renderCourseGroupChatNotifPreference();
}
async function notifyCourseGroupChatMembers(courseId, senderUsername, text){
  const recipients = new Set(await fetchApprovedStudentsForCourse(courseId));
  recipients.delete(senderUsername);
  for(const recipient of recipients){
    const pref = await safeGet('coursegroupchatnotifypref:' + recipient + '__' + courseId, false).catch(() => null);
    const notifyAll = !pref || pref.notifyAll !== false;
    if(notifyAll) await createNotification(recipient, 'course_group_message', senderUsername, courseId, text.slice(0,60));
  }
}
async function fetchCourseGroupChatMessages(courseId){
  return (await safeGet('coursegroupchat:' + courseId, true)) || [];
}
async function renderCourseGroupChat(){
  if(!currentGroupChatCourseId) return;
  const messages = await fetchCourseGroupChatMessages(currentGroupChatCourseId);
  renderCourseChatBubbles(messages, 'course-group-chat-messages', false, currentGroupChatCourseId);
}
async function sendCourseGroupChatMessage(){
  const input = document.getElementById('course-group-chat-input');
  const text = input.value.trim();
  if(!text || !currentGroupChatCourseId) return;
  const messages = await fetchCourseGroupChatMessages(currentGroupChatCourseId);
  messages.push({ from: currentUser, text, ts: new Date().toISOString() });
  await saveWithRetry('coursegroupchat:' + currentGroupChatCourseId, messages, true);
  await notifyCourseGroupChatMembers(currentGroupChatCourseId, currentUser, text);
  input.value = '';
  await renderCourseGroupChat();
}
async function fetchCourseChatMessages(courseId){
  return (await safeGet('coursechat:' + courseId, true)) || [];
}
async function notifyCourseChatParticipants(courseId, senderUsername, text){
  const course = await safeGet('course:' + courseId, true);
  const recipients = new Set(await fetchApprovedStudentsForCourse(courseId));
  if(course && course.trainerUsername) recipients.add(course.trainerUsername);
  recipients.delete(senderUsername);
  for(const recipient of recipients){
    const pref = await safeGet('coursechatnotifypref:' + recipient + '__' + courseId, false).catch(() => null);
    const notifyAll = !pref || pref.notifyAll !== false;
    if(notifyAll) await createNotification(recipient, 'course_chat_message', senderUsername, courseId, text.slice(0,60));
  }
}
async function checkCourseChatMessageWithAI(text, courseTitle){
  const prompt = "Tu modères un espace de discussion pédagogique sur Suktum, pour le cours « " + (courseTitle || 'un cours') + " ». Voici un message d'un participant :\n\n« " + text + " »\n\nCe message contient-il du harcèlement, des insultes, ou est-il manifestement hors sujet par rapport à un cadre pédagogique normal ? Réponds UNIQUEMENT en JSON strict, sans texte autour : {\"appropriate\": true ou false, \"reason\": \"courte explication en français\"}";
  try{
    const { text: aiText } = await callAIClaudeFirstWithGeminiFallback(prompt, 150);
    const cleaned = aiText.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return { flagged: parsed.appropriate === false, reason: parsed.reason || '' };
  }catch(e){
    return { flagged: false, reason: '' }; // l'IA a échoué — on ne bloque jamais à tort, cohérent avec le principe déjà établi pour les leçons
  }
}
async function sendCourseChatMessage(inputId, isTrainerView){
  const input = document.getElementById(inputId);
  const text = input.value.trim();
  if(!text) return;
  const courseId = isTrainerView ? currentManagedCourseId : currentCourseDetailId;
  const platformWords = await getForbiddenWords();
  if(containsForbiddenWord(text, platformWords)){
    await flagCourseChatAutoAlert(courseId, currentUser, text, 'Mot non autorisé détecté automatiquement');
    showToast('Ce message contient un mot non autorisé et n’a pas été envoyé');
    return;
  }
  const course = await safeGet('course:' + courseId, true).catch(() => null);
  const aiCheck = await checkCourseChatMessageWithAI(text, course ? course.title : null);
  if(aiCheck.flagged){
    await flagCourseChatAutoAlert(courseId, currentUser, text, 'Détecté par l’IA : ' + aiCheck.reason);
    showToast('Ce message a été jugé inapproprié et n’a pas été envoyé');
    return;
  }
  const messages = await fetchCourseChatMessages(courseId);
  messages.push({ from: currentUser, text, ts: new Date().toISOString() });
  await saveWithRetry('coursechat:' + courseId, messages, true);
  await notifyCourseChatParticipants(courseId, currentUser, text);
  input.value = '';
  if(isTrainerView) await renderManageCourseChat(); else await renderStudentCourseChat();
}
async function flagCourseChatAutoAlert(courseId, authorUsername, text, detectionReason){
  const course = await safeGet('course:' + courseId, true);
  const id = 'report_' + Date.now();
  await saveWithRetry('report:' + id, {
    id, type: 'course_chat_comment', targetId: courseId, targetUser: authorUsername,
    reporterUser: 'Suktum (filtre automatique)', reason: detectionReason || 'Contenu inapproprié détecté automatiquement',
    evidence: '« ' + text + ' » — cours : ' + (course ? course.title : courseId),
    status: 'pending', createdAt: new Date().toISOString(), autoDetected: true
  }, true);
}
async function renderAdminCourseChatModeration(){
  const el = document.getElementById('admin-course-chat-moderation');
  if(!el) return;
  const keys = await safeList('report:', true);
  const alerts = [];
  for(const k of keys){ const r = await safeGet(k, true).catch(() => null); if(r && r.type === 'course_chat_comment' && r.status === 'pending') alerts.push({...r, key: k}); }
  alerts.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  if(alerts.length === 0){ el.innerHTML = '<div class="empty">Aucun message signalé ou détecté automatiquement pour l’instant.</div>'; return; }
  el.innerHTML = alerts.map(a =>
    '<div class="card" style="margin-bottom:8px;'+(a.autoDetected ? ' border-color:var(--gold);' : '')+'">' +
    '<p style="margin:0 0 4px; font-size:13px;">'+(a.autoDetected ? '🤖 Détecté automatiquement' : '👤 Signalé par @'+escapeHtml(a.reporterUser))+' — auteur : <strong>@'+escapeHtml(a.targetUser)+'</strong></p>' +
    '<p style="margin:0 0 8px; font-size:11.5px; color:rgba(245,239,227,0.6);">'+escapeHtml(a.evidence || a.reason)+'</p>' +
    '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
    '<button class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral);" onclick="moderateCourseChatAlert(\''+a.key+'\', true)">🗑️⚠️ Supprimer + avertir</button>' +
    '<button class="btn btn-outline btn-sm" onclick="moderateCourseChatAlert(\''+a.key+'\', false)">Rejeter, aucune action</button>' +
    '</div></div>'
  ).join('');
}
async function moderateCourseChatAlert(reportKey, shouldWarn){
  const r = await safeGet(reportKey, true);
  if(!r) return;
  r.status = shouldWarn ? 'approved' : 'dismissed';
  await saveWithRetry(reportKey, r, true);
  if(shouldWarn){
    const u = await safeGet('user:' + r.targetUser, true);
    if(u){
      if(!u.warnings) u.warnings = [];
      u.warnings.push({ reason: 'Message inapproprié dans un espace de discussion pédagogique : ' + r.reason, createdAt: new Date().toISOString() });
      await saveWithRetry('user:' + r.targetUser, u, true);
      await createNotification(r.targetUser, 'warning', 'Suktum', null, 'Un message que vous avez envoyé dans un espace de cours a été jugé inapproprié.');
    }
    await logAdminAction('Message d’espace pédagogique supprimé + avertissement émis', '@' + r.targetUser + ' — ' + (r.reason || '').slice(0, 60));
  } else {
    await logAdminAction('Alerte d’espace pédagogique rejetée, aucune action', '@' + r.targetUser);
  }
  showToast(shouldWarn ? 'Avertissement émis ✓' : 'Alerte rejetée');
  await renderAdminCourseChatModeration();
}
let courseChatVoiceRecorder = null;
let courseChatVoiceChunks = [];
let isRecordingCourseChatVoice = false;
async function toggleCourseGroupChatVoiceRecording(){
  const btn = document.getElementById('group-chat-voice-btn');
  if(!isRecordingCourseChatVoice){
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
      showToast('Micro indisponible sur cet appareil');
      return;
    }
    try{
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      courseChatVoiceChunks = [];
      courseChatVoiceRecorder = new MediaRecorder(stream);
      courseChatVoiceRecorder.ondataavailable = (e) => { if(e.data.size > 0) courseChatVoiceChunks.push(e.data); };
      courseChatVoiceRecorder.onstop = async () => {
        const blob = new Blob(courseChatVoiceChunks, { type: 'audio/webm' });
        if(blob.size > MAX_CHAT_MEDIA_SIZE){ showToast('Note vocale trop longue (2 Mo max)'); return; }
        const reader = new FileReader();
        reader.onload = async () => {
          const messages = await fetchCourseGroupChatMessages(currentGroupChatCourseId);
          messages.push({ from: currentUser, text: '', voiceData: reader.result, ts: new Date().toISOString() });
          await saveWithRetry('coursegroupchat:' + currentGroupChatCourseId, messages, true);
          await renderCourseGroupChat();
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      courseChatVoiceRecorder.start();
      isRecordingCourseChatVoice = true;
      btn.textContent = '⏹️';
      btn.style.color = 'var(--coral)';
      showToast('Enregistrement en cours...');
    }catch(e){
      showToast('Micro indisponible ou refusé');
    }
  } else {
    if(courseChatVoiceRecorder) courseChatVoiceRecorder.stop();
    isRecordingCourseChatVoice = false;
    btn.textContent = '🎤';
    btn.style.color = 'var(--cream)';
  }
}
async function toggleCourseChatVoiceRecording(isTrainerView){
  const btn = document.getElementById(isTrainerView ? 'manage-chat-voice-btn' : 'student-chat-voice-btn');
  if(!isRecordingCourseChatVoice){
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
      showToast('Micro indisponible sur cet appareil');
      return;
    }
    try{
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      courseChatVoiceChunks = [];
      courseChatVoiceRecorder = new MediaRecorder(stream);
      courseChatVoiceRecorder.ondataavailable = (e) => { if(e.data.size > 0) courseChatVoiceChunks.push(e.data); };
      courseChatVoiceRecorder.onstop = async () => {
        const blob = new Blob(courseChatVoiceChunks, { type: 'audio/webm' });
        if(blob.size > MAX_CHAT_MEDIA_SIZE){ showToast('Note vocale trop longue (2 Mo max)'); return; }
        const reader = new FileReader();
        reader.onload = async () => {
          const courseId = isTrainerView ? currentManagedCourseId : currentCourseDetailId;
          const messages = await fetchCourseChatMessages(courseId);
          messages.push({ from: currentUser, text: '', voiceData: reader.result, ts: new Date().toISOString() });
          await saveWithRetry('coursechat:' + courseId, messages, true);
          if(isTrainerView) await renderManageCourseChat(); else await renderStudentCourseChat();
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      courseChatVoiceRecorder.start();
      isRecordingCourseChatVoice = true;
      btn.textContent = '⏹️';
      btn.style.color = 'var(--coral)';
      showToast('Enregistrement en cours...');
    }catch(e){
      showToast('Micro indisponible ou refusé');
    }
  } else {
    if(courseChatVoiceRecorder) courseChatVoiceRecorder.stop();
    isRecordingCourseChatVoice = false;
    btn.textContent = '🎤';
    btn.style.color = 'var(--cream)';
  }
}
async function sendCourseChatVideo(){
  const me = await safeGet('user:' + currentUser, true);
  if(!me || !me.isTrainer){ showToast('Seul le formateur peut envoyer une vidéo dans ce chat'); return; }
  const fileInput = document.getElementById('manage-course-chat-video-input');
  const file = fileInput.files[0];
  if(!file) return;
  if(file.size > MAX_COURSE_VIDEO_SIZE){ showToast('Vidéo trop lourde (10 Mo max)'); fileInput.value = ''; return; }
  try{
    const dataUrl = await readFileAsDataURL(file);
    const mediaCheck = await moderateVideoWithVideoIntelligence(dataUrl);
    if(mediaCheck.checked && mediaCheck.flagged){
      showToast('Cette vidéo ne peut pas être envoyée dans le chat du cours');
      fileInput.value = '';
      return;
    }
    const messages = await fetchCourseChatMessages(currentManagedCourseId);
    messages.push({ from: currentUser, text: '', videoData: dataUrl, ts: new Date().toISOString() });
    await saveWithRetry('coursechat:' + currentManagedCourseId, messages, true);
    fileInput.value = '';
    showToast('Vidéo envoyée dans le chat ✓');
    await renderManageCourseChat();
  }catch(e){
    showToast('Impossible d’envoyer cette vidéo');
  }
}
function renderCourseChatBubbles(messages, containerId, allowModeration, courseId){
  const el = document.getElementById(containerId);
  if(!el) return;
  if(messages.length === 0){ el.innerHTML = '<div class="empty">Aucun message pour l’instant — posez une question !</div>'; return; }
  el.innerHTML = messages.map((m, i) => {
    const mine = m.from === currentUser;
    return '<div style="display:flex; flex-direction:column; align-self:'+(mine?'flex-end':'flex-start')+'; max-width:80%;">' +
      (mine ? '' : '<span style="font-size:10.5px; color:var(--gold); margin-bottom:2px;">@'+escapeHtml(m.from)+'</span>') +
      (m.videoData
        ? '<video controls style="max-width:100%; border-radius:12px;" src="'+m.videoData+'"></video>'
        : m.voiceData
        ? '<audio controls style="max-width:100%;" src="'+m.voiceData+'"></audio>'
        : '<div style="background:'+(mine?'var(--coral)':'var(--night-2)')+'; color:'+(mine?'var(--night)':'var(--cream)')+'; padding:8px 12px; border-radius:12px; font-size:12.5px;">'+escapeHtml(m.text)+'</div>') +
      (allowModeration ? '<span style="display:flex; gap:8px; margin-top:2px;">' +
        (!mine ? '<span onclick="reportCourseChatMessage(\''+courseId+'\', '+i+')" style="font-size:10px; color:rgba(245,239,227,0.4); cursor:pointer;">⚠️ Signaler</span>' : '') +
        '<span onclick="deleteCourseChatMessage(\''+courseId+'\', '+i+')" style="font-size:10px; color:rgba(245,239,227,0.4); cursor:pointer;">🗑️ Supprimer</span>' +
        '</span>' : '') +
      '</div>';
  }).join('');
  el.scrollTop = el.scrollHeight;
}
async function renderManageCourseChat(){
  if(!currentManagedCourseId) return;
  const messages = await fetchCourseChatMessages(currentManagedCourseId);
  renderCourseChatBubbles(messages, 'manage-course-chat-messages', true, currentManagedCourseId);
  await renderTrainerChatQuickReplies();
}
async function renderTrainerChatQuickReplies(){
  const el = document.getElementById('trainer-chat-quick-replies');
  if(!el) return;
  const replies = await fetchQuickReplies();
  el.innerHTML = replies.length === 0 ? '' : '<div style="display:flex; gap:6px; flex-wrap:wrap;">' +
    replies.map((r, i) => '<button class="btn btn-outline btn-sm" style="font-size:11px; padding:4px 8px;" onclick="useTrainerQuickReply('+i+')">⚡ '+escapeHtml(r.slice(0,20))+(r.length>20?'...':'')+'</button>').join('') +
    '</div>';
}
async function useTrainerQuickReply(index){
  const replies = await fetchQuickReplies();
  const text = replies[index];
  if(!text) return;
  const input = document.getElementById('manage-course-chat-input');
  if(input) input.value = text;
}
async function reportCourseChatMessage(courseId, index){
  const messages = await fetchCourseChatMessages(courseId);
  const m = messages[index];
  if(!m) return;
  const reason = prompt('Pourquoi signaler ce message d’un(e) élève ? (visible par la direction)');
  if(reason === null || !reason.trim()) return;
  const course = await safeGet('course:' + courseId, true);
  const id = 'report_' + Date.now();
  await saveWithRetry('report:' + id, {
    id, type: 'course_chat_comment', targetId: courseId, targetUser: m.from,
    reporterUser: currentUser, reason: reason.trim(),
    evidence: '« ' + m.text + ' » — cours : ' + (course ? course.title : courseId),
    status: 'pending', createdAt: new Date().toISOString()
  }, true);
  showToast('Message signalé à la direction ✓');
}
async function deleteCourseChatMessage(courseId, index){
  const messages = await fetchCourseChatMessages(courseId);
  messages.splice(index, 1);
  await saveWithRetry('coursechat:' + courseId, messages, true);
  await renderManageCourseChat();
}
async function renderStudentCourseChat(){
  if(!currentCourseDetailId) return;
  const messages = await fetchCourseChatMessages(currentCourseDetailId);
  renderCourseChatBubbles(messages, 'student-course-chat-messages', false, currentCourseDetailId);
}
let liveDocPollInterval = null;
let liveDocFullContent = '';
function stopLiveDocPolling(){
  if(liveDocPollInterval){ clearInterval(liveDocPollInterval); liveDocPollInterval = null; }
}
async function refreshLiveDocView(courseId){
  const viewer = document.getElementById('live-doc-viewer');
  if(!viewer) { stopLiveDocPolling(); return; }
  const doc = await safeGet('livedoc:' + courseId, true);
  liveDocFullContent = (doc && doc.content) || '';
  filterLiveDocView();
}
function filterLiveDocView(){
  const viewer = document.getElementById('live-doc-viewer');
  const searchInput = document.getElementById('live-doc-search');
  if(!viewer) return;
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
  if(!liveDocFullContent){ viewer.innerHTML = '<span style="color:rgba(245,239,227,0.4);">Le formateur n’a encore rien publié.</span>'; return; }
  if(!query){ viewer.textContent = liveDocFullContent; return; }
  const lines = liveDocFullContent.split('\n');
  const matching = lines.filter(l => l.toLowerCase().includes(query));
  if(matching.length === 0){ viewer.innerHTML = '<span style="color:rgba(245,239,227,0.4);">Aucun passage ne correspond à « '+escapeHtml(query)+' ».</span>'; return; }
  const escQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp('('+escQuery+')', 'ig');
  viewer.innerHTML = matching.map(l => escapeHtml(l).replace(regex, '<mark style="background:var(--gold); color:var(--night);">$1</mark>')).join('<br>');
}
/**
 * Pour les vérifications de sécurité où Claude doit rester le choix principal stable,
 * mais où Gemini doit automatiquement prendre le relais si Claude échoue (limite de
 * requêtes, panne réseau...) — sans aucune intervention humaine. Contrairement à
 * callAIProvider() (qui privilégie le choix de l'utilisateur avec repli vers Claude),
 * celle-ci est toujours Claude d'abord, Gemini en secours automatique.
 */
async function callAIClaudeFirstWithGeminiFallback(prompt, maxTokens){
  try{
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] })
    });
    const data = await response.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    if(!text) throw new Error('Réponse Claude vide');
    return { text, provider: 'claude' };
  }catch(claudeError){
    const geminiKey = await safeGet('settings:geminiApiKey', true);
    if(!geminiKey) throw claudeError; // pas de clé Gemini configurée — on remonte l'échec initial de Claude
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + geminiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: maxTokens } })
    });
    const data = await response.json();
    const text = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.map(p => p.text).join('').trim();
    if(!text) throw new Error('Réponse Gemini vide');
    return { text, provider: 'gemini' };
  }
}
async function checkLessonContentWithAI(title, content){
  const prompt = "Tu modères le contenu d'une plateforme éducative (Suktum — Espace Éducation). Voici une leçon soumise par un formateur :\n\nTitre : " + title + "\nContenu : " + content +
    "\n\nCe contenu est-il authentiquement éducatif et approprié (pas de spam, pas de contenu hors-sujet, pas de contenu inapproprié ou dangereux) ? Réponds UNIQUEMENT en JSON strict, sans aucun texte autour, au format : {\"educational\": true ou false, \"reason\": \"courte explication en français\"}";
  try{
    const { text, provider } = await callAIClaudeFirstWithGeminiFallback(prompt, 200);
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return { flagged: parsed.educational === false, reason: parsed.reason || '', provider };
  }catch(e){
    return { flagged: false, reason: '' }; // Claude ET Gemini ont échoué — on ne bloque jamais à tort, la modération humaine reste le filet de sécurité
  }
}
/* ---------- VIDÉOTHÈQUE DU COURS ---------- */
const MAX_COURSE_VIDEO_SIZE = 10 * 1024 * 1024;
async function generateAndShowCourseVideoSubtitles(courseId, videoId){
  const el = document.getElementById('coursevideo_' + videoId + '_subtitles');
  if(!el) return;
  const v = await safeGet('coursevideo:' + courseId + '__' + videoId, true);
  if(!v){ el.textContent = 'Vidéo introuvable.'; return; }
  el.textContent = 'Génération en cours...';
  const lang = (await safeGet('settings:subtitleLanguage', false)) || 'fr';
  const text = await generateVideoSubtitles(videoId, v.data, lang);
  el.textContent = text || 'Aucune parole détectée, ou clé IA non configurée.';
}
async function fetchCourseVideos(courseId){
  const keys = await safeList('coursevideo:' + courseId + '__', true);
  const list = [];
  for(const k of keys){ const v = await safeGet(k, true); if(v) list.push(v); }
  list.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  return list;
}
/* ---------- REMPLAÇANT TEMPORAIRE ---------- */
async function renderSubstituteCard(){
  const el = document.getElementById('substitute-current-card');
  if(!el) return;
  const c = await safeGet('course:' + currentManagedCourseId, true);
  if(!c) return;
  // Expiration automatique — si la date est dépassée, on nettoie silencieusement.
  if(c.substituteTrainer && c.substituteEndDate && new Date(c.substituteEndDate) < new Date()){
    c.substituteTrainer = null;
    c.substituteEndDate = null;
    await saveWithRetry('course:' + currentManagedCourseId, c, true);
  }
  if(c.substituteTrainer && c.substituteEndDate){
    el.innerHTML = '<p style="margin:0 0 6px; font-size:13px;">@'+escapeHtml(c.substituteTrainer)+' gère ce cours jusqu’au '+new Date(c.substituteEndDate).toLocaleDateString('fr-FR')+'</p>' +
      '<button class="btn btn-outline btn-sm" onclick="removeSubstitute()">Retirer le remplaçant</button>';
  } else {
    el.innerHTML = '<label style="margin-top:0;">Nom d’utilisateur du remplaçant</label>' +
      '<input type="text" id="substitute-username-input" placeholder="Ex : monami">' +
      '<label>Jusqu’au</label>' +
      '<input type="date" id="substitute-end-date-input">' +
      '<button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="assignSubstitute()">Désigner ce remplaçant</button>';
  }
}
async function assignSubstitute(){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function removeSubstitute(){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
/* ---------- CO-ENSEIGNEMENT ---------- */
async function renderCoTrainerManager(){
  const el = document.getElementById('co-trainer-manage-card');
  if(!el) return;
  const c = await safeGet('course:' + currentManagedCourseId, true);
  if(!c) return;
  if(c.trainerUsername !== currentUser){
    el.innerHTML = '<p style="margin:0; font-size:12.5px; color:rgba(245,239,227,0.6);">Cours principal de @'+escapeHtml(c.trainerUsername)+'. Seul le formateur principal peut gérer le co-enseignement.</p>';
    return;
  }
  const coTrainers = c.coTrainers || [];
  el.innerHTML =
    (coTrainers.length === 0 ? '<p style="margin:0 0 10px; font-size:12px; color:rgba(245,239,227,0.5);">Aucun co-formateur pour l’instant.</p>' :
      coTrainers.map(u => '<div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;"><span style="flex:1; font-size:12.5px;">@'+escapeHtml(u)+'</span><span onclick="removeCoTrainer(\''+escapeHtml(u)+'\')" style="cursor:pointer; color:var(--coral); font-size:12px;">✕ Retirer</span></div>').join('')
    ) +
    '<label style="margin-top:10px;">Ajouter un co-formateur (nom d’utilisateur)</label>' +
    '<input type="text" id="new-co-trainer-input" placeholder="Ex : ProfPhysique">' +
    '<button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="addCoTrainer()">Ajouter</button>';
}
async function addCoTrainer(){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function removeCoTrainer(username){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
/* ---------- EMPLOI DU TEMPS HEBDOMADAIRE ---------- */
const WEEKDAY_NAMES_FR = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
async function loadCourseSchedule(){
  const c = await safeGet('course:' + currentManagedCourseId, true);
  const dayEl = document.getElementById('course-schedule-day');
  const timeEl = document.getElementById('course-schedule-time');
  if(!dayEl) return;
  dayEl.value = (c && c.scheduleDay !== undefined && c.scheduleDay !== null) ? c.scheduleDay : '';
  timeEl.value = (c && c.scheduleTime) || '';
}
async function saveCourseSchedule(){
  const c = await safeGet('course:' + currentManagedCourseId, true);
  if(!c) return;
  const day = document.getElementById('course-schedule-day').value;
  const time = document.getElementById('course-schedule-time').value;
  c.scheduleDay = day === '' ? null : parseInt(day, 10);
  c.scheduleTime = day === '' ? null : (time || null);
  await saveWithRetry('course:' + currentManagedCourseId, c, true);
  showToast('Emploi du temps enregistré ✓');
}
function nextOccurrenceOf(dayOfWeek, timeStr){
  const [h, m] = timeStr.split(':').map(Number);
  const now = new Date();
  const result = new Date(now);
  result.setHours(h, m, 0, 0);
  let diff = (dayOfWeek - now.getDay() + 7) % 7;
  if(diff === 0 && result <= now) diff = 7;
  result.setDate(now.getDate() + diff);
  return result;
}
/* ---------- RAPPEL DE RENOUVELLEMENT D'ABONNEMENT ---------- */
/* ---------- CLASSEMENT MENSUEL DES MEILLEURS ÉLÈVES (TOUTES MATIÈRES) ---------- */
async function renderStudentsLeaderboard(){
  const el = document.getElementById('students-leaderboard-list');
  if(!el) return;
  el.innerHTML = '<p style="font-size:13px; color:rgba(245,239,227,0.5);">Calcul en cours...</p>';
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const allCourses = await fetchCourses(true);
  const studentGrades = {}; // { username: [scores...] }
  for(const c of allCourses){
    const enrollKeys = await safeList('enrollment:' + c.id + '__', true);
    const exercises = await fetchExercisesForCourse(c.id);
    const fullExams = await fetchFullExams(c.id);
    for(const k of enrollKeys){
      const e = await safeGet(k, true);
      if(!e || e.status !== 'approved') continue;
      if(!studentGrades[e.studentUsername]) studentGrades[e.studentUsername] = [];
      for(const ex of exercises){
        const sub = await safeGet('submission:' + ex.id + '__' + e.studentUsername, true);
        if(sub && sub.status === 'graded' && typeof sub.score === 'number' && sub.gradedAt && new Date(sub.gradedAt) >= monthStart){
          studentGrades[e.studentUsername].push(sub.score);
        }
      }
      const examResultKeys = await safeList('examresult:' + c.id + '__' + e.studentUsername + '__', true);
      for(const rk of examResultKeys){
        const r = await safeGet(rk, true);
        if(r && typeof r.score === 'number' && r.createdAt && new Date(r.createdAt) >= monthStart) studentGrades[e.studentUsername].push(r.score);
      }
      for(const fe of fullExams){
        const fsub = await safeGet('fullexamsubmission:' + fe.id + '__' + e.studentUsername, true);
        if(fsub && fsub.status === 'graded' && typeof fsub.totalScore === 'number' && fsub.gradedAt && new Date(fsub.gradedAt) >= monthStart){
          studentGrades[e.studentUsername].push(fsub.totalScore);
        }
      }
    }
  }
  const ranked = Object.entries(studentGrades)
    .filter(([, grades]) => grades.length > 0)
    .map(([student, grades]) => ({ student, average: grades.reduce((s,g) => s+g, 0) / grades.length, count: grades.length }))
    .sort((a,b) => b.average - a.average);
  if(ranked.length === 0){ el.innerHTML = '<div class="empty">Aucune note enregistrée ce mois-ci pour l’instant.</div>'; return; }
  const medals = ['🥇', '🥈', '🥉'];
  el.innerHTML = ranked.slice(0, 20).map((r, i) =>
    '<div class="card" style="display:flex; align-items:center; gap:10px;'+(i<3?' border-color:var(--gold);':'')+'">' +
    '<span style="font-size:18px; width:28px; text-align:center;">'+(medals[i] || (i+1))+'</span>' + smallAvatarBadge(r.student, 30) +
    '<div style="flex:1;"><strong style="font-size:13px; cursor:pointer;" onclick="openUserProfile(\''+escapeHtml(r.student)+'\')">@'+escapeHtml(r.student)+'</strong>' +
    '<p style="margin:2px 0 0; font-size:11.5px; color:rgba(245,239,227,0.5);">'+r.count+' note(s) ce mois-ci</p></div>' +
    '<strong style="font-size:14px; color:var(--gold); font-family:\'Baloo 2\';">'+r.average.toFixed(1)+'/20</strong>' +
    '</div>'
  ).join('');
}
/* ---------- SÉRIE DE CONNEXION — ESPACE ÉDUCATION ---------- */
async function updateEducationStreak(){
  const todayStr = new Date().toISOString().slice(0,10);
  const streakData = (await safeGet('edustreak:' + currentUser, true)) || { count: 0, lastDate: null };
  if(streakData.lastDate === todayStr) return; // déjà comptée aujourd'hui
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0,10);
  if(streakData.lastDate === yesterdayStr){
    streakData.count += 1; // visite consécutive
  } else {
    streakData.count = 1; // série interrompue ou première visite
  }
  streakData.lastDate = todayStr;
  await saveWithRetry('edustreak:' + currentUser, streakData, true);
}
async function renderEducationStreakBadge(){
  const el = document.getElementById('education-streak-badge');
  if(!el) return;
  const streakData = (await safeGet('edustreak:' + currentUser, true)) || { count: 0 };
  el.innerHTML = streakData.count > 0
    ? '<span style="font-size:12.5px; color:var(--gold);">🔥 '+streakData.count+' jour(s) de suite</span>'
    : '';
}
/* ---------- RAPPEL VENDEUR INACTIF ---------- */
async function checkSellerInactivityReminder(){
  const myProducts = (await fetchProducts()).filter(p => p.sellerUsername === currentUser);
  if(myProducts.length === 0) return; // pas encore vendeur, rien à rappeler
  const mostRecent = myProducts.reduce((latest, p) => new Date(p.createdAt) > new Date(latest.createdAt) ? p : latest, myProducts[0]);
  const daysSinceLastProduct = Math.floor((new Date() - new Date(mostRecent.createdAt)) / (24*60*60*1000));
  if(daysSinceLastProduct < 21) return;
  const isoWeek = getISOWeekKey(new Date());
  const notifKey = 'sellerinactivereminder:' + currentUser + '__' + isoWeek;
  const alreadySent = await safeGet(notifKey, true);
  if(alreadySent) return;
  await saveWithRetry(notifKey, true, true);
  await createNotification(currentUser, 'seller_inactive', 'Suktum', null, String(daysSinceLastProduct));
}
/* ---------- ALERTE D'EXPIRATION DE L'ESSAI GRATUIT 7 JOURS ---------- */
/* ---------- ANNIVERSAIRE D'INSCRIPTION ---------- */
/* ---------- RAPPORT MENSUEL AUTOMATIQUE VENDEUR ---------- */
async function checkMonthlySellerReport(){
  const myProducts = (await fetchProducts()).filter(p => p.sellerUsername === currentUser);
  if(myProducts.length === 0) return;
  const now = new Date();
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthKey = prevMonthDate.getFullYear() + '-' + String(prevMonthDate.getMonth()+1).padStart(2,'0');
  const reportKey = 'monthlysellerreport:' + currentUser + '__' + monthKey;
  const alreadySent = await safeGet(reportKey, true);
  if(alreadySent) return;
  const monthStart = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
  const allOrders = await fetchOrders();
  const myOrdersLastMonth = allOrders.filter(o => o.sellerUsername === currentUser && new Date(o.createdAt) >= monthStart && new Date(o.createdAt) < monthEnd);
  const revenue = myOrdersLastMonth.reduce((s,o) => s + (o.total||0), 0);
  const newCustomers = new Set(myOrdersLastMonth.map(o => o.buyerUsername)).size;
  const ratings = await fetchSellerRatings(currentUser);
  const ratingsLastMonth = ratings.filter(r => new Date(r.createdAt) >= monthStart && new Date(r.createdAt) < monthEnd);
  const avgRating = ratingsLastMonth.length > 0 ? (ratingsLastMonth.reduce((s,r) => s + r.stars, 0) / ratingsLastMonth.length).toFixed(1) : '-';
  await saveWithRetry(reportKey, true, true);
  const monthLabel = monthStart.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const summary = monthLabel + '__' + myOrdersLastMonth.length + '__' + revenue + '__' + newCustomers + '__' + avgRating;
  await createNotification(currentUser, 'monthly_seller_report', 'Suktum', null, summary);
}
async function checkAccountAnniversary(){
  const u = await safeGet('user:' + currentUser, true);
  if(!u || !u.createdAt) return;
  const created = new Date(u.createdAt);
  const now = new Date();
  const years = now.getFullYear() - created.getFullYear();
  if(years < 1) return;
  const isAnniversaryDay = now.getMonth() === created.getMonth() && now.getDate() === created.getDate();
  if(!isAnniversaryDay) return;
  const yearKey = String(now.getFullYear());
  const notifKey = 'anniversarysent:' + currentUser + '__' + yearKey;
  const alreadySent = await safeGet(notifKey, true);
  if(alreadySent) return;
  await saveWithRetry(notifKey, true, true);
  await createNotification(currentUser, 'account_anniversary', 'Suktum', null, String(years));
  showToast('🎂 Ça fait ' + years + ' an(s) que vous êtes sur Suktum !');
}
/* ---------- RAPPEL DE RENDEZ-VOUS AVANT UN CRÉNEAU DE SERVICE ---------- */
async function checkServiceBookingReminders(){
  const keys = await safeList('servicebooking:', true);
  const now = new Date();
  for(const k of keys){
    const b = await safeGet(k, true);
    if(!b || b.status !== 'confirmed') continue;
    if(b.buyerUsername !== currentUser && b.sellerUsername !== currentUser) continue;
    const hoursUntil = (new Date(b.slot) - now) / (60*60*1000);
    if(hoursUntil <= 0 || hoursUntil > 24) continue;
    const reminderKey = 'servicereminder:' + b.id + '__' + currentUser;
    const alreadySent = await safeGet(reminderKey, true);
    if(alreadySent) continue;
    await saveWithRetry(reminderKey, true, true);
    const otherParty = b.sellerUsername === currentUser ? b.buyerUsername : b.sellerUsername;
    await createNotification(currentUser, 'service_reminder', otherParty, b.productId, b.productName + '__' + b.slot);
  }
}
async function renderTrainerMissedConferencesStat(){
  const el = document.getElementById('trainer-missed-conferences-stat');
  if(!el || !currentUser) return;
  const u = await safeGet('user:' + currentUser, true);
  const count = (u && u.trainerMissedConferenceCount) || 0;
  el.innerHTML = count > 0 ? '<div class="card" style="'+(count >= 3 ? 'border-color:var(--coral);' : '')+'"><p style="margin:0; font-size:12.5px; color:'+(count >= 3 ? 'var(--coral)' : 'rgba(245,239,227,0.6)')+';">📡 '+count+' conférence(s) programmée(s) mais jamais tenue(s)'+(count >= 3 ? ' — pensez à annuler à l’avance si vous ne pouvez plus assurer une session' : '')+'</p></div>' : '';
}
async function checkMissedConferences(){
  if(!currentUser) return;
  const myLives = (await fetchLives()).filter(l => l.username === currentUser && l.isEducational && l.scheduledTime);
  for(const l of myLives){
    const hoursSinceScheduled = (Date.now() - new Date(l.scheduledTime).getTime()) / (60*60*1000);
    if(hoursSinceScheduled < 2) continue;
    const u = await safeGet('user:' + currentUser, true);
    if(u){
      u.trainerMissedConferenceCount = (u.trainerMissedConferenceCount || 0) + 1;
      await saveWithRetry('user:' + currentUser, u, true);
    }
    const allCourses = await fetchCourses(true);
    const trainerCourseIds = new Set(allCourses.filter(c => c.trainerUsername === currentUser).map(c => c.id));
    const enrollmentKeys = await safeList('enrollment:', true);
    const students = new Set();
    for(const k of enrollmentKeys){
      const e = await safeGet(k, true);
      if(e && e.status === 'approved' && trainerCourseIds.has(e.courseId)) students.add(e.studentUsername);
    }
    for(const student of students){
      await createNotification(student, 'conference_missed', currentUser, l.id);
    }
    await window.storage.delete('live:' + l.id, true).catch(() => {});
  }
}
async function checkTrialExpiryReminder(){
  const u = await safeGet('user:' + currentUser, true);
  if(!u || !u.eduTrialStartedAt || u.stateFunded) return;
  const sub = await safeGet('edusubscription:' + currentUser, true);
  if(sub && new Date(sub.expiresAt) > new Date()) return; // déjà un vrai abonnement, l'essai n'a plus d'importance
  if(!isTrialStillActive(u)) return; // essai déjà terminé, pris en charge ailleurs (verrouillage des cours)
  const msLeft = TRIAL_DURATION_MS - (Date.now() - new Date(u.eduTrialStartedAt).getTime());
  const daysLeft = Math.max(1, Math.ceil(msLeft / (24*60*60*1000)));
  if(daysLeft > 3) return; // pas encore le moment d'alerter
  const todayStr = new Date().toISOString().slice(0,10);
  const notifKey = 'trialexpiryreminder:' + currentUser + '__' + todayStr;
  const alreadySent = await safeGet(notifKey, true);
  if(alreadySent) return;
  await saveWithRetry(notifKey, true, true);
  await createNotification(currentUser, 'trial_expiring', 'Suktum', null, String(daysLeft));
  showToast('🎁 Votre essai gratuit se termine dans ' + daysLeft + ' jour(s)');
}
/* ---------- RAPPEL DE COMMANDE RÉCURRENTE ---------- */
async function activateRecurringReminder(productId, productName){
  await saveWithRetry('recurringreminder:' + currentUser + '__' + productId, {
    username: currentUser, productId, productName, active: true, lastRemindedAt: new Date().toISOString(), createdAt: new Date().toISOString()
  }, true);
  showToast('Rappel mensuel activé ✓');
  await renderMyOrdersScreen();
}
async function cancelRecurringReminder(productId){
  const reminder = await safeGet('recurringreminder:' + currentUser + '__' + productId, true);
  if(reminder){ reminder.active = false; await saveWithRetry('recurringreminder:' + currentUser + '__' + productId, reminder, true); }
  showToast('Rappel annulé');
  await renderMyOrdersScreen();
}
async function checkReceiptConfirmReminder(){
  if(!currentUser) return;
  const myOrders = (await fetchOrders()).filter(o => o.buyerUsername === currentUser && o.status !== 'cancelled' && !o.buyerConfirmedReceipt && (o.shipmentStage === 'shipped' || o.shipmentStage === 'delivered'));
  for(const o of myOrders){
    const daysSinceShipped = (Date.now() - new Date(o.createdAt).getTime()) / (24*60*60*1000);
    if(daysSinceShipped < 3) continue;
    const existingDispute = await safeGet('refundrequest:' + o.id, true).catch(() => null);
    if(existingDispute) continue;
    const reminderKey = 'receiptreminder:' + o.id;
    const existing = await safeGet(reminderKey, true).catch(() => null);
    const daysSinceLastReminder = existing ? (Date.now() - new Date(existing.lastRemindedAt).getTime()) / (24*60*60*1000) : 999;
    if(daysSinceLastReminder >= 3){
      await createNotification(currentUser, 'receipt_confirm_reminder', 'Suktum', o.id, o.productName);
      await saveWithRetry(reminderKey, { lastRemindedAt: new Date().toISOString() }, true);
    }
  }
}
async function checkShippingReminder(){
  if(!currentUser) return;
  const myOrders = (await fetchOrders()).filter(o => o.sellerUsername === currentUser && o.status !== 'cancelled' && (!o.shipmentStage || o.shipmentStage === 'prepared'));
  for(const o of myOrders){
    const daysSinceOrdered = (Date.now() - new Date(o.createdAt).getTime()) / (24*60*60*1000);
    if(daysSinceOrdered < 2) continue;
    const reminderKey = 'shippingreminder:' + o.id;
    const existing = await safeGet(reminderKey, true).catch(() => null);
    const daysSinceLastReminder = existing ? (Date.now() - new Date(existing.lastRemindedAt).getTime()) / (24*60*60*1000) : 999;
    if(daysSinceLastReminder >= 2){
      await createNotification(currentUser, 'shipping_reminder', 'Suktum', o.id, o.productName);
      await saveWithRetry(reminderKey, { lastRemindedAt: new Date().toISOString() }, true);
    }
  }
}
async function checkRecurringOrderReminders(){
  if(!currentUser) return;
  const keys = await safeList('recurringreminder:' + currentUser + '__', true);
  for(const k of keys){
    const reminder = await safeGet(k, true);
    if(!reminder || !reminder.active) continue;
    const daysSinceLastReminder = (Date.now() - new Date(reminder.lastRemindedAt).getTime()) / (24*60*60*1000);
    if(daysSinceLastReminder >= 30){
      await createNotification(currentUser, 'recurring_order_reminder', 'Suktum', reminder.productId, reminder.productName);
      reminder.lastRemindedAt = new Date().toISOString();
      await saveWithRetry(k, reminder, true);
    }
  }
}
async function checkSubscriptionRenewalReminder(){
  const todayStr = new Date().toISOString().slice(0,10);
  const eduSub = await safeGet('edusubscription:' + currentUser, true);
  if(eduSub && eduSub.expiresAt && !eduSub.cancelled){
    const daysLeft = Math.ceil((new Date(eduSub.expiresAt) - new Date()) / (24*60*60*1000));
    if(daysLeft > 0 && daysLeft <= 3){
      const key = 'renewalreminder:edu__' + currentUser + '__' + todayStr;
      const alreadySent = await safeGet(key, true);
      if(!alreadySent){
        await saveWithRetry(key, true, true);
        await createNotification(currentUser, 'edu_renewal', 'Suktum', null, String(daysLeft));
        showToast('⏰ Votre abonnement Espace Éducation expire dans ' + daysLeft + ' jour(s)');
      }
    }
  }
  const premiumSub = await safeGet('subscription:' + currentUser, true);
  if(premiumSub && premiumSub.expiresAt && !premiumSub.cancelled){
    const daysLeft = Math.ceil((new Date(premiumSub.expiresAt) - new Date()) / (24*60*60*1000));
    if(daysLeft > 0 && daysLeft <= 3){
      const key = 'renewalreminder:premium__' + currentUser + '__' + todayStr;
      const alreadySent = await safeGet(key, true);
      if(!alreadySent){
        await saveWithRetry(key, true, true);
        await createNotification(currentUser, 'premium_renewal', 'Suktum', null, String(daysLeft));
        showToast('⏰ Votre abonnement Premium expire dans ' + daysLeft + ' jour(s)');
      }
    }
  }
}
async function checkScheduledCourseReminders(){
  const enrollmentKeys = await safeList('enrollment:', true);
  const myCourseIds = new Set();
  for(const k of enrollmentKeys){
    const e = await safeGet(k, true);
    if(e && e.studentUsername === currentUser && e.status === 'approved') myCourseIds.add(e.courseId);
  }
  for(const courseId of myCourseIds){
    const c = await safeGet('course:' + courseId, true);
    if(!c || c.scheduleDay === null || c.scheduleDay === undefined || !c.scheduleTime) continue;
    const next = nextOccurrenceOf(c.scheduleDay, c.scheduleTime);
    const minutesUntil = (next - new Date()) / 60000;
    if(minutesUntil <= 15 && minutesUntil > 0){
      const reminderKey = 'schedulereminder:' + courseId + '__' + currentUser + '__' + next.toISOString().slice(0,13);
      const alreadySent = await safeGet(reminderKey, true);
      if(!alreadySent){
        await saveWithRetry(reminderKey, true, true);
        showToast('⏰ Votre cours "' + c.title + '" commence bientôt !');
      }
    }
  }
}
/* ---------- PODCASTS DU COURS ---------- */
async function fetchCoursePodcasts(courseId){
  const keys = await safeList('coursepodcast:' + courseId + '__', true);
  const list = [];
  for(const k of keys){ const p = await safeGet(k, true); if(p) list.push(p); }
  list.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  return list;
}
async function addCoursePodcast(){
  const title = document.getElementById('new-course-podcast-title').value.trim();
  const fileInput = document.getElementById('new-course-podcast-input');
  const file = fileInput.files[0];
  if(!title || !file){ showToast('Renseignez un titre et choisissez un fichier audio'); return; }
  if(file.size > MAX_LESSON_ATTACHMENT_SIZE){ showToast('Épisode trop lourd (5 Mo max)'); fileInput.value = ''; return; }
  try{
    const dataUrl = await readFileAsDataURL(file);
    const ts = Date.now();
    await saveWithRetry('coursepodcast:' + currentManagedCourseId + '__' + ts, {
      courseId: currentManagedCourseId, title, data: dataUrl, createdAt: new Date().toISOString()
    }, true);
    document.getElementById('new-course-podcast-title').value = '';
    fileInput.value = '';
    showToast('Épisode ajouté ✓');
    await renderManageCoursePodcasts();
  }catch(e){
    showToast('Impossible d’ajouter cet épisode');
  }
}
async function renderManageCoursePodcasts(){
  const el = document.getElementById('manage-course-podcasts-list');
  if(!el) return;
  const podcasts = await fetchCoursePodcasts(currentManagedCourseId);
  el.innerHTML = podcasts.length === 0 ? '<div class="empty">Aucun épisode pour l’instant.</div>' : podcasts.map(pc =>
    '<div class="card"><strong style="font-size:13px;">'+escapeHtml(pc.title)+'</strong><audio controls style="width:100%; margin-top:8px;" src="'+pc.data+'"></audio></div>'
  ).join('');
}
async function addCourseVideo(){
  const title = document.getElementById('new-course-video-title').value.trim();
  const seriesName = document.getElementById('new-course-video-series').value.trim();
  const episodeRaw = document.getElementById('new-course-video-episode').value;
  const episodeNumber = episodeRaw ? Math.max(1, parseInt(episodeRaw, 10)) : null;
  const fileInput = document.getElementById('new-course-video-input');
  const file = fileInput.files[0];
  if(!title || !file){ showToast('Renseignez un titre et choisissez une vidéo'); return; }
  if(file.size > MAX_COURSE_VIDEO_SIZE){ showToast('Vidéo trop lourde (10 Mo max)'); fileInput.value = ''; return; }
  try{
    const dataUrl = await readFileAsDataURL(file);
    const mediaCheck = await moderateVideoWithVideoIntelligence(dataUrl);
    const ts = Date.now();
    await saveWithRetry('coursevideo:' + currentManagedCourseId + '__' + ts, {
      id: ts, courseId: currentManagedCourseId, title, data: dataUrl, seriesName: seriesName || null, episodeNumber, createdAt: new Date().toISOString(),
      mediaFlagged: mediaCheck.checked && mediaCheck.flagged, mediaFlagReason: mediaCheck.reason || null
    }, true);
    document.getElementById('new-course-video-title').value = '';
    document.getElementById('new-course-video-series').value = '';
    document.getElementById('new-course-video-episode').value = '';
    fileInput.value = '';
    if(mediaCheck.checked && mediaCheck.flagged){
      await logAdminAction('Vidéo de cours signalée automatiquement (Google Cloud)', '@'+currentUser+' — '+mediaCheck.reason);
      showToast('Vidéo envoyée pour vérification avant d’être visible aux élèves');
    } else {
      showToast('Vidéo ajoutée ✓');
    }
    await renderManageCourseVideos();
  }catch(e){
    showToast('Impossible d’ajouter cette vidéo');
  }
}
async function renderManageCourseVideos(){
  const el = document.getElementById('manage-course-videos-list');
  if(!el) return;
  const videos = await fetchCourseVideos(currentManagedCourseId);
  el.innerHTML = videos.length === 0 ? '<div class="empty">Aucune vidéo pour l’instant.</div>' : videos.map(v =>
    '<div class="card"><strong style="font-size:13px;">'+escapeHtml(v.title)+'</strong>' +
    (v.mediaFlagged ? '<p style="font-size:11px; color:var(--coral); margin:4px 0 0;">⏳ En attente de vérification</p>' : '') +
    '<video controls style="width:100%; border-radius:10px; margin-top:8px;" src="'+v.data+'"></video>' +
    ((!v.chapters || v.chapters.length === 0) ? '<button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="generateCourseVideoChapters(\''+currentManagedCourseId+'\', '+v.id+')">🤖 Générer les chapitres</button>' : '') +
    '<button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="startAltAudioRecording(\''+currentManagedCourseId+'\', '+v.id+')">🌐 '+(v.altAudioLabel ? 'Remplacer la langue « '+escapeHtml(v.altAudioLabel)+' »' : 'Ajouter une langue alternative')+'</button>' +
    '</div>'
  ).join('');
}
function renderLessonAttachmentHtml(l){
  if(!l.attachmentData) return '';
  if(l.attachmentType && l.attachmentType.startsWith('audio/')){
    return '<audio controls style="width:100%; margin-top:8px;" src="'+l.attachmentData+'"></audio>';
  }
  if(l.attachmentType && l.attachmentType.startsWith('video/')){
    const videoId = 'lessonvideo_' + l.id;
    return '<video id="'+videoId+'" controls style="width:100%; border-radius:10px; margin-top:8px;" src="'+l.attachmentData+'"></video>' +
      '<button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="startLessonRemixRecording(\''+l.courseId+'\', \''+l.id+'\')">🔄 Remixer cette leçon</button>' +
      ((l.chapters && l.chapters.length > 0) ? '<div style="margin-top:8px;">' + l.chapters.map(c =>
        '<span onclick="document.getElementById(\''+videoId+'\').currentTime='+c.seconds+'; document.getElementById(\''+videoId+'\').play();" style="display:inline-block; background:rgba(47,184,166,0.15); color:var(--lagoon); font-size:11px; padding:3px 9px; border-radius:8px; margin:0 4px 4px 0; cursor:pointer;">▶ '+c.label+' — '+escapeHtml(c.title)+'</span>'
      ).join('') + '</div>' : '');
  }
  return '<a href="'+l.attachmentData+'" download="'+escapeHtml(l.attachmentName||'document')+'" style="display:inline-block; margin-top:8px; font-size:12.5px; color:var(--gold); text-decoration:underline;">📎 '+escapeHtml(l.attachmentName||'Pièce jointe')+' — télécharger</a>';
}
const MAX_LESSON_ATTACHMENT_SIZE = 5 * 1024 * 1024;
/* ---------- OBJECTIF DE VENTE MENSUEL VENDEUR ---------- */
function getCurrentMonthKey(){
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
}
async function renderSellerSalesGoal(){
  const el = document.getElementById('seller-sales-goal-card');
  if(!el) return;
  const monthKey = getCurrentMonthKey();
  const goalData = await safeGet('salesgoal:' + currentUser + '__' + monthKey, true);
  const allOrders = await fetchOrders();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const myOrdersThisMonth = allOrders.filter(o => o.sellerUsername === currentUser && new Date(o.createdAt) >= monthStart);
  const revenue = myOrdersThisMonth.reduce((s,o) => s + (o.total||0), 0);
  if(!goalData || !goalData.amount){
    el.innerHTML = '<label style="margin-top:0;">Fixer mon objectif du mois (FCFA)</label>' +
      '<input type="number" id="new-sales-goal-input" placeholder="Ex : 200000">' +
      '<button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="setSellerSalesGoal()">Fixer l’objectif</button>' +
      '<p style="margin:8px 0 0; font-size:11.5px; color:rgba(245,239,227,0.5);">Chiffre d’affaires déjà réalisé ce mois-ci : '+revenue.toLocaleString('fr-FR')+' FCFA</p>';
    return;
  }
  const pct = Math.min(100, Math.round(revenue / goalData.amount * 100));
  el.innerHTML = '<p style="margin:0 0 8px; font-size:13px;">'+revenue.toLocaleString('fr-FR')+' / '+goalData.amount.toLocaleString('fr-FR')+' FCFA</p>' +
    '<div style="background:rgba(245,239,227,0.12); border-radius:8px; height:10px; overflow:hidden; margin-bottom:8px;"><div style="background:'+(pct>=100?'var(--lagoon)':'var(--gold)')+'; height:100%; width:'+pct+'%;"></div></div>' +
    '<p style="margin:0 0 10px; font-size:12px; color:'+(pct>=100?'var(--lagoon)':'rgba(245,239,227,0.5)')+';">'+(pct>=100 ? '🎉 Objectif atteint !' : pct+'% de l’objectif')+'</p>' +
    '<button class="btn btn-outline btn-sm" onclick="clearSellerSalesGoal()">Modifier l’objectif</button>';
}
async function setSellerSalesGoal(){
  const amount = parseInt(document.getElementById('new-sales-goal-input').value, 10);
  if(isNaN(amount) || amount <= 0){ showToast('Entrez un montant valide'); return; }
  const monthKey = getCurrentMonthKey();
  await saveWithRetry('salesgoal:' + currentUser + '__' + monthKey, { amount, setAt: new Date().toISOString() }, true);
  showToast('Objectif fixé ✓');
  await renderSellerSalesGoal();
}
async function clearSellerSalesGoal(){
  const monthKey = getCurrentMonthKey();
  await window.storage.delete('salesgoal:' + currentUser + '__' + monthKey, true).catch(() => {});
  await renderSellerSalesGoal();
}
/* ---------- MODÈLE DE LEÇON RÉUTILISABLE ---------- */
async function fetchMyLessonTemplates(){
  const keys = await safeList('lessontemplate:' + currentUser + '__', true);
  const list = [];
  for(const k of keys){ const t = await safeGet(k, true); if(t) list.push(t); }
  list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return list;
}
async function saveLessonAsTemplate(){
  const title = document.getElementById('new-lesson-title').value.trim();
  const content = document.getElementById('new-lesson-content').value.trim();
  if(!title || !content){ showToast('Renseignez au moins un titre et un contenu avant d’enregistrer un modèle'); return; }
  const id = 'lessontemplate:' + currentUser + '__' + Date.now();
  await saveWithRetry(id, { title, content, createdAt: new Date().toISOString() }, true);
  showToast('Modèle enregistré ✓');
  await renderLessonTemplateOptions();
}
async function renderLessonTemplateOptions(){
  const select = document.getElementById('lesson-template-select');
  if(!select) return;
  const templates = await fetchMyLessonTemplates();
  select.innerHTML = '<option value="">— Aucun —</option>' +
    templates.map((t, i) => '<option value="'+i+'">'+escapeHtml(t.title)+'</option>').join('');
  select.dataset.templates = JSON.stringify(templates);
}
function applyLessonTemplate(){
  const select = document.getElementById('lesson-template-select');
  const idx = select.value;
  if(idx === '') return;
  const templates = JSON.parse(select.dataset.templates || '[]');
  const t = templates[parseInt(idx, 10)];
  if(!t) return;
  document.getElementById('new-lesson-title').value = t.title;
  document.getElementById('new-lesson-content').value = t.content;
  showToast('Modèle appliqué — modifiez-le librement avant d’enregistrer la leçon');
}
async function addLessonToCourse(){
  const title = document.getElementById('new-lesson-title').value.trim();
  const content = document.getElementById('new-lesson-content').value.trim();
  if(!title || !content){ showToast('Renseignez un titre et un contenu'); return; }
  const fileInput = document.getElementById('new-lesson-attachment');
  const freePreview = document.getElementById('new-lesson-free-preview').checked;
  const file = fileInput.files[0];
  let attachmentData = null, attachmentName = null, attachmentType = null;
  if(file){
    if(file.size > MAX_LESSON_ATTACHMENT_SIZE){ showToast('Pièce jointe trop lourde (5 Mo max)'); return; }
    try{
      attachmentData = await readFileAsDataURL(file);
      attachmentName = file.name;
      attachmentType = file.type;
    }catch(e){
      showToast('Impossible de charger la pièce jointe');
      return;
    }
  }
  const ts = Date.now();
  const id = 'lesson_' + currentManagedCourseId + '__' + ts;
  showToast('Vérification du contenu en cours...');
  const aiCheck = await checkLessonContentWithAI(title, content);
  await saveWithRetry('lesson:' + currentManagedCourseId + '__' + ts, {
    id, courseId: currentManagedCourseId, title, content, attachmentData, attachmentName, attachmentType, freePreview, createdAt: new Date().toISOString(),
    aiFlagged: aiCheck.flagged, aiFlagReason: aiCheck.reason
  }, true);
  if(content){
    const vec = await getContentEmbedding(title + ' — ' + content).catch(() => null);
    if(vec) await saveWithRetry('contentembedding:lesson:' + currentManagedCourseId + '__' + ts, vec, true).catch(() => {});
  }
  if(!aiCheck.flagged){
    const enrolledStudents = await fetchApprovedStudentsForCourse(currentManagedCourseId);
    for(const student of enrolledStudents){
      await createNotification(student, 'new_lesson', currentUser, id, title);
    }
  }
  document.getElementById('new-lesson-title').value = '';
  document.getElementById('new-lesson-content').value = '';
  fileInput.value = '';
  document.getElementById('new-lesson-free-preview').checked = false;
  showToast(aiCheck.flagged ? 'Leçon ajoutée — en attente de vérification avant d’être visible aux élèves' : 'Leçon ajoutée ✓');
  if(aiCheck.flagged) await logAdminAction('Leçon signalée par l’IA', title + ' — ' + aiCheck.reason);
  await renderManageCourseLessons();
}
async function generateCourseVideoChapters(courseId, videoId){
  const keys = await safeList('coursevideo:' + courseId + '__', true);
  let video = null, videoKey = null;
  for(const k of keys){ const v = await safeGet(k, true).catch(() => null); if(v && v.id === videoId){ video = v; videoKey = k; break; } }
  if(!video || !video.data){ showToast('Vidéo introuvable'); return; }
  const geminiKey = await safeGet('settings:geminiApiKey', true).catch(() => null);
  if(!geminiKey){ showToast('Chapitrage automatique indisponible — aucune clé Gemini configurée par l’équipe technique'); return; }
  const base64Data = video.data.split(',')[1];
  const approxSizeMb = (base64Data.length * 0.75) / (1024 * 1024);
  if(approxSizeMb > 19){ showToast('Vidéo trop lourde pour le chapitrage automatique (limite ~19 Mo)'); return; }
  showToast('Analyse de la vidéo en cours...');
  try{
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + geminiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: 'Analyse cette vidéo de cours et détecte les vrais changements de sujet. Réponds UNIQUEMENT avec une ligne par chapitre détecté, au format exact "MM:SS|Titre court du chapitre en français", sans aucun autre texte. Le premier chapitre doit commencer à 00:00. Ne détecte que des changements de sujet clairs et significatifs — pas plus de 8 chapitres. Si la vidéo est trop courte ou homogène pour un vrai chapitrage, réponds exactement : PAS_DE_CHAPITRAGE_PERTINENT' },
          { inline_data: { mime_type: 'video/mp4', data: base64Data } }
        ] }],
        generationConfig: { maxOutputTokens: 300 }
      })
    });
    const data = await response.json();
    const text = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.map(p => p.text).join('');
    if(!text || text.trim() === 'PAS_DE_CHAPITRAGE_PERTINENT'){ showToast('Aucun vrai changement de sujet détecté dans cette vidéo'); return; }
    const chapters = text.trim().split('\n').map(line => {
      const match = line.match(/^(\d{1,2}):(\d{2})\|(.+)$/);
      if(!match) return null;
      const seconds = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
      return { label: match[1].padStart(2,'0') + ':' + match[2], seconds, title: match[3].trim() };
    }).filter(Boolean);
    if(chapters.length === 0){ showToast('Réponse inattendue de l’IA — réessayez'); return; }
    video.chapters = chapters;
    await saveWithRetry(videoKey, video, true);
    showToast(chapters.length + ' chapitre(s) généré(s) ✓');
    await renderManageCourseVideos();
  }catch(e){
    showToast('Erreur lors du chapitrage — réessayez');
  }
}
async function generateLessonChapters(courseId, lessonId){
  const lesson = await safeGet('lesson:' + courseId + '__' + lessonId, true).catch(() => null);
  if(!lesson || !lesson.attachmentData){ showToast('Leçon introuvable'); return; }
  const geminiKey = await safeGet('settings:geminiApiKey', true).catch(() => null);
  if(!geminiKey){ showToast('Chapitrage automatique indisponible — aucune clé Gemini configurée par l’équipe technique'); return; }
  const base64Data = lesson.attachmentData.split(',')[1];
  const approxSizeMb = (base64Data.length * 0.75) / (1024 * 1024);
  if(approxSizeMb > 19){ showToast('Vidéo trop lourde pour le chapitrage automatique (limite ~19 Mo)'); return; }
  showToast('Analyse de la vidéo en cours...');
  try{
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + geminiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: 'Analyse cette vidéo de cours et détecte les vrais changements de sujet. Réponds UNIQUEMENT avec une ligne par chapitre détecté, au format exact "MM:SS|Titre court du chapitre en français", sans aucun autre texte. Le premier chapitre doit commencer à 00:00. Ne détecte que des changements de sujet clairs et significatifs — pas plus de 8 chapitres. Si la vidéo est trop courte ou homogène pour un vrai chapitrage, réponds exactement : PAS_DE_CHAPITRAGE_PERTINENT' },
          { inline_data: { mime_type: lesson.attachmentType || 'video/mp4', data: base64Data } }
        ] }],
        generationConfig: { maxOutputTokens: 300 }
      })
    });
    const data = await response.json();
    const text = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.map(p => p.text).join('');
    if(!text || text.trim() === 'PAS_DE_CHAPITRAGE_PERTINENT'){ showToast('Aucun vrai changement de sujet détecté dans cette vidéo'); return; }
    const chapters = text.trim().split('\n').map(line => {
      const match = line.match(/^(\d{1,2}):(\d{2})\|(.+)$/);
      if(!match) return null;
      const seconds = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
      return { label: match[1].padStart(2,'0') + ':' + match[2], seconds, title: match[3].trim() };
    }).filter(Boolean);
    if(chapters.length === 0){ showToast('Réponse inattendue de l’IA — réessayez'); return; }
    lesson.chapters = chapters;
    await saveWithRetry('lesson:' + courseId + '__' + lessonId, lesson, true);
    showToast(chapters.length + ' chapitre(s) généré(s) ✓');
    await renderManageCourseLessons();
  }catch(e){
    showToast('Erreur lors du chapitrage — réessayez');
  }
}
async function renderManageCourseLessons(){
  const el = document.getElementById('manage-course-lessons');
  let lessons = await fetchLessonsForCourse(currentManagedCourseId);
  lessons = lessons.slice().sort((a,b) => (b.pinned?1:0) - (a.pinned?1:0));
  el.innerHTML = lessons.length === 0 ? '<div class="empty">Aucune leçon pour l’instant.</div>' :
    lessons.map(l => '<div class="card"'+(l.pinned ? ' style="border-color:var(--gold);"' : '')+'><strong style="font-size:13px;">'+(l.pinned ? '📌 ' : '')+escapeHtml(l.title)+'</strong>' +
      (l.freePreview ? ' <span style="font-size:10.5px; color:var(--lagoon);">🆓 Aperçu gratuit</span>' : '') +
      renderLessonAttachmentHtml(l) +
      (l.aiFlagged ? '<p style="margin:4px 0 0; font-size:11.5px; color:var(--coral);">⏳ En attente de vérification avant d’être visible aux élèves'+(l.aiFlagReason ? ' — '+escapeHtml(l.aiFlagReason) : '')+'</p>' : '') +
      (!l.aiFlagged ? '<p style="margin:4px 0 0; font-size:11px; color:'+(l.validatedForSearch ? 'var(--lagoon)' : 'rgba(245,239,227,0.4)')+';">'+(l.validatedForSearch ? '✓ Validée pour la recherche IA' : '○ Pas encore validée pour la recherche IA')+'</p>' : '') +
      ((l.attachmentType && l.attachmentType.startsWith('video/') && (!l.chapters || l.chapters.length === 0)) ? '<button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="generateLessonChapters(\''+l.courseId+'\', \''+l.id+'\')">🤖 Générer les chapitres</button>' : '') +
      '<button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="toggleLessonPin(\''+l.id+'\')">'+(l.pinned ? '📌 Désépingler' : '📌 Épingler')+'</button>' +
      (!l.aiFlagged ? '<button class="btn btn-outline btn-sm" style="margin-top:8px; margin-left:6px;" onclick="toggleLessonSearchValidation(\''+l.id+'\')">'+(l.validatedForSearch ? 'Retirer de la recherche' : '✓ Valider pour la recherche')+'</button>' : '') +
      '</div>').join('');
}
async function runFraudInvestigation(){
  const username = document.getElementById('fraud-investigation-username-input').value.trim();
  if(!username){ showToast('Renseignez un nom d’utilisateur'); return; }
  const resultEl = document.getElementById('fraud-investigation-result');
  const u = await safeGet('user:' + username, true);
  if(!u){ resultEl.innerHTML = '<div class="empty">Ce compte n’existe pas.</div>'; return; }
  const allOrders = await fetchOrders();
  const relatedOrders = allOrders.filter(o => o.buyerUsername === username || o.sellerUsername === username);
  const bookingKeys = await safeList('servicebooking:', true);
  const relatedBookings = [];
  for(const k of bookingKeys){ const b = await safeGet(k, true).catch(() => null); if(b && (b.buyerUsername === username || b.sellerUsername === username)) relatedBookings.push(b); }
  const totalAsSeller = relatedOrders.filter(o => o.sellerUsername === username).reduce((s,o) => s + o.total, 0);
  const totalAsBuyer = relatedOrders.filter(o => o.buyerUsername === username).reduce((s,o) => s + o.total, 0);
  resultEl.innerHTML = '<div class="card">' +
    '<p style="margin:0 0 4px; font-size:13px; font-weight:600;">@'+escapeHtml(username)+' — statut : '+(u.status === 'banned' ? '🚫 Banni' : u.status === 'suspended' ? '⏸ Suspendu' : '🟢 Actif')+'</p>' +
    '<p style="margin:0 0 4px; font-size:12px;">📱 Wave : '+escapeHtml(u.waveNumber || 'non renseigné')+' — Orange Money : '+escapeHtml(u.omNumber || u.trainerPaymentNumber || 'non renseigné')+'</p>' +
    '<p style="margin:0 0 4px; font-size:12px;">🛍️ '+relatedOrders.length+' commande(s) réelle(s) — reçues (vendeur) : '+totalAsSeller.toLocaleString('fr-FR')+' FCFA, effectuées (acheteur) : '+totalAsBuyer.toLocaleString('fr-FR')+' FCFA</p>' +
    '<p style="margin:0; font-size:12px;">💬 '+relatedBookings.length+' réservation(s) de consultation réelle(s)</p>' +
    '</div>';
}
async function toggleLessonSearchValidation(lessonId){
  const key = 'lesson:' + currentManagedCourseId + '__' + lessonId;
  const l = await safeGet(key, true);
  if(!l) return;
  l.validatedForSearch = !l.validatedForSearch;
  await saveWithRetry(key, l, true);
  showToast(l.validatedForSearch ? 'Validée pour la recherche IA ✓' : 'Retirée de la recherche IA');
  await renderManageCourseLessons();
}
async function toggleLessonPin(lessonId){
  const lessons = await fetchLessonsForCourse(currentManagedCourseId);
  const l = lessons.find(x => x.id === lessonId);
  if(!l) return;
  const storageKey = 'lesson:' + currentManagedCourseId + '__' + lessonId.split('__')[1];
  l.pinned = !l.pinned;
  await saveWithRetry(storageKey, l, true);
  showToast(l.pinned ? 'Leçon épinglée ✓' : 'Leçon désépinglée');
  await renderManageCourseLessons();
}
/* ---------- RÉSULTATS D'EXAMENS ---------- */
/* ---------- CONCOURS ---------- */
async function fetchContestsForCourse(courseId){
  const keys = await safeList('contest:' + courseId + '__', true);
  const list = [];
  for(const k of keys){ const c = await safeGet(k, true); if(c) list.push(c); }
  list.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  return list;
}
async function createContest(){
  const title = document.getElementById('new-contest-title').value.trim();
  const question = document.getElementById('new-contest-question').value.trim();
  if(!title || !question){ showToast('Renseignez le titre et la consigne'); return; }
  const ts = Date.now();
  const id = 'contest_' + currentManagedCourseId + '__' + ts;
  await saveWithRetry('contest:' + currentManagedCourseId + '__' + ts, {
    id, courseId: currentManagedCourseId, title, question, status: 'open', createdAt: new Date().toISOString()
  }, true);
  document.getElementById('new-contest-title').value = '';
  document.getElementById('new-contest-question').value = '';
  showToast('Concours créé ✓');
  await renderManageCourseContests();
}
async function renderManageCourseContests(){
  const el = document.getElementById('manage-course-contests');
  const contests = await fetchContestsForCourse(currentManagedCourseId);
  if(contests.length === 0){ el.innerHTML = '<div class="empty">Aucun concours pour l’instant.</div>'; return; }
  el.innerHTML = contests.map(ct =>
    '<div class="card" style="cursor:pointer;" onclick="openManageContest(\''+ct.id+'\')">' +
    '<p style="margin:0 0 4px; font-size:13px; font-weight:600;">'+escapeHtml(ct.title)+'</p>' +
    '<p style="margin:0; font-size:12px; color:rgba(245,239,227,0.55);">'+(ct.status === 'closed' ? '🏆 Classement publié' : 'Ouvert aux participations')+'</p>' +
    '</div>'
  ).join('');
}
let currentManagedContestId = null;
async function openManageContest(contestId){
  currentManagedContestId = contestId;
  const ct = await findContestById(contestId);
  document.getElementById('manage-contest-title').textContent = ct ? ct.title : 'Concours';
  go('manage-contest');
  await renderManageContestEntries();
}
async function findContestById(contestId){
  const contests = await fetchContestsForCourse(currentManagedCourseId);
  return contests.find(c => c.id === contestId);
}
async function renderManageContestEntries(){
  const el = document.getElementById('manage-contest-entries');
  const keys = await safeList('contestentry:' + currentManagedContestId + '__', true);
  const entries = [];
  for(const k of keys){ const e = await safeGet(k, true); if(e) entries.push({storageKey: k, ...e}); }
  if(entries.length === 0){ el.innerHTML = '<div class="empty">Aucune participation pour l’instant.</div>'; return; }
  el.innerHTML = entries.map(e =>
    '<div class="card">' +
    '<p style="margin:0 0 4px; font-size:13px; font-weight:600;">@'+escapeHtml(e.studentUsername)+(e.score != null ? ' — '+e.score+'/20' : '')+'</p>' +
    '<p style="margin:0 0 10px; font-size:12.5px; white-space:pre-line;">'+escapeHtml(e.answer)+'</p>' +
    '<input type="number" min="0" max="20" id="contest-score-'+e.studentUsername+'" placeholder="Note /20" value="'+(e.score != null ? e.score : '')+'" style="margin-bottom:0;">' +
    '<button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="submitContestScore(\''+e.storageKey+'\', \''+escapeHtml(e.studentUsername)+'\')">Enregistrer la note</button>' +
    '</div>'
  ).join('');
}
async function submitContestScore(storageKey, studentUsername){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function publishContestResults(){
  const keys = await safeList('contestentry:' + currentManagedContestId + '__', true);
  const entries = [];
  for(const k of keys){ const e = await safeGet(k, true); if(e) entries.push(e); }
  if(entries.some(e => e.score == null)){ showToast('Notez toutes les participations avant de publier le classement'); return; }
  if(entries.length === 0){ showToast('Aucune participation à publier'); return; }
  const ct = await findContestById(currentManagedContestId);
  ct.status = 'closed';
  await saveWithRetry('contest:' + currentManagedCourseId + '__' + currentManagedContestId.split('__')[1], ct, true);
  for(const e of entries){
    await createNotification(e.studentUsername, 'contest_published', currentUser, currentManagedContestId, ct.title);
  }
  showToast('Classement publié ✓');
  await renderManageCourseContests();
  go('trainer-dashboard');
}

/* ---------- CONCOURS — VUE ÉTUDIANT ---------- */
let currentStudentContestId = null;
async function openContestDetail(contestId, courseId){
  if(!(await requireEducationSubscription())) return;
  currentStudentContestId = contestId;
  currentManagedCourseId = courseId;
  const ct = await findContestById(contestId);
  if(!ct){ showToast('Concours introuvable'); return; }
  document.getElementById('contest-detail-title').textContent = ct.title;
  const el = document.getElementById('contest-detail-content');
  const myEntry = await safeGet('contestentry:' + contestId + '__' + currentUser, true);

  if(ct.status === 'closed'){
    const keys = await safeList('contestentry:' + contestId + '__', true);
    const entries = [];
    for(const k of keys){ const e = await safeGet(k, true); if(e) entries.push(e); }
    entries.sort((a,b) => (b.score||0) - (a.score||0));
    const medals = ['🥇','🥈','🥉'];
    el.innerHTML = '<div class="eyebrow">🏆 Classement final</div>' + entries.map((e, i) =>
      '<div class="card" style="display:flex; align-items:center; gap:10px;'+(e.studentUsername===currentUser?' border-color:var(--gold);':'')+'">' +
      '<span style="font-size:15px; width:24px; text-align:center;">'+(medals[i]||(i+1))+'</span>' +
      '<span style="flex:1; font-size:13px;">@'+escapeHtml(e.studentUsername)+(e.studentUsername===currentUser?' (vous)':'')+'</span>' +
      '<strong style="font-size:13px; color:var(--gold);">'+e.score+'/20</strong></div>'
    ).join('');
  } else if(myEntry){
    el.innerHTML = '<p style="margin:0; font-size:13px; color:var(--gold);">⏳ Votre participation a été envoyée. Le classement sera publié une fois toutes les copies notées.</p>' +
      '<div class="card" style="margin-top:10px;"><p style="margin:0; font-size:12.5px; color:rgba(245,239,227,0.6);">Votre participation :</p><p style="margin:6px 0 0; font-size:13px; white-space:pre-line;">'+escapeHtml(myEntry.answer)+'</p></div>';
  } else {
    el.innerHTML = '<p style="margin:0 0 16px; font-size:13.5px; white-space:pre-line;">'+escapeHtml(ct.question)+'</p>' +
      '<label style="margin-top:0;">Votre participation</label>' +
      '<textarea id="contest-answer-input" placeholder="Rédigez votre participation..." style="min-height:120px;"></textarea>' +
      '<button class="btn btn-primary" style="margin-top:14px; width:100%;" onclick="submitContestEntry(\''+contestId+'\')">Participer</button>';
  }
  go('contest-detail');
}
async function submitContestEntry(contestId){
  const answer = document.getElementById('contest-answer-input').value.trim();
  if(!answer){ showToast('Écrivez votre participation avant d’envoyer'); return; }
  await saveWithRetry('contestentry:' + contestId + '__' + currentUser, {
    contestId, courseId: currentManagedCourseId, studentUsername: currentUser, answer, score: null, createdAt: new Date().toISOString()
  }, true);
  showToast('Participation envoyée ✓');
  await openContestDetail(contestId, currentManagedCourseId);
}

async function fetchExamResultsForStudent(courseId, studentUsername){
  const keys = await safeList('examresult:' + courseId + '__' + studentUsername + '__', true);
  const list = [];
  for(const k of keys){ const r = await safeGet(k, true); if(r) list.push(r); }
  list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return list;
}
async function populateExamStudentSelect(){
  const sel = document.getElementById('new-exam-student');
  if(!sel) return;
  const keys = await safeList('enrollment:' + currentManagedCourseId + '__', true);
  const students = [];
  for(const k of keys){ const e = await safeGet(k, true); if(e && e.status === 'approved') students.push(e.studentUsername); }
  sel.innerHTML = students.length === 0 ? '<option value="">Aucun élève inscrit</option>' : students.map(u => '<option value="'+escapeHtml(u)+'">@'+escapeHtml(u)+'</option>').join('');
}
async function recordExamResult(){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function renderManageCourseExamResults(){
  const el = document.getElementById('manage-course-exam-results');
  if(!el) return;
  const keys = await safeList('examresult:', true);
  const results = [];
  for(const k of keys){
    if(!k.startsWith('examresult:' + currentManagedCourseId + '__')) continue;
    const r = await safeGet(k, true);
    if(r) results.push(r);
  }
  results.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  el.innerHTML = results.length === 0 ? '<div class="empty">Aucun résultat enregistré pour l’instant.</div>' : results.map(r =>
    '<div class="card"><p style="margin:0 0 4px; font-size:13px;">@'+escapeHtml(r.studentUsername)+' — '+escapeHtml(r.examTitle)+'</p>' +
    '<p style="margin:0; font-size:13px; color:var(--gold); font-weight:700;">'+r.score+'/20</p></div>'
  ).join('');
}
/* ---------- ESPACE PARENT/TUTEUR ---------- */
async function requestParentLink(){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function fetchParentLinkRequests(){
  const keys = await safeList('parentlinkrequest:', true);
  const list = [];
  for(const k of keys){ const r = await safeGet(k, true); if(r) list.push({storageKey: k, ...r}); }
  return list;
}
/* ---------- MODE FAMILIAL / RESTREINT (fil principal) ---------- */
async function toggleRestrictedMode(studentUsername){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function isRestrictedModeActive(username){
  const active = await safeGet('restrictedmode:' + username, true);
  return active === true;
}
async function renderParentSpace(){
  const pendingEl = document.getElementById('parent-pending-requests');
  const linkedEl = document.getElementById('parent-linked-students');
  if(!pendingEl) return;
  const requests = await fetchParentLinkRequests();
  const myPending = requests.filter(r => r.parentUsername === currentUser && r.status === 'pending');
  pendingEl.innerHTML = myPending.length === 0 ? '<div class="empty">Aucune demande en attente.</div>' : myPending.map(r =>
    '<div class="card"><p style="margin:0; font-size:13px;">⏳ @'+escapeHtml(r.studentUsername)+' — en attente d’approbation</p></div>'
  ).join('');

  const linkKeys = await safeList('parentlink:' + currentUser + '__', true);
  const linkedStudents = [];
  for(const k of linkKeys){ const l = await safeGet(k, true); if(l && l.approved) linkedStudents.push(l.studentUsername); }
  const restrictedStates = {};
  for(const s of linkedStudents){ restrictedStates[s] = await safeGet('restrictedmode:' + s, true); }
  linkedEl.innerHTML = linkedStudents.length === 0 ? '<div class="empty">Aucun élève suivi pour l’instant.</div>' : linkedStudents.map(s =>
    '<div class="card"><div style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="openParentViewStudent(\''+escapeHtml(s)+'\')">' + smallAvatarBadge(s, 30) + '<span style="font-size:13px; flex:1;">@'+escapeHtml(s)+'</span></div>' +
    '<div style="display:flex; align-items:center; gap:8px; margin-top:10px; padding-top:10px; border-top:1px solid var(--line);"><input type="checkbox" id="restricted-'+escapeHtml(s)+'" style="width:auto;" '+(restrictedStates[s] ? 'checked' : '')+' onchange="toggleRestrictedMode(\''+escapeHtml(s)+'\')"><label style="margin:0; font-size:12px;" for="restricted-'+escapeHtml(s)+'">🔒 Mode Familial — masquer le contenu sensible sur son fil</label></div></div>'
  ).join('');
}
async function renderStudentParentRequests(){
  const el = document.getElementById('student-parent-requests-list');
  if(!el) return;
  const requests = await fetchParentLinkRequests();
  const myRequests = requests.filter(r => r.studentUsername === currentUser && r.status === 'pending');
  el.innerHTML = myRequests.length === 0 ? '<div class="empty">Aucune demande de suivi en attente.</div>' : myRequests.map(r =>
    '<div class="card"><p style="margin:0 0 10px; font-size:13px;">@'+escapeHtml(r.parentUsername)+' souhaite suivre votre progression (cours, notes, badges).</p>' +
    '<div style="display:flex; gap:8px; flex-wrap:wrap;"><button class="btn btn-outline btn-sm" onclick="approveParentLink(\''+r.storageKey+'\')">✓ Autoriser</button>' +
    '<button class="btn btn-outline btn-sm" onclick="rejectParentLink(\''+r.storageKey+'\')">✕ Refuser</button></div></div>'
  ).join('');
}
async function approveParentLink(storageKey){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function rejectParentLink(storageKey){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function openParentViewStudent(studentUsername){
  const link = await safeGet('parentlink:' + currentUser + '__' + studentUsername, true);
  if(!link || !link.approved){ showToast('Suivi non autorisé pour cet élève'); return; }
  document.getElementById('parent-view-student-title').textContent = '@' + studentUsername;
  go('parent-view-student');
  const el = document.getElementById('parent-view-student-content');
  el.innerHTML = '<p style="font-size:13px; color:rgba(245,239,227,0.5);">Chargement...</p>';

  const enrollmentKeys = await safeList('enrollment:', true);
  const courseIds = [];
  for(const k of enrollmentKeys){
    const e = await safeGet(k, true);
    if(e && e.studentUsername === studentUsername && e.status === 'approved') courseIds.push(e.courseId);
  }
  const rows = [];
  let allGrades = [];
  let allBadges = [];
  for(const courseId of courseIds){
    const c = await safeGet('course:' + courseId, true);
    if(!c) continue;
    const exercises = await fetchExercisesForCourse(courseId);
    const grades = [];
    for(const ex of exercises){
      const sub = await safeGet('submission:' + ex.id + '__' + studentUsername, true);
      if(sub && sub.status === 'graded') grades.push(sub.score);
    }
    const examResults = await fetchExamResultsForStudent(courseId, studentUsername);
    examResults.forEach(r => grades.push(r.score));
    if(grades.length > 0) allGrades = allGrades.concat(grades);
    const courseAverage = grades.length > 0 ? (grades.reduce((s,g) => s+g, 0) / grades.length) : null;
    rows.push({ title: c.title, trainerUsername: c.trainerUsername, average: courseAverage });
    const badges = await fetchStudentBadges(courseId, studentUsername);
    allBadges = allBadges.concat(badges);
  }
  const overallAverage = allGrades.length > 0 ? (allGrades.reduce((s,g) => s+g, 0) / allGrades.length).toFixed(1) : null;

  if(courseIds.length === 0){ el.innerHTML = '<div class="empty">Cet élève ne suit encore aucun cours.</div>'; return; }
  el.innerHTML =
    (overallAverage ? '<div class="card" style="text-align:center; margin-bottom:16px;">' +
      '<p style="margin:0 0 4px; font-size:11px; text-transform:uppercase; letter-spacing:.04em;">Moyenne générale</p>' +
      '<p style="margin:0; font-size:22px; font-family:\'Baloo 2\'; font-weight:700;">'+overallAverage+'/20</p></div>' : '') +
    '<div class="eyebrow">Cours suivis</div>' +
    rows.map(r =>
      '<div class="card"><p style="margin:0 0 4px; font-size:13px; font-weight:600;">'+escapeHtml(r.title)+'</p>' +
      '<p style="margin:0 0 4px; font-size:12px; color:rgba(245,239,227,0.6);">Formateur : @'+escapeHtml(r.trainerUsername)+'</p>' +
      '<p style="margin:0; font-size:13px; color:var(--gold);">'+(r.average !== null ? r.average.toFixed(1)+'/20' : 'Pas encore de note')+'</p></div>'
    ).join('') +
    '<div class="eyebrow" style="margin-top:14px;">🏅 Badges reçus</div>' +
    (allBadges.length === 0 ? '<div class="empty">Aucun badge pour l’instant.</div>' : '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
      allBadges.map(b => '<span style="background:rgba(242,183,5,0.15); border:1px solid var(--gold); border-radius:20px; padding:6px 12px; font-size:12px;">'+escapeHtml(b.badgeName)+'</span>').join('') + '</div>');
}
async function openMyReportCard(){
  if(!(await requireEducationSubscription())) return;
  go('report-card');
  const el = document.getElementById('report-card-content');
  el.innerHTML = '<p style="font-size:13px; color:rgba(245,239,227,0.5);">Génération...</p>';

  const enrollmentKeys = await safeList('enrollment:', true);
  const myApprovedCourseIds = [];
  for(const k of enrollmentKeys){
    const e = await safeGet(k, true);
    if(e && e.studentUsername === currentUser && e.status === 'approved') myApprovedCourseIds.push(e.courseId);
  }
  if(myApprovedCourseIds.length === 0){
    el.innerHTML = '<div class="empty">Aucun cours suivi pour l’instant.</div>';
    return;
  }
  const rows = [];
  let allGrades = [];
  for(const courseId of myApprovedCourseIds){
    const c = await safeGet('course:' + courseId, true);
    if(!c) continue;
    const exercises = await fetchExercisesForCourse(courseId);
    const grades = [];
    for(const ex of exercises){
      const sub = await safeGet('submission:' + ex.id + '__' + currentUser, true);
      if(sub && sub.status === 'graded') grades.push(sub.score);
    }
    const examResults = await fetchExamResultsForStudent(courseId, currentUser);
    examResults.forEach(r => grades.push(r.score));
    const courseAverage = grades.length > 0 ? (grades.reduce((s,g) => s+g, 0) / grades.length) : null;
    if(courseAverage !== null) allGrades = allGrades.concat(grades);
    rows.push({ title: c.title, trainerUsername: c.trainerUsername, schoolLevel: c.schoolLevel, average: courseAverage });
  }
  const overallAverage = allGrades.length > 0 ? (allGrades.reduce((s,g) => s+g, 0) / allGrades.length).toFixed(1) : null;
  const now = new Date().toLocaleDateString('fr-FR');

  el.innerHTML =
    '<div style="text-align:center; margin-bottom:20px;">' +
    '<p style="margin:0; font-size:11px; color:rgba(245,239,227,0.5);">SUKTUM — ESPACE ÉDUCATION</p>' +
    '<h2 style="margin:6px 0 4px; font-size:20px; font-family:\'Baloo 2\';">Bulletin de l’élève</h2>' +
    '<p style="margin:0 0 4px; font-size:15px; font-weight:700; color:var(--gold);">@'+escapeHtml(currentUser)+'</p>' +
    '<p style="margin:0; font-size:12px; color:rgba(245,239,227,0.5);">Édité le '+now+'</p>' +
    '</div>' +
    (overallAverage ? '<div class="card" style="text-align:center; margin-bottom:16px;">' +
      '<p style="margin:0 0 4px; font-size:11px; text-transform:uppercase; letter-spacing:.04em;">Moyenne générale (toutes matières)</p>' +
      '<p style="margin:0; font-size:22px; font-family:\'Baloo 2\'; font-weight:700;">'+overallAverage+'/20</p></div>' : '') +
    '<div class="eyebrow">Détail par matière</div>' +
    rows.map(r =>
      '<div class="card"><p style="margin:0 0 4px; font-size:13px; font-weight:600;">'+escapeHtml(r.title)+(r.schoolLevel ? ' · '+escapeHtml(r.schoolLevel) : '')+'</p>' +
      '<p style="margin:0 0 4px; font-size:12px; color:rgba(245,239,227,0.6);">Formateur : @'+escapeHtml(r.trainerUsername)+'</p>' +
      '<p style="margin:0; font-size:14px; color:var(--gold); font-family:\'Baloo 2\'; font-weight:700;">'+(r.average !== null ? r.average.toFixed(1)+'/20' : 'Pas encore de note')+'</p></div>'
    ).join('');
}
async function openLessonPrint(lessonId, courseId){
  if(!(await requireEducationSubscription())) return;
  const lessons = await fetchLessonsForCourse(courseId);
  const l = lessons.find(x => x.id === lessonId);
  if(!l){ showToast('Leçon introuvable'); return; }
  const c = await safeGet('course:' + courseId, true);
  go('lesson-print');
  const el = document.getElementById('lesson-print-content');
  el.innerHTML =
    '<p style="margin:0 0 4px; font-size:11px; color:rgba(245,239,227,0.5);">'+(c ? escapeHtml(c.title) : '')+'</p>' +
    '<h2 style="margin:0 0 16px; font-size:20px; font-family:\'Baloo 2\';">'+escapeHtml(l.title)+'</h2>' +
    '<p style="margin:0; font-size:14px; white-space:pre-line; line-height:1.7;">'+escapeHtml(l.content)+'</p>' +
    (l.attachmentName ? '<p style="margin:16px 0 0; font-size:12px; color:rgba(245,239,227,0.5);">📎 Pièce jointe non incluse dans l’impression : '+escapeHtml(l.attachmentName)+'</p>' : '');
}
/* ---------- CODE DE VÉRIFICATION D'ATTESTATION ---------- */
/* ---------- BINÔME DE RÉVISION ---------- */
let currentStudyBuddyCourseId = null;
/* ---------- BIBLIOTHÈQUE DE RESSOURCES PARTAGÉES ENTRE FORMATEURS ---------- */
async function publishSharedResource(){
  const title = document.getElementById('new-resource-title').value.trim();
  const subject = document.getElementById('new-resource-subject').value.trim();
  const content = document.getElementById('new-resource-content').value.trim();
  if(!title || !content){ showToast('Renseignez au moins un titre et un contenu'); return; }
  const id = 'resource_' + Date.now();
  await saveWithRetry('sharedresource:' + id, {
    id, title, subject, content, authorUsername: currentUser, createdAt: new Date().toISOString()
  }, true);
  document.getElementById('new-resource-title').value = '';
  document.getElementById('new-resource-subject').value = '';
  document.getElementById('new-resource-content').value = '';
  showToast('Ressource publiée dans la bibliothèque ✓');
  go('resource-library');
}
async function fetchSharedResources(){
  const keys = await safeList('sharedresource:', true);
  const list = [];
  for(const k of keys){ const r = await safeGet(k, true); if(r) list.push(r); }
  list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return list;
}
async function renderResourceLibraryList(){
  const el = document.getElementById('resource-library-list');
  if(!el) return;
  const resources = await fetchSharedResources();
  el.innerHTML = resources.length === 0 ? '<div class="empty">Aucune ressource partagée pour l’instant — soyez le premier à en publier une !</div>' : resources.map(r =>
    '<div class="card"><p style="margin:0 0 4px; font-size:13px; font-weight:600;">'+escapeHtml(r.title)+'</p>' +
    (r.subject ? '<p style="margin:0 0 6px; font-size:11.5px; color:var(--gold);">'+escapeHtml(r.subject)+'</p>' : '') +
    '<p style="margin:0 0 10px; font-size:12.5px; color:rgba(245,239,227,0.6);">Par @'+escapeHtml(r.authorUsername)+'</p>' +
    '<button class="btn btn-outline btn-sm" onclick="openImportResource(\''+r.id+'\')">📥 Importer dans un de mes cours</button></div>'
  ).join('');
}
let currentImportResourceId = null;
async function openImportResource(resourceId){
  currentImportResourceId = resourceId;
  go('import-resource');
  const select = document.getElementById('import-resource-course-select');
  const allCourses = await fetchCourses(true);
  const myCourses = allCourses.filter(c => c.trainerUsername === currentUser || (Array.isArray(c.coTrainers) && c.coTrainers.includes(currentUser)));
  if(myCourses.length === 0){
    select.innerHTML = '<option value="">Aucun cours à vous</option>';
  } else {
    select.innerHTML = myCourses.map(c => '<option value="'+c.id+'">'+escapeHtml(c.title)+'</option>').join('');
  }
}
async function importSharedResource(){
  const courseId = document.getElementById('import-resource-course-select').value;
  if(!courseId){ showToast('Choisissez un cours'); return; }
  const resource = await safeGet('sharedresource:' + currentImportResourceId, true);
  if(!resource) return;
  const ts = Date.now();
  await saveWithRetry('lesson:' + courseId + '__' + ts, {
    id: 'lesson_' + courseId + '__' + ts, courseId, title: resource.title, content: resource.content,
    attachmentData: null, attachmentName: null, attachmentType: null, freePreview: false,
    createdAt: new Date().toISOString(), aiFlagged: false, aiFlagReason: ''
  }, true);
  showToast('Ressource importée comme nouvelle leçon ✓');
  go('trainer-dashboard');
}
/* ---------- NOTIFICATION DES ÉLÈVES EN RETARD ---------- */
async function checkLateExerciseReminders(){
  const enrollmentKeys = await safeList('enrollment:', true);
  const myCourseIds = new Set();
  for(const k of enrollmentKeys){
    const e = await safeGet(k, true);
    if(e && e.studentUsername === currentUser && e.status === 'approved') myCourseIds.add(e.courseId);
  }
  for(const courseId of myCourseIds){
    const exercises = await fetchExercisesForCourse(courseId);
    for(const ex of exercises){
      if(!ex.deadline || new Date(ex.deadline) >= new Date()) continue;
      const submission = await safeGet('submission:' + ex.id + '__' + currentUser, true);
      if(submission) continue;
      const notifKey = 'latereminder:' + ex.id + '__' + currentUser;
      const alreadySent = await safeGet(notifKey, true);
      if(alreadySent) continue;
      await saveWithRetry(notifKey, true, true);
      await createNotification(currentUser, 'exercise_late', 'Suktum', ex.id, ex.title);
    }
  }
}
async function renderCourseAttritionHistory(courseId){
  const el = document.getElementById('manage-course-attrition');
  if(!el) return;
  const keys = await safeList('courseleave:' + courseId + '__', true);
  const departures = [];
  for(const k of keys){ const l = await safeGet(k, true); if(l) departures.push(l); }
  departures.sort((a,b) => new Date(b.leftAt) - new Date(a.leftAt));
  if(departures.length === 0){ el.innerHTML = '<div class="empty">Aucun élève n’a encore quitté ce cours.</div>'; return; }
  el.innerHTML = departures.map(d =>
    '<div class="card" style="margin-bottom:6px;"><p style="margin:0 0 3px; font-size:13px;">@'+escapeHtml(d.studentUsername)+' — '+new Date(d.leftAt).toLocaleDateString('fr-FR')+'</p>' +
    (d.reason ? '<p style="margin:0; font-size:12px; color:rgba(245,239,227,0.6); font-style:italic;">« '+escapeHtml(d.reason)+' »</p>' : '<p style="margin:0; font-size:11.5px; color:rgba(245,239,227,0.4);">Aucun motif renseigné.</p>') +
    '</div>'
  ).join('');
}
async function fetchApprovedStudentsForCourse(courseId){
  const enrollKeys = await safeList('enrollment:' + courseId + '__', true);
  const students = [];
  for(const k of enrollKeys){
    const e = await safeGet(k, true);
    if(e && e.status === 'approved') students.push(e.studentUsername);
  }
  return students;
}
async function fetchLateStudentsForCourse(courseId){
  const exercises = await fetchExercisesForCourse(courseId);
  const enrollKeys = await safeList('enrollment:' + courseId + '__', true);
  const students = [];
  for(const k of enrollKeys){
    const e = await safeGet(k, true);
    if(e && e.status === 'approved') students.push(e.studentUsername);
  }
  const lateEntries = [];
  for(const ex of exercises){
    if(!ex.deadline || new Date(ex.deadline) >= new Date()) continue;
    for(const student of students){
      const submission = await safeGet('submission:' + ex.id + '__' + student, true);
      if(!submission) lateEntries.push({ student, exerciseTitle: ex.title, deadline: ex.deadline });
    }
  }
  return lateEntries;
}
async function renderManageCourseLateStudents(){
  const el = document.getElementById('manage-course-late-students');
  if(!el) return;
  const lateEntries = await fetchLateStudentsForCourse(currentManagedCourseId);
  if(lateEntries.length === 0){ el.innerHTML = ''; return; }
  el.innerHTML = '<div class="eyebrow" style="margin-top:14px;">⚠️ Élèves en retard</div>' + lateEntries.map(entry =>
    '<div class="card" style="border-color:var(--coral);"><p style="margin:0; font-size:12.5px;">@'+escapeHtml(entry.student)+' — « '+escapeHtml(entry.exerciseTitle)+' » (à rendre avant le '+new Date(entry.deadline).toLocaleDateString('fr-FR')+')</p></div>'
  ).join('');
}
/* ---------- CARNET DE VOCABULAIRE PERSONNEL ---------- */
async function addVocabWord(lessonId, lessonTitle){
  const input = document.getElementById('vocab-word-' + lessonId);
  const word = input.value.trim();
  if(!word){ showToast('Écrivez un mot ou une notion à retenir'); return; }
  const notebook = (await safeGet('vocabnotebook:' + currentUser, true)) || [];
  notebook.push({ word, lessonTitle, note: '', createdAt: new Date().toISOString() });
  await saveWithRetry('vocabnotebook:' + currentUser, notebook, true);
  input.value = '';
  showToast('Ajouté à votre carnet 📖');
}
async function renderVocabNotebook(){
  const el = document.getElementById('vocab-notebook-list');
  if(!el) return;
  const notebook = (await safeGet('vocabnotebook:' + currentUser, true)) || [];
  if(notebook.length === 0){ el.innerHTML = '<div class="empty">Votre carnet est vide — épinglez un mot depuis une leçon pour commencer.</div>'; return; }
  const sorted = notebook.map((entry, i) => ({ ...entry, index: i })).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  el.innerHTML = sorted.map(entry =>
    '<div class="card">' +
    '<p style="margin:0 0 4px; font-size:14px; font-weight:600; font-family:\'Baloo 2\';">'+escapeHtml(entry.word)+'</p>' +
    '<p style="margin:0 0 8px; font-size:11.5px; color:rgba(245,239,227,0.5);">Depuis « '+escapeHtml(entry.lessonTitle)+' »</p>' +
    '<textarea id="vocab-note-'+entry.index+'" placeholder="Ajouter une définition ou une note personnelle..." style="min-height:50px; font-size:12.5px; margin-bottom:8px;">'+escapeHtml(entry.note||'')+'</textarea>' +
    '<div style="display:flex; gap:6px;">' +
    '<button class="btn btn-outline btn-sm" onclick="saveVocabNote('+entry.index+')">Enregistrer la note</button>' +
    '<button class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral);" onclick="removeVocabWord('+entry.index+')">🗑️</button>' +
    '</div></div>'
  ).join('');
}
async function saveVocabNote(index){
  const notebook = (await safeGet('vocabnotebook:' + currentUser, true)) || [];
  if(!notebook[index]) return;
  notebook[index].note = document.getElementById('vocab-note-' + index).value.trim();
  await saveWithRetry('vocabnotebook:' + currentUser, notebook, true);
  showToast('Note enregistrée ✓');
}
async function removeVocabWord(index){
  const notebook = (await safeGet('vocabnotebook:' + currentUser, true)) || [];
  notebook.splice(index, 1);
  await saveWithRetry('vocabnotebook:' + currentUser, notebook, true);
  showToast('Retiré du carnet');
  await renderVocabNotebook();
}
async function openStudyBuddyFinder(courseId){
  currentStudyBuddyCourseId = courseId;
  go('study-buddy');
  await renderStudyBuddyScreen();
}
async function renderStudyBuddyScreen(){
  const courseId = currentStudyBuddyCourseId;
  const optinKey = 'studybuddyoptin:' + courseId + '__' + currentUser;
  const isOptedIn = await safeGet(optinKey, true);
  const optinEl = document.getElementById('study-buddy-optin-card');
  optinEl.innerHTML = isOptedIn
    ? '<p style="margin:0 0 10px; font-size:13px; color:var(--lagoon);">✓ Vous êtes visible par les autres élèves de ce cours comme partant(e) pour réviser ensemble.</p><button class="btn btn-outline btn-sm" onclick="toggleStudyBuddyOptin(false)">Retirer mon nom de la liste</button>'
    : '<p style="margin:0 0 10px; font-size:12.5px; color:rgba(245,239,227,0.6);">Se rendre visible aux autres élèves inscrits à ce cours, pour que quelqu’un puisse vous contacter afin de réviser ensemble.</p><button class="btn btn-primary btn-sm" onclick="toggleStudyBuddyOptin(true)">Je suis partant(e) pour réviser ensemble</button>';

  const listEl = document.getElementById('study-buddy-list');
  const enrollmentKeys = await safeList('enrollment:', true);
  const courseStudents = [];
  for(const k of enrollmentKeys){
    const e = await safeGet(k, true);
    if(e && e.courseId === courseId && e.status === 'approved') courseStudents.push(e.studentUsername);
  }
  const volunteers = [];
  for(const username of courseStudents){
    if(username === currentUser) continue;
    const opted = await safeGet('studybuddyoptin:' + courseId + '__' + username, true);
    if(opted) volunteers.push(username);
  }
  listEl.innerHTML = volunteers.length === 0 ? '<div class="empty">Personne d’autre ne s’est encore porté volontaire — revenez plus tard, ou soyez le premier !</div>' : volunteers.map(u =>
    '<div class="card" style="display:flex; align-items:center; gap:10px;">' + smallAvatarBadge(u, 32) +
    '<span style="flex:1; font-size:13px;">@'+escapeHtml(u)+'</span>' +
    '<button class="btn btn-outline btn-sm" onclick="contactStudyBuddy(\''+escapeHtml(u)+'\')">💬 Contacter</button>' +
    '</div>'
  ).join('');
}
async function toggleStudyBuddyOptin(value){
  const courseId = currentStudyBuddyCourseId;
  const optinKey = 'studybuddyoptin:' + courseId + '__' + currentUser;
  if(value){
    await saveWithRetry(optinKey, true, true);
    showToast('Vous êtes maintenant visible aux autres élèves ✓');
  }else{
    await window.storage.delete(optinKey, true).catch(() => {});
    showToast('Vous avez été retiré(e) de la liste');
  }
  await renderStudyBuddyScreen();
}
async function contactStudyBuddy(username){
  await openThread(username);
  const input = document.getElementById('thread-input');
  if(input && !input.value) input.value = 'Salut ! On révise ensemble pour le cours ?';
}
async function ensureCertificateVerificationCode(courseId, studentUsername, courseTitle, trainerUsername, average){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function verifyCertificateCode(){
  const input = document.getElementById('verify-cert-code-input').value.trim().toUpperCase();
  const el = document.getElementById('verify-cert-result');
  if(!input){ el.innerHTML = ''; return; }
  const record = await safeGet('certverification:' + input, true);
  if(!record){
    el.innerHTML = '<div class="card" style="border-color:var(--coral);"><p style="margin:0; font-size:13px; color:var(--coral);">❌ Aucune attestation ne correspond à ce code.</p></div>';
    return;
  }
  el.innerHTML = '<div class="card" style="border-color:var(--lagoon);">' +
    '<p style="margin:0 0 8px; font-size:13px; color:var(--lagoon);">✓ Attestation authentique</p>' +
    '<p style="margin:0 0 4px; font-size:13px;">Élève : <strong>@'+escapeHtml(record.studentUsername)+'</strong></p>' +
    '<p style="margin:0 0 4px; font-size:13px;">Cours : <strong>'+escapeHtml(record.courseTitle)+'</strong></p>' +
    '<p style="margin:0 0 4px; font-size:13px;">Formateur : @'+escapeHtml(record.trainerUsername)+'</p>' +
    (record.average ? '<p style="margin:0 0 4px; font-size:13px;">Moyenne : '+escapeHtml(record.average)+'/20</p>' : '') +
    '<p style="margin:8px 0 0; font-size:11.5px; color:rgba(245,239,227,0.5);">Délivrée le '+new Date(record.issuedAt).toLocaleDateString('fr-FR')+'</p>' +
    '</div>';
}
/* ---------- OBJECTIF PERSONNEL — ESPACE ÉDUCATION ---------- */
async function renderCourseGoalSection(courseId){
  const el = document.getElementById('course-goal-section');
  if(!el) return;
  const goal = await safeGet('coursegoal:' + courseId + '__' + currentUser, true);
  if(!goal){
    el.innerHTML = '<div class="card">' +
      '<label style="margin-top:0;">Que voulez-vous accomplir ?</label>' +
      '<input type="text" id="new-goal-text" placeholder="Ex : Terminer ce cours avant la fin du mois">' +
      '<label>Date cible (facultatif)</label>' +
      '<input type="date" id="new-goal-date">' +
      '<button class="btn btn-outline btn-sm" style="margin-top:10px;" onclick="setCourseGoal(\''+courseId+'\')">Fixer mon objectif</button>' +
      '</div>';
    return;
  }
  el.innerHTML = '<div class="card">' +
    '<p style="margin:0 0 4px; font-size:13px;'+(goal.achieved?' text-decoration:line-through; color:rgba(245,239,227,0.5);':'')+'">'+escapeHtml(goal.text)+'</p>' +
    (goal.targetDate ? '<p style="margin:0 0 10px; font-size:11.5px; color:rgba(245,239,227,0.5);">🎯 Cible : '+new Date(goal.targetDate).toLocaleDateString('fr-FR')+'</p>' : '') +
    '<div style="display:flex; gap:8px;">' +
    (goal.achieved
      ? '<span style="color:var(--lagoon); font-size:12.5px;">✓ Objectif atteint !</span>'
      : '<button class="btn btn-primary btn-sm" onclick="markGoalAchieved(\''+courseId+'\')">✓ Marquer comme atteint</button>') +
    '<button class="btn btn-outline btn-sm" onclick="clearCourseGoal(\''+courseId+'\')">Supprimer</button>' +
    '</div></div>';
}
async function setCourseGoal(courseId){
  const text = document.getElementById('new-goal-text').value.trim();
  const targetDate = document.getElementById('new-goal-date').value;
  if(!text){ showToast('Décrivez votre objectif'); return; }
  await saveWithRetry('coursegoal:' + courseId + '__' + currentUser, {
    courseId, studentUsername: currentUser, text, targetDate: targetDate || null, achieved: false, createdAt: new Date().toISOString()
  }, true);
  showToast('Objectif fixé ✓');
  await renderCourseGoalSection(courseId);
}
async function markGoalAchieved(courseId){
  const goal = await safeGet('coursegoal:' + courseId + '__' + currentUser, true);
  if(!goal) return;
  goal.achieved = true;
  await saveWithRetry('coursegoal:' + courseId + '__' + currentUser, goal, true);
  showToast('Bravo, objectif atteint ! 🎉');
  await renderCourseGoalSection(courseId);
}
async function clearCourseGoal(courseId){
  await window.storage.delete('coursegoal:' + courseId + '__' + currentUser, true).catch(() => {});
  await renderCourseGoalSection(courseId);
}
async function openCourseCertificate(courseId){
  if(!(await requireEducationSubscription())) return;
  const surveyKey = 'coursesurvey:' + courseId + '__' + currentUser;
  const alreadySurveyed = await safeGet(surveyKey, true);
  if(!alreadySurveyed){
    currentSurveyCourseId = courseId;
    go('course-survey');
    return;
  }
  go('course-certificate');
  const el = document.getElementById('course-certificate-content');
  el.innerHTML = '<p style="font-size:13px; color:rgba(245,239,227,0.5);">Génération...</p>';

  const c = await safeGet('course:' + courseId, true);
  const enrollment = await fetchEnrollment(courseId, currentUser);
  if(!c || !enrollment || enrollment.status !== 'approved'){ el.innerHTML = '<div class="empty">Attestation indisponible.</div>'; return; }

  const exercises = await fetchExercisesForCourse(courseId);
  const grades = [];
  for(const ex of exercises){
    const sub = await safeGet('submission:' + ex.id + '__' + currentUser, true);
    if(sub && sub.status === 'graded') grades.push(sub.score);
  }
  const examResults = await fetchExamResultsForStudent(courseId, currentUser);
  examResults.forEach(r => grades.push(r.score));
  const average = grades.length > 0 ? (grades.reduce((s,g) => s+g, 0) / grades.length).toFixed(1) : null;

  const attendanceKeys = await safeList('conferenceattendance:', true);
  const trainerSessions = [];
  for(const k of attendanceKeys){
    const s = await safeGet(k, true).catch(() => null);
    if(s && s.trainerUsername === c.trainerUsername) trainerSessions.push(s);
  }
  const attendedCount = trainerSessions.filter(s => s.attendees.includes(currentUser)).length;
  const attendanceRate = trainerSessions.length > 0 ? Math.round((attendedCount / trainerSessions.length) * 100) : null;

  const missingReasons = [];
  if(c.certMinAverage !== null && c.certMinAverage !== undefined){
    if(average === null || parseFloat(average) < c.certMinAverage) missingReasons.push('une moyenne d’au moins '+c.certMinAverage+'/20 (moyenne actuelle : '+(average || 'aucune note')+')');
  }
  if(c.certMinAttendance !== null && c.certMinAttendance !== undefined){
    if(attendanceRate === null || attendanceRate < c.certMinAttendance) missingReasons.push('un taux de présence d’au moins '+c.certMinAttendance+'% (taux actuel : '+(attendanceRate !== null ? attendanceRate+'%' : 'aucune session tenue')+')');
  }
  if(missingReasons.length > 0){
    el.innerHTML = '<div class="empty">🔒 Attestation pas encore disponible.<br><br>Ce cours requiert : '+missingReasons.join(' et ')+'.</div>';
    return;
  }

  const now = new Date().toLocaleDateString('fr-FR');
  const verificationCode = await ensureCertificateVerificationCode(courseId, currentUser, c.title, c.trainerUsername, average);

  el.innerHTML =
    '<div style="text-align:center; border:2px solid var(--gold); border-radius:14px; padding:28px 20px;">' +
    '<p style="margin:0; font-size:11px; color:rgba(245,239,227,0.5); letter-spacing:.1em;">SUKTUM — ESPACE ÉDUCATION</p>' +
    '<h2 style="margin:14px 0 4px; font-size:20px; font-family:\'Baloo 2\';">Attestation de suivi</h2>' +
    '<p style="margin:0 0 20px; font-size:12px; color:rgba(245,239,227,0.5);">Délivrée le '+now+'</p>' +
    '<p style="margin:0 0 4px; font-size:13px;">Ceci atteste que</p>' +
    '<p style="margin:0 0 16px; font-size:19px; font-family:\'Baloo 2\'; font-weight:700; color:var(--gold);">@'+escapeHtml(currentUser)+'</p>' +
    '<p style="margin:0 0 4px; font-size:13px;">a suivi le cours</p>' +
    '<p style="margin:0 0 16px; font-size:16px; font-weight:700;">« '+escapeHtml(c.title)+' »</p>' +
    '<p style="margin:0 0 20px; font-size:13px;">dispensé par <strong>@'+escapeHtml(c.trainerUsername)+'</strong></p>' +
    (average ? '<p style="margin:0; font-size:13px;">Moyenne obtenue : <strong style="color:var(--gold); font-size:16px;">'+average+'/20</strong></p>' : '<p style="margin:0; font-size:12px; color:rgba(245,239,227,0.5);">Aucune évaluation notée pour l’instant.</p>') +
    '<p style="margin:20px 0 0; font-size:11px; color:rgba(245,239,227,0.5); border-top:1px solid var(--line); padding-top:14px;">Code de vérification</p>' +
    '<p style="margin:2px 0 10px; font-size:15px; font-family:\'Courier New\', monospace; letter-spacing:.08em; color:var(--lagoon);">'+verificationCode+'</p>' +
    '<img src="https://api.qrserver.com/v1/create-qr-code/?size=130x130&data='+encodeURIComponent('SUNU_GAAL_CERT:' + verificationCode)+'" style="width:130px; height:130px; border-radius:8px; background:white; padding:6px;">' +
    '<p style="margin:8px 0 0; font-size:10.5px; color:rgba(245,239,227,0.4);">Scannez ce code, ou saisissez-le sur "Vérifier une attestation" depuis Explorer.</p>' +
    '</div>';
}
async function openTrainerGlobalReport(){
  if(!(await requireEducationSubscription())) return;
  go('trainer-global-report');
  const el = document.getElementById('trainer-global-report-content');
  el.innerHTML = '<p style="font-size:13px; color:rgba(245,239,227,0.5);">Génération du rapport...</p>';

  const me = await safeGet('user:' + currentUser, true);
  const activity = await computeTrainerActivity(currentUser);
  const allCourses = (await fetchCourses(true)).filter(c => c.trainerUsername === currentUser);

  const courseRows = [];
  let allGrades = [];
  for(const c of allCourses){
    const enrollmentKeys = await safeList('enrollment:' + c.id + '__', true);
    let studentCount = 0;
    const studentsInCourse = [];
    for(const k of enrollmentKeys){
      const e = await safeGet(k, true);
      if(e && e.status === 'approved'){ studentCount++; studentsInCourse.push(e.studentUsername); }
    }
    const exercises = await fetchExercisesForCourse(c.id);
    for(const ex of exercises){
      for(const student of studentsInCourse){
        const sub = await safeGet('submission:' + ex.id + '__' + student, true);
        if(sub && sub.status === 'graded') allGrades.push(sub.score);
      }
    }
    for(const student of studentsInCourse){
      const results = await fetchExamResultsForStudent(c.id, student);
      results.forEach(r => allGrades.push(r.score));
    }
    courseRows.push({ title: c.title, status: c.status, studentCount, students: studentsInCourse, price: c.price, createdAt: c.createdAt });
  }
  const overallAverage = allGrades.length > 0 ? (allGrades.reduce((s,g) => s+g, 0) / allGrades.length).toFixed(1) : null;
  const now = new Date().toLocaleDateString('fr-FR');

  el.innerHTML =
    '<div style="text-align:center; margin-bottom:20px;">' +
    '<p style="margin:0; font-size:11px; color:rgba(245,239,227,0.5);">SUKTUM — ESPACE ÉDUCATION</p>' +
    '<h2 style="margin:6px 0 4px; font-size:20px; font-family:\'Baloo 2\';">Rapport d’activité du formateur</h2>' +
    '<p style="margin:0; font-size:12px; color:rgba(245,239,227,0.5);">Généré le '+now+'</p>' +
    '</div>' +
    '<div class="card" style="margin-bottom:16px;">' +
    '<p style="margin:0 0 4px; font-size:13px;"><strong>Formateur :</strong> @'+escapeHtml(currentUser)+'</p>' +
    '<p style="margin:0 0 4px; font-size:13px;"><strong>Matière enseignée :</strong> '+escapeHtml((me && me.trainerSubject) || '—')+'</p>' +
    '<p style="margin:0; font-size:13px;"><strong>Formateur depuis :</strong> '+(me && me.trainerSince ? new Date(me.trainerSince).toLocaleDateString('fr-FR') : '—')+'</p>' +
    '</div>' +
    '<div class="card" style="margin-bottom:16px;">' +
    '<p style="margin:0 0 4px; font-size:13px;">📚 Cours créés : <strong>'+activity.courseCount+'</strong></p>' +
    '<p style="margin:0 0 4px; font-size:13px;">📖 Leçons publiées : <strong>'+activity.lessonCount+'</strong></p>' +
    '<p style="margin:0 0 4px; font-size:13px;">👥 Étudiants actifs (total) : <strong>'+activity.activeStudentCount+'</strong></p>' +
    '<p style="margin:0; font-size:13px;">📅 Dernière activité : <strong>'+(activity.lastActivity ? new Date(activity.lastActivity).toLocaleDateString('fr-FR') : '—')+'</strong></p>' +
    '</div>' +
    (overallAverage ? '<div class="card" style="text-align:center; margin-bottom:16px;">' +
      '<p style="margin:0 0 4px; font-size:11px; text-transform:uppercase; letter-spacing:.04em;">Moyenne générale (tous cours, exercices et examens confondus)</p>' +
      '<p style="margin:0; font-size:22px; font-family:\'Baloo 2\'; font-weight:700;">'+overallAverage+'/20</p></div>' : '') +
    '<div class="eyebrow" style="margin-top:6px;">Détail par cours</div>' +
    (courseRows.length === 0 ? '<div class="empty">Aucun cours créé pour l’instant.</div>' : courseRows.map(c =>
      '<div class="card"><p style="margin:0 0 4px; font-size:13px; font-weight:600;">'+escapeHtml(c.title)+'</p>' +
      '<p style="margin:0 0 6px; font-size:12px;">'+c.studentCount+' étudiant(s) · Créé le '+new Date(c.createdAt).toLocaleDateString('fr-FR')+' · '+(c.status === 'active' ? 'Publié' : c.status === 'suspended' ? 'Suspendu' : 'En attente')+'</p>' +
      (c.students.length > 0 ? '<p style="margin:0; font-size:11.5px; color:rgba(245,239,227,0.6);">Élèves : '+c.students.map(s => '@'+escapeHtml(s)).join(', ')+'</p>' : '') +
      '</div>'
    ).join(''));
}
async function openStudentGradebook(studentUsername){
  document.getElementById('student-gradebook-title').textContent = '@' + studentUsername;
  go('student-gradebook');
  const el = document.getElementById('student-gradebook-content');
  el.innerHTML = '<p style="font-size:13px; color:rgba(245,239,227,0.5);">Chargement...</p>';

  const exercises = await fetchExercisesForCourse(currentManagedCourseId);
  const exerciseGrades = [];
  for(const ex of exercises){
    const sub = await safeGet('submission:' + ex.id + '__' + studentUsername, true);
    if(sub && sub.status === 'graded') exerciseGrades.push({ label: ex.title, score: sub.score, type: 'Exercice' });
  }
  const examResults = await fetchExamResultsForStudent(currentManagedCourseId, studentUsername);
  examResults.forEach(r => exerciseGrades.push({ label: r.examTitle, score: r.score, type: 'Examen', comment: r.comment }));

  if(exerciseGrades.length === 0){
    el.innerHTML = '<div class="empty">Aucune note enregistrée pour cet élève dans ce cours pour l’instant.</div>';
    return;
  }
  const average = (exerciseGrades.reduce((s,g) => s + g.score, 0) / exerciseGrades.length).toFixed(1);
  el.innerHTML =
    '<div class="card" style="border-color:var(--gold); text-align:center; margin-bottom:16px;">' +
    '<p style="margin:0 0 4px; font-size:11px; color:var(--gold); text-transform:uppercase; letter-spacing:.04em;">Moyenne générale</p>' +
    '<p style="margin:0; font-size:24px; color:var(--gold); font-family:\'Baloo 2\'; font-weight:700;">'+average+'/20</p>' +
    '</div>' +
    exerciseGrades.map(g =>
      '<div class="card"><p style="margin:0 0 4px; font-size:12.5px; color:rgba(245,239,227,0.55);">'+g.type+'</p>' +
      '<p style="margin:0 0 4px; font-size:13px; font-weight:600;">'+escapeHtml(g.label)+'</p>' +
      '<p style="margin:0; font-size:14px; color:var(--gold); font-family:\'Baloo 2\'; font-weight:700;">'+g.score+'/20</p>' +
      (g.comment ? '<p style="margin:4px 0 0; font-size:12px; font-style:italic; color:rgba(245,239,227,0.6);">'+escapeHtml(g.comment)+'</p>' : '') +
      '</div>'
    ).join('');
}
async function renderManageCourseStudents(){
  const el = document.getElementById('manage-course-students');
  const keys = await safeList('enrollment:' + currentManagedCourseId + '__', true);
  const students = [];
  for(const k of keys){ const e = await safeGet(k, true); if(e && e.status === 'approved') students.push(e); }
  if(students.length === 0){ el.innerHTML = '<div class="empty">Aucun élève inscrit pour l’instant.</div>'; return; }
  const myRequests = await fetchStudentRemovalRequests();
  el.innerHTML = students.map(e => {
    const pending = myRequests.find(r => r.courseId === currentManagedCourseId && r.studentUsername === e.studentUsername && r.status === 'pending');
    return '<div class="card" style="display:flex; align-items:center; gap:10px;">' +
      '<span onclick="openStudentGradebook(\''+escapeHtml(e.studentUsername)+'\')" style="display:flex; align-items:center; gap:10px; flex:1; cursor:pointer;">' + smallAvatarBadge(e.studentUsername, 28) +
      '<span style="font-size:13px;">@'+escapeHtml(e.studentUsername)+'</span></span>' +
      (pending
        ? '<span style="font-size:11px; color:var(--gold);">⏳ Retrait demandé</span>'
        : '<button class="btn btn-outline btn-sm" onclick="requestStudentRemoval(\''+currentManagedCourseId+'\', \''+escapeHtml(e.studentUsername)+'\')">Demander le retrait</button>') +
      '</div>';
  }).join('');
}
async function requestStudentRemoval(courseId, studentUsername){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function fetchStudentRemovalRequests(){
  const keys = await safeList('studentremoval:', true);
  const list = [];
  for(const k of keys){ const r = await safeGet(k, true); if(r) list.push({storageKey: k, ...r}); }
  return list;
}
async function approveStudentRemoval(storageKey){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function rejectStudentRemoval(storageKey){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}

const DEFAULT_QUICK_REPLIES = ['Produit disponible, merci de votre intérêt !', 'Livraison sous 48h.', 'Merci de confirmer votre adresse.'];
async function fetchQuickReplies(){
  const saved = await safeGet('quickreplies:' + currentUser, true);
  return saved || DEFAULT_QUICK_REPLIES.slice();
}
async function addQuickReply(){
  const text = document.getElementById('new-quick-reply-input').value.trim();
  if(!text){ showToast('Écrivez un message'); return; }
  const replies = await fetchQuickReplies();
  replies.push(text);
  await saveWithRetry('quickreplies:' + currentUser, replies, true);
  document.getElementById('new-quick-reply-input').value = '';
  showToast('Réponse rapide ajoutée ✓');
  await renderQuickRepliesManager();
}
async function removeQuickReply(index){
  const replies = await fetchQuickReplies();
  replies.splice(index, 1);
  await saveWithRetry('quickreplies:' + currentUser, replies, true);
  await renderQuickRepliesManager();
}
async function renderQuickRepliesManager(){
  const el = document.getElementById('seller-quick-replies-list');
  if(!el) return;
  const replies = await fetchQuickReplies();
  el.innerHTML = replies.map((r, i) =>
    '<div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;"><span style="flex:1; font-size:12.5px;">'+escapeHtml(r)+'</span>' +
    '<span onclick="removeQuickReply('+i+')" style="cursor:pointer; color:var(--coral); font-size:12px;">✕</span></div>'
  ).join('');
}
async function useQuickReply(buyerUsername, index){
  const replies = await fetchQuickReplies();
  const text = replies[index];
  if(!text) return;
  await openThread(buyerUsername);
  const input = document.getElementById('thread-input');
  if(input) input.value = text;
}
async function deleteSellerProduct(productId){
  const p = await safeGet('product:' + productId, true);
  if(!p || p.sellerUsername !== currentUser) return;
  const ok = confirm('Supprimer « ' + p.name + ' » de votre boutique ?');
  if(!ok) return;
  await window.storage.delete('product:' + productId, true).catch(() => {});
  showToast('Produit supprimé');
  await renderSellerDashboard();
}
