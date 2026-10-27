import { expect } from "bun:test";
import type { Page } from "playwright";

export async function inspectObservability(page: Page, origin: string): Promise<void> {
    await page.goto(`${origin}/admin/observability`);
    await page.getByRole("heading", { name: /^(Observability|Observabilité)$/u, exact: true }).waitFor();
    const entries = page.locator('a[href^="/admin/observability/detail?"]');
    await entries.first().waitFor({ timeout: 30_000 });
    const summaries = await page.request.fetch(`${origin}/.cms/query/ulvia.cms.observability/logs.query`, {
        method: "QUERY",
        data: { service: "cms-kernel", limit: 10 },
    });
    expect(summaries.ok()).toBe(true);
    const logs = await summaries.json();
    expect(logs.items.length).toBeGreaterThan(0);
    expect(logs.items.every((entry: { service: string }) => entry.service === "cms-kernel")).toBe(true);
    expect(logs.items[0]).not.toHaveProperty("attributes");
    await page.locator("#log-service").fill("cms-kernel");
    await page.getByRole("link", { name: /^(Search logs|Rechercher)$/u, exact: true }).click();
    await entries.first().waitFor();
    await entries.first().click();
    await page.getByRole("heading", { name: /^(Log details|Détail du journal)$/u, exact: true }).waitFor();
    await page
        .locator("h3")
        .filter({ hasText: /^(Attributes|Attributs)$/u })
        .waitFor();
    const forbidden = await page.request.post(`${origin}/.cms/mutation/ulvia.cms.observability/logs.append`, {
        data: {
            entries: [
                {
                    id: crypto.randomUUID(),
                    time: new Date().toISOString(),
                    level: "error",
                    event: "forged.entry",
                    attributes: {},
                },
            ],
        },
    });
    expect(forbidden.status()).toBe(403);
}
