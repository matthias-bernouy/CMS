import { expect, test } from "bun:test";
import { chromium } from "playwright";
import { resolve } from "node:path";
import { healthPage, installHealthRoutes } from "./fixture";

test("action completion supersedes an older Health refresh", async () => {
    const browser = await chromium.launch();
    let releaseAction: (() => void) | undefined;
    let releaseRead: (() => void) | undefined;
    try {
        const page = await browser.newPage();
        page.setDefaultTimeout(5000);
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const fixture = await installHealthRoutes(
            page,
            await Bun.file(
                resolve(import.meta.dir, "../../../../../../src/static/assets/control-components.js"),
            ).text(),
            await Bun.file(
                resolve(import.meta.dir, "../../../../../../../../foundation/components/dist/style.css"),
            ).text(),
        );
        await page.goto(healthPage);
        const repair = page
            .locator("[data-health-content]")
            .getByRole("button", { name: "Repair connection", exact: true });
        await repair.waitFor();
        releaseAction = fixture.holdAction();
        await repair.click();
        await page.locator("p9r-modal[open]").getByRole("button", { name: "Repair connection", exact: true }).click();
        releaseRead = fixture.holdRead();
        const olderRead = page.waitForRequest((request) => request.url().includes("/management/health"));
        await page
            .getByRole("button", { name: "Refresh health", exact: true })
            .evaluate((node) => (node as HTMLElement).click());
        await olderRead;
        const freshRead = page.waitForRequest((request) => request.url().includes("/management/health"));
        releaseAction();
        await freshRead;
        expect(fixture.actions).toEqual(["repair"]);
        expect(fixture.health!.report!.configuration.appliedRevision).toBe("v2");
        releaseRead();
        await page.getByText("The saved configuration is applied.", { exact: true }).waitFor();
        expect(fixture.reads).toHaveLength(3);
        expect(await page.getByText("Saved changes were waiting to be applied at the last observation.").count()).toBe(
            0,
        );
        expect(errors).toEqual([]);
    } finally {
        releaseAction?.();
        releaseRead?.();
        await browser.close();
    }
}, 20000);
