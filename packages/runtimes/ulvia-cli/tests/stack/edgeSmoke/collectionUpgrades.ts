import { submitSiteUpgrade } from "../fixtures/operationCompletion";
import type { Page } from "playwright";

export async function exerciseCollectionUpgrades(page: Page): Promise<void> {
    for (const version of ["1.1.0", "2.0.0"]) {
        console.info(`[edge-smoke] collection upgrade ${version}: plan`);
        await openHistory(page);
        const card = historyRow(page, version);
        await card.locator('a[href^="/admin/collections/upgrade?"]').click();
        const apply = page.locator(
            'form[cms-mutation="ulvia/cms.installations:apply-collection-upgrade as mutation"] button[type="submit"]',
        );
        await apply.waitFor();
        console.info(`[edge-smoke] collection upgrade ${version}: submit`);
        await submitSiteUpgrade(page, apply, "apply-collection-upgrade");
        console.info(`[edge-smoke] collection upgrade ${version}: redirect`);
        await page.waitForURL(/\/admin\/collections$/u, { waitUntil: "domcontentloaded" }).catch(async (error) => {
            const state = await Promise.race([
                page
                    .evaluate(() => ({
                        path: location.pathname,
                        readyState: document.readyState,
                        forms: Array.from(document.querySelectorAll("form[cms-mutation]")).map((form) => ({
                            mutation: form.getAttribute("cms-mutation"),
                            redirect: form.getAttribute("cms-mutation-redirect"),
                            connected: form.isConnected,
                        })),
                    }))
                    .catch(() => null),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000)),
            ]);
            throw new Error(
                `${String(error)}; upgrade redirect state: ${JSON.stringify(state)}; current path: ${new URL(page.url()).pathname}`,
            );
        });
        await page.reload({ waitUntil: "domcontentloaded" });
        await openHistory(page);
        await historyRow(page, version)
            .getByRole("link", { name: /^(Manage|Gérer)$/u })
            .waitFor({ timeout: 60_000 });
        await page
            .getByRole("link", { name: /^(Back to collections|Retour aux Collections|Retour aux collections)$/u })
            .click();
        console.info(`[edge-smoke] collection upgrade ${version}: done`);
    }
}

async function openHistory(page: Page) {
    const card = page
        .locator('[role="listitem"]')
        .filter({ has: page.getByRole("heading", { name: "Smoke Kit", exact: true }) });
    await card.getByRole("link", { name: /^(Release history|Historique des versions)$/u }).click();
    await page.locator("tbody tr").first().waitFor();
}

function historyRow(page: Page, version: string) {
    return page.locator("tbody tr").filter({ has: page.getByText(version, { exact: true }) });
}
