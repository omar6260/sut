/* ---------- POSTS / FEED ---------- */
async function fetchPosts(includeSuspended){
  const keys = await safeList('post:', true);
  const posts = [];
  const pausedUsers = includeSuspended ? new Set() : new Set((await fetchUsers()).filter(u => u.paused).map(u => u.username));
  let myMutualFriends = null;
  let myFollowingForReposts = null;
  if(currentUser){
    const meForPrivacy = await safeGet('user:' + currentUser, true);
    const myFollowingSet = new Set((meForPrivacy && meForPrivacy.following) || []);
    const myFollowersSet = new Set((meForPrivacy && meForPrivacy.followers) || []);
    myMutualFriends = new Set([...myFollowingSet].filter(u => myFollowersSet.has(u)));
    myFollowingForReposts = myFollowingSet;
  }
  const repostsByPostId = {};
  if(myFollowingForReposts && myFollowingForReposts.size > 0){
    const repostKeys = await safeList('repost:', true);
    for(const rk of repostKeys){
      const r = await safeGet(rk, true);
      if(r && myFollowingForReposts.has(r.repostedBy)){
        if(!repostsByPostId[r.postId]) repostsByPostId[r.postId] = r.repostedBy;
      }
    }
  }
  for(const k of keys){
    const p = await safeGet(k, true);
    if(!p) continue;
    if(!includeSuspended && p.suspended) continue;
    if(!includeSuspended && p.mediaFlagged) continue;
    if(!includeSuspended && p.status === 'scheduled' && new Date(p.scheduledFor) > new Date()) continue;
    if(!includeSuspended && p.blockedCountries && p.blockedCountries.length > 0 && currentUserCountry && p.blockedCountries.includes(currentUserCountry)) continue;
    if(!includeSuspended && pausedUsers.has(p.userId)) continue;
    if(p.postPrivacy && p.postPrivacy !== 'public' && p.userId !== currentUser){
      if(p.postPrivacy === 'private') continue;
      if(p.postPrivacy === 'friends' && !(myMutualFriends && myMutualFriends.has(p.userId))) continue;
    }
    if(repostsByPostId[p.id]) p.repostedByFollowedUser = repostsByPostId[p.id];
    posts.push(p);
  }
  posts.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return posts;
}
async function releaseScheduledPosts(){
  /* phase 06 : logique serveur — voir src/platform/overrides/30-social.js */
  return;
}
async function checkMemories(){
  if(!currentUser) return;
  const todayStr = new Date().toISOString().slice(0,10);
  const lastCheck = await safeGet('settings:lastMemoryCheck', false);
  if(lastCheck === todayStr) return;
  await saveWithRetry('settings:lastMemoryCheck', todayStr, false);
  const now = new Date();
  const myPosts = (await fetchPosts(true)).filter(p => p.userId === currentUser && !p.suspended);
  const matches = myPosts.filter(p => {
    const d = new Date(p.createdAt);
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() < now.getFullYear();
  });
  for(const p of matches){
    const yearsAgo = now.getFullYear() - new Date(p.createdAt).getFullYear();
    await createNotification(currentUser, 'memory', 'Suktum', p.id, yearsAgo === 1 ? 'il y a 1 an' : 'il y a ' + yearsAgo + ' ans');
  }
}
/* ---------- BIBLIOTHÈQUE DE TRAITEMENT VIDÉO (FFmpeg.wasm) ---------- */
let ffmpegInstance = null;
let processedVideoBlob = null;
let originalSelectedFile = null;
let recordedVoiceoverBlob = null;
let voiceoverRecorder = null;
let voiceoverChunks = [];
async function toggleVoiceoverRecording(){
  const btn = document.getElementById('vp-voiceover-record-btn');
  const statusEl = document.getElementById('vp-voiceover-status');
  if(!voiceoverRecorder || voiceoverRecorder.state === 'inactive'){
    let stream;
    try{
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }catch(e){
      showToast('Accès au microphone refusé ou indisponible');
      return;
    }
    voiceoverChunks = [];
    voiceoverRecorder = new MediaRecorder(stream);
    voiceoverRecorder.ondataavailable = (e) => { if(e.data.size > 0) voiceoverChunks.push(e.data); };
    voiceoverRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      recordedVoiceoverBlob = new Blob(voiceoverChunks, { type: 'audio/webm' });
      const previewEl = document.getElementById('vp-voiceover-preview');
      previewEl.src = URL.createObjectURL(recordedVoiceoverBlob);
      previewEl.style.display = 'block';
      statusEl.textContent = '✓ Narration enregistrée';
      btn.textContent = '🔴 Réenregistrer la narration';
    };
    voiceoverRecorder.start();
    btn.textContent = '⏹️ Arrêter l’enregistrement';
    statusEl.textContent = 'Enregistrement en cours...';
  } else {
    voiceoverRecorder.stop();
  }
}
let videoClipsQueue = [];
async function getFFmpegInstance(){
  if(ffmpegInstance) return ffmpegInstance;
  if(typeof FFmpeg === 'undefined'){
    throw new Error('Bibliothèque de traitement vidéo indisponible (pas de connexion internet ?)');
  }
  const { createFFmpeg } = FFmpeg;
  ffmpegInstance = createFFmpeg({ log: false });
  await ffmpegInstance.load();
  return ffmpegInstance;
}
/**
 * Superpose un autocollant emoji sur une image via canvas — fiable car le rendu emoji
 * est natif au navigateur (contrairement à FFmpeg qui nécessiterait une police emoji
 * dédiée, absente de l'environnement, donc pas utilisée pour les vidéos ici).
 */
function applyImageSticker(dataUrl, emoji, position){
  return new Promise((resolve) => {
    if(!emoji){ resolve(dataUrl); return; }
    try{
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const fontSize = Math.round(Math.min(img.width, img.height) * 0.14);
        ctx.font = fontSize + 'px sans-serif';
        ctx.textBaseline = 'top';
        const margin = fontSize * 0.3;
        let x = margin, y = margin;
        if(position === 'top-right'){ x = img.width - fontSize - margin; y = margin; }
        else if(position === 'bottom-right'){ x = img.width - fontSize - margin; y = img.height - fontSize - margin; }
        else if(position === 'center'){ x = (img.width - fontSize) / 2; y = (img.height - fontSize) / 2; }
        ctx.fillText(emoji, x, y);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    }catch(e){
      resolve(dataUrl);
    }
  });
}
function onPublishFileSelected(){
  const fileInput = document.getElementById('publish-file');
  const panel = document.getElementById('video-processing-panel');
  const stickerPanel = document.getElementById('image-sticker-panel');
  const file = fileInput.files[0];
  processedVideoBlob = null;
  originalSelectedFile = file || null;
  document.getElementById('vp-status').textContent = '';
  populateSfxSelect();
  videoClipsQueue = [];
  renderVideoClipsQueue();
  speedRampSegments = [];
  renderSpeedRampSegments();
  hideProcessedVideoPreview();
  recordedVoiceoverBlob = null;
  pendingAnimatedCaptionWords = null;
  document.getElementById('vp-voiceover-preview').style.display = 'none';
  document.getElementById('vp-voiceover-status').textContent = '';
  document.getElementById('vp-voiceover-record-btn').textContent = '🔴 Enregistrer une narration';
  const clipPreviewVideo = document.getElementById('clip-preview-video');
  if(file && file.type.startsWith('video')){
    panel.style.display = 'block';
    stickerPanel.style.display = 'none';
    if(clipPreviewVideo){
      clipPreviewVideo.src = URL.createObjectURL(file);
      clipPreviewVideo.style.display = 'block';
    }
  } else if(file && file.type.startsWith('image')){
    panel.style.display = 'none';
    stickerPanel.style.display = 'block';
    if(clipPreviewVideo) clipPreviewVideo.style.display = 'none';
  } else {
    panel.style.display = 'none';
    stickerPanel.style.display = 'none';
    if(clipPreviewVideo) clipPreviewVideo.style.display = 'none';
  }
}
/**
 * FFmpeg's atempo filter only accepts a single stage between 0.5x et 2x.
 * Un facteur combiné (vitesse + éventuel effet de voix) hors de cette plage
 * doit être chaîné en plusieurs étapes valides — cette fonction le fait proprement.
 */
/* ---------- DÉCOUPAGE EN PLUSIEURS EXTRAITS ---------- */
function hideProcessedVideoPreview(){
  const previewEl = document.getElementById('vp-result-preview');
  if(!previewEl) return;
  if(previewEl.dataset.objectUrl) URL.revokeObjectURL(previewEl.dataset.objectUrl);
  previewEl.removeAttribute('src');
  previewEl.dataset.objectUrl = '';
  previewEl.style.display = 'none';
}
let speedRampSegments = [];
function addSpeedRampSegment(){
  const start = parseFloat(document.getElementById('speed-ramp-start').value);
  const end = parseFloat(document.getElementById('speed-ramp-end').value);
  const speed = parseFloat(document.getElementById('speed-ramp-speed').value);
  if(isNaN(start) || isNaN(end) || start < 0 || end <= start){ showToast('Renseignez un début et une fin valides'); return; }
  const video = document.getElementById('clip-preview-video');
  if(video && video.duration && end > video.duration + 0.5){ showToast('La fin dépasse la durée réelle de la vidéo (' + Math.round(video.duration) + 's)'); return; }
  const overlaps = speedRampSegments.some(s => start < s.end && end > s.start);
  if(overlaps){ showToast('Ce segment chevauche un segment déjà ajouté'); return; }
  speedRampSegments.push({ start, end, speed });
  speedRampSegments.sort((a,b) => a.start - b.start);
  document.getElementById('speed-ramp-start').value = '';
  document.getElementById('speed-ramp-end').value = '';
  renderSpeedRampSegments();
}
function removeSpeedRampSegment(index){
  speedRampSegments.splice(index, 1);
  renderSpeedRampSegments();
}
function renderSpeedRampSegments(){
  const el = document.getElementById('speed-ramp-segments-list');
  if(!el) return;
  el.innerHTML = speedRampSegments.map((s,i) => '<div class="card" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; padding:6px 10px;"><span style="font-size:12px;">'+s.start+'s → '+s.end+'s à '+s.speed+'×</span><span onclick="removeSpeedRampSegment('+i+')" style="color:var(--coral); cursor:pointer; font-size:12px;">Retirer</span></div>').join('');
}
function addVideoClipRange(){
  const video = document.getElementById('clip-preview-video');
  const start = parseFloat(document.getElementById('clip-start-input').value);
  const end = parseFloat(document.getElementById('clip-end-input').value);
  if(isNaN(start) || isNaN(end) || start < 0 || end <= start){ showToast('Renseignez un début et une fin valides'); return; }
  if(video.duration && end > video.duration + 0.5){ showToast('La fin dépasse la durée réelle de la vidéo (' + Math.round(video.duration) + 's)'); return; }
  videoClipsQueue.push({ start, end });
  document.getElementById('clip-start-input').value = '';
  document.getElementById('clip-end-input').value = '';
  showToast('Extrait ajouté ✓ (' + videoClipsQueue.length + ' au total)');
  renderVideoClipsQueue();
}
function removeVideoClipRange(index){
  videoClipsQueue.splice(index, 1);
  renderVideoClipsQueue();
}
function renderVideoClipsQueue(){
  const el = document.getElementById('video-clips-queue-list');
  if(!el) return;
  if(videoClipsQueue.length === 0){ el.innerHTML = ''; return; }
  el.innerHTML = '<p style="font-size:11.5px; color:var(--lagoon); margin:0 0 6px;">'+videoClipsQueue.length+' extrait(s) en attente — la publication créera une vidéo distincte pour chacun.</p>' +
    videoClipsQueue.map((c, i) => '<div class="card" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; padding:8px 10px;"><span style="font-size:12.5px;">Extrait '+(i+1)+' : '+c.start+'s → '+c.end+'s</span><span onclick="removeVideoClipRange('+i+')" style="color:var(--coral); cursor:pointer; font-size:12px;">Retirer</span></div>').join('');
}
async function publishBeforeAfter(caption){
  if(!beforeAfterImages.before || !beforeAfterImages.after){ showToast('Choisissez les deux photos, avant et après'); return; }
  showToast('Publication en cours...');
  const beforeCheck = await moderateImageWithCloudVision(beforeAfterImages.before);
  const afterCheck = await moderateImageWithCloudVision(beforeAfterImages.after);
  const flagged = (beforeCheck.checked && beforeCheck.flagged) || (afterCheck.checked && afterCheck.flagged);
  const myDefaultCommentRestriction = await getMyDefaultCommentRestriction();
  const id = 'post_' + Date.now();
  await saveWithRetry('post:' + id, {
    id, userId: currentUser, type: 'beforeafter', beforeImage: beforeAfterImages.before, afterImage: beforeAfterImages.after,
    caption, country: currentUserCountry,
    likes: [], dislikes: [], comments: [], favoritedBy: [], viewedBy: [], views: 0, status: 'published',
    commentRestriction: myDefaultCommentRestriction,
    mediaFlagged: flagged, mediaFlagReason: (beforeCheck.reason || afterCheck.reason) || null,
    createdAt: new Date().toISOString()
  }, true);
  if(!flagged){
    await notifyMentions(caption, currentUser, id);
    await notifyFollowersOfNewPost({ id, userId: currentUser });
  }
  showToast('Publié ✓' + (flagged ? ' — en attente de vérification' : ''));
  await logUserActivity(currentUser, 'contenu', 'Publication mise en ligne');
  document.getElementById('publish-caption').value = '';
  await clearCaptionDraft();
  toggleBeforeAfterMode();
  go('feed');
}
async function publishVideoClips(file, baseCaption){
  showToast('Publication de ' + videoClipsQueue.length + ' extrait(s) en cours...');
  let dataUrl;
  try{
    dataUrl = await readFileAsDataURL(file);
  }catch(e){
    showToast('Impossible de charger la vidéo');
    return;
  }
  const mediaCheck = await moderateVideoWithVideoIntelligence(dataUrl);
  const myDefaultCommentRestriction = await getMyDefaultCommentRestriction();
  const clips = [...videoClipsQueue];
  let publishedCount = 0;
  for(let i = 0; i < clips.length; i++){
    const clip = clips[i];
    const id = 'post_' + Date.now() + '_' + i;
    const clipCaption = baseCaption ? baseCaption + ' (Extrait ' + (i+1) + '/' + clips.length + ')' : 'Extrait ' + (i+1) + '/' + clips.length;
    await saveWithRetry('post:' + id, {
      id, userId: currentUser, type: 'video', data: dataUrl, caption: clipCaption, country: currentUserCountry,
      likes: [], dislikes: [], comments: [], favoritedBy: [], viewedBy: [], views: 0, status: 'published',
      commentRestriction: myDefaultCommentRestriction,
      clipStartTime: clip.start, clipEndTime: clip.end,
      mediaFlagged: mediaCheck.checked && mediaCheck.flagged, mediaFlagReason: mediaCheck.reason || null, mediaFlagConfidence: mediaCheck.confidence || null,
      createdAt: new Date(Date.now() + i).toISOString()
    }, true);
    if(!mediaCheck.flagged){
      await notifyMentions(clipCaption, currentUser, id);
      await notifyFollowersOfNewPost({ id, userId: currentUser });
    }
    publishedCount++;
  }
  showToast(publishedCount + ' extrait(s) publié(s) ✓' + (mediaCheck.checked && mediaCheck.flagged ? ' — en attente de vérification' : ''));
  document.getElementById('publish-file').value = '';
  document.getElementById('publish-caption').value = '';
  await clearCaptionDraft();
  videoClipsQueue = [];
  renderVideoClipsQueue();
  speedRampSegments = [];
  renderSpeedRampSegments();
  hideProcessedVideoPreview();
  document.getElementById('video-processing-panel').style.display = 'none';
  go('feed');
  await renderFeed();
  recordedVoiceoverBlob = null;
  document.getElementById('vp-voiceover-preview').style.display = 'none';
  document.getElementById('vp-voiceover-status').textContent = '';
  document.getElementById('vp-voiceover-record-btn').textContent = '🔴 Enregistrer une narration';
}
function buildAtempoChain(factor){
  const stages = [];
  let remaining = factor;
  while(remaining > 2.0){ stages.push(2.0); remaining /= 2.0; }
  while(remaining < 0.5){ stages.push(0.5); remaining /= 0.5; }
  stages.push(remaining);
  return stages.map(s => 'atempo=' + s.toFixed(4)).join(',');
}
function buildVideoColorChain(crop, filter){
  const parts = [];
  if(crop === '9:16') parts.push("crop='min(iw,ih*9/16)':'min(ih,iw*16/9)'");
  if(crop === '1:1') parts.push("crop='min(iw,ih)':'min(iw,ih)'");
  if(filter === 'bw') parts.push('hue=s=0');
  if(filter === 'sepia') parts.push('colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131:0');
  if(filter === 'vivid') parts.push('eq=saturation=1.4:contrast=1.1');
  if(filter === 'smooth') parts.push('gblur=sigma=1.4,eq=brightness=0.03');
  if(filter === 'glow') parts.push('eq=brightness=0.07:contrast=1.08:saturation=1.15');
  if(filter === 'warm') parts.push('colorbalance=rs=.15:gs=.05:bs=-.15');
  if(filter === 'retro') parts.push('eq=contrast=1.2:saturation=0.75:brightness=-0.03,vignette');
  if(filter === 'negative') parts.push('negate');
  if(filter === 'mirror') parts.push('hflip');
  return parts;
}
function buildVideoFilterChain(crop, filter){
  // conservé pour compatibilité — utilisé par les tests existants
  return buildVideoColorChain(crop, filter).concat([
    "drawtext=text='Suktum':fontcolor=white:fontsize=22:x=55:y=h-45:box=1:boxcolor=0x0B2E3D@0.55:boxborderw=10"
  ]).join(',');
}
function dataURLtoUint8Array(dataUrl){
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for(let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
async function sendSuggestedDuetReply(postId){
  const post = await safeGet('post:' + postId, true);
  if(!post || !post.suggestedReplyText) return;
  const replyText = post.suggestedReplyText;
  const forbiddenWords = await getForbiddenWords();
  if(containsForbiddenWord(replyText, forbiddenWords)){ showToast('La réponse suggérée contient un mot non autorisé — envoyez-la manuellement après l’avoir modifiée'); return; }
  if(post.userId){
    const creatorWords = await getCreatorBlockedWords(post.userId);
    if(containsForbiddenWord(replyText, creatorWords)){ showToast('La réponse suggérée contient un mot bloqué par le créateur de cette vidéo'); return; }
  }
  post.suggestedReplyText = null;
  await saveWithRetry('post:' + postId, post, true);
  const result = await addComment(postId, replyText, null, null, null);
  if(!result.allowed){ showToast(result.reason); return; }
  showToast('Réponse envoyée ✓');
  await openSinglePostView(postId);
}
async function generateDuetToOrderSuggestion(duoPostId, reactionBlob, sellerUsername, productId){
  const geminiKey = await safeGet('settings:geminiApiKey', true).catch(() => null);
  if(!geminiKey) return;
  const product = await safeGet('product:' + productId, true).catch(() => null);
  if(!product) return;
  try{
    const dataUrl = await blobToDataURL(reactionBlob);
    const base64Data = dataUrl.split(',')[1];
    const mimeType = reactionBlob.type || 'video/webm';
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + geminiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: 'Un spectateur pose une question sur le produit « '+product.name+' » ('+product.price+' FCFA) dans cette vidéo de réaction. Rédige en français une courte réponse commerciale chaleureuse (2 phrases maximum) que le vendeur pourrait envoyer pour répondre à sa question et l’encourager à commander. Réponds uniquement avec cette réponse suggérée, sans introduction ni guillemets. Si aucune question claire n’est audible, réponds exactement : AUCUNE_QUESTION_DETECTEE' },
          { inline_data: { mime_type: mimeType, data: base64Data } }
        ] }],
        generationConfig: { maxOutputTokens: 150 }
      })
    });
    const data = await response.json();
    const text = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.map(p => p.text).join('');
    if(!text || text.trim() === 'AUCUNE_QUESTION_DETECTEE') return;
    const post = await safeGet('post:' + duoPostId, true);
    if(!post) return;
    post.suggestedReplyText = text.trim();
    await saveWithRetry('post:' + duoPostId, post, true);
    await createNotification(sellerUsername, 'duet_to_order_suggestion', currentUser, duoPostId, product.name);
  }catch(e){ /* échec silencieux — la fonctionnalité reste facultative */ }
}
let pendingAnimatedCaptionWords = null;
async function generateAnimatedCaptions(){
  if(!originalSelectedFile){ showToast('Choisissez d’abord une vidéo'); return; }
  const geminiKey = await safeGet('settings:geminiApiKey', true).catch(() => null);
  if(!geminiKey){ showToast('Sous-titres animés indisponibles — aucune clé Gemini configurée par l’équipe technique'); return; }
  if(originalSelectedFile.size > 19 * 1024 * 1024){ showToast('Vidéo trop lourde pour la transcription automatique (limite ~19 Mo)'); return; }
  showToast('Analyse mot par mot en cours...');
  try{
    const dataUrl = await readFileAsDataURL(originalSelectedFile);
    const base64Data = dataUrl.split(',')[1];
    const mimeType = originalSelectedFile.type || 'video/mp4';
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + geminiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: 'Transcris fidèlement en français tout ce qui est dit dans cette vidéo, mot par mot, avec le temps de début approximatif de chaque mot en secondes. Réponds UNIQUEMENT avec une ligne par mot, au format exact "secondes|mot" (ex : "1.2|Bonjour"), sans aucun autre texte. Si aucune parole n’est audible, réponds exactement : AUCUNE_PAROLE_DETECTEE' },
          { inline_data: { mime_type: mimeType, data: base64Data } }
        ] }],
        generationConfig: { maxOutputTokens: 1500 }
      })
    });
    const data = await response.json();
    const text = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.map(p => p.text).join('');
    if(!text || text.trim() === 'AUCUNE_PAROLE_DETECTEE'){ showToast('Aucune parole détectée dans cette vidéo'); return; }
    const words = text.trim().split('\n').map(line => {
      const match = line.match(/^([\d.]+)\|(.+)$/);
      if(!match) return null;
      return { time: parseFloat(match[1]), word: match[2].trim() };
    }).filter(Boolean);
    if(words.length === 0){ showToast('Réponse inattendue de l’IA — réessayez'); return; }
    pendingAnimatedCaptionWords = words;
    showToast(words.length + ' mot(s) synchronisé(s) ✓ — activé pour cette publication');
  }catch(e){
    showToast('Erreur lors de l’analyse — réessayez');
  }
}
async function generateAutoCaptions(){
  if(!originalSelectedFile){ showToast('Choisissez d’abord une vidéo'); return; }
  const geminiKey = await safeGet('settings:geminiApiKey', true).catch(() => null);
  if(!geminiKey){ showToast('Sous-titres automatiques indisponibles — aucune clé Gemini configurée par l’équipe technique'); return; }
  if(originalSelectedFile.size > 19 * 1024 * 1024){ showToast('Vidéo trop lourde pour la transcription automatique (limite ~19 Mo)'); return; }
  showToast('Transcription en cours...');
  try{
    const dataUrl = await readFileAsDataURL(originalSelectedFile);
    const base64Data = dataUrl.split(',')[1];
    const mimeType = originalSelectedFile.type || 'video/mp4';
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + geminiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: 'Transcris fidèlement en français tout ce qui est dit dans cette vidéo. Réponds uniquement avec le texte transcrit, sans commentaire ni introduction. Si aucune parole n’est audible, réponds exactement : AUCUNE_PAROLE_DETECTEE' },
          { inline_data: { mime_type: mimeType, data: base64Data } }
        ] }],
        generationConfig: { maxOutputTokens: 500 }
      })
    });
    const data = await response.json();
    const text = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.map(p => p.text).join('');
    if(!text || text.trim() === 'AUCUNE_PAROLE_DETECTEE'){ showToast('Aucune parole détectée dans cette vidéo'); return; }
    const captionField = document.getElementById('publish-caption');
    captionField.value = captionField.value ? (captionField.value + ' ' + text.trim()) : text.trim();
    saveCaptionDraft();
    showToast('Sous-titres générés — ajoutés à votre légende ✓');
  }catch(e){
    showToast('Erreur lors de la transcription — réessayez');
  }
}
async function applySpeedRampIfNeeded(ffmpeg, inputFilename){
  if(speedRampSegments.length === 0) return inputFilename;
  const video = document.getElementById('clip-preview-video');
  const totalDuration = video && video.duration ? video.duration : (speedRampSegments[speedRampSegments.length-1].end + 1);
  const allSegments = [];
  let cursor = 0;
  for(const seg of speedRampSegments){
    if(seg.start > cursor) allSegments.push({ start: cursor, end: seg.start, speed: 1 });
    allSegments.push(seg);
    cursor = seg.end;
  }
  if(cursor < totalDuration) allSegments.push({ start: cursor, end: totalDuration, speed: 1 });
  const filterParts = [];
  const concatLabels = [];
  allSegments.forEach((seg, i) => {
    filterParts.push('[0:v]trim=start='+seg.start+':end='+seg.end+',setpts=(1/'+seg.speed+')*PTS-STARTPTS[v'+i+']');
    const audioTempo = buildAtempoChain(seg.speed);
    filterParts.push('[0:a]atrim=start='+seg.start+':end='+seg.end+','+audioTempo+',asetpts=PTS-STARTPTS[a'+i+']');
    concatLabels.push('[v'+i+'][a'+i+']');
  });
  const filterComplex = filterParts.join(';') + ';' + concatLabels.join('') + 'concat=n='+allSegments.length+':v=1:a=1[vramp][aramp]';
  await ffmpeg.run('-i', inputFilename, '-filter_complex', filterComplex, '-map', '[vramp]', '-map', '[aramp]', '-preset', 'ultrafast', 'ramped.mp4');
  return 'ramped.mp4';
}
let smartCutFiles = [];
let smartCutSelectedSound = null;
let smartCutResultBlob = null;
async function onSmartCutFilesSelected(){
  const files = Array.from(document.getElementById('smart-cut-files').files);
  if(files.length < 2){ showToast('Choisissez au moins 2 photos'); smartCutFiles = []; }
  else if(files.length > 8){ showToast('8 photos maximum — les 8 premières seront utilisées'); smartCutFiles = files.slice(0,8); }
  else { smartCutFiles = files; }
  const previewEl = document.getElementById('smart-cut-photos-preview');
  previewEl.innerHTML = '';
  for(const file of smartCutFiles){
    const dataUrl = await readFileAsDataURL(file);
    previewEl.insertAdjacentHTML('beforeend', '<img src="'+dataUrl+'" style="width:56px; height:56px; object-fit:cover; border-radius:8px;">');
  }
}
async function renderSmartCutSoundList(){
  const el = document.getElementById('smart-cut-sound-list');
  if(!el) return;
  const sounds = await fetchSounds();
  if(sounds.length === 0){ el.innerHTML = '<div class="empty">Aucun son disponible pour l’instant.</div>'; return; }
  el.innerHTML = sounds.slice(0,15).map(s => '<div class="card" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; padding:6px 10px;"><span style="font-size:12.5px;">🎵 '+escapeHtml(s.name)+'</span><button type="button" class="btn btn-outline btn-sm" onclick="selectSmartCutSound(\''+s.id+'\')">Choisir</button></div>').join('');
}
function selectSmartCutSound(soundId){
  fetchSounds().then(sounds => {
    smartCutSelectedSound = sounds.find(s => s.id === soundId) || null;
    document.getElementById('smart-cut-sound-label').textContent = smartCutSelectedSound ? '🎵 ' + smartCutSelectedSound.name : 'Aucun son sélectionné';
  });
}
async function generateSmartCutVideo(){
  const statusEl = document.getElementById('smart-cut-status');
  if(smartCutFiles.length < 2){ showToast('Choisissez au moins 2 photos'); return; }
  if(!smartCutSelectedSound){ showToast('Choisissez une musique de fond'); return; }
  statusEl.textContent = '⏳ Chargement de la bibliothèque de traitement vidéo...';
  try{
    const ffmpeg = await getFFmpegInstance();
    const { fetchFile } = FFmpeg;
    const perPhotoSeconds = 2.2;
    for(let i = 0; i < smartCutFiles.length; i++){
      ffmpeg.FS('writeFile', 'photo' + i + '.jpg', await fetchFile(smartCutFiles[i]));
    }
    statusEl.textContent = '⏳ Génération du mini-clip animé...';
    const inputArgs = [];
    smartCutFiles.forEach((_, i) => { inputArgs.push('-loop', '1', '-t', String(perPhotoSeconds), '-i', 'photo' + i + '.jpg'); });
    const zoomFrames = Math.round(perPhotoSeconds * 25);
    const perClipFilters = smartCutFiles.map((_, i) =>
      '[' + i + ':v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,zoompan=z=\'min(zoom+0.0015,1.15)\':d=' + zoomFrames + ':s=720x1280:fps=25[z' + i + ']'
    ).join(';');
    let concatChain = '';
    for(let i = 1; i < smartCutFiles.length; i++){
      const prevLabel = i === 1 ? 'z0' : 'xf' + (i-1);
      const thisXfade = 'xf' + i;
      concatChain += (i === 1 ? '' : ';') + '[' + prevLabel + '][z' + i + ']xfade=transition=fade:duration=0.4:offset=' + ((i*perPhotoSeconds) - 0.4).toFixed(2) + '[' + thisXfade + ']';
    }
    const finalVideoLabel = smartCutFiles.length === 1 ? 'z0' : 'xf' + (smartCutFiles.length - 1);
    const audioData = smartCutSelectedSound.audioData.split(',')[1];
    ffmpeg.FS('writeFile', 'music.mp3', Uint8Array.from(atob(audioData), c => c.charCodeAt(0)));
    const totalDuration = smartCutFiles.length * perPhotoSeconds;
    await ffmpeg.run(
      ...inputArgs, '-i', 'music.mp3',
      '-filter_complex', perClipFilters + ';' + concatChain,
      '-map', '[' + finalVideoLabel + ']', '-map', String(smartCutFiles.length) + ':a',
      '-t', String(totalDuration), '-shortest', '-preset', 'ultrafast', 'smartcut.mp4'
    );
    const data = ffmpeg.FS('readFile', 'smartcut.mp4');
    smartCutResultBlob = new Blob([data.buffer], { type: 'video/mp4' });
    const previewEl = document.getElementById('smart-cut-preview');
    previewEl.src = URL.createObjectURL(smartCutResultBlob);
    previewEl.style.display = 'block';
    document.getElementById('smart-cut-use-btn').style.display = 'block';
    statusEl.textContent = '✓ Mini-clip prêt (' + (smartCutResultBlob.size / (1024*1024)).toFixed(2) + ' Mo)';
    showToast('Mini-clip généré ✓');
  }catch(e){
    statusEl.textContent = '✕ Génération indisponible pour le moment (' + e.message + ')';
  }
}
function useSmartCutResult(){
  if(!smartCutResultBlob) return;
  const file = new File([smartCutResultBlob], 'smartcut.mp4', { type: 'video/mp4' });
  const dt = new DataTransfer();
  dt.items.add(file);
  document.getElementById('publish-file').files = dt.files;
  originalSelectedFile = file;
  processedVideoBlob = smartCutResultBlob;
  showToast('Mini-clip prêt à publier ✓');
  go('publish');
}
async function processVideoForPublish(){
  const statusEl = document.getElementById('vp-status');
  if(!originalSelectedFile){ showToast('Choisissez d’abord une vidéo'); return; }
  const crop = document.getElementById('vp-crop').value;
  const filter = document.getElementById('vp-filter').value;
  const compress = document.getElementById('vp-compress').checked;
  const voiceEffect = document.getElementById('vp-voice-effect').value;
  const usingRamp = speedRampSegments.length > 0;
  const speed = usingRamp ? 1 : (parseFloat(document.getElementById('vp-speed').value) || 1);
  statusEl.textContent = '⏳ Chargement de la bibliothèque de traitement vidéo...';
  try{
    const ffmpeg = await getFFmpegInstance();
    const { fetchFile } = FFmpeg;
    ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(originalSelectedFile));
    let effectiveInput = 'input.mp4';
    if(usingRamp){
      statusEl.textContent = '⏳ Application de la vitesse variable...';
      effectiveInput = await applySpeedRampIfNeeded(ffmpeg, 'input.mp4');
    }
    statusEl.textContent = '⏳ Traitement en cours (recadrage, filtre, logo pirogue incrusté)...';
    ffmpeg.FS('writeFile', 'logo.png', dataURLtoUint8Array(effectivePlatformLogo));
    const colorParts = buildVideoColorChain(crop, filter);
    if(speed !== 1) colorParts.push('setpts=' + (1/speed).toFixed(4) + '*PTS');
    const colorStage = colorParts.length ? '[0:v]' + colorParts.join(',') + '[vc];' : '[0:v]copy[vc];';
    const filterComplex = colorStage +
      '[1:v]scale=48:-1[logo];' +
      '[vc][logo]overlay=20:H-60[vlogo];' +
      "[vlogo]drawtext=text='Suktum':fontcolor=white:fontsize=20:x=72:y=H-50:box=1:boxcolor=0x0B2E3D@0.55:boxborderw=8[vout]";
    const crf = compress ? '32' : '23';
    const voiceEffectFilters = {
      deep: 'asetrate=44100*0.8,atempo=1.25,aresample=44100',
      high: 'asetrate=44100*1.3,atempo=0.77,aresample=44100',
      robot: 'asetrate=44100*0.9,atempo=1.11,vibrato=f=8:d=0.6,aresample=44100'
    };
    let audioArgs;
    const hasVoiceover = !!recordedVoiceoverBlob;
    if(hasVoiceover){
      ffmpeg.FS('writeFile', 'voiceover.webm', new Uint8Array(await recordedVoiceoverBlob.arrayBuffer()));
      audioArgs = ['-c:a', 'aac'];
    } else if(voiceEffect !== 'none' && voiceEffectFilters[voiceEffect]){
      let combinedFilter = voiceEffectFilters[voiceEffect];
      if(speed !== 1) combinedFilter += ',' + buildAtempoChain(speed);
      audioArgs = ['-af', combinedFilter];
    } else if(speed !== 1){
      audioArgs = ['-af', buildAtempoChain(speed)];
    } else {
      audioArgs = ['-c:a', 'copy'];
    }
    await ffmpeg.run(
      '-i', effectiveInput, '-i', 'logo.png', ...(hasVoiceover ? ['-i', 'voiceover.webm'] : []),
      '-filter_complex', filterComplex,
      '-map', '[vout]', '-map', hasVoiceover ? '2:a' : '0:a?',
      '-crf', crf, '-preset', 'ultrafast', ...audioArgs, '-shortest', 'output.mp4'
    );
    let data = ffmpeg.FS('readFile', 'output.mp4');
    const selectedSfxId = document.getElementById('vp-sfx-select') ? document.getElementById('vp-sfx-select').value : '';
    if(selectedSfxId){
      statusEl.textContent = '⏳ Ajout du bruitage...';
      const sfx = await safeGet('sfx:' + selectedSfxId, true).catch(() => null);
      if(sfx){
        const sfxPosition = document.getElementById('vp-sfx-position').value;
        const intermediateBlob = new Blob([data.buffer], { type: 'video/mp4' });
        const realDuration = await new Promise(resolve => {
          const probeVideo = document.createElement('video');
          probeVideo.preload = 'metadata';
          probeVideo.onloadedmetadata = () => resolve(probeVideo.duration || 0);
          probeVideo.onerror = () => resolve(0);
          probeVideo.src = URL.createObjectURL(intermediateBlob);
        });
        const delayMs = sfxPosition === 'end' ? Math.max(0, Math.round((realDuration - 1.5) * 1000)) : 0;
        const sfxVolumeEl = document.getElementById('vp-sfx-volume');
        const originalVolumeEl = document.getElementById('vp-original-volume');
        const sfxVolume = sfxVolumeEl ? (parseInt(sfxVolumeEl.value, 10) / 100) : 1;
        const originalVolume = originalVolumeEl ? (parseInt(originalVolumeEl.value, 10) / 100) : 1;
        ffmpeg.FS('writeFile', 'sfx.mp3', Uint8Array.from(atob(sfx.audioData.split(',')[1]), c => c.charCodeAt(0)));
        await ffmpeg.run(
          '-i', 'output.mp4', '-i', 'sfx.mp3',
          '-filter_complex', '[0:a]volume=' + originalVolume + '[voriginal];[1:a]adelay=' + delayMs + '|' + delayMs + ',volume=' + sfxVolume + '[sfxd];[voriginal][sfxd]amix=inputs=2:duration=first:dropout_transition=0[aout]',
          '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-preset', 'ultrafast', 'output_sfx.mp4'
        );
        data = ffmpeg.FS('readFile', 'output_sfx.mp4');
      }
    }
    processedVideoBlob = new Blob([data.buffer], { type: 'video/mp4' });
    statusEl.textContent = '✓ Vidéo traitée — prête à publier (' + (processedVideoBlob.size / (1024*1024)).toFixed(2) + ' Mo)';
    const previewEl = document.getElementById('vp-result-preview');
    if(previewEl.dataset.objectUrl) URL.revokeObjectURL(previewEl.dataset.objectUrl);
    const objectUrl = URL.createObjectURL(processedVideoBlob);
    previewEl.src = objectUrl;
    previewEl.dataset.objectUrl = objectUrl;
    previewEl.style.display = 'block';
    showToast('Vidéo traitée ✓');
  } catch(e){
    statusEl.textContent = '✕ Traitement indisponible pour le moment (' + e.message + ')';
    processedVideoBlob = null;
  }
}
function blobToDataURL(blob){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/* ---------- MODÉRATION IA (Google Cloud Vision / Video Intelligence) ---------- */
async function getVisionApiKey(){ return (await safeGet('settings:google_vision_api_key', true)) || ''; }
async function getVideoApiKey(){ return (await safeGet('settings:google_video_api_key', true)) || ''; }
async function isAiAutoBlockEnabled(){ return (await safeGet('settings:ai_auto_block', true)) === true; }
async function saveGoogleModerationKeys(){
  const visionKey = document.getElementById('vision-api-key-input').value.trim();
  const videoKey = document.getElementById('video-api-key-input').value.trim();
  await saveWithRetry('settings:google_vision_api_key', visionKey, true);
  await saveWithRetry('settings:google_video_api_key', videoKey, true);
  showToast('Clés enregistrées ✓');
}
async function saveAiAutoBlockSetting(){
  const enabled = document.getElementById('ai-auto-block-toggle').checked;
  await saveWithRetry('settings:ai_auto_block', enabled, true);
  document.getElementById('ai-auto-block-visual').style.background = enabled ? 'var(--lagoon)' : 'rgba(245,239,227,0.2)';
  showToast(enabled ? 'Blocage automatique activé ✓' : 'Blocage automatique désactivé');
}
async function loadGoogleModerationSettingsAdmin(){
  const el = document.getElementById('vision-api-key-input');
  if(!el) return;
  el.value = await getVisionApiKey();
  document.getElementById('video-api-key-input').value = await getVideoApiKey();
  const enabled = await isAiAutoBlockEnabled();
  document.getElementById('ai-auto-block-toggle').checked = enabled;
  document.getElementById('ai-auto-block-visual').style.background = enabled ? 'var(--lagoon)' : 'rgba(245,239,227,0.2)';
}
// Vérifie une image avec Google Cloud Vision (SafeSearch Detection). Renvoie {flagged, reason} ou null si indisponible/désactivé.
async function checkImageWithVisionAI(dataUrl){
  const apiKey = await getVisionApiKey();
  if(!apiKey) return null;
  try{
    const base64 = dataUrl.split(',')[1];
    const response = await fetch('https://vision.googleapis.com/v1/images:annotate?key=' + apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ image: { content: base64 }, features: [{ type: 'SAFE_SEARCH_DETECTION' }] }] })
    });
    const data = await response.json();
    const safe = data.responses && data.responses[0] && data.responses[0].safeSearchAnnotation;
    if(!safe) return null;
    const risky = ['LIKELY', 'VERY_LIKELY'];
    if(risky.includes(safe.adult)) return { flagged: true, reason: 'Contenu pour adultes détecté' };
    if(risky.includes(safe.violence)) return { flagged: true, reason: 'Contenu violent détecté' };
    if(risky.includes(safe.racy)) return { flagged: true, reason: 'Contenu suggestif détecté' };
    return { flagged: false, reason: null };
  }catch(e){
    return null; // API indisponible — on ne bloque jamais sur un doute technique, la modération humaine prend le relais
  }
}
// Soumet une vidéo à Google Cloud Video Intelligence (détection de contenu explicite). Opération asynchrone : renvoie le nom d'opération à vérifier plus tard.
async function submitVideoForAIAnalysis(postId, dataUrl){
  const apiKey = await getVideoApiKey();
  if(!apiKey) return;
  try{
    const base64 = dataUrl.split(',')[1];
    const response = await fetch('https://videointelligence.googleapis.com/v1/videos:annotate?key=' + apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputContent: base64, features: ['EXPLICIT_CONTENT_DETECTION'] })
    });
    const data = await response.json();
    if(data.name){
      await saveWithRetry('videoanalysis:' + postId, { postId, operationName: data.name, status: 'processing', createdAt: new Date().toISOString() }, true);
    }
  }catch(e){ /* Analyse indisponible — la publication reste soumise à la modération humaine habituelle */ }
}
async function checkVideoAnalysisResult(postId){
  const analysis = await safeGet('videoanalysis:' + postId, true);
  if(!analysis) return;
  const apiKey = await getVideoApiKey();
  if(!apiKey) return;
  try{
    const response = await fetch('https://videointelligence.googleapis.com/v1/' + analysis.operationName + '?key=' + apiKey);
    const data = await response.json();
    if(data.done){
      const frames = data.response && data.response.annotationResults && data.response.annotationResults[0] && data.response.annotationResults[0].explicitAnnotation && data.response.annotationResults[0].explicitAnnotation.frames || [];
      const risky = ['LIKELY', 'VERY_LIKELY'];
      const flagged = frames.some(f => risky.includes(f.pornographyLikelihood));
      analysis.status = 'done';
      analysis.flagged = flagged;
      await saveWithRetry('videoanalysis:' + postId, analysis, true);
      if(flagged){
        const post = await safeGet('post:' + postId, true);
        if(post){ post.suspended = true; await saveWithRetry('post:' + postId, post, true); }
        await logAdminAction('Vidéo suspendue automatiquement (IA)', postId);
      }
      showToast(flagged ? 'Contenu inapproprié détecté — publication suspendue' : 'Aucun contenu inapproprié détecté ✓');
      await loadAdminVideoAnalyses();
    } else {
      showToast('Analyse encore en cours, réessayez dans un instant');
    }
  }catch(e){
    showToast('Impossible de vérifier le résultat pour le moment');
  }
}
async function requestVideoAIAnalysis(postId){
  const post = await safeGet('post:' + postId, true);
  if(!post) return;
  const apiKey = await getVideoApiKey();
  if(!apiKey){ showToast('Aucune clé Video Intelligence configurée'); return; }
  showToast('Analyse envoyée à l’IA...');
  await submitVideoForAIAnalysis(postId, post.data);
  await loadAdminVideoAnalyses();
}
async function loadAdminVideoAnalyses(){
  const el = document.getElementById('admin-video-analyses');
  if(!el) return;
  const keys = await safeList('videoanalysis:', true);
  const analyses = [];
  for(const k of keys){ const a = await safeGet(k, true); if(a) analyses.push(a); }
  analyses.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  if(analyses.length === 0){ el.innerHTML = '<div class="empty">Aucune analyse vidéo pour l’instant.</div>'; return; }
  el.innerHTML = analyses.slice(0, 20).map(a =>
    '<div class="card" style="display:flex; justify-content:space-between; align-items:center;">' +
    '<span style="font-size:12.5px;">'+a.postId+' — '+(a.status === 'processing' ? '⏳ En cours' : (a.flagged ? '🚩 Signalé par l’IA' : '✓ Rien détecté'))+'</span>' +
    (a.status === 'processing' ? '<button class="btn btn-outline btn-sm" onclick="checkVideoAnalysisResult(\''+a.postId+'\')">Vérifier</button>' : '') +
    '</div>'
  ).join('');
}

/* ---------- BIBLIOTHÈQUE DE SONS PARTAGÉS ---------- */
let selectedSharedSound = null;
let cameraPublishStream = null;
let cameraFacingMode = 'user';
let cameraFlashOn = false;
let cameraTimerSeconds = 0;
let cameraTimerHandle = null;
let currentCameraFormat = 'photo';
let selectedCameraSoundId = null;
let cameraRecorder = null;
let cameraRecordedChunks = [];
async function openCameraPublish(){
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    showToast('Caméra indisponible sur cet appareil — utilisez la galerie 📁');
    return;
  }
  try{
    cameraPublishStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: cameraFacingMode }, audio: true });
  }catch(e){
    showToast('Accès à la caméra refusé — vous pouvez toujours publier depuis la galerie 📁');
    return;
  }
  document.getElementById('camera-publish-preview').srcObject = cameraPublishStream;
  const lastDraft = await getMostRecentGalleryThumbnail();
  const thumbEl = document.getElementById('camera-gallery-thumb');
  if(lastDraft){ thumbEl.src = lastDraft; thumbEl.style.display = 'block'; } else { thumbEl.style.display = 'none'; }
}
function closeCameraPublish(){
  if(cameraPublishStream){ cameraPublishStream.getTracks().forEach(t => t.stop()); cameraPublishStream = null; }
  go('feed');
}
async function flipCameraPublish(){
  cameraFacingMode = cameraFacingMode === 'user' ? 'environment' : 'user';
  if(cameraPublishStream) cameraPublishStream.getTracks().forEach(t => t.stop());
  try{
    cameraPublishStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: cameraFacingMode }, audio: true });
    document.getElementById('camera-publish-preview').srcObject = cameraPublishStream;
  }catch(e){ showToast('Impossible de changer de caméra sur cet appareil'); }
}
async function toggleCameraFlash(){
  if(!cameraPublishStream){ return; }
  const track = cameraPublishStream.getVideoTracks()[0];
  const capabilities = track.getCapabilities ? track.getCapabilities() : {};
  if(!capabilities.torch){
    showToast('Le flash n’est pas contrôlable sur cet appareil depuis Suktum');
    return;
  }
  cameraFlashOn = !cameraFlashOn;
  await track.applyConstraints({ advanced: [{ torch: cameraFlashOn }] }).catch(() => showToast('Le flash n’a pas pu être activé'));
  document.getElementById('camera-flash-icon').style.color = cameraFlashOn ? 'var(--gold)' : '#fff';
}
function openCameraTimerPicker(){
  const options = [
    { icon: '🚫', label: 'Pas de minuteur', action: 'closeGenericKebabMenu(); cameraTimerSeconds = 0;' },
    { icon: '3️⃣', label: '3 secondes', action: 'closeGenericKebabMenu(); cameraTimerSeconds = 3;' },
    { icon: '🔟', label: '10 secondes', action: 'closeGenericKebabMenu(); cameraTimerSeconds = 10;' }
  ];
  openGenericKebabMenu(options);
}
function openCameraLayoutPicker(){
  showToast('La mise en page multi-cadres n’est pas encore disponible sur Suktum');
}
function openCameraRetouchPanel(){
  showToast('La retouche visage en direct n’est pas encore disponible sur Suktum — un vrai chantier à part entière');
}
function openCameraEffectsPicker(){
  showToast('Les filtres visuels en direct ne sont pas encore disponibles sur Suktum');
}
async function openCameraSoundPicker(){
  const sounds = await fetchSounds();
  const options = sounds.slice(0, 15).map(s => ({ icon: '🎵', label: s.name, action: 'closeGenericKebabMenu(); selectedCameraSoundId=\'' + s.id + '\'; showToast(\'Son sélectionné ✓\');' }));
  options.unshift({ icon: '🚫', label: 'Aucun son', action: 'closeGenericKebabMenu(); selectedCameraSoundId=null;' });
  openGenericKebabMenu(options);
}
function openCameraMoreOptions(){
  openGenericKebabMenu([
    { icon: '📸', label: 'Carrousel photos', action: 'closeGenericKebabMenu(); go(\'publish\'); toggleCarouselMode();' },
    { icon: '🔄', label: 'Avant/après', action: 'closeGenericKebabMenu(); go(\'publish\'); toggleBeforeAfterMode();' },
    { icon: '📝', label: 'Texte seul', action: 'closeGenericKebabMenu(); go(\'publish\'); toggleTextOnlyPost();' },
    { icon: '➕', label: 'Story', action: 'closeGenericKebabMenu(); go(\'story-compose\');' },
    { icon: '🔴', label: 'Démarrer un live', action: 'closeGenericKebabMenu(); openLiveQuickStartPanel();' },
    { icon: '🎬', label: 'Assembler plusieurs clips', action: 'closeGenericKebabMenu(); go(\'multi-clip-merge\');' },
    { icon: '🤖', label: 'Photos produit → mini-clip IA', action: 'closeGenericKebabMenu(); go(\'smart-cut\');' },
    { icon: '🎥', label: 'Mes brouillons', action: 'closeGenericKebabMenu(); go(\'video-drafts-library\');' }
  ]);
}
function openCameraGalleryPicker(){
  go('publish');
}
function setCameraFormat(el){
  document.querySelectorAll('.camera-format-chip').forEach(chip => {
    chip.dataset.selected = 'false';
    chip.style.background = 'transparent';
    chip.style.color = 'rgba(255,255,255,0.6)';
    chip.style.borderRadius = '0';
    chip.style.padding = '6px 4px';
  });
  el.dataset.selected = 'true';
  el.style.color = '#fff';
  el.style.background = 'rgba(255,255,255,0.2)';
  el.style.borderRadius = '16px';
  el.style.padding = '6px 10px';
  currentCameraFormat = el.dataset.format;
  if(currentCameraFormat === 'texte'){
    if(cameraPublishStream){ cameraPublishStream.getTracks().forEach(t => t.stop()); cameraPublishStream = null; }
    go('publish');
    toggleTextOnlyPost();
  }
}
async function triggerCameraCapture(){
  if(!cameraPublishStream) return;
  if(cameraTimerSeconds > 0){
    const overlay = document.getElementById('camera-timer-countdown');
    const span = overlay.querySelector('span');
    overlay.style.display = 'flex';
    let remaining = cameraTimerSeconds;
    span.textContent = remaining;
    await new Promise(resolve => {
      cameraTimerHandle = setInterval(() => {
        remaining--;
        if(remaining <= 0){ clearInterval(cameraTimerHandle); overlay.style.display = 'none'; resolve(); }
        else span.textContent = remaining;
      }, 1000);
    });
  }
  if(currentCameraFormat === 'photo'){
    capturePhotoFromCamera();
  } else {
    toggleCameraVideoRecording();
  }
}
async function capturePhotoFromCamera(){
  const video = document.getElementById('camera-publish-preview');
  const canvas = document.getElementById('camera-publish-canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if(cameraFacingMode === 'user'){ ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  if(cameraPublishStream){ cameraPublishStream.getTracks().forEach(t => t.stop()); cameraPublishStream = null; }
  go('publish');
  await prefillPublishWithCapturedMedia(dataUrl, 'image');
}
function toggleCameraVideoRecording(){
  const btn = document.getElementById('camera-capture-btn');
  if(!cameraRecorder || cameraRecorder.state === 'inactive'){
    cameraRecordedChunks = [];
    cameraRecorder = new MediaRecorder(cameraPublishStream);
    cameraRecorder.ondataavailable = (e) => { if(e.data.size > 0) cameraRecordedChunks.push(e.data); };
    cameraRecorder.onstop = async () => {
      const blob = new Blob(cameraRecordedChunks, { type: 'video/webm' });
      const reader = new FileReader();
      reader.onload = async () => {
        if(cameraPublishStream){ cameraPublishStream.getTracks().forEach(t => t.stop()); cameraPublishStream = null; }
        go('publish');
        await prefillPublishWithCapturedMedia(reader.result, 'video');
      };
      reader.readAsDataURL(blob);
    };
    cameraRecorder.start();
    btn.style.borderRadius = '16px';
    btn.style.background = 'var(--coral)';
    const maxMs = currentCameraFormat === '15s' ? 15000 : currentCameraFormat === '60s' ? 60000 : 600000;
    cameraTimerHandle = setTimeout(() => { if(cameraRecorder && cameraRecorder.state === 'recording') cameraRecorder.stop(); }, maxMs);
  } else {
    cameraRecorder.stop();
    if(cameraTimerHandle) clearTimeout(cameraTimerHandle);
    btn.style.borderRadius = '50%';
    btn.style.background = '#fff';
  }
}
async function getMostRecentGalleryThumbnail(){
  const drafts = await fetchVideoDrafts().catch(() => []);
  return drafts.length > 0 ? drafts[0].data : null;
}
async function prefillPublishWithCapturedMedia(dataUrl, type){
  const filename = 'suktum-capture-' + Date.now() + (type === 'video' ? '.webm' : '.jpg');
  const file = await dataURLtoFile(dataUrl, filename);
  const dt = new DataTransfer();
  dt.items.add(file);
  document.getElementById('publish-file').files = dt.files;
  onPublishFileSelected();
  if(selectedCameraSoundId){
    const sound = await safeGet('sound:' + selectedCameraSoundId, true).catch(() => null);
    if(sound && sound.audioData){
      const soundFile = await dataURLtoFile(sound.audioData, 'sound-' + selectedCameraSoundId + '.mp3');
      const soundDt = new DataTransfer();
      soundDt.items.add(soundFile);
      document.getElementById('publish-audio').files = soundDt.files;
      sound.usageCount = (sound.usageCount || 0) + 1;
      await saveWithRetry('sound:' + selectedCameraSoundId, sound, true);
    }
    selectedCameraSoundId = null;
  }
  showToast('Média capturé ✓ — complétez votre publication');
}
async function fetchSounds(){
  const keys = await safeList('sound:', true);
  const sounds = [];
  for(const k of keys){ const s = await safeGet(k, true); if(s) sounds.push(s); }
  sounds.sort((a,b) => (b.usageCount||0) - (a.usageCount||0));
  return sounds;
}
async function renderTrendingSounds(){
  const el = document.getElementById('trending-sounds-list');
  if(!el) return;
  await renderWeeklyTrendElection();
  const sounds = sortSoundsByCountryPreference(await fetchSounds());
  if(sounds.length === 0){ el.innerHTML = '<div class="empty">Aucun son partagé pour l’instant.</div>'; return; }
  const top = sounds.slice(0, 20);
  const medals = ['🥇','🥈','🥉'];
  el.innerHTML = top.map((s, i) =>
    '<div class="card" style="display:flex; align-items:center; gap:10px; margin-bottom:8px;'+(s.featuredOnHome ? ' border-color:var(--gold);' : '')+'">' +
    '<span style="font-size:16px; width:26px; text-align:center;">'+(medals[i]||(i+1))+'</span>' +
    '<div style="flex:1; cursor:pointer;" onclick="openSoundDetailPage(\''+s.id+'\')"><strong style="font-size:13px;">'+escapeHtml(s.name)+'</strong>'+(s.featuredOnHome ? ' <span style="font-size:10.5px; color:var(--gold);">⭐ Recommandé</span>' : '') +
    (s.artist ? '<p style="margin:2px 0 0; font-size:11.5px; color:var(--gold);">🎤 '+escapeHtml(s.artist)+'</p>' : '') +
    '<p style="margin:2px 0 0; font-size:11px; color:rgba(245,239,227,0.5);">'+(s.usageCount||0)+' publication(s)</p></div>' +
    '<audio src="'+s.audioData+'" controls style="width:100px; height:32px;"></audio>' +
    '<button class="btn btn-outline btn-sm" onclick="useSoundFromPost(\''+s.id+'\')">Utiliser</button>' +
    '</div>'
  ).join('');
}
async function renderSoundPicker(){
  const el = document.getElementById('sound-picker-list');
  const onlyFavorites = document.getElementById('sound-picker-favorites-only') && document.getElementById('sound-picker-favorites-only').checked;
  const me = currentUser ? await safeGet('user:' + currentUser, true) : null;
  const myFavoriteSounds = new Set((me && me.favoriteSounds) || []);
  let sounds = sortSoundsByCountryPreference(await fetchSounds());
  if(onlyFavorites) sounds = sounds.filter(s => myFavoriteSounds.has(s.id));
  if(sounds.length === 0){ el.innerHTML = '<div class="empty">'+(onlyFavorites ? 'Aucun son favori pour l’instant.' : 'Aucun son partagé pour l’instant.<br>Importez un fichier audio à la publication — il deviendra disponible ici pour les autres.')+'</div>'; return; }
  el.innerHTML = sounds.map(s =>
    '<div class="card" style="display:flex; align-items:center; gap:10px;">' +
    '<span onclick="toggleFavoriteSound(\''+s.id+'\')" style="font-size:18px; cursor:pointer; color:'+(myFavoriteSounds.has(s.id)?'var(--gold)':'rgba(245,239,227,0.3)')+';">'+(myFavoriteSounds.has(s.id)?'⭐':'☆')+'</span>' +
    '<div style="flex:1;"><strong style="font-size:13px;">'+escapeHtml(s.name)+'</strong>' +
    (s.country ? '<span style="font-size:10.5px; color:'+(s.country===currentUserCountry?'var(--lagoon)':'rgba(245,239,227,0.4)')+'; margin-left:6px;">'+(s.country===currentUserCountry?'📍 ':'')+escapeHtml(s.country)+'</span>' : '') +
    (s.artist ? '<p style="font-size:11.5px; color:var(--gold); margin:2px 0 0;">🎤 '+escapeHtml(s.artist)+'</p>' : '') +
    '<p style="font-size:11.5px; color:rgba(245,239,227,0.5); margin:2px 0 0;">'+(s.usageCount||0)+' publication(s) · par @'+escapeHtml(s.uploaderUsername)+'</p></div>' +
    '<audio src="'+s.audioData+'" controls style="width:110px; height:32px;"></audio>' +
    '<button class="btn btn-outline btn-sm" onclick="selectSharedSound(\''+s.id+'\')">Utiliser</button>' +
    '</div>'
  ).join('');
}
async function toggleFavoriteSound(soundId){
  if(!requireAccount('Créez un compte pour enregistrer un son favori')) return;
  const me = (await safeGet('user:' + currentUser, true)) || {username: currentUser, createdAt: new Date().toISOString()};
  if(!me.favoriteSounds) me.favoriteSounds = [];
  const idx = me.favoriteSounds.indexOf(soundId);
  if(idx === -1){ me.favoriteSounds.push(soundId); showToast('Son ajouté aux favoris ⭐'); }
  else { me.favoriteSounds.splice(idx, 1); showToast('Son retiré des favoris'); }
  await saveWithRetry('user:' + currentUser, me, true);
  await renderSoundPicker();
}
async function renderMissedContent(){
  const el = document.getElementById('missed-content-list');
  if(!el || !currentUser) return;
  const me = await safeGet('user:' + currentUser, true);
  if(!me || !me.previousSessionAt){ el.innerHTML = '<div class="empty">Pas encore assez d’historique pour savoir ce que vous avez manqué.</div>'; return; }
  const myFollowing = new Set(me.following || []);
  if(myFollowing.size === 0){ el.innerHTML = '<div class="empty">Vous ne suivez personne pour l’instant.</div>'; return; }
  const allPosts = await fetchPosts();
  const missed = allPosts.filter(p => myFollowing.has(p.userId) && new Date(p.createdAt) > new Date(me.previousSessionAt));
  missed.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  if(missed.length === 0){ el.innerHTML = '<div class="empty">Rien de nouveau de vos abonnements depuis votre dernière visite.</div>'; return; }
  el.innerHTML = '<p style="font-size:11.5px; color:rgba(245,239,227,0.5); margin:0 0 12px;">'+missed.length+' publication(s) de vos abonnements depuis le '+new Date(me.previousSessionAt).toLocaleString('fr-FR')+'.</p>' +
    missed.map(p =>
      '<div class="card" style="display:flex; align-items:center; gap:10px; margin-bottom:8px; cursor:pointer;" onclick="openSinglePostView(\''+p.id+'\')">' +
      smallAvatarBadge(p.userId, 40) +
      '<div style="flex:1;"><strong style="font-size:13px;">@'+escapeHtml(p.userId)+'</strong>' +
      '<p style="margin:2px 0 0; font-size:12px; color:rgba(245,239,227,0.6);">'+escapeHtml((p.caption||'Sans légende').slice(0,60))+'</p></div>' +
      '</div>'
    ).join('');
}
async function openSoundDetailPage(soundId){
  currentSoundDetailId = soundId;
  go('sound-detail');
  await renderSoundDetailPage();
}
let currentSoundDetailId = null;
async function renderSoundDetailPage(){
  if(!currentSoundDetailId) return;
  const s = await safeGet('sound:' + currentSoundDetailId, true);
  const titleEl = document.getElementById('sound-detail-title');
  const infoEl = document.getElementById('sound-detail-info');
  const videosEl = document.getElementById('sound-detail-videos');
  if(!s){ if(infoEl) infoEl.innerHTML = '<div class="empty">Ce son n’existe plus.</div>'; return; }
  if(titleEl) titleEl.textContent = '🎵 ' + s.name;
  if(infoEl) infoEl.innerHTML = '<div class="card"><audio src="'+s.audioData+'" controls style="width:100%;"></audio>' +
    (s.artist ? '<p style="margin:8px 0 0; font-size:12.5px; color:var(--gold);">🎤 '+escapeHtml(s.artist)+'</p>' : '') +
    '<p style="margin:6px 0 0; font-size:12px; color:rgba(245,239,227,0.5);">Ajouté par @'+escapeHtml(s.uploaderUsername)+'</p>' +
    '<button class="btn btn-primary btn-sm" style="width:100%; margin-top:10px;" onclick="useSoundFromPost(\''+currentSoundDetailId+'\')">Utiliser ce son</button></div>';
  const allPosts = await fetchPosts();
  const videosWithSound = allPosts.filter(p => p.soundId === currentSoundDetailId)
    .sort((a,b) => ((b.likes?b.likes.length:0) + (b.views||0)) - ((a.likes?a.likes.length:0) + (a.views||0)));
  if(videosEl){
    if(videosWithSound.length === 0){
      videosEl.innerHTML = '<p style="grid-column:1/-1; font-size:12px; color:rgba(245,239,227,0.5);">Aucune vidéo publique avec ce son pour l’instant.</p>';
    } else {
      videosEl.innerHTML = videosWithSound.map(p =>
        '<div style="cursor:pointer; aspect-ratio:9/16; border-radius:8px; overflow:hidden; background:var(--night-2); position:relative;" onclick="openSinglePostView(\''+p.id+'\')">' +
        (p.customThumbnail ? '<img src="'+p.customThumbnail+'" style="width:100%; height:100%; object-fit:cover;">' : '<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:24px;">🎬</div>') +
        '</div>'
      ).join('');
    }
  }
}
async function useSoundFromPost(soundId){
  if(!requireAccount('Créez un compte pour utiliser ce son')) return;
  await selectSharedSound(soundId);
}
async function selectSharedSound(soundId){
  const s = await safeGet('sound:' + soundId, true);
  if(!s) return;
  selectedSharedSound = s;
  document.getElementById('publish-audio').value = '';
  document.getElementById('selected-sound-label').textContent = '🎵 Son sélectionné : ' + s.name + ' (appuyez sur Publier pour continuer)';
  showToast('Son sélectionné ✓');
  go('publish');
}
async function registerNewSound(audioData, name, uploaderUsername, artist, genre, mood){
  const id = 'sound_' + Date.now();
  await saveWithRetry('sound:' + id, {
    id, name: name || 'Son sans titre', artist: artist || null, genre: genre || null, mood: mood || null, audioData, usageCount: 1, uploaderUsername, country: currentUserCountry, createdAt: new Date().toISOString()
  }, true);
  return id;
}
async function incrementSoundUsage(soundId){
  const s = await safeGet('sound:' + soundId, true);
  if(!s) return;
  s.usageCount = (s.usageCount || 0) + 1;
  await saveWithRetry('sound:' + soundId, s, true);
}
/* ---------- BIBLIOTHÈQUE DE MUSIQUES — AJOUT AUTONOME ---------- */
function sortSoundsByCountryPreference(sounds){
  return [...sounds].sort((a, b) => {
    const aMatch = a.country === currentUserCountry ? 1 : 0;
    const bMatch = b.country === currentUserCountry ? 1 : 0;
    if(aMatch !== bMatch) return bMatch - aMatch;
    return (b.usageCount||0) - (a.usageCount||0);
  });
}
async function renderMusicTrending(){
  const el = document.getElementById('music-trending-list');
  const labelEl = document.getElementById('music-trending-label');
  if(!el) return;
  if(labelEl) labelEl.textContent = '📻 En ce moment' + (currentUserCountry ? ' — ' + currentUserCountry : '');
  const allSounds = await fetchSounds();
  const countrySounds = currentUserCountry ? allSounds.filter(s => s.country === currentUserCountry) : allSounds;
  const top = [...countrySounds].sort((a,b) => (b.usageCount||0) - (a.usageCount||0)).slice(0, 5);
  if(top.length === 0){ el.innerHTML = '<div class="empty">Pas encore de tendance dans votre pays — ajoutez la première musique !</div>'; return; }
  el.innerHTML = top.map((s, i) =>
    '<div class="card" style="display:flex; align-items:center; gap:10px;">' +
    '<span style="font-size:16px; font-family:\'Baloo 2\'; color:var(--gold); width:20px;">'+(i+1)+'</span>' +
    '<div style="flex:1;"><strong style="font-size:13px;">'+escapeHtml(s.name)+'</strong>' +
    (s.artist ? '<p style="font-size:11px; color:rgba(245,239,227,0.5); margin:2px 0 0;">🎤 '+escapeHtml(s.artist)+'</p>' : '') +
    '</div>' +
    '<span style="font-size:11px; color:rgba(245,239,227,0.5);">'+(s.usageCount||0)+' util.</span>' +
    '</div>'
  ).join('');
}
/* ---------- SONS RECOMMANDÉS SELON VOS GOÛTS ---------- */
async function computeRecommendedSounds(){
  const posts = await fetchPosts();
  const engagedPosts = posts.filter(p => (p.likes||[]).includes(currentUser) || (p.favoritedBy||[]).includes(currentUser));
  const soundUsageCounts = {};
  engagedPosts.forEach(p => { if(p.soundId) soundUsageCounts[p.soundId] = (soundUsageCounts[p.soundId]||0) + 1; });
  const allSounds = await fetchSounds();
  const soundById = {};
  allSounds.forEach(s => { soundById[s.id] = s; });
  return Object.entries(soundUsageCounts)
    .map(([soundId, count]) => ({ sound: soundById[soundId], count }))
    .filter(x => x.sound)
    .sort((a,b) => b.count - a.count)
    .slice(0, 5)
    .map(x => x.sound);
}
async function renderRecommendedSounds(){
  const el = document.getElementById('recommended-sounds-section');
  if(!el) return;
  const recommended = await computeRecommendedSounds();
  if(recommended.length === 0){ el.innerHTML = ''; return; }
  el.innerHTML = '<div class="eyebrow" style="margin-top:0;">🎯 Sons qui pourraient vous plaire</div>' +
    recommended.map(s =>
      '<div class="card" style="display:flex; align-items:center; gap:10px;">' +
      '<span style="font-size:20px;">🎵</span>' +
      '<div style="flex:1;"><strong style="font-size:13px;">'+escapeHtml(s.name)+'</strong>' +
      (s.artist ? '<p style="font-size:11.5px; color:var(--gold); margin:2px 0 0;">🎤 '+escapeHtml(s.artist)+'</p>' : '') + '</div>' +
      '<button class="btn btn-outline btn-sm" onclick="selectSharedSound(\''+s.id+'\')">Utiliser</button>' +
      '</div>'
    ).join('');
}
async function renderMusicLibrary(){
  const el = document.getElementById('music-library-list');
  if(!el) return;
  const searchInput = document.getElementById('music-library-search');
  const query = (searchInput ? searchInput.value : '').trim().toLowerCase();
  const genreFilter = document.getElementById('music-genre-filter') ? document.getElementById('music-genre-filter').value : '';
  const moodFilter = document.getElementById('music-mood-filter') ? document.getElementById('music-mood-filter').value : '';
  let sounds = sortSoundsByCountryPreference(await fetchSounds());
  if(query){
    sounds = sounds.filter(s => s.name.toLowerCase().includes(query) || (s.artist && s.artist.toLowerCase().includes(query)) || (s.genre && s.genre.toLowerCase().includes(query)) || (s.mood && s.mood.toLowerCase().includes(query)));
  }
  if(genreFilter) sounds = sounds.filter(s => s.genre === genreFilter);
  if(moodFilter) sounds = sounds.filter(s => s.mood === moodFilter);
  if(sounds.length === 0){ el.innerHTML = '<div class="empty">'+(query || genreFilter || moodFilter ? 'Aucune musique ne correspond à votre recherche.' : 'Aucune musique pour l’instant — soyez le premier à en ajouter une !')+'</div>'; return; }
  el.innerHTML = sounds.map(s =>
    '<div class="card" style="display:flex; align-items:center; gap:10px;">' +
    '<span style="font-size:20px;">🎵</span>' +
    '<div style="flex:1;"><strong style="font-size:13px;">'+escapeHtml(s.name)+'</strong>' +
    (s.country ? '<span style="font-size:10.5px; color:'+(s.country===currentUserCountry?'var(--lagoon)':'rgba(245,239,227,0.4)')+'; margin-left:6px;">'+(s.country===currentUserCountry?'📍 ':'')+escapeHtml(s.country)+'</span>' : '') +
    (s.artist ? '<p style="font-size:11.5px; color:var(--gold); margin:2px 0 0;">🎤 '+escapeHtml(s.artist)+'</p>' : '') +
    ((s.genre || s.mood) ? '<p style="font-size:10.5px; color:rgba(245,239,227,0.45); margin:2px 0 0;">'+[s.genre, s.mood].filter(Boolean).map(x => MUSIC_GENRE_MOOD_LABELS[x] || x).join(' · ')+'</p>' : '') +
    '<p style="font-size:11.5px; color:rgba(245,239,227,0.5); margin:2px 0 0;">'+(s.usageCount||0)+' publication(s) · ajoutée par @'+escapeHtml(s.uploaderUsername)+'</p></div>' +
    '<audio src="'+s.audioData+'" controls style="width:110px; height:32px;"></audio>' +
    '</div>'
  ).join('');
}
const MUSIC_GENRE_MOOD_LABELS = { afrobeats: 'Afrobeats', mbalax: 'Mbalax', rnb: 'R&B', hiphop: 'Hip-Hop / Rap', traditionnel: 'Traditionnel', gospel: 'Gospel', autre: 'Autre', energique: 'Énergique', calme: 'Calme', inspirant: 'Inspirant', festif: 'Festif', romantique: 'Romantique', triste: 'Triste' };
/* ---------- BIBLIOTHÈQUE D'IMAGES PÉDAGOGIQUES (FORMATEUR) ---------- */
async function fetchTeachingImages(){
  const keys = await safeList('teachingimage:' + currentUser + '__', true);
  const list = [];
  for(const k of keys){ const img = await safeGet(k, true); if(img) list.push({ key: k, ...img }); }
  list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return list;
}
async function uploadTeachingImage(){
  const fileInput = document.getElementById('new-teaching-image-input');
  const file = fileInput.files[0];
  if(!file){ showToast('Choisissez une image'); return; }
  try{
    const rawDataUrl = await readFileAsDataURL(file);
    const dataUrl = await compressImageDataUrl(rawDataUrl, 1280, 0.8);
    const id = 'teachingimage:' + currentUser + '__' + Date.now();
    await saveWithRetry(id, { name: file.name, data: dataUrl, createdAt: new Date().toISOString() }, true);
    fileInput.value = '';
    showToast('Image ajoutée à votre bibliothèque ✓');
    await renderTeachingImageLibrary();
  }catch(e){
    showToast('Impossible d’ajouter cette image');
  }
}
async function renderTeachingImageLibrary(){
  const el = document.getElementById('teaching-image-library-grid');
  if(!el) return;
  const images = await fetchTeachingImages();
  el.innerHTML = images.length === 0 ? '<div class="empty">Aucune image pour l’instant.</div>' : images.map(img =>
    '<div class="thumb" style="position:relative;"><img src="'+img.data+'" loading="lazy">' +
    '<div style="position:absolute; bottom:4px; right:4px; display:flex; gap:4px;">' +
    '<a href="'+img.data+'" download="'+escapeHtml(img.name||'image.jpg')+'" style="background:rgba(11,46,61,0.75); border-radius:6px; width:26px; height:26px; display:flex; align-items:center; justify-content:center; font-size:13px; text-decoration:none;">⬇️</a>' +
    '<span onclick="deleteTeachingImage(\''+img.key+'\')" style="background:rgba(11,46,61,0.75); border-radius:6px; width:26px; height:26px; display:flex; align-items:center; justify-content:center; font-size:13px; cursor:pointer;">🗑️</span>' +
    '</div></div>'
  ).join('');
}
async function deleteTeachingImage(key){
  await window.storage.delete(key, true).catch(() => {});
  showToast('Image supprimée');
  await renderTeachingImageLibrary();
}
async function uploadNewMusic(){
  const name = document.getElementById('upload-music-name').value.trim();
  const artist = document.getElementById('upload-music-artist').value.trim();
  const genre = document.getElementById('upload-music-genre').value;
  const mood = document.getElementById('upload-music-mood').value;
  const fileInput = document.getElementById('upload-music-file');
  const file = fileInput.files[0];
  if(!name || !file){ showToast('Renseignez un nom et choisissez un fichier audio'); return; }
  if(file.size > MAX_AUDIO_SIZE){ showToast('Fichier trop lourd (1,5 Mo maximum)'); return; }
  try{
    const audioData = await readFileAsDataURL(file);
    await registerNewSound(audioData, name, currentUser, artist, genre, mood);
    document.getElementById('upload-music-name').value = '';
    document.getElementById('upload-music-artist').value = '';
    fileInput.value = '';
    showToast('Musique ajoutée à la bibliothèque ✓');
    go('music-library');
  }catch(e){
    showToast('Impossible d’ajouter cette musique');
  }
}

const MAX_AUDIO_SIZE = 1.5 * 1024 * 1024;
/* ---------- CALENDRIER DES PUBLICATIONS PROGRAMMÉES ---------- */
let scheduleCalendarDate = new Date();
let selectedScheduleDay = null;
function shiftScheduleMonth(delta){
  scheduleCalendarDate.setMonth(scheduleCalendarDate.getMonth() + delta);
  renderScheduleCalendar();
}
async function renderScheduleCalendar(){
  const monthLabel = document.getElementById('schedule-calendar-month-label');
  const grid = document.getElementById('schedule-calendar-grid');
  const detailEl = document.getElementById('schedule-day-detail');
  const monthNames = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const year = scheduleCalendarDate.getFullYear();
  const month = scheduleCalendarDate.getMonth();
  monthLabel.textContent = monthNames[month] + ' ' + year;

  const myScheduled = (await fetchPosts(true)).filter(p => p.userId === currentUser && p.status === 'scheduled');
  const byDay = {};
  myScheduled.forEach(p => {
    const d = new Date(p.scheduledFor);
    if(d.getFullYear() === year && d.getMonth() === month){
      const day = d.getDate();
      if(!byDay[day]) byDay[day] = [];
      byDay[day].push(p);
    }
  });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dayLabels = ['D','L','M','M','J','V','S'];
  let cells = dayLabels.map(d => '<div style="text-align:center; font-size:10px; color:rgba(245,239,227,0.4);">'+d+'</div>').join('');
  for(let i = 0; i < firstDay; i++) cells += '<div></div>';
  for(let day = 1; day <= daysInMonth; day++){
    const hasPosts = byDay[day];
    cells += '<div onclick="selectScheduleDay('+day+')" style="text-align:center; padding:8px 0; border-radius:8px; cursor:pointer; font-size:12.5px; background:'+(hasPosts ? 'rgba(242,183,5,0.2)' : 'transparent')+'; border:1px solid '+(selectedScheduleDay===day ? 'var(--gold)' : 'transparent')+';">' +
      day + (hasPosts ? '<div style="width:5px; height:5px; border-radius:50%; background:var(--gold); margin:2px auto 0;"></div>' : '') + '</div>';
  }
  grid.innerHTML = cells;

  if(selectedScheduleDay && byDay[selectedScheduleDay]){
    detailEl.innerHTML = byDay[selectedScheduleDay].map(p =>
      '<div class="card" style="display:flex; gap:10px; align-items:center;">' +
      (p.type === 'video' ? '<video src="'+p.data+'" muted style="width:44px; height:44px; border-radius:8px; object-fit:cover;"></video>' : '<img src="'+p.data+'" style="width:44px; height:44px; border-radius:8px; object-fit:cover;">') +
      '<div style="flex:1;"><p style="margin:0; font-size:12.5px;">'+escapeHtml((p.caption||'').slice(0,50))+'</p>' +
      '<p style="margin:2px 0 0; font-size:11px; color:var(--gold);">⏰ '+new Date(p.scheduledFor).toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})+'</p></div></div>'
    ).join('');
  } else {
    detailEl.innerHTML = '<div class="empty">Sélectionnez un jour marqué d’un point doré pour voir le détail.</div>';
  }
}
function selectScheduleDay(day){
  selectedScheduleDay = day;
  renderScheduleCalendar();
}
function toggleScheduleFields(){
  const enabled = document.getElementById('schedule-toggle').checked;
  document.getElementById('schedule-fields').style.display = enabled ? 'block' : 'none';
  document.getElementById('schedule-toggle-visual').style.background = enabled ? 'var(--lagoon)' : 'rgba(245,239,227,0.2)';
}
function toggleSensitiveVisual(){
  const enabled = document.getElementById('sensitive-toggle').checked;
  document.getElementById('sensitive-toggle-visual').style.background = enabled ? 'var(--coral)' : 'rgba(245,239,227,0.2)';
}
function toggleDownloadVisual(){
  const enabled = document.getElementById('download-toggle').checked;
  document.getElementById('download-toggle-visual').style.background = enabled ? 'var(--lagoon)' : 'rgba(245,239,227,0.2)';
}
async function detectDuplicateContent(contentHash, authorUsername){
  const keys = await safeList('post:', true);
  for(const k of keys){
    const p = await safeGet(k, true);
    if(p && p.contentHash === contentHash && p.userId !== authorUsername) return p;
  }
  return null;
}
/* ---------- PUBLICATION TEXTE SEUL (fond coloré, façon TikTok) ---------- */
let selectedTextBgColor = '#0B2E3D';
let pendingQuoteRepostPostId = null;
async function startQuoteRepost(postId){
  const p = await safeGet('post:' + postId, true);
  if(!p){ showToast('Publication introuvable'); return; }
  pendingQuoteRepostPostId = postId;
  go('publish');
  document.getElementById('text-only-panel').style.display = 'block';
  document.getElementById('publish-file').style.display = 'none';
  document.getElementById('text-only-content').focus();
  showToast('Ajoutez votre commentaire sur la publication de @' + p.userId);
}
function toggleTextOnlyPost(){
  const panel = document.getElementById('text-only-panel');
  const isOpening = panel.style.display === 'none';
  panel.style.display = isOpening ? 'block' : 'none';
  if(isOpening){
    document.getElementById('publish-file').value = '';
    onPublishFileSelected();
  }
}
function selectTextBgColor(color){
  selectedTextBgColor = color;
  ['#0B2E3D','#B7472A','#2FB8A6','#F2B705'].forEach(c => {
    document.getElementById('bgswatch-'+c).style.borderColor = (c === color) ? 'var(--gold)' : 'transparent';
  });
}
function renderTextOnlyCanvas(text, bgColor){
  const canvas = document.createElement('canvas');
  canvas.width = 720; canvas.height = 1280;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#F5EFE3';
  ctx.font = 'bold 46px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  for(const word of words){
    const testLine = currentLine ? currentLine + ' ' + word : word;
    if(ctx.measureText(testLine).width > 600 && currentLine){
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if(currentLine) lines.push(currentLine);
  const lineHeight = 60;
  const startY = canvas.height/2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => ctx.fillText(line, canvas.width/2, startY + i*lineHeight));
  return canvas.toDataURL('image/jpeg', 0.85);
}
async function publishTextOnlyPost(){
  const text = document.getElementById('text-only-content').value.trim();
  if(!text){ showToast('Écrivez quelque chose à publier'); return; }
  showToast('Publication en cours...');
  const dataUrl = renderTextOnlyCanvas(text, selectedTextBgColor);
  const id = 'post_' + Date.now();
  const post = {
    id, userId: currentUser, type: 'image', data: dataUrl, audioData: null,
    caption: text, isTextOnly: true, watermarkBaked: false, country: currentUserCountry, city: currentUserCity,
    likes: [], dislikes: [], comments: [], favoritedBy: [], views: 0,
    status: 'published', scheduledFor: null, soundId: null,
    commentRestriction: await getMyDefaultCommentRestriction(),
    quotedPostId: pendingQuoteRepostPostId,
    createdAt: new Date().toISOString()
  };
  await saveWithRetry('post:' + id, post, true);
  await notifyMentions(text, currentUser, id);
  await notifyFollowersOfNewPost(post);
  if(pendingQuoteRepostPostId){
    const quotedPost = await safeGet('post:' + pendingQuoteRepostPostId, true);
    if(quotedPost) await createNotification(quotedPost.userId, 'quote_repost', currentUser, id, text.slice(0,60));
    pendingQuoteRepostPostId = null;
  }
  document.getElementById('text-only-content').value = '';
  document.getElementById('text-only-panel').style.display = 'none';
  document.getElementById('publish-file').style.display = 'block';
  await clearCaptionDraft();
  showToast('Publication texte publiée ✓');
  go('feed');
}
/* ---------- PUBLICATION MULTI-PHOTOS (CARROUSEL) ---------- */
let carouselModeActive = false;
let carouselImages = [];
let beforeAfterModeActive = false;
let beforeAfterImages = { before: null, after: null };
function toggleBeforeAfterMode(){
  beforeAfterModeActive = !beforeAfterModeActive;
  document.getElementById('before-after-panel').style.display = beforeAfterModeActive ? 'block' : 'none';
  document.getElementById('publish-file').style.display = beforeAfterModeActive ? 'none' : 'block';
  if(beforeAfterModeActive && carouselModeActive) toggleCarouselMode();
  if(!beforeAfterModeActive){
    beforeAfterImages = { before: null, after: null };
    document.getElementById('before-after-before-input').value = '';
    document.getElementById('before-after-after-input').value = '';
    document.getElementById('before-after-preview').innerHTML = '';
  }
}
async function onBeforeAfterImageSelected(which){
  const file = document.getElementById('before-after-' + which + '-input').files[0];
  if(!file) return;
  const dataUrl = await compressImageDataUrl(await readFileAsDataURL(file), 1000, 0.82);
  beforeAfterImages[which] = dataUrl;
  document.getElementById('before-after-preview').innerHTML =
    (beforeAfterImages.before ? '<img src="'+beforeAfterImages.before+'" style="width:70px; height:70px; object-fit:cover; border-radius:8px;">' : '') +
    (beforeAfterImages.after ? '<img src="'+beforeAfterImages.after+'" style="width:70px; height:70px; object-fit:cover; border-radius:8px;">' : '');
}
function toggleCarouselMode(){
  carouselModeActive = !carouselModeActive;
  document.getElementById('carousel-panel').style.display = carouselModeActive ? 'block' : 'none';
  document.getElementById('publish-file').style.display = carouselModeActive ? 'none' : 'block';
  if(carouselModeActive && beforeAfterModeActive) toggleBeforeAfterMode();
  if(!carouselModeActive){
    carouselImages = [];
    document.getElementById('carousel-files-input').value = '';
    document.getElementById('carousel-preview-list').innerHTML = '';
  }
}
async function onCarouselFilesSelected(){
  const input = document.getElementById('carousel-files-input');
  const files = Array.from(input.files).slice(0, 10);
  const previewEl = document.getElementById('carousel-preview-list');
  if(files.length < 2){ previewEl.innerHTML = '<p style="font-size:12px; color:var(--coral);">Choisissez au moins 2 photos.</p>'; carouselImages = []; return; }
  previewEl.innerHTML = '<p style="font-size:12px; color:var(--gold);">Chargement...</p>';
  carouselImages = [];
  for(const file of files){
    const raw = await readFileAsDataURL(file);
    const compressed = await compressImageDataUrl(raw, 1280, 0.75);
    carouselImages.push(compressed);
  }
  previewEl.innerHTML = carouselImages.map(img => '<img src="'+img+'" style="width:60px; height:60px; object-fit:cover; border-radius:8px; flex-shrink:0;">').join('');
}
async function navigateCarousel(postId, direction){
  const img = document.getElementById('carousel-img-' + postId);
  if(!img) return;
  const p = await safeGet('post:' + postId, true);
  if(!p || !p.images) return;
  let index = parseInt(img.dataset.index, 10) || 0;
  index = (index + direction + p.images.length) % p.images.length;
  img.dataset.index = index;
  img.src = p.images[index];
  const dotsEl = document.getElementById('carousel-dots-' + postId);
  if(dotsEl){
    dotsEl.innerHTML = p.images.map((_,i) => '<span style="width:6px; height:6px; border-radius:50%; background:'+(i===index?'white':'rgba(255,255,255,0.4)')+';"></span>').join('');
  }
}
async function publishCarouselPost(){
  if(carouselImages.length < 2){ showToast('Choisissez au moins 2 photos'); return; }
  const caption = document.getElementById('publish-caption').value.trim();
  showToast('Publication en cours...');
  const id = 'post_' + Date.now();
  const post = {
    id, userId: currentUser, type: 'image', data: carouselImages[0], images: [...carouselImages], audioData: null,
    caption, watermarkBaked: false, country: currentUserCountry, city: currentUserCity,
    likes: [], dislikes: [], comments: [], favoritedBy: [], views: 0,
    status: 'published', scheduledFor: null, soundId: null,
    commentRestriction: await getMyDefaultCommentRestriction(),
    videoReplyTo: pendingVideoReplyTo,
    addYoursResponseTo: pendingAddYoursPrompt ? pendingAddYoursPrompt.storyId : null,
    createdAt: new Date().toISOString()
  };
  await saveWithRetry('post:' + id, post, true);
  await notifyMentions(caption, currentUser, id);
  await notifyFollowersOfNewPost(post);
  if(pendingVideoReplyTo){
    await createNotification(pendingVideoReplyTo.commentAuthor, 'video_comment_reply', currentUser, id, pendingVideoReplyTo.commentText.slice(0,60));
    pendingVideoReplyTo = null;
  }
  if(pendingAddYoursPrompt){
    await createNotification(pendingAddYoursPrompt.promptAuthor, 'addyours_response', currentUser, id, null);
    pendingAddYoursPrompt = null;
  }
  await clearCaptionDraft();
  carouselImages = [];
  document.getElementById('carousel-files-input').value = '';
  document.getElementById('carousel-preview-list').innerHTML = '';
  document.getElementById('publish-caption').value = '';
  carouselModeActive = false;
  document.getElementById('carousel-panel').style.display = 'none';
  document.getElementById('publish-file').style.display = 'block';
  showToast('Carrousel publié ✓ (' + post.images.length + ' photos)');
  go('feed');
}
/* ---------- SAUVEGARDE AUTOMATIQUE DE BROUILLON (LÉGENDE) ---------- */
let captionDraftSaveTimer = null;
function saveCaptionDraft(){
  clearTimeout(captionDraftSaveTimer);
  captionDraftSaveTimer = setTimeout(async () => {
    if(!currentUser) return;
    const mainField = document.getElementById('publish-caption');
    const textOnlyField = document.getElementById('text-only-content');
    const isTextOnlyVisible = document.getElementById('text-only-panel') && document.getElementById('text-only-panel').style.display !== 'none';
    const text = isTextOnlyVisible ? (textOnlyField ? textOnlyField.value : '') : (mainField ? mainField.value : '');
    if(text.trim()){
      await saveWithRetry('draftcaption:' + currentUser, { text, savedAt: new Date().toISOString(), isTextOnly: isTextOnlyVisible }, false);
    } else {
      await window.storage.delete('draftcaption:' + currentUser, false).catch(() => {});
    }
  }, 800);
}
/* ---------- ANALYSE D'AUDIENCE CRÉATEUR ---------- */
async function renderAudienceInsights(){
  const el = document.getElementById('audience-insights-content');
  if(!el || !currentUser) return;
  const myPosts = (await fetchPosts(true)).filter(p => p.userId === currentUser);
  const allViewers = new Set();
  myPosts.forEach(p => { (p.viewedBy || []).forEach(v => allViewers.add(v)); });
  if(allViewers.size === 0){ el.innerHTML = '<div class="empty">Pas encore assez de vues pour analyser votre audience.</div>'; return; }
  const allUsers = await fetchUsers();
  const countryByUsername = {};
  allUsers.forEach(u => { countryByUsername[u.username] = u.country || 'Non renseigné'; });
  const byCountry = {};
  allViewers.forEach(v => {
    const c = countryByUsername[v] || 'Non renseigné';
    byCountry[c] = (byCountry[c] || 0) + 1;
  });
  const ranked = Object.entries(byCountry).map(([country, count]) => ({ country, count })).sort((a,b) => b.count - a.count);
  const maxCount = ranked[0].count;
  el.innerHTML = '<p style="font-size:12px; color:var(--gold); margin:0 0 14px;">'+allViewers.size+' spectateur(s) unique(s) au total, sur '+myPosts.length+' publication(s)</p>' +
    ranked.map(r =>
      '<div class="card" style="margin-bottom:8px;">' +
      '<p style="margin:0 0 6px; font-size:13px;">'+escapeHtml(r.country)+'</p>' +
      '<div style="background:rgba(245,239,227,0.1); border-radius:6px; height:8px; margin-bottom:4px; overflow:hidden;"><div style="background:var(--lagoon); height:100%; width:'+Math.round(r.count/maxCount*100)+'%;"></div></div>' +
      '<p style="margin:0; font-size:11px; color:rgba(245,239,227,0.5);">'+r.count+' spectateur(s)</p>' +
      '</div>'
    ).join('');
}
async function loadSeriesPartOptions(){
  const select = document.getElementById('compose-series-part-of');
  if(!select || !currentUser) return;
  const myVideos = (await fetchPosts(true)).filter(p => p.userId === currentUser && p.type === 'video' && p.status === 'published');
  myVideos.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  const recent = myVideos.slice(0, 20);
  select.innerHTML = '<option value="">— Vidéo indépendante —</option>' + recent.map(p => '<option value="'+p.id+'">'+escapeHtml((p.caption || 'Sans légende').slice(0,40))+'</option>').join('');
}
async function restoreCaptionDraft(){
  if(!currentUser) return;
  const draft = await safeGet('draftcaption:' + currentUser, false).catch(() => null);
  if(!draft || !draft.text) return;
  if(draft.isTextOnly){
    const textOnlyField = document.getElementById('text-only-content');
    const panel = document.getElementById('text-only-panel');
    if(textOnlyField && panel && !textOnlyField.value){
      panel.style.display = 'block';
      const filePanel = document.getElementById('publish-file');
      if(filePanel) filePanel.style.display = 'none';
      textOnlyField.value = draft.text;
      showToast('📝 Brouillon restauré');
    }
  } else {
    const field = document.getElementById('publish-caption');
    if(field && !field.value){
      field.value = draft.text;
      showToast('📝 Brouillon restauré');
    }
  }
}
async function clearCaptionDraft(){
  if(!currentUser) return;
  await window.storage.delete('draftcaption:' + currentUser, false).catch(() => {});
}
let customThumbnailDataUrl = null;
async function previewCustomThumbnail(){
  const fileInput = document.getElementById('custom-thumbnail-input');
  const preview = document.getElementById('custom-thumbnail-preview');
  if(!fileInput.files[0]){ customThumbnailDataUrl = null; preview.style.display = 'none'; return; }
  try{
    let dataUrl = await readFileAsDataURL(fileInput.files[0]);
    dataUrl = await compressImageDataUrl(dataUrl, 800, 0.75);
    customThumbnailDataUrl = dataUrl;
    preview.src = dataUrl;
    preview.style.display = 'block';
  }catch(e){
    showToast('Impossible de charger la miniature');
    customThumbnailDataUrl = null;
  }
}
async function publishPost(){
  const fileInput = document.getElementById('publish-file');
  const audioInput = document.getElementById('publish-audio');
  const caption = document.getElementById('publish-caption').value.trim();
  const file = fileInput.files[0];
  const audioFile = audioInput.files[0];
  if(beforeAfterModeActive){
    await publishBeforeAfter(caption);
    return;
  }
  if(!file){ showToast('Choisissez une vidéo ou une photo'); return; }
  if(videoClipsQueue.length > 0){
    await publishVideoClips(file, caption);
    return;
  }
  const coCreatorInput = document.getElementById('compose-co-creator-username');
  const coCreatorUsername = coCreatorInput ? coCreatorInput.value.trim() : '';
  if(coCreatorUsername){
    if(coCreatorUsername === currentUser){ showToast('Vous ne pouvez pas vous inviter vous-même en co-créateur'); return; }
    const coCreatorExists = await safeGet('user:' + coCreatorUsername, true);
    if(!coCreatorExists){ showToast('Ce compte co-créateur n’existe pas'); return; }
  }
  const addPollToggle = document.getElementById('compose-add-poll-toggle');
  let postPoll = null;
  if(addPollToggle && addPollToggle.checked){
    const question = document.getElementById('compose-poll-question').value.trim();
    const optionA = document.getElementById('compose-poll-option-a').value.trim();
    const optionB = document.getElementById('compose-poll-option-b').value.trim();
    if(!question || !optionA || !optionB){ showToast('Complétez la question et les deux options du sondage, ou décochez-le'); return; }
    postPoll = { question, options: [optionA, optionB], votes: {} };
  }
  const isScheduled = document.getElementById('schedule-toggle').checked;
  let scheduledFor = null;
  if(isScheduled){
    const dtValue = document.getElementById('schedule-datetime').value;
    if(!dtValue){ showToast('Choisissez une date et une heure de publication'); return; }
    scheduledFor = new Date(dtValue);
    if(scheduledFor <= new Date()){ showToast('Choisissez un moment dans le futur'); return; }
  }
  const isVideo = file.type.startsWith('video');
  const usingProcessed = isVideo && processedVideoBlob;
  const effectiveSize = usingProcessed ? processedVideoBlob.size : file.size;
  if(effectiveSize > MAX_FILE_SIZE){
    showToast('Fichier trop lourd (3,5 Mo max pour l’instant)');
    return;
  }
  if(audioFile && audioFile.size > MAX_AUDIO_SIZE){
    showToast('Fichier audio trop lourd (1,5 Mo max)');
    return;
  }
  showToast('Publication en cours...');
  try{
    const rawDataUrl = usingProcessed ? await blobToDataURL(processedVideoBlob) : await readFileAsDataURL(file);
    let dataUrl = (!isVideo) ? await compressImageDataUrl(rawDataUrl, 1280, 0.75) : rawDataUrl;
    if(!isVideo){
      const stickerChoice = document.getElementById('image-sticker-choice');
      const stickerPosition = document.getElementById('image-sticker-position');
      if(stickerChoice && stickerChoice.value){
        dataUrl = await applyImageSticker(dataUrl, stickerChoice.value, stickerPosition.value);
      }
    }
    let audioData = audioFile ? await readFileAsDataURL(audioFile) : null;
    let soundId = null;
    if(selectedSharedSound && !audioFile){
      audioData = selectedSharedSound.audioData;
      soundId = selectedSharedSound.id;
      await incrementSoundUsage(soundId);
    } else if(audioFile){
      const soundName = prompt('Donnez un nom à ce son (les autres pourront le réutiliser) :', 'Mon son');
      if(soundName !== null && soundName.trim()){
        soundId = await registerNewSound(audioData, soundName.trim(), currentUser);
      }
    }

    if(!isVideo){
      const autoBlock = await isAiAutoBlockEnabled();
      if(autoBlock){
        const check = await checkImageWithVisionAI(dataUrl);
        if(check && check.flagged){
          showToast('Publication refusée : ' + check.reason);
          return;
        }
      }
    }

    const id = 'post_' + Date.now();
    const contentHash = await sha256Hex(dataUrl);
    const duplicateInfo = await detectDuplicateContent(contentHash, currentUser);
    const mediaCheck = isVideo ? await moderateVideoWithVideoIntelligence(dataUrl) : await moderateImageWithCloudVision(dataUrl);
    const post = {
      id, userId: currentUser, type: isVideo ? 'video' : 'image',
      data: dataUrl, audioData, caption, watermarkBaked: !!usingProcessed, country: currentUserCountry, city: currentUserCity, likes: [], dislikes: [], comments: [], favoritedBy: [], views: 0,
      status: isScheduled ? 'scheduled' : 'published', scheduledFor: isScheduled ? scheduledFor.toISOString() : null, soundId,
      commentRestriction: document.getElementById('publish-comment-restriction-select').value,
      videoReplyTo: pendingVideoReplyTo,
      addYoursResponseTo: pendingAddYoursPrompt ? pendingAddYoursPrompt.storyId : null,
      sensitive: document.getElementById('sensitive-toggle').checked,
      downloadable: document.getElementById('download-toggle').checked,
      contentHash, possibleRepost: !!duplicateInfo, originalAuthor: duplicateInfo ? duplicateInfo.userId : null, originalPostId: duplicateInfo ? duplicateInfo.id : null,
      challengeId: currentPublishChallengeId || null,
      mediaFlagged: mediaCheck.checked && mediaCheck.flagged, mediaFlagReason: mediaCheck.reason || null, mediaFlagConfidence: mediaCheck.confidence || null,
      customThumbnail: customThumbnailDataUrl || null,
      postPrivacy: document.getElementById('compose-post-privacy') ? document.getElementById('compose-post-privacy').value : 'public',
      poll: postPoll,
      coCreatorUsername: coCreatorUsername || null, coCreatorStatus: coCreatorUsername ? 'pending' : null,
      seriesPartOf: document.getElementById('compose-series-part-of') ? (document.getElementById('compose-series-part-of').value || null) : null,
      voiceoverText: document.getElementById('compose-voiceover-text') ? (document.getElementById('compose-voiceover-text').value.trim() || null) : null,
      wordTimings: pendingAnimatedCaptionWords || null,
      createdAt: new Date().toISOString()
    };
    await saveWithRetry('post:' + id, post, true);
    if(!isScheduled && !(mediaCheck.checked && mediaCheck.flagged)) await notifyFollowersOfNewPost(post);
    if(stitchPendingOriginalUserId){
      post.stitchWithUsername = stitchPendingOriginalUserId;
      await saveWithRetry('post:' + id, post, true);
      await createNotification(stitchPendingOriginalUserId, 'stitch', currentUser, id);
      stitchPendingOriginalUserId = null;
    }
    if(currentPublishChallengeId){ currentPublishChallengeId = null; }
    if(duplicateInfo){
      await logAdminAction('Republication suspecte détectée (contenu identique à un autre auteur)', '@'+currentUser+' ↔ @'+duplicateInfo.userId);
    }
    if(post.mediaFlagged){
      await logAdminAction('Média signalé automatiquement (Google Cloud)', '@'+currentUser+' — '+mediaCheck.reason);
      showToast('Publication envoyée pour vérification avant d’être visible publiquement');
    }
    if(!isScheduled && !post.mediaFlagged){
      await notifyMentions(caption, currentUser, id);
      if(isVideo) submitVideoForAIAnalysis(id, dataUrl);
    }
    if(coCreatorUsername){
      await createNotification(coCreatorUsername, 'co_creator_invite', currentUser, id, caption.slice(0,60));
    }
    fileInput.value = ''; audioInput.value = ''; document.getElementById('publish-caption').value = '';
    if(coCreatorInput) coCreatorInput.value = '';
    if(addPollToggle) addPollToggle.checked = false;
    const pollFields = document.getElementById('compose-poll-fields');
    if(pollFields) pollFields.style.display = 'none';
    ['compose-poll-question','compose-poll-option-a','compose-poll-option-b'].forEach(id => { const f = document.getElementById(id); if(f) f.value = ''; });
    customThumbnailDataUrl = null;
    const thumbInput = document.getElementById('custom-thumbnail-input');
    const thumbPreview = document.getElementById('custom-thumbnail-preview');
    if(thumbInput) thumbInput.value = '';
    if(thumbPreview) thumbPreview.style.display = 'none';
    await clearCaptionDraft();
    pendingAnimatedCaptionWords = null;
    if(pendingVideoReplyTo){
      await createNotification(pendingVideoReplyTo.commentAuthor, 'video_comment_reply', currentUser, id, pendingVideoReplyTo.commentText.slice(0,60));
      pendingVideoReplyTo = null;
    }
    if(pendingAddYoursPrompt){
      await createNotification(pendingAddYoursPrompt.promptAuthor, 'addyours_response', currentUser, id, null);
      pendingAddYoursPrompt = null;
    }
    const stickerReset = document.getElementById('image-sticker-choice');
    if(stickerReset) stickerReset.value = '';
    processedVideoBlob = null; originalSelectedFile = null;
    speedRampSegments = [];
    renderSpeedRampSegments();
    hideProcessedVideoPreview();
    document.getElementById('video-processing-panel').style.display = 'none';
    document.getElementById('schedule-toggle').checked = false;
    document.getElementById('sensitive-toggle').checked = false;
    toggleSensitiveVisual();
    document.getElementById('download-toggle').checked = true;
    toggleDownloadVisual();
    recordedVoiceoverBlob = null;
    document.getElementById('vp-voiceover-preview').style.display = 'none';
    document.getElementById('vp-voiceover-status').textContent = '';
    document.getElementById('vp-voiceover-record-btn').textContent = '🔴 Enregistrer une narration';
    selectedSharedSound = null;
    document.getElementById('selected-sound-label').textContent = '';
    toggleScheduleFields();
    showToast(isScheduled ? 'Programmée pour le ' + scheduledFor.toLocaleString('fr-FR') + ' ✓' : 'Publié ⛵');
    go('feed');
  }catch(e){
    showToast('Impossible de publier ce fichier');
  }
}
let feedMode = 'foryou';
function extractHashtags(text){
  const matches = (text || '').match(/#[\p{L}0-9_]+/gu) || [];
  return matches.map(h => h.toLowerCase());
}
async function buildUserContentProfile(){
  const posts = await fetchPosts();
  const weights = {};
  posts.forEach(p => {
    const engaged = (p.likes || []).includes(currentUser) || (p.favoritedBy || []).includes(currentUser);
    if(!engaged) return;
    extractHashtags(p.caption).forEach(tag => { weights[tag] = (weights[tag] || 0) + 1; });
  });
  const rewatchWeights = await fetchMyRewatchSignals();
  const postById = {};
  posts.forEach(p => { postById[p.id] = p; });
  Object.entries(rewatchWeights).forEach(([postId, count]) => {
    const p = postById[postId];
    if(!p) return;
    extractHashtags(p.caption).forEach(tag => { weights[tag] = (weights[tag] || 0) + count * 2; });
  });
  const completionWeights = await fetchMyCompletionSignals();
  Object.entries(completionWeights).forEach(([postId, maxCompletion]) => {
    if(maxCompletion < 0.75) return;
    const p = postById[postId];
    if(!p) return;
    extractHashtags(p.caption).forEach(tag => { weights[tag] = (weights[tag] || 0) + (maxCompletion >= 0.95 ? 2 : 1); });
  });
  const notInterestedIds = await fetchNotInterestedPostIds();
  notInterestedIds.forEach(postId => {
    const p = postById[postId];
    if(!p) return;
    extractHashtags(p.caption).forEach(tag => { weights[tag] = (weights[tag] || 0) - 3; });
  });
  const shareKeys = await safeList('shareSignal:' + currentUser + '__', true);
  for(const k of shareKeys){
    const s = await safeGet(k, true).catch(() => null);
    if(!s) continue;
    const p = postById[s.postId];
    if(!p) continue;
    extractHashtags(p.caption).forEach(tag => { weights[tag] = (weights[tag] || 0) + 2; });
  }
  return weights;
}
/* ---------- "PAS INTÉRESSÉ" — AFFINE L'ALGORITHME "POUR VOUS" ---------- */
let feedQuickScrollObserver = null;
let feedQualifiedViewObserver = null;
function setupFeedQuickScrollObserver(){
  if(feedQuickScrollObserver) feedQuickScrollObserver.disconnect();
  if(!currentUser) return;
  const container = document.getElementById('feed-container');
  if(!container) return;
  feedQuickScrollObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const postId = entry.target.dataset.postId;
      if(!postId) return;
      if(entry.isIntersecting && entry.intersectionRatio > 0.5){
        entry.target.dataset.enteredAt = String(Date.now());
        primeUpcomingVideoDecoding();
      } else if(entry.target.dataset.enteredAt){
        const dwellMs = Date.now() - parseInt(entry.target.dataset.enteredAt, 10);
        delete entry.target.dataset.enteredAt;
        if(dwellMs > 0 && dwellMs < 1200) recordQuickScrollSignal(postId);
      }
    });
  }, { threshold: [0, 0.5] });
  container.querySelectorAll('.feed-card[data-post-id]').forEach(card => feedQuickScrollObserver.observe(card));
  setupQualifiedViewObserver();
}
const qualifiedViewTimers = {};
function setupQualifiedViewObserver(){
  if(feedQualifiedViewObserver) feedQualifiedViewObserver.disconnect();
  const container = document.getElementById('feed-container');
  if(!container) return;
  feedQualifiedViewObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const postId = entry.target.dataset.postId;
      if(!postId) return;
      if(entry.isIntersecting && entry.intersectionRatio > 0.5){
        if(qualifiedViewTimers[postId]) clearTimeout(qualifiedViewTimers[postId]);
        qualifiedViewTimers[postId] = setTimeout(() => { recordQualifiedView(postId); delete qualifiedViewTimers[postId]; }, 5000);
      } else if(qualifiedViewTimers[postId]){
        clearTimeout(qualifiedViewTimers[postId]);
        delete qualifiedViewTimers[postId];
      }
    });
  }, { threshold: [0, 0.5] });
  container.querySelectorAll('.feed-card[data-post-id]').forEach(card => feedQualifiedViewObserver.observe(card));
}
async function recordQualifiedView(postId){
  const sessionKey = postId + '__' + currentUser;
  if(qualifiedViewsCountedThisSession.has(sessionKey)) return;
  qualifiedViewsCountedThisSession.add(sessionKey);
  const p = await safeGet('post:' + postId, true);
  if(!p) return;
  p.qualifiedViews = (p.qualifiedViews || 0) + 1;
  await saveWithRetry('post:' + postId, p, true);
}
async function recordQuickScrollSignal(postId){
  const key = 'quickscroll:' + postId + '__' + currentUser;
  const existing = (await safeGet(key, false).catch(() => null)) || { postId, count: 0 };
  existing.count = (existing.count || 0) + 1;
  existing.lastAt = new Date().toISOString();
  await saveWithRetry(key, existing, false);
}
async function fetchMyQuickScrollPenalties(){
  const keys = await safeList('quickscroll:', false);
  const penalties = {};
  for(const k of keys){
    if(!k.endsWith('__' + currentUser)) continue;
    const rec = await safeGet(k, false);
    if(rec) penalties[rec.postId] = rec.count || 0;
  }
  return penalties;
}
async function fetchNotInterestedPostIds(){
  return (await safeGet('notinterested:' + currentUser, false)) || [];
}
async function markNotInterested(postId){
  const list = await fetchNotInterestedPostIds();
  if(!list.includes(postId)) list.push(postId);
  await saveWithRetry('notinterested:' + currentUser, list, false);
  showToast('C’est noté — vous verrez moins de contenu comme ça');
  await renderFeed();
}
function getUserEngagedPostIds(username, posts){
  const ids = new Set();
  posts.forEach(p => {
    if((p.likes || []).includes(username) || (p.favoritedBy || []).includes(username)) ids.add(p.id);
  });
  return ids;
}
async function findSimilarUsers(posts){
  const myEngaged = getUserEngagedPostIds(currentUser, posts);
  if(myEngaged.size === 0) return {};
  const allUsers = await fetchUsers();
  const similarity = {};
  allUsers.forEach(u => {
    if(u.username === currentUser) return;
    const theirEngaged = getUserEngagedPostIds(u.username, posts);
    let overlap = 0;
    theirEngaged.forEach(id => { if(myEngaged.has(id)) overlap++; });
    if(overlap > 0) similarity[u.username] = overlap;
  });
  return similarity;
}
async function sortPostsCollaborative(posts){
  const similarity = await findSimilarUsers(posts);
  const similarUsernames = Object.keys(similarity);
  if(similarUsernames.length === 0) return posts;
  const myEngaged = getUserEngagedPostIds(currentUser, posts);
  const scored = posts.map(p => {
    if(myEngaged.has(p.id)) return {post: p, score: -1};
    let score = 0;
    similarUsernames.forEach(u => {
      const engaged = (p.likes || []).includes(u) || (p.favoritedBy || []).includes(u);
      if(engaged) score += similarity[u];
    });
    return {post: p, score};
  });
  scored.sort((a, b) => b.score - a.score || new Date(b.post.createdAt) - new Date(a.post.createdAt));
  return scored.map(s => s.post);
}
/* ---------- TRANSPARENCE ALGORITHME — "POURQUOI CETTE VIDÉO ?" ---------- */
async function explainWhyThisVideo(postId){
  const el = document.getElementById('why-this-video-explanation');
  if(!el) return;
  if(el.style.display === 'block'){ el.style.display = 'none'; return; }
  const posts = await fetchPosts();
  const p = posts.find(x => x.id === postId);
  if(!p){ return; }
  let explanation;
  if(feedMode !== 'foryou'){
    const modeLabels = { community: 'Communauté', local: 'Local', recent: 'Récent' };
    explanation = 'Vous êtes en mode « '+ (modeLabels[feedMode] || feedMode) +' » — ce mode suit son propre critère (pas votre historique personnel).';
  } else {
    const profile = await buildUserContentProfile();
    const completionSignals = currentUser ? await fetchMyCompletionSignals() : {};
    const collaborativeScores = computeCollaborativeScores(posts);
    const quickScrollPenalties = currentUser ? await fetchMyQuickScrollPenalties() : {};
    const me = currentUser ? await safeGet('user:' + currentUser, true) : null;
    const myFollowing = new Set((me && me.following) || []);
    const tags = extractHashtags(p.caption);
    const matchedTags = tags.filter(t => profile[t] > 0).sort((a,b) => (profile[b]||0) - (profile[a]||0));
    const reasons = [];
    if(matchedTags.length > 0) reasons.push('vous avez aimé, mis en favori, ou revisionné d’autres publications avec ' + matchedTags.slice(0,3).map(t => '#'+t).join(', '));
    if((completionSignals[p.id] || 0) >= 0.5) reasons.push('vous avez déjà regardé une bonne partie d’une vidéo similaire jusqu’au bout');
    if((collaborativeScores[p.id] || 0) > 0) reasons.push('des personnes ayant des goûts proches des vôtres ont aussi aimé cette publication');
    if(myFollowing.has(p.userId)) reasons.push('vous suivez @' + p.userId);
    explanation = reasons.length > 0
      ? 'Montrée notamment parce que ' + reasons.join(', et aussi parce que ') + '.'
      : 'Aucun lien particulier détecté avec votre historique — probablement montrée car populaire ou récente, en l’absence de préférence claire identifiée pour vous.';
    if((quickScrollPenalties[p.id] || 0) > 0) explanation += ' (Vous aviez déjà passé rapidement sur cette publication — elle reste légèrement moins mise en avant pour vous.)';
  }
  el.textContent = 'ℹ️ ' + explanation;
  el.style.display = 'block';
}
function computeCollaborativeScores(posts){
  if(!currentUser) return {};
  const userLikedSets = {};
  posts.forEach(p => {
    (p.likes || []).forEach(u => {
      if(!userLikedSets[u]) userLikedSets[u] = new Set();
      userLikedSets[u].add(p.id);
    });
  });
  const myLikedIds = userLikedSets[currentUser] || new Set();
  if(myLikedIds.size === 0) return {};
  const scores = {};
  Object.entries(userLikedSets).forEach(([u, likedSet]) => {
    if(u === currentUser) return;
    const sharesInterest = [...likedSet].some(id => myLikedIds.has(id));
    if(!sharesInterest) return;
    likedSet.forEach(postId => {
      if(!myLikedIds.has(postId)) scores[postId] = (scores[postId] || 0) + 1;
    });
  });
  return scores;
}
function getTimeDecayFactor(createdAt){
  const ageInDays = (Date.now() - new Date(createdAt).getTime()) / (1000*60*60*24);
  return Math.pow(0.5, Math.max(0, ageInDays) / 7);
}
function injectDiscoveryContent(sortedPosts, profile){
  const knownTags = new Set(Object.keys(profile).filter(t => profile[t] > 0));
  if(knownTags.size === 0 || sortedPosts.length < 5) return sortedPosts;
  const familiar = [];
  const discovery = [];
  sortedPosts.forEach(p => {
    const tags = extractHashtags(p.caption);
    const isFamiliar = tags.some(t => knownTags.has(t));
    (isFamiliar || tags.length === 0 ? familiar : discovery).push(p);
  });
  if(discovery.length === 0) return sortedPosts;
  const result = [];
  let discoveryIndex = 0;
  familiar.forEach((p, i) => {
    result.push(p);
    if((i + 1) % 3 === 0 && discoveryIndex < discovery.length){
      result.push(discovery[discoveryIndex]);
      discoveryIndex++;
    }
  });
  while(discoveryIndex < discovery.length) result.push(discovery[discoveryIndex++]);
  return result;
}
function diversifyFeedOrder(sortedPosts){
  const result = [];
  const pool = [...sortedPosts];
  let lastCreator = null;
  while(pool.length > 0){
    let pickIndex = 0;
    if(pool[0].userId === lastCreator){
      const altIndex = pool.findIndex((p, i) => i > 0 && p.userId !== lastCreator);
      if(altIndex !== -1) pickIndex = altIndex;
    }
    const [picked] = pool.splice(pickIndex, 1);
    result.push(picked);
    lastCreator = picked.userId;
  }
  return result;
}
async function sortPostsForYou(posts){
  const profile = await buildUserContentProfile();
  const completionSignals = currentUser ? await fetchMyCompletionSignals() : {};
  const collaborativeScores = computeCollaborativeScores(posts);
  const quickScrollPenalties = currentUser ? await fetchMyQuickScrollPenalties() : {};
  const me = currentUser ? await safeGet('user:' + currentUser, true) : null;
  const myFollowing = new Set((me && me.following) || []);
  const topicPrefs = currentUser ? ((await safeGet('topicpreferences:' + currentUser, false)) || {}) : {};
  const hasPreferences = Object.keys(profile).length > 0 || Object.keys(completionSignals).length > 0 || Object.keys(collaborativeScores).length > 0;
  if(!hasPreferences){
    const myLang = me ? me.appLanguage : null;
    const myTopics = (me && me.initialTopics) || [];
    const topicKeywords = { education: ['education', 'cours', 'apprendre', 'etude', 'formation', 'ecole'], culture: ['culture', 'tradition', 'sagesse', 'histoire', 'coutume'], entrepreneuriat: ['entrepreneuriat', 'business', 'entreprise', 'startup', 'commerce'], divertissement: ['fun', 'comedie', 'humour', 'divertissement'], musique: ['musique', 'son', 'chanson', 'clip'] };
    const myKeywords = new Set(myTopics.flatMap(t => topicKeywords[t] || []));
    const scored = posts.map(p => {
      const matchesInitialTopic = myKeywords.size > 0 && extractHashtags(p.caption).some(tag => myKeywords.has(tag.replace('#','').toLowerCase()));
      return { post: p, score: (((p.views || 0) + (p.qualifiedViews || 0) * 4 + (p.likes ? p.likes.length : 0) * 3) * getTimeDecayFactor(p.createdAt)) + ((me && me.originCountry && p.country === me.originCountry) ? 8 : 0) + ((myLang && p.language === myLang) ? 6 : 0) + (matchesInitialTopic ? 7 : 0) + ((p.country && isCountryInWakingHours(p.country) && (Date.now() - new Date(p.createdAt).getTime()) < 24*60*60*1000) ? 5 : 0) - (quickScrollPenalties[p.id] || 0) * 2 };
    });
    scored.sort((a, b) => b.score - a.score || new Date(b.post.createdAt) - new Date(a.post.createdAt));
    return diversifyFeedOrder(scored.map(s => s.post));
  }
  const scored = posts.map(p => {
    const tags = extractHashtags(p.caption);
    let score = tags.reduce((s, t) => s + (profile[t] || 0), 0);
    score += (completionSignals[p.id] || 0) * 5;
    score += (collaborativeScores[p.id] || 0) * 1.5;
    if(myFollowing.has(p.userId)) score += 4;
    if(p.repostedByFollowedUser) score += 3;
    if(me && me.originCountry && p.country === me.originCountry) score += 8;
    if(p.country && isCountryInWakingHours(p.country) && (Date.now() - new Date(p.createdAt).getTime()) < 24*60*60*1000) score += 5;
    score *= getTimeDecayFactor(p.createdAt);
    score -= (quickScrollPenalties[p.id] || 0) * 3;
    const matchingTopicWeights = tags.map(t => topicPrefs[t.slice(1)]).filter(w => w !== undefined);
    if(matchingTopicWeights.length > 0){
      const strongestWeight = matchingTopicWeights.reduce((a, b) => Math.abs(b) > Math.abs(a) ? b : a, 0);
      score += strongestWeight;
    }
    return {post: p, score};
  });
  scored.sort((a, b) => b.score - a.score || new Date(b.post.createdAt) - new Date(a.post.createdAt));
  const withDiscovery = injectDiscoveryContent(scored.map(s => s.post), profile);
  return diversifyFeedOrder(withDiscovery);
}
function setFeedMode(mode){
  feedMode = mode;
  document.getElementById('feed-mode-foryou').style.background = mode === 'foryou' ? 'var(--coral)' : 'transparent';
  document.getElementById('feed-mode-foryou').style.color = mode === 'foryou' ? 'var(--night)' : 'var(--cream)';
  document.getElementById('feed-mode-community').style.background = mode === 'community' ? 'var(--coral)' : 'transparent';
  document.getElementById('feed-mode-community').style.color = mode === 'community' ? 'var(--night)' : 'var(--cream)';
  document.getElementById('feed-mode-following').style.background = mode === 'following' ? 'var(--coral)' : 'transparent';
  document.getElementById('feed-mode-following').style.color = mode === 'following' ? 'var(--night)' : 'var(--cream)';
  document.getElementById('feed-mode-friends').style.background = mode === 'friends' ? 'var(--coral)' : 'transparent';
  document.getElementById('feed-mode-friends').style.color = mode === 'friends' ? 'var(--night)' : 'var(--cream)';
  document.getElementById('feed-mode-local').style.background = mode === 'local' ? 'var(--coral)' : 'transparent';
  document.getElementById('feed-mode-local').style.color = mode === 'local' ? 'var(--night)' : 'var(--cream)';
  document.getElementById('feed-mode-recent').style.background = mode === 'recent' ? 'var(--coral)' : 'transparent';
  document.getElementById('feed-mode-recent').style.color = mode === 'recent' ? 'var(--night)' : 'var(--cream)';
  renderFeed();
}
async function translateComment(index){
  const el = document.getElementById('comment-text-' + index);
  if(!el) return;
  if(el.dataset.translated === 'true'){
    el.innerHTML = el.dataset.original;
    el.dataset.translated = 'false';
    return;
  }
  const originalHtml = el.innerHTML;
  el.dataset.original = originalHtml;
  const p = await safeGet('post:' + currentCommentsPostId, true);
  const comment = p && p.comments && p.comments[index];
  if(!comment || !comment.text){ return; }
  el.innerHTML = originalHtml.replace('🌐 Traduire', '⏳ Traduction...');
  try{
    const prompt = "Traduis ce texte en français, sans aucun commentaire ni guillemets, juste la traduction directe :\n\n" + comment.text;
    const translated = await callAIProvider(prompt, 300, await getGovernanceAIProvider());
    if(translated){
      el.innerHTML = escapeHtml(translated) + ' <span style="color:rgba(245,239,227,0.5); font-size:10.5px;">(traduit)</span> <span onclick="translateComment('+index+')" style="color:var(--lagoon); font-size:11px; cursor:pointer;">Voir l’original</span>';
      el.dataset.translated = 'true';
    } else {
      el.innerHTML = originalHtml;
    }
  }catch(e){
    el.innerHTML = originalHtml;
    showToast('Traduction indisponible pour le moment');
  }
}
async function translateProduct(productId){
  const el = document.getElementById('product-desc-' + productId);
  if(!el) return;
  if(el.dataset.translated === 'true'){
    el.innerHTML = el.dataset.original;
    el.dataset.translated = 'false';
    return;
  }
  const originalHtml = el.innerHTML;
  el.dataset.original = originalHtml;
  const products = await fetchProducts();
  const p = products.find(x => x.id === productId);
  if(!p || !p.name){ return; }
  el.innerHTML = '⏳ Traduction...';
  try{
    const prompt = "Traduis ce nom de produit en français, sans aucun commentaire ni guillemets, juste la traduction directe :\n\n" + p.name;
    const translated = await callAIProvider(prompt, 100, await getGovernanceAIProvider());
    if(translated){
      el.innerHTML = escapeHtml(translated) + ' <span onclick="translateProduct(\''+productId+'\')" style="color:var(--lagoon); font-size:10.5px; cursor:pointer;">(original)</span>';
      el.dataset.translated = 'true';
    } else {
      el.innerHTML = originalHtml;
    }
  }catch(e){
    el.innerHTML = originalHtml;
  }
}
/* ---------- DICTÉE VOCALE DE LÉGENDE ---------- */
/* ---------- RECHERCHE VOCALE ---------- */
let voiceSearchRecognizer = null;
let isVoiceSearching = false;
function toggleVoiceSearch(){
  const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SpeechRecognitionAPI){
    showToast('Recherche vocale indisponible sur cet appareil');
    return;
  }
  const btn = document.getElementById('voice-search-btn');
  const input = document.getElementById('discover-search-input');
  if(isVoiceSearching){
    if(voiceSearchRecognizer) voiceSearchRecognizer.stop();
    return;
  }
  voiceSearchRecognizer = new SpeechRecognitionAPI();
  voiceSearchRecognizer.lang = 'fr-FR';
  voiceSearchRecognizer.interimResults = false;
  voiceSearchRecognizer.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    input.value = transcript;
    renderDiscoverSearchResults();
  };
  voiceSearchRecognizer.onerror = () => {
    showToast('Impossible de capter votre voix — réessayez');
  };
  voiceSearchRecognizer.onend = () => {
    isVoiceSearching = false;
    btn.textContent = '🎙️';
    btn.style.color = 'var(--cream)';
  };
  voiceSearchRecognizer.start();
  isVoiceSearching = true;
  btn.textContent = '⏹️';
  btn.style.color = 'var(--coral)';
}
let captionDictationRecognizer = null;
let isCaptionDictating = false;
function toggleCaptionDictation(){
  const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SpeechRecognitionAPI){
    showToast('Dictée vocale indisponible sur cet appareil');
    return;
  }
  const btn = document.getElementById('caption-dictate-btn');
  const textarea = document.getElementById('publish-caption');
  if(isCaptionDictating){
    if(captionDictationRecognizer) captionDictationRecognizer.stop();
    return;
  }
  captionDictationRecognizer = new SpeechRecognitionAPI();
  captionDictationRecognizer.lang = 'fr-FR';
  captionDictationRecognizer.interimResults = false;
  captionDictationRecognizer.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    textarea.value = (textarea.value ? textarea.value + ' ' : '') + transcript;
  };
  captionDictationRecognizer.onerror = () => {
    showToast('Impossible de capter votre voix — réessayez');
  };
  captionDictationRecognizer.onend = () => {
    isCaptionDictating = false;
    btn.textContent = '🎙️ Dicter ma légende';
    btn.style.color = 'var(--cream)';
  };
  captionDictationRecognizer.start();
  isCaptionDictating = true;
  btn.textContent = '⏹️ Arrêter la dictée';
  btn.style.color = 'var(--coral)';
}
function startVideoVoiceover(postId){
  if(!('speechSynthesis' in window)) return;
  const cachedPost = singlePostViewCachedPost;
  if(!cachedPost || cachedPost.id !== postId || !cachedPost.voiceoverText) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(cachedPost.voiceoverText);
  utterance.lang = 'fr-FR';
  window.speechSynthesis.speak(utterance);
}
/* ---------- DIAPORAMA SYNCHRONISÉ AVEC LA MUSIQUE ---------- */
let slideshowImages = [];
let slideshowAudioTimeUpdateHandler = null;
async function startSyncedSlideshow(postId){
  const post = await safeGet('post:' + postId, true);
  if(!post || !post.images || post.images.length < 2 || !post.audioData) return;
  slideshowImages = post.images;
  go('synced-slideshow');
  document.getElementById('slideshow-current-image').src = slideshowImages[0];
  document.getElementById('slideshow-dots').innerHTML = slideshowImages.map((_,i) => '<span style="width:7px; height:7px; border-radius:50%; background:'+(i===0?'var(--gold)':'rgba(245,239,227,0.25)')+';"></span>').join('');
  const audio = document.getElementById('slideshow-audio');
  audio.src = post.audioData;
  audio.currentTime = 0;
  if(slideshowAudioTimeUpdateHandler) audio.removeEventListener('timeupdate', slideshowAudioTimeUpdateHandler);
  slideshowAudioTimeUpdateHandler = function(){
    if(!audio.duration || isNaN(audio.duration)) return;
    const slotDuration = audio.duration / slideshowImages.length;
    const activeIndex = Math.min(slideshowImages.length - 1, Math.floor(audio.currentTime / slotDuration));
    document.getElementById('slideshow-current-image').src = slideshowImages[activeIndex];
    const dots = document.querySelectorAll('#slideshow-dots span');
    dots.forEach((d,i) => { d.style.background = i === activeIndex ? 'var(--gold)' : 'rgba(245,239,227,0.25)'; });
  };
  audio.addEventListener('timeupdate', slideshowAudioTimeUpdateHandler);
  audio.play().catch(() => {});
}
function stopSyncedSlideshow(){
  const audio = document.getElementById('slideshow-audio');
  audio.pause();
  if(slideshowAudioTimeUpdateHandler) audio.removeEventListener('timeupdate', slideshowAudioTimeUpdateHandler);
  slideshowAudioTimeUpdateHandler = null;
  go('single-post');
}
function stopVideoVoiceover(){
  if('speechSynthesis' in window) window.speechSynthesis.cancel();
}
async function readCaptionAloud(postId){
  if(!('speechSynthesis' in window)){
    showToast('Lecture vocale indisponible sur cet appareil');
    return;
  }
  const post = (await fetchPosts()).find(p => p.id === postId);
  if(!post || !post.caption) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(post.caption.replace(/#\S+/g, '').replace(/@\S+/g, ''));
  utterance.lang = 'fr-FR';
  window.speechSynthesis.speak(utterance);
}
async function translateCaption(postId){
  const el = document.getElementById('caption-' + postId);
  if(!el) return;
  if(el.dataset.translated === 'true'){
    el.innerHTML = el.dataset.original;
    el.dataset.translated = 'false';
    return;
  }
  const originalHtml = el.innerHTML;
  el.dataset.original = originalHtml;
  const post = (await fetchPosts()).find(p => p.id === postId);
  if(!post || !post.caption){ return; }
  el.innerHTML = originalHtml.replace('🌐 Traduire', '⏳ Traduction...');
  try{
    const prompt = "Traduis ce texte en français, sans aucun commentaire ni guillemets, juste la traduction directe :\n\n" + post.caption;
    const translated = await callAIProvider(prompt, 300, await getGovernanceAIProvider());
    if(translated){
      el.innerHTML = escapeHtml(translated) + ' <span style="color:rgba(245,239,227,0.5); font-size:10.5px;">(traduit)</span> <span onclick="translateCaption(\''+postId+'\')" style="color:var(--lagoon); font-size:11px; cursor:pointer;">Voir l’original</span>';
      el.dataset.translated = 'true';
    } else {
      el.innerHTML = originalHtml;
    }
  }catch(e){
    el.innerHTML = originalHtml;
    showToast('Traduction indisponible pour le moment');
  }
}
const CAPTION_TRUNCATE_LENGTH = 100;
const expandedCaptionsThisSession = new Set();
function renderCaptionWithToggle(caption, postId){
  if(!caption) return '';
  const isExpanded = expandedCaptionsThisSession.has(postId);
  const isLong = caption.length > CAPTION_TRUNCATE_LENGTH;
  if(!isLong || isExpanded){
    return formatCaptionWithLinks(caption, postId) + (isLong ? ' <span onclick="event.stopPropagation(); toggleCaptionExpanded(\''+postId+'\')" style="color:rgba(245,239,227,0.5); font-size:11.5px; cursor:pointer; white-space:nowrap;">voir moins</span>' : '');
  }
  const truncated = caption.slice(0, CAPTION_TRUNCATE_LENGTH);
  return formatCaptionWithLinks(truncated, postId) + '… <span onclick="event.stopPropagation(); toggleCaptionExpanded(\''+postId+'\')" style="color:rgba(245,239,227,0.5); font-size:11.5px; cursor:pointer; white-space:nowrap;">voir plus</span>';
}
function toggleCaptionExpanded(postId){
  if(expandedCaptionsThisSession.has(postId)) expandedCaptionsThisSession.delete(postId);
  else expandedCaptionsThisSession.add(postId);
  const el = document.getElementById('caption-text-' + postId);
  if(el && el.dataset.rawCaption !== undefined){
    el.innerHTML = renderCaptionWithToggle(el.dataset.rawCaption, postId);
  }
}
function formatCaptionWithLinks(caption, postId){
  const escaped = escapeHtml(caption || '');
  let result = escaped
    .replace(/#([\p{L}0-9_]+)/gu, '<span onclick="openHashtagPage(\'$1\')" style="color:var(--gold); cursor:pointer;">#$1</span>')
    .replace(/@([a-zA-Z0-9_]+)/g, '<span onclick="openUserProfile(\'$1\')" style="color:var(--lagoon); cursor:pointer;">@$1</span>');
  if(postId){
    result = result.replace(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/g, function(match, ts){
      return '<span onclick="seekVideoToTimestamp(\''+postId+'\', \''+ts+'\')" style="color:var(--lagoon); cursor:pointer; text-decoration:underline;">'+ts+'</span>';
    });
  }
  return result;
}
function seekVideoToTimestamp(postId, timestamp){
  const video = document.getElementById('video-' + postId);
  if(!video) return;
  const parts = timestamp.split(':').map(Number);
  let seconds = 0;
  if(parts.length === 2) seconds = parts[0]*60 + parts[1];
  else if(parts.length === 3) seconds = parts[0]*3600 + parts[1]*60 + parts[2];
  video.currentTime = seconds;
  video.play().catch(() => {});
}
let currentHashtagPage = null;
