// Garantit : A publie une photo avec légende et #hashtag ; B la voit dans le fil « Récent » ;
// B aime et commente ; A retrouve les deux notifications.
import { test, expect } from '../support/fixtures.js';
import { photoFile } from '../support/fixtures-media.js';

/**
 * Depuis le fil : onglet Publier (caméra) → vignette « galerie » → écran d'import de fichier.
 * (Le lien « CRÉER » en bas de l'écran caméra est recouvert par la barre d'onglets sur Pixel 7 — voir a-traiter.md.)
 */
async function openPublishScreen(page) {
  await page.locator('.tab[data-screen="publish"]').click();
  await expect(page.locator('#screen-camera-publish')).toHaveClass(/active/);
  await page.locator('#screen-camera-publish [onclick="openCameraGalleryPicker()"]').click();
  await expect(page.locator('#screen-publish')).toHaveClass(/active/);
}

test.describe('Publication', () => {
  test('photo avec légende et hashtag → vue, aimée et commentée par un autre utilisateur → notifications', async ({ suktum }) => {
    const a = await suktum.openDevice('A');
    await suktum.signUp(a, 'Awa_Dakar');
    await suktum.dismissTour(a);

    // A publie.
    await openPublishScreen(a);
    await a.locator('#publish-file').setInputFiles(photoFile());
    await a.locator('#publish-caption').fill('Ma pirogue au soleil #teranga');
    await a.locator('#screen-publish button[onclick="publishPost()"]').click();
    await expect(a.locator('#screen-feed')).toHaveClass(/active/);
    expect(suktum.lastToast(a)).toBe('Publié ⛵');

    const postKeys = suktum.storage.list(null, 'post:', true).keys;
    expect(postKeys).toHaveLength(1);
    const post = suktum.storage.readJSON(postKeys[0]);
    expect(post).toMatchObject({ userId: 'Awa_Dakar', type: 'image', caption: 'Ma pirogue au soleil #teranga', status: 'published', likes: [], comments: [] });
    expect(post.data).toMatch(/^data:image\//);

    // B voit la publication dans « Récent ».
    const b = await suktum.openDevice('B');
    await suktum.signUp(b, 'Moussa_Thies');
    await suktum.dismissTour(b);
    await b.locator('#feed-mode-recent').click();
    const card = b.locator(`.feed-card[data-post-id="${post.id}"]`);
    await expect(card).toBeVisible();
    await expect(card).toContainText('#teranga');
    await expect(card).toContainText('Awa_Dakar');

    // B aime. (Sur Pixel 7 la colonne d'actions déborde et le cœur est recouvert par la cloche des
    // notifications — voir a-traiter.md ; on déclenche le clic sur le bouton lui-même.)
    await card.locator('button[onclick^="toggleLike"]').dispatchEvent('click');
    await expect(b.locator(`.feed-card[data-post-id="${post.id}"] button[onclick^="toggleLike"]`)).toContainText('❤️');
    expect(suktum.storage.readJSON(`post:${post.id}`).likes).toEqual(['Moussa_Thies']);

    // B commente.
    await b.locator(`.feed-card[data-post-id="${post.id}"] button[onclick^="openCommentsScreen"]`).dispatchEvent('click');
    await expect(b.locator('#screen-comments')).toHaveClass(/active/);
    await b.locator('#comment-input').fill('Magnifique, bon vent !');
    await b.locator('#screen-comments button', { hasText: 'Envoyer' }).click();
    await expect(b.locator('#comments-list')).toContainText('Magnifique, bon vent !');
    expect(suktum.storage.readJSON(`post:${post.id}`).comments).toHaveLength(1);

    // A voit les notifications.
    await a.locator('#global-notif-btn').click();
    await expect(a.locator('#screen-notifications')).toHaveClass(/active/);
    await expect(a.locator('#notifications-list')).toContainText('@Moussa_Thies a aimé votre publication');
    await expect(a.locator('#notifications-list')).toContainText('@Moussa_Thies a commenté votre publication');

    expect(suktum.errors).toEqual([]);
  });

  test('publier sans fichier est refusé', async ({ suktum }) => {
    const a = await suktum.openDevice('A');
    await suktum.signUp(a, 'Awa_Dakar');
    await suktum.dismissTour(a);
    await openPublishScreen(a);
    await a.locator('#publish-caption').fill('Sans image');
    await a.locator('#screen-publish button[onclick="publishPost()"]').click();
    await expect(a.locator('#screen-publish')).toHaveClass(/active/);
    expect(suktum.lastToast(a)).toBe('Choisissez une vidéo ou une photo');
    expect(suktum.storage.list(null, 'post:', true).keys).toEqual([]);
  });
});
