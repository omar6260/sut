/* ---------- STORIES ÉPHÉMÈRES 24H ---------- */
const STORY_DURATION_MS = 24 * 60 * 60 * 1000;
async function fetchActiveStories(){
  const keys = await safeList('story:', true);
  const stories = [];
  for(const k of keys){
    const s = await safeGet(k, true);
    if(s && new Date(s.expiresAt) > new Date() && !s.mediaFlagged) stories.push(s);
  }
  stories.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return stories;
}
async function fetchPinnedStories(username){
  const keys = await safeList('story:', true);
  const stories = [];
  for(const k of keys){
    const s = await safeGet(k, true);
    if(s && s.userId === username && s.pinned && !s.mediaFlagged) stories.push(s);
  }
  stories.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  return stories;
}
async function renderProfileHighlights(){
  const el = document.getElementById('profile-highlights-bar');
  if(!el) return;
  const pinned = await fetchPinnedStories(currentUser);
  if(pinned.length === 0){ el.style.display = 'none'; return; }
  el.style.display = 'flex';
  el.innerHTML = pinned.map((s, i) =>
    '<div style="display:flex; flex-direction:column; align-items:center; gap:4px; flex-shrink:0; cursor:pointer;" onclick="openPinnedHighlight('+i+')">' +
    '<div style="width:56px; height:56px; border-radius:50%; overflow:hidden; border:2px solid var(--gold);">' +
    (s.type === 'video' ? '<video src="'+s.data+'" muted style="width:100%; height:100%; object-fit:cover; touch-action:manipulation;"></video>' : '<img src="'+s.data+'" style="width:100%; height:100%; object-fit:cover;">') +
    '</div></div>'
  ).join('');
}
async function openPinnedHighlight(index){
  const pinned = await fetchPinnedStories(currentUser);
  currentStoryQueue = pinned;
  currentStoryIndex = index;
  document.getElementById('story-viewer-username').textContent = '📌 @' + currentUser;
  go('story-viewer');
  await showCurrentStory();
}
async function renderStoriesBar(){
  const el = document.getElementById('stories-bar');
  if(!el) return;
  const myBlocked = await getMyBlockedUsernames();
  const stories = (await fetchActiveStories()).filter(s => !myBlocked.has(s.userId));
  const byUser = {};
  for(const s of stories){ if(!byUser[s.userId]) byUser[s.userId] = []; byUser[s.userId].push(s); }
  const usernames = Object.keys(byUser);
  if(usernames.length === 0){ el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = 'flex';
  const userCircles = usernames.map(u => {
    const allViewed = byUser[u].every(s => (s.viewedBy||[]).includes(currentUser));
    return '<div style="display:flex; flex-direction:column; align-items:center; gap:4px; flex-shrink:0; cursor:pointer;" onclick="openStoryViewer(\''+escapeHtml(u)+'\')">' +
      '<div style="width:52px; height:52px; border-radius:50%; padding:2px; background:'+(allViewed ? 'rgba(245,239,227,0.25)' : 'linear-gradient(135deg, var(--coral), var(--gold), var(--lagoon))')+';">' +
      '<div style="width:100%; height:100%; border-radius:50%; overflow:hidden; border:2px solid var(--night);">' + smallAvatarBadge(u, 48) + '</div></div>' +
      '<span style="font-size:10px; color:rgba(245,239,227,0.7);">'+(u === currentUser ? 'Vous' : '@'+escapeHtml(u))+'</span></div>';
  });
  el.innerHTML = userCircles.join('');
}
let selectedStoryDuration = '24h';
function setStoryDurationChoice(choice){
  selectedStoryDuration = choice;
  const btn24 = document.getElementById('story-duration-24h-btn');
  const btnPerm = document.getElementById('story-duration-permanent-btn');
  const explainer = document.getElementById('story-duration-explainer');
  const active = { background: 'var(--gold)', color: 'var(--night)', border: '1px solid var(--gold)' };
  const inactive = { background: 'transparent', color: 'var(--cream)', border: '1px solid var(--line)' };
  const apply = (btn, style) => { btn.style.background = style.background; btn.style.color = style.color; btn.style.border = style.border; };
  if(choice === '24h'){
    apply(btn24, active); apply(btnPerm, inactive);
    explainer.textContent = 'Disparaît automatiquement après 24h, comme les stories classiques.';
  } else {
    apply(btnPerm, active); apply(btn24, inactive);
    explainer.textContent = 'Reste visible en permanence à la une de votre profil, ne disparaît jamais.';
  }
}
async function publishStory(){
  const fileInput = document.getElementById('story-upload-input');
  const file = fileInput.files[0];
  if(!file) return;
  if(file.size > MAX_FILE_SIZE){ showToast('Fichier trop lourd (3,5 Mo max)'); fileInput.value = ''; return; }
  try{
    const dataUrl = await readFileAsDataURL(file);
    const isVideoStory = file.type.startsWith('video');
    const mediaCheck = isVideoStory ? await moderateVideoWithVideoIntelligence(dataUrl) : await moderateImageWithCloudVision(dataUrl);
    const id = 'story_' + Date.now();
    const isPermanent = selectedStoryDuration === 'permanent';
    const hasQuestionsSticker = document.getElementById('story-questions-toggle').checked;
    const hasAddYoursSticker = document.getElementById('story-addyours-toggle').checked;
    await saveWithRetry('story:' + id, {
      id, userId: currentUser, type: isVideoStory ? 'video' : 'image',
      data: dataUrl, viewedBy: [], createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + STORY_DURATION_MS).toISOString(),
      pinned: isPermanent, hasQuestionsSticker, hasAddYoursSticker,
      mediaFlagged: mediaCheck.checked && mediaCheck.flagged, mediaFlagReason: mediaCheck.reason || null
    }, true);
    if(mediaCheck.checked && mediaCheck.flagged){
      await logAdminAction('Story signalée automatiquement (Google Cloud)', '@'+currentUser+' — '+mediaCheck.reason);
      showToast('Story envoyée pour vérification avant d’être visible');
    } else {
      showToast(isPermanent ? 'Story publiée — à la une en permanence 📌' : 'Story publiée — visible 24h ⛵');
    }
    fileInput.value = '';
    document.getElementById('story-questions-toggle').checked = false;
    document.getElementById('story-addyours-toggle').checked = false;
    selectedStoryDuration = '24h';
    go('feed');
    await renderStoriesBar();
  }catch(e){
    showToast('Impossible de publier cette story');
    fileInput.value = '';
  }
}
let currentStoryQueue = [];
let currentStoryIndex = 0;
async function openStoryViewer(username){
  const stories = (await fetchActiveStories()).filter(s => s.userId === username);
  if(stories.length === 0){ showToast('Aucune story disponible'); return; }
  currentStoryQueue = stories.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  currentStoryIndex = 0;
  document.getElementById('story-viewer-username').textContent = '@' + username;
  go('story-viewer');
  await showCurrentStory();
}
async function showCurrentStory(){
  const s = currentStoryQueue[currentStoryIndex];
  if(!s){ closeStoryViewer(); return; }
  /* phase 06 : viewedBy écrit par le serveur (markStoryViewed) — voir src/platform/overrides/30-social.js */
  await recordStoryWatchStart(s.id);
  const mediaEl = document.getElementById('story-viewer-media');
  mediaEl.innerHTML = s.type === 'video'
    ? '<video src="'+s.data+'" autoplay playsinline style="max-width:100%; max-height:100%;" onended="advanceStory()"></video>'
    : '<img src="'+s.data+'" style="max-width:100%; max-height:100%; object-fit:contain;">';
  const fill = document.getElementById('story-progress-fill');
  fill.style.transition = 'none';
  fill.style.width = '0%';
  setTimeout(() => { fill.style.transition = 'width ' + (s.type === 'video' ? 8 : 5) + 's linear'; fill.style.width = '100%'; }, 30);
  if(s.type !== 'video'){
    clearTimeout(window._storyTimer);
    window._storyTimer = setTimeout(advanceStory, 5000);
  }
  const pinBtn = document.getElementById('story-pin-btn');
  const isMine = s.userId === currentUser;
  pinBtn.style.display = isMine ? 'block' : 'none';
  pinBtn.textContent = s.pinned ? '📌 Déjà à la une' : '📌 Épingler à la une';
  pinBtn.disabled = !!s.pinned;
  const viewersBtn = document.getElementById('story-viewers-btn');
  if(viewersBtn) viewersBtn.style.display = isMine ? 'block' : 'none';
  const questionsSticker = document.getElementById('story-questions-sticker');
  questionsSticker.style.display = (s.hasQuestionsSticker && !isMine) ? 'block' : 'none';
  document.getElementById('story-question-input').value = '';
  const addYoursSticker = document.getElementById('story-addyours-sticker');
  addYoursSticker.style.display = (s.hasAddYoursSticker && !isMine) ? 'block' : 'none';
}
/* ---------- AUTOCOLLANT "QUESTIONS" SUR UNE STORY ---------- */
/* ---------- "AJOUTEZ LA VÔTRE" — RÉPONDRE À UNE STORY AVEC SA PROPRE PHOTO ---------- */
let pendingAddYoursPrompt = null;
function respondToAddYours(){
  const s = currentStoryQueue[currentStoryIndex];
  if(!s) return;
  pendingAddYoursPrompt = { storyId: s.id, promptAuthor: s.userId };
  showToast('Publiez votre réponse à @' + s.userId);
  go('publish');
}
function renderAddYoursBanner(){
  const el = document.getElementById('addyours-banner');
  if(!el) return;
  if(!pendingAddYoursPrompt){ el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = '✨ Vous ajoutez la vôtre en réponse à @'+escapeHtml(pendingAddYoursPrompt.promptAuthor)+' <span onclick="cancelAddYoursResponse()" style="color:rgba(245,239,227,0.5); cursor:pointer; text-decoration:underline; margin-left:6px;">Annuler</span>';
}
function cancelAddYoursResponse(){
  pendingAddYoursPrompt = null;
  renderAddYoursBanner();
}
async function fetchAddYoursResponses(storyId){
  const allPosts = await fetchPosts();
  return allPosts.filter(p => p.addYoursResponseTo === storyId);
}
async function submitStoryQuestion(){
  if(!requireAccount('Créez un compte pour poser une question')) return;
  const s = currentStoryQueue[currentStoryIndex];
  if(!s) return;
  const input = document.getElementById('story-question-input');
  const question = input.value.trim();
  if(!question){ showToast('Écrivez votre question'); return; }
  const id = 'storyquestion_' + Date.now();
  await saveWithRetry('storyquestion:' + id, {
    id, storyId: s.id, toUser: s.userId, fromUser: currentUser, question, answered: false, createdAt: new Date().toISOString()
  }, true);
  await createNotification(s.userId, 'story_question', currentUser, s.id, question);
  input.value = '';
  showToast('Question envoyée ✓');
}
async function fetchMyStoryQuestions(){
  const keys = await safeList('storyquestion:', true);
  const list = [];
  for(const k of keys){ const q = await safeGet(k, true); if(q && q.toUser === currentUser && !q.answered) list.push(q); }
  list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return list;
}
async function renderMyStoryQuestions(){
  const el = document.getElementById('my-story-questions-list');
  if(!el) return;
  const questions = await fetchMyStoryQuestions();
  el.innerHTML = questions.length === 0 ? '<div class="empty">Aucune question en attente pour l’instant.</div>' : questions.map(q =>
    '<div class="card"><p style="margin:0 0 6px; font-size:13px;">❓ @'+escapeHtml(q.fromUser)+' : « '+escapeHtml(q.question)+' »</p>' +
    '<button class="btn btn-outline btn-sm" onclick="markStoryQuestionAnswered(\''+q.id+'\')">✓ Marquer comme répondue (dans une vidéo)</button></div>'
  ).join('');
}
async function markStoryQuestionAnswered(questionId){
  /* phase 06 : logique serveur — voir src/platform/overrides/30-social.js */
  return;
}
async function pinStoryToHighlights(){
  const s = currentStoryQueue[currentStoryIndex];
  if(!s || s.userId !== currentUser) return;
  s.pinned = true;
  await saveWithRetry('story:' + s.id, s, true);
  document.getElementById('story-pin-btn').textContent = '📌 Déjà à la une';
  document.getElementById('story-pin-btn').disabled = true;
  showToast('Épinglée à la une de votre profil ✓');
}
/* ---------- DURÉE DE VISIONNAGE RÉELLE D'UNE STORY ---------- */
let currentStoryWatchStartedAt = null;
let currentStoryWatchId = null;
async function recordStoryWatchStart(storyId){
  await finalizeStoryWatchDuration();
  currentStoryWatchStartedAt = Date.now();
  currentStoryWatchId = storyId;
}
async function finalizeStoryWatchDuration(){
  if(!currentStoryWatchId || !currentStoryWatchStartedAt || !currentUser) return;
  const durationMs = Date.now() - currentStoryWatchStartedAt;
  if(durationMs > 0){
    await saveWithRetry('storywatchtime:' + currentStoryWatchId + '__' + currentUser, {
      storyId: currentStoryWatchId, viewer: currentUser, durationMs, viewedAt: new Date().toISOString()
    }, true);
  }
  currentStoryWatchStartedAt = null;
  currentStoryWatchId = null;
}
async function fetchStoryWatchTimes(storyId){
  const keys = await safeList('storywatchtime:' + storyId + '__', true);
  const list = [];
  for(const k of keys){ const w = await safeGet(k, true); if(w) list.push(w); }
  list.sort((a,b) => b.durationMs - a.durationMs);
  return list;
}
async function openStoryViewersDurations(){
  const s = currentStoryQueue[currentStoryIndex];
  if(!s) return;
  clearTimeout(window._storyTimer);
  const panel = document.getElementById('story-viewers-durations-panel');
  const listEl = document.getElementById('story-viewers-durations-list');
  const watchTimes = await fetchStoryWatchTimes(s.id);
  listEl.innerHTML = watchTimes.length === 0 ? '<p style="color:rgba(245,239,227,0.5); font-size:13px;">Personne d’autre n’a encore fini de regarder cette story.</p>' : watchTimes.map(w =>
    '<div class="card" style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">' + smallAvatarBadge(w.viewer, 32) +
    '<span style="flex:1; color:white; font-size:13px;">@'+escapeHtml(w.viewer)+'</span>' +
    '<span style="color:var(--gold); font-size:12.5px;">'+(w.durationMs/1000).toFixed(1)+' s</span>' +
    '</div>'
  ).join('');
  panel.style.display = 'block';
}
function closeStoryViewersDurations(){
  document.getElementById('story-viewers-durations-panel').style.display = 'none';
  window._storyTimer = setTimeout(advanceStory, 5000);
}
function advanceStory(){
  finalizeStoryWatchDuration();
  currentStoryIndex++;
  if(currentStoryIndex >= currentStoryQueue.length){ closeStoryViewer(); return; }
  showCurrentStory();
}
function closeStoryViewer(){
  finalizeStoryWatchDuration();
  clearTimeout(window._storyTimer);
  currentStoryQueue = [];
  go('feed');
}

/* ---------- DUO / RÉACTION ---------- */
let duoOriginalPost = null;
let duoCameraStream = null;
let duoRecorder = null;
let duoChunks = [];
let duoIsRecording = false;
async function startCourseVideoRemixRecording(courseId, videoId){
  const keys = await safeList('coursevideo:' + courseId + '__', true);
  let video = null;
  for(const k of keys){ const v = await safeGet(k, true).catch(() => null); if(v && v.id === videoId){ video = v; break; } }
  if(!video || !video.data){ showToast('Vidéo introuvable'); return; }
  const course = await safeGet('course:' + courseId, true).catch(() => null);
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    showToast('Caméra indisponible sur cet appareil');
    return;
  }
  try{
    duoCameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  }catch(e){
    showToast('Accès à la caméra refusé ou indisponible');
    return;
  }
  duoOriginalPost = {
    id: 'coursevideo_' + courseId + '__' + videoId, userId: (course && course.trainerUsername) || 'Suktum',
    data: video.data, caption: video.title, taggedProductId: null, isLessonRemix: true
  };
  go('duo-record');
  const origVideo = document.getElementById('duo-original-video');
  const camVideo = document.getElementById('duo-camera-preview');
  origVideo.src = video.data;
  origVideo.loop = true;
  camVideo.srcObject = duoCameraStream;
  document.getElementById('duo-status').textContent = '';
  document.getElementById('duo-record-btn').textContent = '🔴 Démarrer l’enregistrement';
}
async function startLessonRemixRecording(courseId, lessonId){
  const lesson = await safeGet('lesson:' + courseId + '__' + lessonId, true).catch(() => null);
  if(!lesson || !lesson.attachmentData){ showToast('Leçon introuvable'); return; }
  const course = await safeGet('course:' + courseId, true).catch(() => null);
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    showToast('Caméra indisponible sur cet appareil');
    return;
  }
  try{
    duoCameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  }catch(e){
    showToast('Accès à la caméra refusé ou indisponible');
    return;
  }
  duoOriginalPost = {
    id: 'lesson_' + courseId + '__' + lessonId, userId: (course && course.trainerUsername) || 'Suktum',
    data: lesson.attachmentData, caption: lesson.title, taggedProductId: null, isLessonRemix: true
  };
  go('duo-record');
  const origVideo = document.getElementById('duo-original-video');
  const camVideo = document.getElementById('duo-camera-preview');
  origVideo.src = lesson.attachmentData;
  origVideo.loop = true;
  camVideo.srcObject = duoCameraStream;
  document.getElementById('duo-status').textContent = '';
  document.getElementById('duo-record-btn').textContent = '🔴 Démarrer l’enregistrement';
}
async function startDuoRecording(postId){
  const post = (await fetchPosts()).find(p => p.id === postId);
  if(!post){ showToast('Publication introuvable'); return; }
  duoOriginalPost = post;
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    showToast('Caméra indisponible sur cet appareil');
    return;
  }
  try{
    duoCameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  }catch(e){
    showToast('Accès à la caméra refusé ou indisponible');
    return;
  }
  go('duo-record');
  const origVideo = document.getElementById('duo-original-video');
  const camVideo = document.getElementById('duo-camera-preview');
  origVideo.src = post.data;
  origVideo.loop = true;
  camVideo.srcObject = duoCameraStream;
  document.getElementById('duo-status').textContent = '';
  document.getElementById('duo-record-btn').textContent = '🔴 Démarrer l’enregistrement';
}
function cancelDuoRecording(){
  if(duoCameraStream) duoCameraStream.getTracks().forEach(t => t.stop());
  duoCameraStream = null;
  duoOriginalPost = null;
  duoIsRecording = false;
  go('feed');
}
async function toggleDuoRecording(){
  const btn = document.getElementById('duo-record-btn');
  const statusEl = document.getElementById('duo-status');
  const origVideo = document.getElementById('duo-original-video');
  if(!duoIsRecording){
    const timerSeconds = parseInt(document.getElementById('duo-timer-select').value, 10) || 0;
    if(timerSeconds > 0){
      const overlay = document.getElementById('duo-countdown-overlay');
      overlay.style.display = 'flex';
      for(let n = timerSeconds; n > 0; n--){
        overlay.textContent = n;
        await new Promise(resolve => setTimeout(resolve, 1000));
        if(!duoCameraStream) return;
      }
      overlay.style.display = 'none';
      if(!duoCameraStream) return;
    }
    duoChunks = [];
    duoRecorder = new MediaRecorder(duoCameraStream);
    duoRecorder.ondataavailable = (e) => { if(e.data.size > 0) duoChunks.push(e.data); };
    duoRecorder.onstop = async () => { await composeDuoVideo(); };
    duoRecorder.start();
    duoIsRecording = true;
    origVideo.currentTime = 0;
    origVideo.play();
    btn.textContent = '⏹️ Arrêter l’enregistrement';
    statusEl.textContent = 'Enregistrement en cours...';
  } else {
    duoRecorder.stop();
    origVideo.pause();
    duoIsRecording = false;
    btn.disabled = true;
    statusEl.textContent = '⏳ Composition de la vidéo en cours...';
  }
}
/* ---------- STITCH — REPRENDRE UN EXTRAIT PRÉCIS D'UNE VIDÉO ---------- */
let stitchOriginalPost = null;
async function startStitchRecording(postId){
  const post = (await fetchPosts()).find(p => p.id === postId);
  if(!post){ showToast('Publication introuvable'); return; }
  stitchOriginalPost = post;
  go('stitch-record');
  document.getElementById('stitch-original-preview').src = post.data;
  document.getElementById('stitch-my-video-input').value = '';
  document.getElementById('stitch-status').textContent = '';
}
function cancelStitchRecording(){
  stitchOriginalPost = null;
  go('feed');
}
async function composeStitchVideo(){
  const statusEl = document.getElementById('stitch-status');
  if(!stitchOriginalPost){ showToast('Vidéo d’origine introuvable'); return; }
  const myFile = document.getElementById('stitch-my-video-input').files[0];
  if(!myFile){ showToast('Choisissez votre propre vidéo'); return; }
  const clipDuration = document.getElementById('stitch-clip-duration').value;
  statusEl.textContent = '⏳ Chargement de la bibliothèque de traitement vidéo...';
  try{
    const ffmpeg = await getFFmpegInstance();
    const { fetchFile } = FFmpeg;
    statusEl.textContent = '⏳ Découpe de l’extrait et assemblage...';
    const originalBlob = await (await fetch(stitchOriginalPost.data)).blob();
    ffmpeg.FS('writeFile', 'orig.mp4', await fetchFile(originalBlob));
    ffmpeg.FS('writeFile', 'mine.mp4', await fetchFile(myFile));
    await ffmpeg.run('-i', 'orig.mp4', '-t', clipDuration, '-c', 'copy', 'origclip.mp4');
    const filterComplex =
      '[0:v]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1[v0];' +
      '[1:v]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1[v1];' +
      '[v0][0:a][v1][1:a]concat=n=2:v=1:a=1[outv][outa]';
    await ffmpeg.run(
      '-i', 'origclip.mp4', '-i', 'mine.mp4',
      '-filter_complex', filterComplex, '-map', '[outv]', '-map', '[outa]',
      '-crf', '28', '-preset', 'ultrafast', 'stitched.mp4'
    );
    const data = ffmpeg.FS('readFile', 'stitched.mp4');
    processedVideoBlob = new Blob([data.buffer], { type: 'video/mp4' });
    const dt = new DataTransfer();
    dt.items.add(myFile);
    document.getElementById('publish-file').files = dt.files;
    originalSelectedFile = myFile;
    document.getElementById('publish-caption').value = '✂️ Stitch avec @' + stitchOriginalPost.userId + ' ';
    statusEl.textContent = '✓ Stitch assemblé (' + (processedVideoBlob.size / (1024*1024)).toFixed(2) + ' Mo) — direction la publication...';
    showToast('Stitch assemblé ✓');
    stitchPendingOriginalUserId = stitchOriginalPost.userId;
    setTimeout(() => go('publish'), 800);
  }catch(e){
    statusEl.textContent = '✕ Assemblage indisponible pour le moment (' + e.message + ')';
    processedVideoBlob = null;
  }
}
let stitchPendingOriginalUserId = null;
async function composeDuoVideo(){
  const statusEl = document.getElementById('duo-status');
  try{
    const reactionBlob = new Blob(duoChunks, { type: 'video/webm' });
    const ffmpeg = await getFFmpegInstance();
    const { fetchFile } = FFmpeg;
    ffmpeg.FS('writeFile', 'original.mp4', await fetchFile(duoOriginalPost.data));
    ffmpeg.FS('writeFile', 'reaction.webm', await fetchFile(reactionBlob));
    const layout = document.getElementById('duo-layout-select').value;
    const filterComplex = layout === 'stacked'
      ? '[0:v]scale=480:270[top];[1:v]scale=480:270[bottom];[top][bottom]vstack=inputs=2[vout]'
      : '[0:v]scale=270:480[left];[1:v]scale=270:480[right];[left][right]hstack=inputs=2[vout]';
    await ffmpeg.run(
      '-i', 'original.mp4', '-i', 'reaction.webm',
      '-filter_complex', filterComplex,
      '-map', '[vout]', '-map', '1:a?',
      '-preset', 'ultrafast', 'duo_output.mp4'
    );
    const data = ffmpeg.FS('readFile', 'duo_output.mp4');
    const composedBlob = new Blob([data.buffer], { type: 'video/mp4' });
    const dataUrl = await blobToDataURL(composedBlob);

    const id = 'post_' + Date.now();
    const carriedProductId = duoOriginalPost.taggedProductId || null;
    await saveWithRetry('post:' + id, {
      id, userId: currentUser, type: 'video', data: dataUrl, audioData: null,
      caption: duoOriginalPost.isLessonRemix
        ? '🔄 Remix de la leçon « ' + duoOriginalPost.caption + ' » de @' + duoOriginalPost.userId
        : '🎭 Duo avec @' + duoOriginalPost.userId + (duoOriginalPost.caption ? ' — ' + duoOriginalPost.caption : ''),
      duoWithPostId: duoOriginalPost.id, duoWithUsername: duoOriginalPost.userId, taggedProductId: carriedProductId,
      country: currentUserCountry, city: currentUserCity, likes: [], dislikes: [], comments: [], favoritedBy: [], views: 0,
      commentRestriction: await getMyDefaultCommentRestriction(),
      status: 'published', scheduledFor: null, soundId: null, createdAt: new Date().toISOString()
    }, true);
    await createNotification(duoOriginalPost.userId, 'duo', currentUser, id);
    await notifyFollowersOfNewPost({ id, userId: currentUser });
    if(carriedProductId){
      generateDuetToOrderSuggestion(id, reactionBlob, duoOriginalPost.userId, carriedProductId).catch(() => {});
    }
    statusEl.textContent = '✓ Duo publié !';
    showToast('Duo publié ⛵');
    if(duoCameraStream) duoCameraStream.getTracks().forEach(t => t.stop());
    duoCameraStream = null;
    setTimeout(() => go('feed'), 800);
  }catch(e){
    statusEl.textContent = '✕ Composition indisponible pour le moment (' + e.message + ')';
    document.getElementById('duo-record-btn').disabled = false;
  }
}

/* ---------- DÉTECTION DU RE-VISIONNAGE (signal fort pour "Pour vous") ---------- */
/* ---------- APERÇU AU GLISSEMENT SUR LA BARRE DE PROGRESSION ---------- */
function formatVideoTime(seconds){
  if(!isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m + ':' + String(s).padStart(2, '0');
}
/* ---------- REPRISE DE LECTURE ---------- */
/* ---------- VITESSE DE LECTURE RETENUE ---------- */
/* ---------- IMAGE DANS L'IMAGE ---------- */
function checkPictureInPictureSupport(postId){
  const btn = document.getElementById('pip-btn-' + postId);
  const video = document.getElementById('video-' + postId);
  if(!btn || !video) return;
  if(document.pictureInPictureEnabled && !video.disablePictureInPicture){
    btn.style.display = 'inline-block';
  }
}
function enterLivePip(){
  if(!currentJitsiApi || !currentLiveView) return;
  const jitsiContainer = document.getElementById('live-jitsi-container');
  const pipSlot = document.getElementById('live-pip-jitsi-slot');
  if(!jitsiContainer || !pipSlot) return;
  pipSlot.appendChild(jitsiContainer);
  jitsiContainer.style.paddingBottom = '0';
  jitsiContainer.style.height = '100%';
  isLivePipActive = true;
  livePipLiveIdBeforeMinimize = currentLiveView.id;
  document.getElementById('live-pip-window').style.display = 'block';
  go('feed');
  showToast('Le live continue en petite fenêtre 📺');
}
function exitLivePipToFullView(){
  const jitsiContainer = document.getElementById('live-jitsi-container');
  const embedSlot = document.getElementById('live-view-embed');
  if(jitsiContainer && embedSlot){
    embedSlot.appendChild(jitsiContainer);
    jitsiContainer.style.paddingBottom = '130%';
    jitsiContainer.style.height = '';
  }
  isLivePipActive = false;
  document.getElementById('live-pip-window').style.display = 'none';
}
function expandLivePipToFullView(){
  if(!livePipLiveIdBeforeMinimize) return;
  exitLivePipToFullView();
  openLiveView(livePipLiveIdBeforeMinimize);
}
function closeLivePip(){
  isLivePipActive = false;
  document.getElementById('live-pip-window').style.display = 'none';
  clearLiveViewerHeartbeat();
  if(currentJitsiApi){ try{ currentJitsiApi.dispose(); }catch(e){} currentJitsiApi = null; }
  if(livePollRefreshInterval){ clearInterval(livePollRefreshInterval); livePollRefreshInterval = null; }
  livePipLiveIdBeforeMinimize = null;
}
let livePipMuted = false;
function toggleLivePipMute(){
  if(!currentJitsiApi) return;
  currentJitsiApi.executeCommand('toggleAudio');
  livePipMuted = !livePipMuted;
  document.getElementById('live-pip-mute-icon').textContent = livePipMuted ? '🔇' : '🔊';
}
(function setupLivePipDragAndResize(){
  document.addEventListener('DOMContentLoaded', () => {
    const win = document.getElementById('live-pip-window');
    const handle = document.getElementById('live-pip-drag-handle');
    const resizeHandle = document.getElementById('live-pip-resize-handle');
    if(!win || !handle || !resizeHandle) return;
    let dragging = false, startX = 0, startY = 0, startRight = 0, startTop = 0;
    handle.addEventListener('pointerdown', (e) => {
      if(e.target !== handle) return;
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      startRight = window.innerWidth - win.getBoundingClientRect().right;
      startTop = win.getBoundingClientRect().top;
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', (e) => {
      if(!dragging) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      win.style.right = Math.max(0, startRight - dx) + 'px';
      win.style.top = Math.max(0, startTop + dy) + 'px';
    });
    handle.addEventListener('pointerup', () => { dragging = false; });
    let resizing = false, startW = 0, startH = 0;
    resizeHandle.addEventListener('pointerdown', (e) => {
      resizing = true;
      startX = e.clientX; startY = e.clientY;
      startW = win.offsetWidth; startH = win.offsetHeight;
      resizeHandle.setPointerCapture(e.pointerId);
    });
    resizeHandle.addEventListener('pointermove', (e) => {
      if(!resizing) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      win.style.width = Math.max(100, startW + dx) + 'px';
      win.style.height = Math.max(130, startH + dy) + 'px';
    });
    resizeHandle.addEventListener('pointerup', () => { resizing = false; });
  });
})();
async function togglePictureInPicture(postId){
  const video = document.getElementById('video-' + postId);
  if(!video) return;
  try{
    if(document.pictureInPictureElement){
      await document.exitPictureInPicture();
    } else {
      await video.requestPictureInPicture();
    }
  }catch(e){
    showToast('Mode image dans l’image indisponible pour le moment');
  }
}
let autoplayCountdownInterval = null;
async function showUpNextSuggestion(currentPostId){
  const el = document.getElementById('up-next-suggestion');
  if(!el) return;
  if(autoplayCountdownInterval){ clearInterval(autoplayCountdownInterval); autoplayCountdownInterval = null; }
  const allPosts = await fetchPosts();
  const candidates = allPosts.filter(p => p.id !== currentPostId && p.type === 'video');
  if(candidates.length === 0) return;
  const ranked = await sortPostsForYou(candidates);
  const next = ranked[0];
  if(!next) return;
  const me = currentUser ? await safeGet('user:' + currentUser, true) : null;
  const autoplayEnabled = !me || me.autoplayNextVideo !== false;
  el.innerHTML = '<div class="card">' +
    '<div style="cursor:pointer;" onclick="cancelAutoplayCountdown(); openSinglePostView(\''+next.id+'\')">' +
    '<p style="margin:0 0 8px; font-size:11.5px; color:var(--gold);">▶️ À suivre</p>' +
    (next.customThumbnail ? '<img src="'+next.customThumbnail+'" style="width:100%; border-radius:8px; max-height:160px; object-fit:cover; margin-bottom:8px;">' : '') +
    '<p style="margin:0 0 4px; font-size:13px;">'+escapeHtml((next.caption||'Sans légende').slice(0,80))+'</p>' +
    '<p style="margin:0; font-size:11.5px; color:rgba(245,239,227,0.5);">@'+escapeHtml(next.userId)+'</p>' +
    '</div>' +
    (autoplayEnabled ? '<p id="autoplay-countdown-text" style="margin:8px 0 0; font-size:11.5px; color:var(--lagoon);">Lecture automatique dans <span id="autoplay-countdown-number">5</span>s</p><button class="btn btn-outline btn-sm" style="margin-top:6px;" onclick="cancelAutoplayCountdown()">Annuler</button>' : '') +
    '</div>';
  el.style.display = 'block';
  if(autoplayEnabled){
    let secondsLeft = 5;
    autoplayCountdownInterval = setInterval(() => {
      secondsLeft--;
      const numEl = document.getElementById('autoplay-countdown-number');
      if(numEl) numEl.textContent = secondsLeft;
      if(secondsLeft <= 0){
        clearInterval(autoplayCountdownInterval);
        autoplayCountdownInterval = null;
        openSinglePostView(next.id);
      }
    }, 1000);
  }
}
function cancelAutoplayCountdown(){
  if(autoplayCountdownInterval){ clearInterval(autoplayCountdownInterval); autoplayCountdownInterval = null; }
  const textEl = document.getElementById('autoplay-countdown-text');
  if(textEl) textEl.style.display = 'none';
}
async function applyPreferredPlaybackSpeed(videoEl, postId){
  const selector = document.getElementById('playback-speed-' + postId);
  if(!currentUser){ if(selector) selector.value = '1'; return; }
  const me = await safeGet('user:' + currentUser, true);
  const speed = (me && me.preferredPlaybackSpeed) || 1;
  videoEl.playbackRate = speed;
  if(selector) selector.value = String(speed);
}
async function setPreferredPlaybackSpeed(postId, speed){
  const video = document.getElementById('video-' + postId);
  if(video) video.playbackRate = parseFloat(speed);
  if(!requireAccount('Créez un compte pour mémoriser votre vitesse préférée')) return;
  const me = (await safeGet('user:' + currentUser, true)) || {username: currentUser, createdAt: new Date().toISOString()};
  me.preferredPlaybackSpeed = parseFloat(speed);
  await saveWithRetry('user:' + currentUser, me, true);
  showToast('Vitesse ' + speed + '× mémorisée pour vos prochaines vidéos ✓');
}
function renderChapterMarkers(videoEl, postId){
  const el = document.getElementById('chapter-markers-' + postId);
  if(!el || !videoEl.duration || videoEl.duration <= 1) return;
  const caption = videoEl.dataset.caption || '';
  const matches = [...caption.matchAll(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/g)];
  if(matches.length === 0){ el.innerHTML = ''; return; }
  el.innerHTML = matches.map(m => {
    const ts = m[1];
    const parts = ts.split(':').map(Number);
    let seconds = 0;
    if(parts.length === 2) seconds = parts[0]*60 + parts[1];
    else if(parts.length === 3) seconds = parts[0]*3600 + parts[1]*60 + parts[2];
    if(seconds > videoEl.duration) return '';
    const pct = (seconds / videoEl.duration) * 100;
    return '<span onclick="seekVideoToTimestamp(\''+postId+'\', \''+ts+'\')" style="position:absolute; left:'+pct+'%; top:50%; transform:translate(-50%,-50%); width:6px; height:6px; border-radius:50%; background:var(--gold); pointer-events:auto; cursor:pointer;" title="'+ts+'"></span>';
  }).join('');
}
async function resumeVideoPlayback(videoEl, postId){
  if(!currentUser) return;
  const saved = await safeGet('watchposition:' + postId + '__' + currentUser, false).catch(() => null);
  if(!saved || !saved.seconds) return;
  if(!videoEl.duration || videoEl.duration <= 1) return;
  if(saved.seconds < 5 || saved.seconds > videoEl.duration * 0.95) return;
  videoEl.currentTime = saved.seconds;
  showToast('▶️ Reprise à ' + formatVideoTime(saved.seconds));
}
function saveVideoWatchPositionThrottled(videoEl, postId){
  if(!currentUser || !videoEl.duration) return;
  const lastSaved = parseFloat(videoEl.dataset.lastPositionSave || '0');
  if(Math.abs(videoEl.currentTime - lastSaved) < 5) return;
  videoEl.dataset.lastPositionSave = String(videoEl.currentTime);
  saveWithRetry('watchposition:' + postId + '__' + currentUser, { seconds: videoEl.currentTime, updatedAt: new Date().toISOString() }, false);
}
function clearVideoWatchPosition(postId){
  if(!currentUser) return;
  window.storage.delete('watchposition:' + postId + '__' + currentUser, false).catch(() => {});
}
function updateScrubBarPosition(postId){
  const video = document.getElementById('video-' + postId);
  const scrubBar = document.getElementById('scrub-' + postId);
  if(!video || !scrubBar || !video.duration || document.activeElement === scrubBar) return;
  scrubBar.value = (video.currentTime / video.duration) * 100;
}
function handleScrubInput(postId, rangeEl){
  const video = document.getElementById('video-' + postId);
  if(!video || !video.duration) return;
  const targetTime = (rangeEl.value / 100) * video.duration;
  video.currentTime = targetTime;
  const timeLabel = document.getElementById('scrub-time-' + postId);
  if(timeLabel){
    timeLabel.style.display = 'block';
    timeLabel.textContent = formatVideoTime(targetTime) + ' / ' + formatVideoTime(video.duration);
  }
}
function handleScrubCommit(postId){
  const timeLabel = document.getElementById('scrub-time-' + postId);
  if(timeLabel) setTimeout(() => { timeLabel.style.display = 'none'; }, 700);
}
function detectVideoRewatch(videoEl, postId){
  const prevTime = parseFloat(videoEl.dataset.prevTime || '0');
  const duration = videoEl.duration || 0;
  if(duration > 1 && prevTime > duration * 0.7 && videoEl.currentTime < duration * 0.15){
    if(videoEl.dataset.loopCounted !== 'true'){
      videoEl.dataset.loopCounted = 'true';
      recordRewatchSignal(postId);
    }
  } else if(videoEl.currentTime > duration * 0.3){
    videoEl.dataset.loopCounted = 'false';
  }
  videoEl.dataset.prevTime = videoEl.currentTime;
  trackVideoCompletionMilestone(videoEl, postId, duration);
}
function trackVideoCompletionMilestone(videoEl, postId, duration){
  if(!duration || duration <= 1 || !currentUser) return;
  const pct = videoEl.currentTime / duration;
  const milestones = [0.25, 0.5, 0.75, 0.95];
  const reached = parseFloat(videoEl.dataset.maxMilestone || '0');
  for(const m of milestones){
    if(pct >= m && m > reached){
      videoEl.dataset.maxMilestone = String(m);
      recordVideoCompletionSignal(postId, m);
    }
  }
}
async function recordVideoCompletionSignal(postId, milestone){
  const key = 'videocompletion:' + postId + '__' + currentUser;
  const existing = (await safeGet(key, true)) || { postId, username: currentUser, maxCompletion: 0, viewerCountry: null };
  const countryChanged = currentUserCountry && existing.viewerCountry !== currentUserCountry;
  const milestoneImproved = milestone > (existing.maxCompletion || 0);
  if(milestoneImproved || countryChanged){
    if(milestoneImproved){ existing.maxCompletion = milestone; existing.updatedAt = new Date().toISOString(); }
    if(countryChanged) existing.viewerCountry = currentUserCountry;
    await saveWithRetry(key, existing, true);
  }
}
async function fetchVideoRetentionStats(postId){
  const keys = await safeList('videocompletion:' + postId + '__', true);
  const milestoneCounts = { '0.25': 0, '0.5': 0, '0.75': 0, '0.95': 0 };
  const countryCounts = {};
  let totalViewers = 0;
  for(const k of keys){
    const rec = await safeGet(k, true);
    if(!rec) continue;
    totalViewers++;
    const m = rec.maxCompletion || 0;
    if(m >= 0.25) milestoneCounts['0.25']++;
    if(m >= 0.5) milestoneCounts['0.5']++;
    if(m >= 0.75) milestoneCounts['0.75']++;
    if(m >= 0.95) milestoneCounts['0.95']++;
    if(rec.viewerCountry) countryCounts[rec.viewerCountry] = (countryCounts[rec.viewerCountry] || 0) + 1;
  }
  return { totalViewers, milestoneCounts, countryCounts };
}
async function renderRetentionStats(postId){
  const el = document.getElementById('retention-stats-' + postId);
  if(!el) return;
  const stats = await fetchVideoRetentionStats(postId);
  const p = await safeGet('post:' + postId, true);
  if(stats.totalViewers === 0){
    el.innerHTML = '<div class="card" style="margin-bottom:12px;"><p style="margin:0; font-size:12px; color:rgba(245,239,227,0.5);">📊 Pas encore assez de données de visionnage pour afficher la rétention.</p></div>';
    return;
  }
  const labels = { '0.25': '25%', '0.5': '50%', '0.75': '75%', '0.95': '95%' };
  el.innerHTML = '<div class="card" style="margin-bottom:12px;"><p style="margin:0 0 10px; font-size:12.5px; font-weight:600;">📊 Rétention ('+stats.totalViewers+' spectateur(s) suivi(s))</p>' +
    (p ? '<p style="margin:0 0 10px; font-size:11.5px; color:rgba(245,239,227,0.6);">👁️ '+(p.views || 0)+' vue(s) au total · ⏱️ '+(p.qualifiedViews || 0)+' vue(s) qualifiée(s) (5 secondes ou plus)</p>' : '') +
    Object.keys(labels).map(key => {
      const pct = Math.round((stats.milestoneCounts[key] / stats.totalViewers) * 100);
      return '<div style="margin-bottom:6px;"><div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:2px;"><span>Ont atteint '+labels[key]+'</span><span>'+pct+'%</span></div><div style="background:rgba(245,239,227,0.1); border-radius:6px; height:6px;"><div style="background:var(--gold); height:100%; width:'+pct+'%; border-radius:6px;"></div></div></div>';
    }).join('') + '</div>';
}
async function fetchMyCompletionSignals(){
  const keys = await safeList('videocompletion:', true);
  const weights = {};
  for(const k of keys){
    if(!k.endsWith('__' + currentUser)) continue;
    const rec = await safeGet(k, true);
    if(rec) weights[rec.postId] = rec.maxCompletion || 0;
  }
  return weights;
}
async function recordRewatchSignal(postId){
  if(!currentUser) return;
  const key = 'rewatch:' + postId + '__' + currentUser;
  const existing = (await safeGet(key, true)) || { postId, username: currentUser, count: 0 };
  existing.count = Math.min((existing.count || 0) + 1, 10);
  existing.lastAt = new Date().toISOString();
  await saveWithRetry(key, existing, true);
}
async function fetchMyRewatchSignals(){
  const keys = await safeList('rewatch:', true);
  const weights = {};
  for(const k of keys){
    if(!k.endsWith('__' + currentUser)) continue;
    const r = await safeGet(k, true);
    if(r) weights[r.postId] = r.count;
  }
  return weights;
}

const postViewsCountedThisSession = new Set();
const qualifiedViewsCountedThisSession = new Set();
const sensitiveRevealedThisSession = new Set();
const sensitiveEpisodeRevealedThisSession = new Set();
function revealSensitiveContent(postId){
  sensitiveRevealedThisSession.add(postId);
  renderFeed();
}
function revealSensitiveEpisode(episodeRevealKey, seriesId){
  sensitiveEpisodeRevealedThisSession.add(episodeRevealKey);
  openSeriesDetail(seriesId);
}
