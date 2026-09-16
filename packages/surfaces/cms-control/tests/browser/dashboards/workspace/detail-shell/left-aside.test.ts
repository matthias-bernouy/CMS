import { expect, test } from "bun:test";
import { chromium } from "playwright";
import { mountShell } from "./fixture";

test("left navigation stays independent while compact form regions become tabs", async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        page.setDefaultTimeout(5000);
        const writes: unknown[] = [];
        const errors = await mountShell(
            page,
            `<cms-shell-detail contained>
                <span slot="title">Collection resource</span>
                <p9r-button slot="actions" type="submit" form="save">Save</p9r-button>
                <form id="save" slot="body" cms-source="/save" cms-source-inherit-query="false" cms-source-trigger="submit" cms-source-success-reset="false">
                    <cms-shell-detail-body tabbed main-label="Content">
                        <p9r-stack slot="left-aside"><p9r-input name="section" label="Section" required value="Theme"></p9r-input></p9r-stack>
                        <p9r-stack slot="main"><p9r-input name="title" label="Title" required value="Ulvia"></p9r-input></p9r-stack>
                        <p9r-stack slot="aside"><p9r-input name="code" label="Code" required value="primary"></p9r-input></p9r-stack>
                    </cms-shell-detail-body>
                </form>
            </cms-shell-detail>`,
            async (route) => {
                writes.push(route.request().postDataJSON());
                await route.fulfill({ status: 204 });
            },
        );
        const body = page.locator("cms-shell-detail-body");
        const section = page.locator('[name="section"] input');
        const title = page.locator('[name="title"] input');
        const code = page.locator('[name="code"] input');
        const sectionNode = await section.elementHandle();
        const titleNode = await title.elementHandle();
        const codeNode = await code.elementHandle();
        const widePositions = await Promise.all(
            [section, title, code].map(async (control) => (await control.boundingBox())!.x),
        );
        expect(widePositions[0]).toBeLessThan(widePositions[1]!);
        expect(widePositions[1]).toBeLessThan(widePositions[2]!);

        await page.setViewportSize({ width: 900, height: 900 });
        const content = body.getByRole("tab", { name: "Content", exact: true });
        const settings = body.getByRole("tab", { name: "Settings", exact: true });
        await content.waitFor();
        expect(await body.getByRole("tab", { name: "Sections", exact: true }).count()).toBe(0);
        expect(await content.getAttribute("aria-selected")).toBe("true");
        expect(await section.isVisible()).toBe(true);
        const compactPositions = await Promise.all(
            [section, title].map(async (control) => (await control.boundingBox())!.x),
        );
        expect(compactPositions[0]).toBeLessThan(compactPositions[1]!);
        await section.fill("");
        await page.getByRole("button", { name: "Save", exact: true }).click();
        expect(await section.isVisible()).toBe(true);
        expect(writes).toEqual([]);

        await section.fill("Theme");
        await settings.click();
        await code.fill("");
        await content.click();
        await page.getByRole("button", { name: "Save", exact: true }).click();
        expect(await settings.getAttribute("aria-selected")).toBe("true");
        await code.fill("primary");
        const saved = page.waitForResponse("**/save");
        await page.getByRole("button", { name: "Save", exact: true }).click();
        await saved;
        expect(writes).toEqual([{ section: "Theme", title: "Ulvia", code: "primary" }]);

        await page.setViewportSize({ width: 1440, height: 900 });
        await body.locator("p9r-tabs[expanded]").waitFor();
        expect(await section.isVisible()).toBe(true);
        expect(await title.isVisible()).toBe(true);
        expect(await code.isVisible()).toBe(true);
        expect(await sectionNode!.evaluate((node) => node.isConnected)).toBe(true);
        expect(await titleNode!.evaluate((node) => node.isConnected)).toBe(true);
        expect(await codeNode!.evaluate((node) => node.isConnected)).toBe(true);
        expect(errors).toEqual([]);
    } finally {
        await browser.close();
    }
}, 20000);

test("empty optional regions are omitted from compact tabs", async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
        await mountShell(
            page,
            `<cms-shell-detail-body tabbed>
                <p9r-stack slot="left-aside"><p9r-input name="section" value="Theme"></p9r-input></p9r-stack>
                <p9r-stack slot="main"><p9r-input name="title" value="Ulvia"></p9r-input></p9r-stack>
                <p9r-stack slot="aside"></p9r-stack>
            </cms-shell-detail-body>`,
        );
        const body = page.locator("cms-shell-detail-body");
        await page.locator('[name="section"] input').waitFor();
        expect(await body.getByRole("tab").count()).toBe(0);
        expect(await body.getAttribute("has-left-aside")).toBe("");
        expect(await body.getAttribute("has-aside")).toBeNull();
        expect(await page.locator('[name="section"] input').isVisible()).toBe(true);
        expect(await page.locator('[name="title"] input').isVisible()).toBe(true);

        await body.evaluate((element) => element.querySelector('[slot="left-aside"]')?.remove());
        await expect(body.getByRole("tab").count()).resolves.toBe(0);
        expect(await body.getAttribute("has-left-aside")).toBeNull();
        expect(await page.locator('[name="title"] input').isVisible()).toBe(true);
    } finally {
        await browser.close();
    }
});
