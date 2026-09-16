import { expect, test } from "bun:test";
import { chromium } from "playwright";
import { mountShell } from "./fixture";

test("detail shells share the container size scale including full width", async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        const errors = await mountShell(
            page,
            `<cms-shell-detail size="sm">
                <cms-shell-detail-body slot="body">
                    <cms-detail-section slot="main" heading="Details">Content</cms-detail-section>
                </cms-shell-detail-body>
            </cms-shell-detail>`,
        );
        const shell = page.locator("cms-shell-detail");
        const content = shell.locator(".shell-detail");
        expect(
            await page
                .locator("cms-shell-detail-body")
                .evaluate((body) =>
                    Array.from(body.shadowRoot!.querySelectorAll("p9r-tab-panel")).some((panel) =>
                        panel.hasAttribute("fill"),
                    ),
                ),
        ).toBe(false);
        const sizes = [
            ["sm", 640],
            ["md", 768],
            ["lg", 1024],
            ["xl", 1280],
        ] as const;

        for (const [size, expected] of sizes) {
            await shell.evaluate((element, value) => element.setAttribute("size", value), size);
            expect((await content.boundingBox())?.width).toBe(expected);
        }

        await shell.evaluate((element) => element.setAttribute("size", "full"));
        expect((await content.boundingBox())?.width).toBe((await shell.boundingBox())?.width);
        expect(errors).toEqual([]);
    } finally {
        await browser.close();
    }
});

test("contained detail bodies keep tall regions inside the available height", async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        const errors = await mountShell(
            page,
            `<div style="width: 1200px; height: 360px">
                <cms-shell-detail-body contained>
                    <div slot="left-aside" style="height: 700px">Navigation</div>
                    <div slot="main" style="height: 700px">Preview</div>
                    <cms-detail-section slot="aside" heading="Settings" contained>
                        <div style="height: 700px">Defaults</div>
                    </cms-detail-section>
                </cms-shell-detail-body>
            </div>`,
        );
        const geometry = await page.locator("cms-shell-detail-body").evaluate((body) => {
            const root = body.shadowRoot!;
            const left = root.querySelector<HTMLElement>(".shell-detail-left-aside")!;
            const main = root.querySelector<HTMLElement>(".shell-detail-main")!;
            const aside = root.querySelector<HTMLElement>(".shell-detail-aside")!;
            const section = body.querySelector("cms-detail-section")!;
            const sectionBody = section.shadowRoot!.querySelector<HTMLElement>(".body")!;
            return {
                bodyHeight: body.getBoundingClientRect().height,
                leftHeight: left.getBoundingClientRect().height,
                leftScrollable: left.scrollHeight > left.clientHeight,
                mainHeight: main.getBoundingClientRect().height,
                mainScrollable: main.scrollHeight > main.clientHeight,
                asideHeight: aside.getBoundingClientRect().height,
                panelsFill: [main, aside].every((panel) => panel.hasAttribute("fill")),
                sectionHeight: section.getBoundingClientRect().height,
                sectionBodyScrollable: sectionBody.scrollHeight > sectionBody.clientHeight,
            };
        });

        expect(geometry).toEqual({
            bodyHeight: 360,
            leftHeight: 360,
            leftScrollable: true,
            mainHeight: 360,
            mainScrollable: true,
            asideHeight: 360,
            panelsFill: true,
            sectionHeight: 360,
            sectionBodyScrollable: true,
        });
        expect(errors).toEqual([]);
    } finally {
        await browser.close();
    }
});
