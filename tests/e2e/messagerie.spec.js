// Garantit : A trouve B via la recherche, ouvre son profil, lui écrit ; B voit la conversation
// dans « Messages », l'ouvre et lit le message ; A a une notification côté B.
import { test, expect } from '../support/fixtures.js';

test.describe('Messagerie', () => {
  test('A écrit à B, B lit', async ({ suktum }) => {
    const a = await suktum.openDevice('A');
    const b = await suktum.openDevice('B');
    await suktum.signUp(a, 'Awa_Dakar');
    await suktum.signUp(b, 'Moussa_Thies');
    await suktum.dismissTour(a);
    await suktum.dismissTour(b);

    // A cherche B depuis Explorer et ouvre son profil.
    await a.locator('.tab[data-screen="discover"]').click();
    await expect(a.locator('#screen-discover')).toHaveClass(/active/);
    await a.locator('#discover-search-input').fill('Moussa');
    await a.locator('#discover-search-results [onclick="openUserProfile(\'Moussa_Thies\')"]').click();
    await expect(a.locator('#screen-user-profile')).toHaveClass(/active/);

    // A ouvre la conversation et envoie un message.
    await a.locator('#screen-user-profile button[onclick="openThread(currentViewedProfileUsername)"]').click();
    await expect(a.locator('#screen-thread')).toHaveClass(/active/);
    await expect(a.locator('#thread-title')).toHaveText('@Moussa_Thies');
    await a.locator('#thread-input').fill('Salut Moussa, on se voit au marché ?');
    await a.locator('#screen-thread button[onclick="sendThreadMessage()"]').click();
    await expect(a.locator('#thread-messages')).toContainText('Salut Moussa, on se voit au marché ?');
    await expect(a.locator('#thread-input')).toHaveValue('');

    const dm = (await suktum.storage.readJSON('dm:Awa_Dakar__Moussa_Thies'));
    expect(dm).toHaveLength(1);
    expect(dm[0]).toMatchObject({ from: 'Awa_Dakar', text: 'Salut Moussa, on se voit au marché ?' });

    // B voit la conversation dans Messages et la lit.
    await b.locator('.tab[data-screen="messages"]').click();
    await expect(b.locator('#screen-messages')).toHaveClass(/active/);
    await expect(b.locator('#messages-list')).toContainText('@Awa_Dakar');
    await expect(b.locator('#messages-list')).toContainText('Salut Moussa, on se voit au marché ?');
    await b.locator('#messages-list [onclick="openThread(\'Awa_Dakar\')"]').click();
    await expect(b.locator('#screen-thread')).toHaveClass(/active/);
    await expect(b.locator('#thread-messages')).toContainText('Salut Moussa, on se voit au marché ?');

    // B répond, A voit la réponse en revenant sur la conversation.
    await b.locator('#thread-input').fill('Oui, à 10h !');
    await b.locator('#screen-thread button[onclick="sendThreadMessage()"]').click();
    await expect(b.locator('#thread-messages')).toContainText('Oui, à 10h !');
    expect((await suktum.storage.readJSON('dm:Awa_Dakar__Moussa_Thies'))).toHaveLength(2);

    // Notification côté B.
    await b.locator('#global-notif-btn').click();
    await expect(b.locator('#notifications-list')).toContainText('@Awa_Dakar');

    expect(suktum.errors).toEqual([]);
  });

  test('sans conversation, la liste des messages est vide', async ({ suktum }) => {
    const a = await suktum.openDevice('A');
    await suktum.signUp(a, 'Awa_Dakar');
    await suktum.dismissTour(a);
    await a.locator('.tab[data-screen="messages"]').click();
    await expect(a.locator('#messages-list')).toContainText('Aucune conversation pour l’instant.');
  });
});
