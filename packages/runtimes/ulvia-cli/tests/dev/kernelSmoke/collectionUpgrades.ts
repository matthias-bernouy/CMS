import type { Page } from "playwright";

export async function exerciseCollectionUpgrades(page: Page): Promise<void> {
    await page.locator('a[href="#repository-releases"]').click();
    const compatible = collectionReleaseCard(page, "ulvia.test 1.1.0");
    const [upgradeResponse] = await Promise.all([
        page.waitForResponse((candidate) => candidate.url().includes("ulvia.cms.collections/upgrade")),
        compatible.getByRole("button", { name: /^(Try compatible upgrade|Essayer l’upgrade compatible)$/u }).click(),
    ]);
    if (!upgradeResponse.ok()) {
        throw new Error(`Compatible collection upgrade failed (${upgradeResponse.status()}).`);
    }
    await page.locator('a[href="#installed-collections"]').click();
    await page.getByText("ulvia.test 1.1.0", { exact: true }).waitFor();

    await page.locator('a[href="#repository-releases"]').click();
    const migration = collectionReleaseCard(page, "ulvia.test 2.0.0");
    await migration.getByRole("link", { name: /^(Plan migration|Planifier la migration)$/u }).click();
    await page.getByRole("heading", { name: /^(Migration preview|Aperçu de la migration)$/u }).waitFor();
    const [migrationResponse] = await Promise.all([
        page.waitForResponse((candidate) => candidate.url().includes("ulvia.cms.collections/apply-migration")),
        page.getByRole("button", { name: /^(Apply migration|Appliquer la migration)$/u }).click(),
    ]);
    if (!migrationResponse.ok()) {
        throw new Error(`Collection migration failed (${migrationResponse.status()}).`);
    }
    await page.waitForURL(/\/admin\/collections$/u);
    await page.locator('a[href="#migration-status"]').click();
    await page
        .locator(
            'section[cms-query^="ulvia.cms.collections:migration-status "] p[cms-condition="migrations.data.maintenance === false"]',
        )
        .waitFor({ timeout: 60_000 });
    await page.locator('a[href="#installed-collections"]').waitFor({ timeout: 15_000 });
    await page.locator('a[href="#installed-collections"]').click();
    await page.locator("#installed-collections").getByText("ulvia.test 2.0.0", { exact: true }).waitFor();
}

function collectionReleaseCard(page: Page, identity: string) {
    return page.locator('[role="listitem"]').filter({ has: page.getByText(identity, { exact: true }) });
}
