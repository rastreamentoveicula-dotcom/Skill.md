import { expect, test } from '@playwright/test';

test.describe('páginas públicas renderizam (smoke sem credenciais)', () => {
  test('página inicial carrega', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });

  test('tela de configurações de IA exige login', async ({ page }) => {
    await page.goto('/admin/ai');
    // Sem sessão, o painel deve pedir autenticação — nunca vazar dados.
    await expect(page.getByText(/Entre na sua conta/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test('API de configurações responde 401 sem sessão', async ({ request }) => {
    const response = await request.get('/api/admin/settings/ai');
    expect(response.status()).toBe(401);
  });
});
