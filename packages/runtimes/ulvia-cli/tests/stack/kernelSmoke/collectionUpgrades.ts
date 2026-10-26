import type { Page } from "playwright";

export async function exerciseCollectionUpgrades(page: Page): Promise<void> {
    for (const version of ["1.1.0", "2.0.0"]) {
        const card = collectionReleaseCard(page, `ulvia.test ${version}`);
        await card.locator('a[href^="/admin/collections/upgrade?"]').click();
        const apply = page.locator(
            'form[cms-mutation="ulvia.cms.installations:apply-collection-upgrade as mutation"] button[type="submit"]',
        );
        await apply.waitFor();
        const [response] = await Promise.all([
            page.waitForResponse((candidate) =>
                candidate.url().includes("ulvia.cms.installations/apply-collection-upgrade"),
            ),
            apply.click(),
        ]);
        if (!response.ok()) {
            throw new Error(`Collection upgrade failed (${response.status()}): ${await response.text()}`);
        }
        await page.waitForURL(/\/admin\/collections$/u);
        await page.locator('a[href="/admin/diagnostics"]').first().click();
        await waitForMaintenanceCompletion(page);
        await page.locator('a[href="/admin/collections"]').first().click();
        await installedRelease(page, `ulvia.test ${version}`).waitFor({ timeout: 60_000 });
    }
}

async function waitForMaintenanceCompletion(page: Page): Promise<void> {
    const completed = '#upgrade-health strong[cms-condition="upgrades.data.maintenance === false"]';
    const loading = "#upgrade-health p[cms-condition=\"upgrades.activity === 'fetching'\"]";
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
        await page.locator(loading).waitFor({ state: "hidden", timeout: 10_000 });
        if (
            await page
                .locator(completed)
                .isVisible()
                .catch(() => false)
        ) {
            return;
        }
        await page.waitForTimeout(500);
        await page.reload({ waitUntil: "domcontentloaded" });
    }
    const upgrade = await page
        .locator("#upgrade-health")
        .innerText()
        .catch(() => "unavailable");
    const operations = await page
        .locator("#collection-operation-health")
        .innerText()
        .catch(() => "unavailable");
    throw new Error(
        `Collection upgrade did not leave maintenance mode.\nUpgrade: ${upgrade}\nOperations: ${operations}`,
    );
}

function collectionReleaseCard(page: Page, identity: string) {
    return page.locator('[role="listitem"]').filter({ has: page.getByText(identity, { exact: true }) });
}

function installedRelease(page: Page, identity: string) {
    return collectionReleaseCard(page, identity).getByText(/^(Installed|Installée)$/u);
}
