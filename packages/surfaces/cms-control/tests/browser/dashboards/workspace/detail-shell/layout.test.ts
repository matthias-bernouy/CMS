import { expect, test } from "bun:test";
import { chromium } from "playwright";
import { mountShell } from "./fixture";

test("detail bodies preserve columns, responsive stacking and the form's light DOM", async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        const errors = await mountShell(
            page,
            `<cms-shell-detail>
                <span slot="title">Product</span>
                <span slot="description">Inventory and pricing</span>
                <p9r-button slot="actions" type="submit" form="save">Save</p9r-button>
                <form id="save" slot="body">
                    <cms-shell-detail-body>
                        <cms-detail-section slot="main" heading="Details">
                            <p9r-input name="title" label="Title" value="Racket"></p9r-input>
                        </cms-detail-section>
                        <cms-detail-section slot="aside" heading="State">
                            <p9r-input name="status" label="Status" value="draft"></p9r-input>
                        </cms-detail-section>
                    </cms-shell-detail-body>
                </form>
            </cms-shell-detail>`,
        );
        expect(
            await page.locator("cms-shell-detail").evaluate((shell) => ({
                heading: shell.querySelector('[slot="title"]')!.textContent?.trim(),
                description: shell.querySelector('[slot="description"]')!.textContent?.trim(),
                descriptionInsideHeading: Boolean(shell.shadowRoot!.querySelector("h3 slot[name='description']")),
            })),
        ).toEqual({
            heading: "Product",
            description: "Inventory and pricing",
            descriptionInsideHeading: false,
        });
        for (const width of [1440, 900, 880, 390]) {
            await page.setViewportSize({ width, height: 900 });
            const geometry = await page.evaluate(() => {
                const body = document.querySelector("cms-shell-detail-body")!;
                const main = body.querySelector('[slot="main"]')!.getBoundingClientRect();
                const aside = body.querySelector('[slot="aside"]')!.getBoundingClientRect();
                const form = document.querySelector("form")!;
                const values: Record<string, FormDataEntryValue> = {};
                new FormData(form).forEach((value, name) => {
                    values[name] = value;
                });
                return {
                    main: { x: main.x, y: main.y, width: main.width, bottom: main.bottom },
                    aside: { x: aside.x, y: aside.y, width: aside.width },
                    values,
                    sameRoot: body.getRootNode() === form.getRootNode(),
                    overflow: document.documentElement.scrollWidth > innerWidth,
                };
            });
            expect(geometry.sameRoot).toBe(true);
            expect(geometry.values).toEqual({ title: "Racket", status: "draft" });
            expect(geometry.overflow).toBe(false);
            if (width > 880) {
                expect(geometry.main.y).toBe(geometry.aside.y);
                expect(geometry.aside.x - geometry.main.x - geometry.main.width).toBeCloseTo(16, 1);
                if (width === 1440) {
                    expect(geometry.main.width).toBe(600);
                    expect(geometry.aside.width).toBe(285);
                }
            } else {
                expect(geometry.aside.y - geometry.main.bottom).toBeCloseTo(16, 1);
                expect(geometry.aside.width).toBe(geometry.main.width);
            }
        }
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.evaluate(() => {
            const shell = document.querySelector("cms-shell-detail") as HTMLElement;
            shell.style.setProperty("--w-detail-main-width", "940px");
            shell.style.setProperty("--w-detail-aside-width", "0px");
            shell.style.setProperty("--w-detail-gap", "0px");
            shell.querySelector('[slot="aside"]')!.remove();
        });
        expect((await page.locator('cms-detail-section[slot="main"]').boundingBox())?.width).toBe(940);
        expect(errors).toEqual([]);
    } finally {
        await browser.close();
    }
});

test("a detail body gives left navigation its own responsive column", async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        const errors = await mountShell(
            page,
            `<cms-shell-detail contained>
                <form slot="body">
                    <cms-shell-detail-body>
                        <w13c-lateral-menu slot="left-aside" variant="embedded" aria-label="Theme groups">
                            <span slot="header">Theme groups</span>
                            <w13c-lateral-menu-item href="#brand" match="hash">Brand</w13c-lateral-menu-item>
                            <w13c-lateral-menu-item href="#feedback" match="hash">Feedback</w13c-lateral-menu-item>
                        </w13c-lateral-menu>
                        <cms-detail-section slot="main" heading="Details">Ulvia</cms-detail-section>
                        <cms-detail-section slot="aside" heading="Preview">Example</cms-detail-section>
                    </cms-shell-detail-body>
                </form>
            </cms-shell-detail>`,
        );
        const geometry = async () =>
            await page.evaluate(() => {
                const region = (slot: string) =>
                    document
                        .querySelector<HTMLElement>(`cms-shell-detail-body > [slot="${slot}"]`)!
                        .getBoundingClientRect();
                const left = region("left-aside");
                const main = region("main");
                const aside = region("aside");
                return {
                    left: { x: left.x, y: left.y, width: left.width, bottom: left.bottom },
                    main: { x: main.x, y: main.y, width: main.width, bottom: main.bottom },
                    aside: { x: aside.x, y: aside.y, width: aside.width },
                    overflow: document.documentElement.scrollWidth > innerWidth,
                };
            });

        const wide = await geometry();
        expect(wide.left.width).toBe(250);
        expect(wide.main.width).toBeGreaterThan(600);
        expect(wide.aside.width).toBe(285);
        expect(wide.main.x - wide.left.x - wide.left.width).toBeCloseTo(16, 1);
        expect(wide.aside.x - wide.main.x - wide.main.width).toBeCloseTo(16, 1);
        expect(wide.overflow).toBe(false);
        expect((await page.locator('w13c-lateral-menu[variant="embedded"]').boundingBox())!.height).toBeLessThan(200);

        await page.getByRole("link", { name: "Feedback", exact: true }).click();
        expect(await page.locator("w13c-lateral-menu-item[active]").allTextContents()).toEqual(["Feedback"]);

        await page.setViewportSize({ width: 1000, height: 900 });
        const medium = await geometry();
        expect(medium.main.y - medium.left.bottom).toBeCloseTo(16, 1);
        expect(medium.aside.y).toBe(medium.main.y);
        expect(medium.aside.x - medium.main.x - medium.main.width).toBeCloseTo(16, 1);
        expect(medium.left.width).toBeGreaterThanOrEqual(medium.main.width + 16 + medium.aside.width);
        expect(medium.overflow).toBe(false);

        await page.setViewportSize({ width: 700, height: 900 });
        const compact = await geometry();
        expect(compact.main.y - compact.left.bottom).toBeCloseTo(16, 1);
        expect(compact.aside.y - compact.main.bottom).toBeCloseTo(16, 1);
        expect(compact.left.width).toBe(compact.main.width);
        expect(compact.main.width).toBe(compact.aside.width);
        expect(compact.overflow).toBe(false);
        const embeddedMenu = page.locator('w13c-lateral-menu[variant="embedded"]');
        const embeddedToggle = embeddedMenu.getByRole("button", { name: "Theme groups", exact: true });
        await embeddedToggle.waitFor();
        expect(await embeddedToggle.getAttribute("aria-expanded")).toBe("false");
        expect(await embeddedMenu.getByRole("link", { name: "Brand", exact: true }).isVisible()).toBe(false);
        await embeddedToggle.click();
        await page.keyboard.press("Escape");
        expect(await embeddedToggle.getAttribute("aria-expanded")).toBe("false");
        await embeddedToggle.click();
        await embeddedMenu.getByRole("link", { name: "Brand", exact: true }).click();
        expect(await embeddedToggle.getAttribute("aria-expanded")).toBe("false");
        expect(await page.locator("w13c-lateral-menu-item[active]").allTextContents()).toEqual(["Brand"]);
        expect(errors).toEqual([]);
    } finally {
        await browser.close();
    }
});
