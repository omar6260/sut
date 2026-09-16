# Appels externes du prototype — `fetch` et scripts tiers

Source : `grep -n "fetch('https://" legacy/suktum-app.html` (28 sites) + `<script src=…>` (3) + ressources `<img>`/`<link>`.
Règle d'or n° 1 : **aucun secret côté navigateur**. Toutes les lignes marquées « clé en `settings:` » sont des violations
à corriger en phase 06 (Cloud Functions + Secret Manager) ; les sites de modération média passent en phase 07.

## 1. Modèles d'IA

| Ligne | Fonction | URL | Secret utilisé | Où est stocké le secret | Fonction serveur cible |
|---|---|---|---|---|---|
| 8052 | `generateVideoSubtitles` | Gemini `gemini-2.0-flash:generateContent?key=` | clé Gemini | `settings:geminiApiKey` (partagé, l. 8046) | `ai.generateSubtitles` |
| 9228 | `generateDuetToOrderSuggestion` | Gemini | clé Gemini | `settings:geminiApiKey` (l. 9220) | `ai.suggest` |
| 9260 | `generateAnimatedCaptions` | Gemini | clé Gemini | `settings:geminiApiKey` (l. 9252) | `ai.captions` |
| 9296 | `generateAutoCaptions` | Gemini | clé Gemini | `settings:geminiApiKey` (l. 9288) | `ai.captions` |
| 15697 | `generateTrainerAISummary` | `api.anthropic.com/v1/messages` | **aucune clé envoyée** (l. 15697-15700 : seul `Content-Type`) — fonctionne uniquement dans l'environnement Claude qui injecte l'authentification | — | `ai.trainerSummary` |
| 19115 | `callAIClaudeFirstWithGeminiFallback` | Anthropic puis Gemini | aucune (Anthropic) / `settings:geminiApiKey` (l. 19125) | idem | `ai.moderateText` |
| 19831 | `generateCourseVideoChapters` | Gemini (vidéo inline base64, ≤ 19 Mo l. 19828) | clé Gemini | `settings:geminiApiKey` (l. 19824) | `ai.videoChapters` (depuis Storage, pas base64) |
| 19870 | `generateLessonChapters` | Gemini | clé Gemini | `settings:geminiApiKey` (l. 19863) | `ai.lessonChapters` |
| 26544 / 26559 | `callAIProviderStrict` | Gemini / Anthropic selon `provider` | `settings:geminiApiKey` / aucune | idem | `ai.call` (fournisseur choisi serveur) |
| 26571 | `getContentEmbedding` | Gemini `text-embedding-004:embedContent` | clé Gemini | `settings:geminiApiKey` (l. 26568) | déclencheur `onCreate` leçon/exercice → `ai.embed` |
| 26592 / 26603 | `callAIProvider` | Gemini / Anthropic | idem | idem | `ai.call` |
| 31289 | `generateTrendsReport` | Anthropic | aucune | — | `admin.trendsReport` |
| 31443 | `checkWeeklyReport` | Anthropic | aucune | — | fonction planifiée `scheduled.weeklyReport` |
| 31494 | `generateAIPlatformReport` | Anthropic | aucune | — | `admin.platformReport` |
| 31516 | `askAIAboutPlatform` | Anthropic | aucune | — | `admin.askAI` |

Modèle demandé côté Anthropic : `claude-sonnet-4-6` (l. 26606, 19118). À remplacer côté serveur par un identifiant courant (la phase 06 tranchera : `claude-sonnet-5` par défaut).

## 2. Google Cloud — modération et analyse de médias

| Ligne | Fonction | URL | Secret | Stockage | Cible |
|---|---|---|---|---|---|
| 9566 | `checkImageWithVisionAI` | `vision.googleapis.com/v1/images:annotate?key=` | clé Vision | `settings:google_vision_api_key` (l. 9535, écrite l. 9541) | `media.moderateImage` |
| 9589 / 9606 | `submitVideoForAIAnalysis` / `checkVideoAnalysisResult` | `videointelligence.googleapis.com` (`videos:annotate`, opérations) | clé Video Intelligence | `settings:google_video_api_key` (l. 9536, écrite l. 9542) | `media.analyzeVideo` + `media.pollAnalysis` |
| 26323 | `analyzeProductPhotoLabels` | Vision (labels) | clé Vision | `settings:gcvVisionKey` (l. 26319, écrite l. 26288) | `media.labelImage` |
| 26373 | `moderateImageWithCloudVision` | Vision (SafeSearch) | clé Vision | `settings:gcvVisionKey` (l. 26369) | `media.moderateImage` |
| 26403 / 26414 | `moderateVideoWithVideoIntelligence` | Video Intelligence (explicit content) | clé Video | `settings:gcvVideoKey` (l. 26399, écrite l. 26289) | `media.moderateVideo` |

**Deux jeux de clés pour le même service** (`google_vision_api_key` / `gcvVisionKey`, `google_video_api_key` / `gcvVideoKey`) écrits par deux écrans de back-office différents (l. 9541-9542 et 26288-26289) : à unifier en un seul secret serveur.

## 3. Services tiers

| Ligne | Fonction | URL | Secret | Stockage | Cible |
|---|---|---|---|---|---|
| 7716 | `attemptAutoDetectCountry` | `nominatim.openstreetmap.org/reverse` | aucun (mais politique d'usage Nominatim : User-Agent obligatoire, 1 req/s) | — | `geo.reverse` (relais serveur avec cache) ou liste de pays sans géocodage |
| 21437 | `checkSellerWeatherAlert` | `api.openweathermap.org/data/2.5/weather` | clé OpenWeather | `settings:weatherApiKey` (l. 21428) | `scheduled.weatherAlerts` (une requête par ville, pas par vendeur) |
| 26483 | `requestYangoDelivery` | `b2b.taxi.yandex.net/api/b2b/platform/requests` | `Authorization: Bearer <clé>` | `settings:yangoApiKey` (l. 26434) | `payments.requestDelivery` (phase 10) — coordonnées `[0, 0]` en dur l. 26489-26490 : intégration inachevée |
| 20716 / 22834 | rendu de QR code | `api.qrserver.com/v1/create-qr-code` (balise `<img>`) | aucun | — | générer le QR localement (bibliothèque) pour ne pas envoyer les codes de certificat à un tiers |
| — | partage WhatsApp | `wa.me/<numéro>` (6 sites, liens sortants) | aucun | — | conserver |

## 4. Scripts et ressources chargés dans la page

| Ligne | Ressource | Risque | Décision proposée |
|---|---|---|---|
| 40 | `https://meet.jit.si/external_api.js` (Jitsi) | serveur public, non épinglé, dépendance à un tiers pour les lives et Penc | phase 07 : Jitsi auto-hébergé ou JaaS (8x8) avec JWT émis serveur |
| 234 | `https://unpkg.com/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js` | CDN non épinglé (pas de SRI), cœur multi-thread exigeant COOP/COEP (C6) | phase 03 : servir localement, cœur mono-thread ; phase 07 : filigrane/filtres côté Cloudflare Stream |
| 235 | `https://accounts.google.com/gsi/client` | `GOOGLE_CLIENT_ID = ""` (l. 6983) : connexion Google inopérante dans le prototype | phase 05 : Firebase Auth Google (plus de GIS direct) |
| 30-31 (à vérifier) | `fonts.googleapis.com` / `fonts.gstatic.com` | dépendance réseau au premier rendu | phase 12 (PWA) : polices auto-hébergées |

## 5. Synthèse pour la phase 06

- **7 clés distinctes** vivent dans `settings:` partagé, lisibles par tout client : `geminiApiKey`, `google_vision_api_key`, `google_video_api_key`, `gcvVisionKey`, `gcvVideoKey`, `weatherApiKey`, `yangoApiKey`. Toutes migrent vers Secret Manager.
- **Les 8 appels Anthropic n'envoient aucune clé** : ils ne fonctionnent que dans l'environnement Claude. Hors de cet environnement, chaque fonction concernée retombe sur son `catch` (comportement « IA indisponible »). C'est ce que les tests de caractérisation simulent.
- Les médias sont envoyés en base64 dans le corps des requêtes (Vision, Video Intelligence, Gemini) : côté serveur, les fonctions liront depuis Storage / Cloudflare Stream.
