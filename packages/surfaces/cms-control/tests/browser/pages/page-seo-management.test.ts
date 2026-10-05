import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { chromium } from "playwright";

const bundlePath = resolve(import.meta.dir, "../../../src/browser/control-components.js");
const stylePath = resolve(import.meta.dir, "../../../../../foundation/components/dist/style.css");

test("SEO translations save without navigation and fit desktop and mobile panels", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
        const errors: string[] = [];
        const writes: Array<Record<string, { title?: string; description?: string }>> = [];
        const detail = {
            id: "page-1",
            defaults: { title: "À propos", description: "Notre entreprise" },
            languages: ["fr", "en", "de"],
            translations: {
                fr: {} as { title?: string; description?: string },
                en: {} as { title?: string; description?: string },
                de: { title: "Über uns" } as { title?: string; description?: string },
            },
        };
        page.on("pageerror", (error) => errors.push(error.message));
        await page.route("http://cms.test/**", async (route) => {
            if (route.request().resourceType() === "document") {
                await route.fulfill({ contentType: "text/html", body: "<!doctype html>" });
                return;
            }
            if (new URL(route.request().url()).pathname === "/api/page/paths") {
                await route.fulfill({
                    json: {
                        id: "page-1",
                        paths: { fr: "/a-propos", en: "/about", de: "/uber-uns" },
                        languages: [
                            { code: "fr", default: true, active: true, publicPath: "/a-propos" },
                            { code: "en", default: false, active: true, publicPath: "/en/about" },
                            { code: "de", default: false, active: true, publicPath: "/de/uber-uns" },
                        ],
                    },
                });
                return;
            }
            if (new URL(route.request().url()).pathname !== "/api/page/seo") {
                await route.fulfill({ status: 404 });
                return;
            }
            if (route.request().method() === "PUT") {
                const body = route.request().postDataJSON() as { translations: typeof detail.translations };
                writes.push(body.translations);
                detail.translations = {
                    fr: body.translations.fr ?? {},
                    en: body.translations.en ?? {},
                    de: body.translations.de ?? {},
                };
            }
            await route.fulfill({ json: detail });
        });
        await page.goto("http://cms.test/");
        await page.setContent(`
            <p9r-modal id="languages" placement="end" content-layout="contained" style="--p9r-modal-width: 760px">
                <span slot="title">Page languages</span>
                <cms-page-languages page-id="page-1"></cms-page-languages>
            </p9r-modal>
        `);
        await page.addStyleTag({ path: stylePath });
        await page.addScriptTag({ path: bundlePath });
        await page.waitForSelector('cms-page-languages p9r-input[name="en.title"]', { state: "attached" });
        await page.locator("p9r-modal").evaluate((modal: HTMLElement & { show: () => void }) => modal.show());
        await page.screenshot({ path: "/tmp/cmscore-languages-desktop.png" });

        expect(await page.locator("cms-page-languages .page-language-row").count()).toBe(3);
        expect(await page.locator('cms-page-languages p9r-input[name="en.title"]').getAttribute("placeholder")).toBe(
            "À propos",
        );
        await page.locator("cms-page-languages .page-language-toggle").nth(1).click();
        await page.screenshot({ path: "/tmp/cmscore-languages-desktop-expanded.png" });
        await page.locator('cms-page-languages p9r-input[name="en.title"] input').fill("About us");
        await page.locator('cms-page-languages p9r-textarea[name="en.description"] textarea').fill("Our company");
        await Promise.all([
            page.waitForResponse(
                (response) => response.url().includes("/api/page/seo") && response.request().method() === "PUT",
            ),
            page.locator("cms-page-languages p9r-button").click(),
        ]);
        await page.waitForFunction(() =>
            document.querySelector("cms-page-languages .page-languages-status")?.textContent?.includes("saved"),
        );
        expect(writes[0]).toEqual({
            en: { title: "About us", description: "Our company" },
            de: { title: "Über uns" },
        });
        expect(page.url()).toBe("http://cms.test/");

        await page.setViewportSize({ width: 390, height: 780 });
        await page.locator("cms-page-languages .page-languages-scroll").evaluate((scroll) => {
            scroll.scrollTop = 0;
        });
        await page.screenshot({ path: "/tmp/cmscore-languages-mobile.png" });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        expect(overflow).toBe(false);
        await page.locator("cms-page-languages .page-languages-scroll").evaluate((scroll) => {
            scroll.scrollTop = scroll.scrollHeight;
        });
        await page.locator("cms-page-languages .page-language-toggle").nth(2).click();
        await page.locator("cms-page-languages .page-languages-scroll").evaluate((scroll) => {
            scroll.scrollTop = scroll.scrollHeight;
        });
        expect(await page.locator('cms-page-languages p9r-textarea[name="de.description"] textarea').isVisible()).toBe(
            true,
        );
        expect(await page.locator("cms-page-languages .page-languages-footer").isVisible()).toBe(true);
        await page.screenshot({ path: "/tmp/cmscore-languages-mobile-bottom.png" });
        expect(errors).toEqual([]);
    } finally {
        await browser.close();
    }
}, 30_000);
