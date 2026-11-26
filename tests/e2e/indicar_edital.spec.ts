import { test, expect } from '@playwright/test';

test.describe('Portal de Editais - Indicar edital', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('./contribua/');
    });

    test('Visualizar seção Indicar edital, aviso LGPD e ausência de campos pessoais', async ({ page }) => {
        const section = page.getByTestId('indicar-edital-section');
        await expect(section).toBeVisible();
        await expect(section.locator('h2')).toContainText('Indicar edital');

        await expect(page.getByTestId('indicar-lgpd-aviso')).toContainText('LGPD');
        await expect(page.getByTestId('indicar-link-oficial')).toBeVisible();
        await expect(page.getByTestId('indicar-orgao')).toBeVisible();
        await expect(page.getByTestId('indicar-prazo')).toBeVisible();
        await expect(page.getByTestId('indicar-observacoes')).toBeVisible();
        await expect(page.getByTestId('indicar-link-direto')).toHaveAttribute(
            'href',
            /template=indicar-edital\.yml/
        );

        await expect(section.locator('input[type="email"], input[type="tel"]')).toHaveCount(0);
    });

    test('Bloquear envio inválido e gerar URL pré-preenchida ao preencher corretamente', async ({ page }) => {
        await page.evaluate(() => {
            (window as unknown as { __openedUrls?: string[] }).__openedUrls = [];
            window.open = ((url?: string | URL) => {
                (window as unknown as { __openedUrls: string[] }).__openedUrls.push(String(url ?? ''));
                return null;
            }) as typeof window.open;
        });

        await page.getByTestId('indicar-submit').click();
        await expect(page.getByTestId('indicar-erro')).toBeVisible();

        await page.getByTestId('indicar-link-oficial').fill('https://fapes.es.gov.br/edital-2026');
        await page.getByTestId('indicar-orgao').fill('FAPES');
        await page.getByTestId('indicar-prazo').fill('15/12/2026');
        await page.getByTestId('indicar-observacoes').fill('Edital de pesquisa aplicada');
        await page.getByTestId('indicar-submit').click();

        await expect(page.getByTestId('indicar-erro')).toBeHidden();

        const generatedHref = await page.getByTestId('indicar-github-link').getAttribute('href');
        expect(generatedHref).toBeTruthy();

        const parsed = new URL(generatedHref!);
        expect(parsed.origin + parsed.pathname).toBe('https://github.com/RafaelDeps/portal_edital/issues/new');
        expect(parsed.searchParams.get('template')).toBe('indicar-edital.yml');
        expect(parsed.searchParams.get('labels')).toBe('indicacao-edital');
        expect(parsed.searchParams.get('link_oficial')).toBe('https://fapes.es.gov.br/edital-2026');
        expect(parsed.searchParams.get('orgao')).toBe('FAPES');
        expect(parsed.searchParams.get('prazo')).toBe('15/12/2026');
        expect(parsed.searchParams.get('observacoes')).toBe('Edital de pesquisa aplicada');
    });
});
