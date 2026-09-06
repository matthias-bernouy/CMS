import { expect, test } from "bun:test";
import { seedBloc } from "../../control/site-blocs/fixtures";
import { fixture } from "./fixture";

test("clicking and keyboard-toggling a bloc below the fold preserve the fixed admin and content scroll", async () => {
    const f = await fixture();
    try {
        for (let index = 0; index < 24; index++) {
            await seedBloc(f.repository, `long-${index}`, {
                group: "Content",
                ownership: {
                    kind: "integration",
                    installationId: "gallery",
                    integrationKind: "gallery",
                    definitionVersion: "1.2.3",
                },
            });
        }
        for (const viewport of [
            { width: 1440, height: 1000 },
            { width: 390, height: 844 },
        ]) {
            await f.page.setViewportSize(viewport);
            await f.goto("?collection=managed:gallery");
            const toggle = f.page.locator('cms-bloc-choice[resource="gallery/blocs/banner"] w13c-switch');
            await toggle.scrollIntoViewIfNeeded();
            const position = () =>
                f.page.evaluate(() => {
                    const host = document.querySelector<HTMLElement>("w13c-fixed-admin-layout")!;
                    const layout = host.shadowRoot!.querySelector<HTMLElement>("w13c-left-menu-layout")!;
                    return {
                        documentY: scrollY,
                        hostScroll: host.scrollTop,
                        layoutScroll: layout.scrollTop,
                        layoutY: layout.getBoundingClientRect().y,
                        contentScroll: layout.shadowRoot!.querySelector("main")!.scrollTop,
                    };
                });
            const before = await position();
            expect(before.contentScroll).toBeGreaterThan(viewport.height);
            expect(before.hostScroll).toBe(0);
            for (const keyboard of [false, true]) {
                const saved = f.page.waitForResponse((r) => r.url().includes("/api/bloc/collections/availability"));
                if (keyboard) {
                    await f.page.keyboard.press("Space");
                } else {
                    await toggle.click();
                }
                expect((await saved).status()).toBe(200);
                await f.page.locator("p9r-toast").filter({ hasText: "Availability saved." }).waitFor();
                expect(await position()).toEqual(before);
                expect(await toggle.evaluate((el) => el.shadowRoot!.activeElement?.tagName)).toBe("INPUT");
            }
        }
        expect(f.errors).toEqual([]);
    } finally {
        await f.browser.close();
    }
}, 30000);
