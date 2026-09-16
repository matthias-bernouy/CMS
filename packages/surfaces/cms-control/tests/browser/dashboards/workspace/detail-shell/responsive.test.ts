import { expect, test } from "bun:test";
import { chromium } from "playwright";
import { mountShell } from "./fixture";

const markup = `<cms-shell-detail>
    <span slot="title">Shared resource</span>
    <p9r-button slot="actions" type="submit" form="save">Save</p9r-button>
    <form id="save" slot="body" cms-source="/save" cms-source-inherit-query="false" cms-source-trigger="submit" cms-source-success-reset="false">
        <cms-shell-detail-body tabbed>
            <p9r-stack slot="main"><p9r-input name="title" label="Title" required></p9r-input></p9r-stack>
            <p9r-stack slot="aside"><p9r-input name="code" label="Code" required></p9r-input></p9r-stack>
        </cms-shell-detail-body>
    </form>
</cms-shell-detail>`;

test("responsive detail tabs retain both form regions and reveal native validation errors", async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        page.setDefaultTimeout(5000);
        const writes: unknown[] = [];
        const errors = await mountShell(page, markup, async (route) => {
            writes.push(route.request().postDataJSON());
            await route.fulfill({ status: 204 });
        });
        const body = page.locator("cms-shell-detail-body");
        await body.locator("p9r-tabs[expanded]").waitFor();
        const title = page.locator('[name="title"] input');
        const code = page.locator('[name="code"] input');
        await title.fill("Retained title");
        await code.fill("Initial code");
        expect((await code.boundingBox())!.x).toBeGreaterThan((await title.boundingBox())!.x);
        const titleNode = await title.elementHandle();
        const codeNode = await code.elementHandle();
        await page.setViewportSize({ width: 700, height: 900 });
        const details = body.getByRole("tab", { name: "Details", exact: true });
        const settings = body.getByRole("tab", { name: "Settings", exact: true });
        await settings.waitFor();
        await settings.click();
        expect(await title.isVisible()).toBe(false);
        expect(await code.inputValue()).toBe("Initial code");
        await code.fill("");
        await details.click();
        await page.getByRole("button", { name: "Save", exact: true }).click();
        expect(await settings.getAttribute("aria-selected")).toBe("true");
        expect(await code.isVisible()).toBe(true);
        expect(writes).toEqual([]);
        await code.fill("Saved code");
        const saved = page.waitForResponse("**/save");
        await page.getByRole("button", { name: "Save", exact: true }).click();
        await saved;
        expect(writes).toEqual([{ title: "Retained title", code: "Saved code" }]);
        await details.click();
        await title.fill("");
        await settings.click();
        await page.getByRole("button", { name: "Save", exact: true }).click();
        expect(await details.getAttribute("aria-selected")).toBe("true");
        await title.fill("Retained title");
        await details.focus();
        await page.keyboard.press("ArrowRight");
        expect(await settings.getAttribute("aria-selected")).toBe("true");
        await page.keyboard.press("ArrowLeft");
        expect(await details.getAttribute("aria-selected")).toBe("true");
        await page.keyboard.press("ArrowRight");
        await page.setViewportSize({ width: 1440, height: 900 });
        await body.locator("p9r-tabs[expanded]").waitFor();
        expect(await title.isVisible()).toBe(true);
        expect(await code.isVisible()).toBe(true);
        await page.setViewportSize({ width: 390, height: 900 });
        await settings.waitFor();
        expect(await settings.getAttribute("aria-selected")).toBe("true");
        expect(await titleNode!.evaluate((node) => node.isConnected)).toBe(true);
        expect(await codeNode!.evaluate((node) => node.isConnected)).toBe(true);
        expect(await title.inputValue()).toBe("Retained title");
        expect(await code.inputValue()).toBe("Saved code");
        expect(await page.locator("form form").count()).toBe(0);
        expect(errors).toEqual([]);
    } finally {
        await browser.close();
    }
}, 20000);

test("a detail without aside content does not display an empty Settings tab", async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
        await mountShell(
            page,
            `<cms-shell-detail-body tabbed>
            <p9r-stack slot="main"><p9r-input name="title" value="Only content"></p9r-input></p9r-stack>
            <p9r-stack slot="aside"></p9r-stack>
        </cms-shell-detail-body>`,
        );
        await page.locator('[name="title"] input').waitFor();
        expect(await page.getByRole("tab").count()).toBe(0);
        expect(await page.locator("cms-shell-detail-body").getAttribute("has-aside")).toBeNull();
    } finally {
        await browser.close();
    }
});

test("a tabbed detail syncs an aside populated by its declarative source", async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
        let loadAside = () => {};
        const responseGate = new Promise<void>((resolve) => {
            loadAside = resolve;
        });
        await mountShell(
            page,
            `<div cms-source="/detail as detail">
                <cms-shell-detail-body tabbed>
                    <p9r-stack slot="main">Details</p9r-stack>
                    <p9r-stack slot="aside"><span cms-condition="detail.showAside">Dynamic settings</span></p9r-stack>
                </cms-shell-detail-body>
            </div>`,
            async (route, url) => {
                if (url.pathname === "/detail") {
                    await responseGate;
                    await route.fulfill({ json: { showAside: true } });
                    return;
                }
                await route.fulfill({ json: [] });
            },
        );
        const body = page.locator("cms-shell-detail-body");
        expect(await body.getByRole("tab").count()).toBe(0);

        loadAside();

        await body.getByRole("tab", { name: "Settings", exact: true }).waitFor();
        expect(await body.getAttribute("has-aside")).toBe("");
    } finally {
        await browser.close();
    }
});
