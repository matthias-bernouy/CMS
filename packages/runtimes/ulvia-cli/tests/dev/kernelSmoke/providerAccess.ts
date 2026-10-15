import type { Page } from "playwright";

export async function mutateProviders(page: Page): Promise<void> {
    await adminPageLink(page, "providers").click();
    await page.locator("#provider-installations").waitFor();
    await page.locator('a[href="#contract-routing"]').click();
    await page.waitForURL(/#contract-routing$/u);
    await page.locator("#contract-routing").waitFor();
    const [response] = await Promise.all([
        page.waitForResponse((candidate) => candidate.url().includes("ulvia.cms.providers/replace-selections")),
        page.locator('form[cms-mutation^="ulvia.cms.providers:replace-selections "] button[type="submit"]').click(),
    ]);
    if (!response.ok()) {
        throw new Error(`Contract routing flow failed (${response.status()}).`);
    }
    await page.locator('a[href="#provider-installations"]').click();
    await page.waitForURL(/#provider-installations$/u);
    const installation = page.locator("#provider-installations [role=listitem]").first();
    for (const action of ["disable", "revoke"]) {
        const button = installation
            .locator('form[cms-mutation^="ulvia.cms.providers:set-status "]')
            .filter({ has: page.locator(`input[name="action"][value="${action}"]`) })
            .locator('button[type="submit"]');
        if (await button.isEnabled()) {
            throw new Error(`Selected provider installation unexpectedly allowed ${action}`);
        }
    }
}

export async function mutateAccess(page: Page, adminEmail: string): Promise<void> {
    await adminPageLink(page, "access").click();
    await page.locator('a[href="#access-login-providers"]').click();
    await page.waitForURL(/#access-login-providers$/u);
    const providerForm = page.locator('form[cms-mutation^="ulvia.cms.access:update-login-provider "]').first();
    await providerForm.getByText("Email & password").waitFor();
    await providerForm.locator('select[name="enabled"]').selectOption("true");
    const [response] = await Promise.all([
        page.waitForResponse((candidate) => candidate.url().includes("ulvia.cms.access/update-login-provider")),
        providerForm.locator('button[type="submit"]').click(),
    ]);
    if (!response.ok()) {
        throw new Error(`Login provider flow failed (${response.status()}).`);
    }
    await page.locator('a[href="#access-members"]').click();
    await page.waitForURL(/#access-members$/u);
    const administrator = page.locator('#access-members [role="listitem"]').filter({ hasText: adminEmail });
    const removeAdministrator = administrator
        .locator('form[cms-mutation^="ulvia.cms.access:set-administrator "]')
        .filter({ has: page.locator('input[name="enabled"][value="false"]') });
    await expectMutationError(page, removeAdministrator, "set-administrator", ["CANNOT_REMOVE_SELF"]);
    await expectMutationError(
        page,
        administrator.locator('form[cms-mutation^="ulvia.cms.access:delete-user "]'),
        "delete-user",
        ["CANNOT_REMOVE_SELF", "PROTECTED_USER"],
    );
}

async function expectMutationError(
    page: Page,
    form: ReturnType<Page["locator"]>,
    capability: string,
    expectedCodes: string[],
): Promise<void> {
    const [response] = await Promise.all([
        page.waitForResponse((candidate) => candidate.url().includes(`ulvia.cms.access/${capability}`)),
        form.locator('button[type="submit"]').click(),
    ]);
    if (response.ok()) {
        throw new Error(`${capability} unexpectedly succeeded for the current administrator`);
    }
    const body = (await response.json()) as { error?: { code?: string } };
    if (!body.error?.code || !expectedCodes.includes(body.error.code)) {
        throw new Error(`${capability} returned an unexpected error: ${JSON.stringify(body)}`);
    }
}

function adminPageLink(page: Page, pageId: string) {
    return page.locator(`a[href="/admin/${pageId}"]`).first();
}
