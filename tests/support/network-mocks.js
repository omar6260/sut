// Simulation des appels réseau sortants du prototype, pour des tests rapides et déterministes.
// Rien ne sort vers Internet : scripts tiers remplacés par des stubs, API IA par des réponses fixes.

const ANTHROPIC_REPLY = {
  id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-test',
  content: [{ type: 'text', text: 'Réponse simulée (test de caractérisation).' }],
  stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 },
};

const GEMINI_REPLY = {
  candidates: [{ content: { role: 'model', parts: [{ text: 'Réponse simulée (test de caractérisation).' }] }, finishReason: 'STOP' }],
};

const EMBED_REPLY = { embedding: { values: Array.from({ length: 8 }, (_, i) => i / 8) } };

const json = (body, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** À appeler sur un `BrowserContext` avant la navigation. */
export async function installNetworkMocks(context) {
  // Playwright évalue les routes de la DERNIÈRE enregistrée à la première : le filet générique
  // doit donc être déclaré en premier pour que les simulations ciblées ci-dessous passent avant lui.
  // Filet : tout autre appel externe est coupé (et signalé) plutôt que d'attendre un délai réseau.
  await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => {
    console.warn(`[network-mocks] appel externe non simulé coupé : ${r.request().url()}`);
    r.abort();
  });

  // Scripts tiers chargés dans <head> : stub vide, les fonctions du legacy testent leur présence.
  await context.route('https://meet.jit.si/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* jitsi stub */' }));
  await context.route('https://unpkg.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* ffmpeg stub */' }));
  await context.route('https://accounts.google.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* gsi stub */' }));
  await context.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await context.route('https://fonts.gstatic.com/**', (r) => r.abort());

  // API d'IA : réponses fixes.
  await context.route('https://api.anthropic.com/**', (r) => r.fulfill(json(ANTHROPIC_REPLY)));
  await context.route('https://generativelanguage.googleapis.com/**', (r) => {
    const url = r.request().url();
    r.fulfill(json(url.includes('embedContent') ? EMBED_REPLY : GEMINI_REPLY));
  });
  await context.route('https://vision.googleapis.com/**', (r) => r.fulfill(json({ responses: [{}] })));
  await context.route('https://videointelligence.googleapis.com/**', (r) => r.fulfill(json({ name: 'operations/test', done: true, response: {} })));

  // Services divers.
  await context.route('https://nominatim.openstreetmap.org/**', (r) => r.fulfill(json({ address: { country: 'Sénégal' } })));
  await context.route('https://api.openweathermap.org/**', (r) => r.fulfill(json({ weather: [{ main: 'Clear' }], main: { temp: 30 } })));
  await context.route('https://b2b.taxi.yandex.net/**', (r) => r.fulfill(json({ id: 'yango_test' })));
  await context.route('https://api.qrserver.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.alloc(0) }));

}
