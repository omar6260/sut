// Garantit : A (vendeur) publie un produit dans sa boutique ; B (acheteur) le voit dans la boutique et le commande ;
// la commande apparaît « En attente » chez A (tableau de bord vendeur) et dans « Mes commandes » chez B.
import { test, expect } from '../support/fixtures.js';

async function openShop(page) {
  await page.locator('#screen-feed [onclick="go(\'shop\')"]').click();
  await expect(page.locator('#screen-shop')).toHaveClass(/active/);
}

async function openSellerDashboard(page) {
  await openShop(page);
  await page.locator('#screen-shop [onclick="openMyShopDrawer()"]').click();
  await expect(page.locator('#screen-my-shop-drawer')).toHaveClass(/active/);
  await page.locator('#screen-my-shop-drawer [onclick="go(\'seller-dashboard\')"]').click();
  await expect(page.locator('#screen-seller-dashboard')).toHaveClass(/active/);
}

test.describe('Boutique', () => {
  test('A crée un produit ; B commande ; statut visible des deux côtés', async ({ suktum }) => {
    const a = await suktum.openDevice('A');
    await suktum.signUp(a, 'Awa_Dakar');
    await suktum.dismissTour(a);

    // A publie un produit.
    await openSellerDashboard(a);
    await a.locator('#seller-product-name').fill('Robe wax');
    await a.locator('#seller-product-desc').fill('Robe en wax cousue main, taille M');
    await a.locator('#seller-product-price').fill('15000');
    await a.locator('#seller-product-category').fill('Vêtement');
    await a.locator('#seller-product-stock').fill('3');
    await a.locator('#screen-seller-dashboard button[onclick="addSellerProduct()"]').click();
    await expect.poll(async () => (await suktum.storage.list(null, 'product:', true)).keys.length).toBe(1);
    const productKey = (await suktum.storage.list(null, 'product:', true)).keys[0];
    const product = (await suktum.storage.readJSON(productKey));
    expect(product).toMatchObject({ name: 'Robe wax', price: 15000, sellerUsername: 'Awa_Dakar', category: 'Vêtement', stock: 3, country: 'Sénégal' });
    await expect(a.locator('#seller-product-name')).toHaveValue('');

    // B voit le produit et commande.
    const b = await suktum.openDevice('B');
    await suktum.signUp(b, 'Moussa_Thies');
    await suktum.dismissTour(b);
    await openShop(b);
    await expect(b.locator('#shop-list')).toContainText('Robe wax');
    await b.locator(`#shop-list button[onclick="openOrderScreen('${product.id}')"]`).click();
    await expect(b.locator('#screen-order')).toHaveClass(/active/);
    await expect(b.locator('#order-product-name')).toContainText('Robe wax');
    await b.locator('#order-quantity').fill('2');
    await b.locator('#order-name').fill('Moussa Ndiaye');
    await b.locator('#order-phone').fill('77 123 45 67');
    await b.locator('#order-address').fill('Thiès, quartier Randoulène');
    await expect(b.locator('#order-total')).toContainText('30');
    await b.locator('#screen-order button[onclick="submitOrder()"]').click();
    await expect(b.locator('#screen-shop')).toHaveClass(/active/);
    expect(suktum.lastToast(b)).toMatch(/^Commande envoyée ✓ Référence : /);

    const orderKeys = (await suktum.storage.list(null, 'order:', true)).keys;
    expect(orderKeys).toHaveLength(1);
    const order = (await suktum.storage.readJSON(orderKeys[0]));
    expect(order).toMatchObject({
      productId: product.id, productName: 'Robe wax', quantity: 2, unitPrice: 15000, total: 30000,
      buyerUsername: 'Moussa_Thies', buyerName: 'Moussa Ndiaye', sellerUsername: 'Awa_Dakar', status: 'pending',
    });
    expect(order.netAmount + order.commissionAmount).toBe(order.total);
    expect((await suktum.storage.readJSON(productKey)).stock).toBe(1);

    // Côté B : « Mes commandes ».
    await b.locator('#screen-shop [onclick="go(\'my-orders\')"]').click();
    await expect(b.locator('#screen-my-orders')).toHaveClass(/active/);
    await expect(b.locator('#my-orders-list')).toContainText('Robe wax');
    await expect(b.locator('#my-orders-list')).toContainText('× 2');

    // Côté A : tableau de bord vendeur.
    await a.locator('.tab[data-screen="feed"]').click();
    await openSellerDashboard(a);
    await expect(a.locator('#seller-orders-list')).toContainText('Robe wax');
    await expect(a.locator('#seller-orders-list')).toContainText('@Moussa_Thies');
    await expect(a.locator('#seller-orders-list')).toContainText('En attente');
    await expect(a.locator('#seller-orders-list')).toContainText('Moussa Ndiaye');

    expect(suktum.errors).toEqual([]);
  });

  test('un produit sans prix est refusé', async ({ suktum }) => {
    const a = await suktum.openDevice('A');
    await suktum.signUp(a, 'Awa_Dakar');
    await suktum.dismissTour(a);
    await openSellerDashboard(a);
    await a.locator('#seller-product-name').fill('Sans prix');
    await a.locator('#screen-seller-dashboard button[onclick="addSellerProduct()"]').click();
    await expect.poll(() => suktum.lastToast(a)).toBe('Renseignez au moins le nom et un prix valide');
    expect((await suktum.storage.list(null, 'product:', true)).keys).toEqual([]);
  });
});
