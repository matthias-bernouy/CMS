import type { Page } from "playwright";

export async function mutateSettings(page: Page): Promise<void> {
    await adminPageLink(page, "settings").click();
    const generalSubmit = 'form[cms-mutation^="ulvia.cms.access:update-site "] button[type="submit"]';
    await waitUntilEnabled(page, generalSubmit);
    await page.locator("#settings-general").waitFor();
    await page.locator("#settings-site-name").fill("Smoke CMS");
    const languageRevision = page.locator(
        'form[cms-mutation^="ulvia.cms.localization:update-languages "] input[name="expectedRevision"]',
    );
    const initialLanguageRevision = await languageRevision.inputValue();
    const languageRefresh = page.waitForResponse((candidate) =>
        candidate.url().includes("ulvia.cms.localization/overview"),
    );
    const [generalResponse] = await Promise.all([
        page.waitForResponse((candidate) => candidate.url().includes("ulvia.cms.access/update-site")),
        page.locator(generalSubmit).click(),
    ]);
    if (!generalResponse.ok()) {
        throw new Error(`General settings flow failed (${generalResponse.status()}): ${await generalResponse.text()}`);
    }
    await page
        .locator(
            'form[cms-mutation^="ulvia.cms.access:update-site "] p[cms-condition*="savedSite.outcome.kind === \'success\'"]',
        )
        .waitFor();
    await languageRefresh;
    await waitForInputChange(page, languageRevision, initialLanguageRevision);
    await page.locator('a[href="#settings-languages"]').click();
    await page.locator("#settings-default-language").fill("fr-FR");
    const [languagesResponse] = await Promise.all([
        page.waitForResponse((candidate) => candidate.url().includes("ulvia.cms.localization/update-languages")),
        page.locator('form[cms-mutation^="ulvia.cms.localization:update-languages "] button[type="submit"]').click(),
    ]);
    if (!languagesResponse.ok()) {
        throw new Error(
            `Language settings flow failed (${languagesResponse.status()}): ${await languagesResponse.text()}`,
        );
    }
    await page
        .locator(
            'form[cms-mutation^="ulvia.cms.localization:update-languages "] p[cms-condition*="savedLanguages.outcome.kind === \'success\'"]',
        )
        .waitFor();
}

export async function inspectDiagnostics(page: Page): Promise<void> {
    await adminPageLink(page, "diagnostics").click();
    await page.getByRole("heading", { name: "Diagnostics", exact: true }).waitFor();
    await page.locator("#migration-health").waitFor();
    await page.locator('a[href="#job-health"]').click();
    await page.waitForURL(/#job-health$/u);
    const jobs = page.locator('section[cms-query*="ulvia.cms.jobs:list"]');
    await jobs
        .locator('p[cms-condition*="jobs.data.items.length"]')
        .or(jobs.locator('article[role="listitem"]'))
        .first()
        .waitFor();
    await page.locator('a[href="#provider-health"]').click();
    await page.waitForURL(/#provider-health$/u);
    await page.locator("#provider-health article[role=listitem]").first().waitFor();
}

export async function verifyAdministrationAfterRestart(page: Page, credentials: { adminEmail: string }): Promise<void> {
    await adminPageLink(page, "settings").click();
    await expectAdminValue(page, "#settings-site-name", "Smoke CMS");
    await expectAdminValue(page, "#settings-default-language", "fr-FR");

    await adminPageLink(page, "providers").click();
    await page.locator("#provider-installations").waitFor();
    await page.locator('a[href="#contract-routing"]').click();
    await page.locator("#contract-routing").waitFor();

    await adminPageLink(page, "access").click();
    await page.getByText(credentials.adminEmail, { exact: true }).waitFor();
    await inspectDiagnostics(page);
}

async function expectAdminValue(page: Page, selector: string, expected: string): Promise<void> {
    const input = page.locator(selector);
    const deadline = Date.now() + 15_000;
    let actual = "";
    while (Date.now() < deadline) {
        actual = await input.inputValue().catch(() => "");
        if (actual === expected) {
            return;
        }
        await page.waitForTimeout(25);
    }
    throw new Error(`${selector} did not survive restart (expected ${expected}, received ${actual}).`);
}

async function waitUntilEnabled(page: Page, selector: string): Promise<void> {
    const button = page.locator(selector);
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
        if (await button.isEnabled().catch(() => false)) {
            return;
        }
        await page.waitForTimeout(100);
    }
    throw new Error(`${selector} did not become enabled.`);
}

async function waitForInputChange(page: Page, input: ReturnType<Page["locator"]>, initial: string): Promise<void> {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
        if ((await input.inputValue().catch(() => initial)) !== initial) {
            return;
        }
        await page.waitForTimeout(25);
    }
    throw new Error("The dependent settings revision did not refresh after mutation");
}

function adminPageLink(page: Page, pageId: string) {
    return page.locator(`a[href="/admin/${pageId}"]`).first();
}
