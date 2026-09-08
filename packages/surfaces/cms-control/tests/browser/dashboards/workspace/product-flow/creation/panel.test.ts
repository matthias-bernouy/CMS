import { expect, test } from "bun:test";
import { chromium, type Locator } from "playwright";
import { productFixture, detailUrl } from "../fixture";

async function geometry(panel: Locator) {
    return panel.evaluate((host) => {
        const dialog = host.shadowRoot!.querySelector("dialog")!;
        const detail = host.querySelector("cms-dashboard-w-detail")!;
        const shell = detail.shadowRoot!.querySelector("cms-shell-detail")!;
        const root = shell.shadowRoot!;
        const content = root.querySelector<HTMLElement>(".shell-detail-content")!;
        const header = root.querySelector(".shell-detail-header")!.getBoundingClientRect();
        const footer = root.querySelector(".shell-detail-footer")!.getBoundingClientRect();
        const rect = dialog.getBoundingClientRect();
        return {
            x: rect.x,
            right: rect.right,
            width: rect.width,
            height: rect.height,
            header: header.y,
            footer: footer.y,
            bottom: footer.bottom,
            scrollable: content.scrollHeight > content.clientHeight,
            overflow: content.scrollWidth > content.clientWidth,
            chrome: getComputedStyle(host.shadowRoot!.querySelector(".header")!).display,
        };
    });
}

for (const width of [1440, 390]) {
    test(`detail panel keeps its chrome fixed, contains focus and preserves the parent at ${width}px`, async () => {
        const browser = await chromium.launch();
        try {
            const page = await browser.newPage({ viewport: { width, height: 540 }, reducedMotion: "reduce" });
            page.setDefaultTimeout(6000);
            const state = await productFixture(page);
            await page.goto(detailUrl);
            const title = page.locator('[name="title"] input');
            await title.fill("Parent draft");
            const parent = await title.elementHandle();
            const opener = page.locator("[data-lookup-create]");
            await opener.click();
            const panel = page.locator("[data-detail-modal]");
            await panel.locator('[name="name"] input').fill("Unsaved brand");
            const parentY = (await title.boundingBox())!.y;
            await panel.locator('[name="description"] textarea').evaluate((field) => {
                field.style.height = "700px";
            });
            const original = await geometry(panel);
            expect(original).toMatchObject({
                right: width,
                width: width <= 640 ? width : Math.min(width * 0.96, 1080),
                height: 540,
                chrome: "none",
                overflow: false,
                scrollable: true,
            });
            expect(original.header).toBe(0);
            expect(original.bottom).toBe(540);
            if (width <= 640) {
                await panel.locator(".shell-detail-content").evaluate((content) => {
                    content.scrollTop = 400;
                });
                const tabsTop = (await panel.getByRole("tab", { name: "Settings", exact: true }).boundingBox())!.y;
                expect(tabsTop).toBeGreaterThanOrEqual(70);
                expect(tabsTop).toBeLessThan(110);
                await panel.getByRole("tab", { name: "Settings", exact: true }).click();
            }
            await panel.locator('[name="status"]').scrollIntoViewIfNeeded();
            const scrolled = await geometry(panel);
            expect(scrolled.header).toBe(original.header);
            expect(scrolled.footer).toBe(original.footer);
            await panel.getByRole("button", { name: "Cancel", exact: true }).focus();
            for (let i = 0; i < 12; i++) {
                await page.keyboard.press("Tab");
                // Native dialogs may yield focus to browser chrome, but never to the background page.
                expect(
                    await panel.evaluate(
                        (host) => document.activeElement === document.body || host.contains(document.activeElement),
                    ),
                ).toBe(true);
            }
            page.once("dialog", (dialog) => dialog.dismiss());
            await panel.getByRole("button", { name: "Close details", exact: true }).click();
            expect(await panel.getAttribute("open")).not.toBeNull();
            page.once("dialog", (dialog) => dialog.accept());
            await panel.getByRole("button", { name: "Cancel", exact: true }).click();
            await panel.waitFor({ state: "detached" });
            expect(await title.inputValue()).toBe("Parent draft");
            expect(await parent!.evaluate((node) => node.isConnected)).toBe(true);
            expect((await title.boundingBox())!.y).toBe(parentY);
            expect(await opener.evaluate((host) => host.shadowRoot!.activeElement?.localName)).toBe("button");
            await opener.click();
            await panel.locator('[name="name"] input').waitFor();
            await page.keyboard.press("Escape");
            await panel.waitFor({ state: "detached" });
            if (width > 680) {
                await opener.click();
                await panel.locator('[name="name"] input').waitFor();
                await page.mouse.click(100, 100);
                await panel.waitFor({ state: "detached" });
            }
            expect(state.brands).toEqual([]);
            expect(state.writes).toEqual([]);
            expect(state.errors).toEqual([]);
        } finally {
            await browser.close();
        }
    }, 15000);
}

test("a failed panel save retains its draft and fixed actions, then retries successfully", async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 540 }, reducedMotion: "reduce" });
        page.setDefaultTimeout(6000);
        const state = await productFixture(page);
        let writes = 0;
        await page.route("**/upsertBrand", async (route) => {
            if (++writes === 1) {
                return route.fulfill({ status: 409, json: { error: "Slug already used" } });
            }
            return route.fallback();
        });
        await page.goto(detailUrl);
        await page.locator("[data-lookup-create]").click();
        const panel = page.locator("[data-detail-modal]");
        await panel.locator('[name="name"] input').fill("Retry brand");
        await panel.locator('[name="slug"] input').fill("retry-brand");
        const before = await geometry(panel);
        const input = await panel.locator('[name="name"] input').elementHandle();
        await panel.getByRole("button", { name: "Save brand", exact: true }).click();
        await page.locator("p9r-toast").filter({ hasText: "Slug already used" }).waitFor();
        expect(await panel.locator('[data-detail-save] p9r-alert[role="alert"]').count()).toBe(0);
        expect((await geometry(panel)).footer).toBe(before.footer);
        expect(await input!.evaluate((node) => node.isConnected)).toBe(true);
        expect(await panel.locator('[name="name"] input').inputValue()).toBe("Retry brand");
        await panel.getByRole("button", { name: "Save brand", exact: true }).click();
        await panel.waitFor({ state: "detached" });
        expect(state.brands).toHaveLength(1);
        expect(state.errors).toEqual([]);
    } finally {
        await browser.close();
    }
}, 15000);
