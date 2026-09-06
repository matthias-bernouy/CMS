import { expect, test } from "bun:test";
import { fixture } from "./fixture";

test("collection errors can be retried and empty search preserves navigation", async () => {
    const f = await fixture();
    try {
        f.failures.set("/api/bloc/library", "Repository unavailable");
        await f.goto();
        await f.page.locator("p9r-alert").filter({ hasText: "HTTP 503" }).waitFor();
        await f.page.getByRole("button", { name: "Try again" }).click();
        await f.page.getByRole("heading", { name: "Explore collections", exact: true }).waitFor();
        await f.page.locator('p9r-input[cms-param-sync="search"] input').fill("does-not-exist");
        await f.page.getByText("No matching collections", { exact: true }).waitFor();
        expect(
            await f.page
                .locator('[aria-label="Bloc collections"]')
                .getByRole("link", { name: /gallery/ })
                .count(),
        ).toBe(1);
        expect(f.errors).toEqual([]);
    } finally {
        await f.browser.close();
    }
}, 30000);

test("autosaved choices retain separate read-only previews", async () => {
    const f = await fixture();
    try {
        await f.goto("?collection=managed:gallery");
        const choice = f.page.locator('cms-bloc-choice[resource="gallery/blocs/card"] w13c-switch');
        await choice.click();
        await f.page.locator("p9r-toast").filter({ hasText: "Availability saved." }).waitFor();
        expect(await choice.evaluate((element) => (element as HTMLElement & { checked: boolean }).checked)).toBe(false);
        expect(f.writes).toHaveLength(1);
        await f.page.getByRole("button", { name: "Preview", exact: true }).first().click();
        const modal = f.page.locator("[data-preview-modal]");
        await modal.frameLocator("iframe").getByText("Read-only preview").waitFor();
        expect(await modal.locator("iframe").getAttribute("sandbox")).toBe("allow-scripts");
        await modal.getByRole("button", { name: "Close", exact: true }).press("Enter");
        await modal.getByRole("dialog").waitFor({ state: "hidden" });
        expect(f.errors).toEqual([]);
    } finally {
        await f.browser.close();
    }
}, 30000);

test("version checks show no-update and failed-update states without losing the installed version", async () => {
    const f = await fixture();
    try {
        await f.goto("?collection=managed:gallery");
        await f.page.getByRole("button", { name: "Check for updates" }).click();
        f.failures.set("/api/integrations/installations/upgrade", "Update temporarily unavailable");
        await f.page.getByRole("button", { name: "Update collection", exact: true }).click();
        await f.page.locator("p9r-alert").filter({ hasText: "Update temporarily unavailable" }).waitFor();
        expect((await f.integrationInstallations.get("gallery"))?.definitionVersion).toBe("1.2.3");
        await f.page.locator("#collection-updates-modal").getByRole("button", { name: "Close", exact: true }).click();
        f.state.versions = [];
        await f.page.getByRole("button", { name: "Check for updates" }).click();
        await f.page
            .getByText("Your collection is up to date. No newer compatible version is available.", { exact: true })
            .waitFor();
        expect(f.errors).toEqual([]);
    } finally {
        await f.browser.close();
    }
}, 30000);

test("bound artwork loads after interpolation and missing files have a visual fallback", async () => {
    const f = await fixture();
    try {
        const requests: string[] = [];
        f.page.on("request", (request) => {
            if (request.resourceType() === "image") {
                requests.push(request.url());
            }
        });
        await f.goto("?collection=managed:gallery");
        await f.page.waitForFunction(() =>
            Array.from(document.querySelectorAll<HTMLImageElement>('img[slot="image"]')).some(
                (image) => image.naturalWidth > 0,
            ),
        );
        expect(requests.length).toBeGreaterThan(0);
        expect(requests.every((url) => !decodeURIComponent(url).includes("{{"))).toBe(true);
        f.state.brokenImages = true;
        await f.page.reload({ waitUntil: "domcontentloaded" });
        await f.page.locator("cms-library-artwork img[data-artwork-failed]").first().waitFor({ state: "attached" });
        expect(await f.page.locator("cms-library-artwork .illustration").first().isVisible()).toBe(true);
        expect(await f.page.getByRole("button", { name: "Preview", exact: true }).count()).toBe(2);
        expect(f.errors).toEqual([]);
    } finally {
        await f.browser.close();
    }
}, 30000);
