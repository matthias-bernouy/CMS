import { submitSiteUpgrade } from "../fixtures/operationCompletion";
import type { Page } from "playwright";

export async function exerciseCollectionUpgrades(page: Page): Promise<void> {
    for (const version of ["1.1.0", "2.0.0"]) {
        const card = collectionReleaseCard(page, `ulvia.test ${version}`);
        await card.locator('a[href^="/admin/collections/upgrade?"]').click();
        const apply = page.locator(
            'form[cms-mutation="ulvia.cms.installations:apply-collection-upgrade as mutation"] button[type="submit"]',
        );
        await apply.waitFor();
        await submitSiteUpgrade(page, apply, "apply-collection-upgrade");
        await page.waitForURL(/\/admin\/collections$/u);
        await page.reload({ waitUntil: "domcontentloaded" });
        await installedRelease(page, `ulvia.test ${version}`).waitFor({ timeout: 60_000 });
    }
}

function collectionReleaseCard(page: Page, identity: string) {
    return page.locator('[role="listitem"]').filter({ has: page.getByText(identity, { exact: true }) });
}

function installedRelease(page: Page, identity: string) {
    return collectionReleaseCard(page, identity).getByText(/^(Installed|Installée)$/u);
}
