import type { Page } from "playwright";

export async function exerciseCollectionUpgrades(page: Page): Promise<void> {
    const compatible = collectionReleaseCard(page, "ulvia.test 1.1.0");
    const [upgradeResponse] = await Promise.all([
        page.waitForResponse((candidate) => candidate.url().includes("ulvia.cms.installations/upgrade-collection")),
        compatible.getByRole("button", { name: /^(Try compatible upgrade|Essayer l’upgrade compatible)$/u }).click(),
    ]);
    if (!upgradeResponse.ok()) {
        throw new Error(`Compatible collection upgrade failed (${upgradeResponse.status()}).`);
    }
    await installedRelease(page, "ulvia.test 1.1.0").waitFor();

    const migration = collectionReleaseCard(page, "ulvia.test 2.0.0");
    await migration.getByRole("link", { name: /^(Plan migration|Planifier la migration)$/u }).click();
    await page.getByRole("heading", { name: /^(Migration preview|Aperçu de la migration)$/u }).waitFor();
    const [migrationResponse] = await Promise.all([
        page.waitForResponse((candidate) =>
            candidate.url().includes("ulvia.cms.installations/apply-collection-migration"),
        ),
        page.getByRole("button", { name: /^(Apply migration|Appliquer la migration)$/u }).click(),
    ]);
    if (!migrationResponse.ok()) {
        throw new Error(`Collection migration failed (${migrationResponse.status()}).`);
    }
    await page.waitForURL(/\/admin\/collections$/u);
    await page.locator('a[href="/admin/diagnostics"]').first().click();
    await waitForMaintenanceCompletion(page);
    await page.locator('a[href="/admin/collections"]').first().click();
    await installedRelease(page, "ulvia.test 2.0.0").waitFor({ timeout: 60_000 });
}

async function waitForMaintenanceCompletion(page: Page): Promise<void> {
    const completed = '#migration-health strong[cms-condition="migrations.data.maintenance === false"]';
    const loading = "#migration-health p[cms-condition=\"migrations.activity === 'fetching'\"]";
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
    const migration = await page
        .locator("#migration-health")
        .innerText()
        .catch(() => "unavailable");
    const operations = await page
        .locator("#collection-operation-health")
        .innerText()
        .catch(() => "unavailable");
    throw new Error(
        `Collection migration did not leave maintenance mode.\nMigration: ${migration}\nOperations: ${operations}`,
    );
}

function collectionReleaseCard(page: Page, identity: string) {
    return page.locator('[role="listitem"]').filter({ has: page.getByText(identity, { exact: true }) });
}

function installedRelease(page: Page, identity: string) {
    return collectionReleaseCard(page, identity).getByText(/^(Installed|Installée)$/u);
}
