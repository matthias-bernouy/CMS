import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { chromium } from "playwright";

const bundlePath = resolve(import.meta.dir, "../../../src/browser/control-components.js");

test("page path and deletion panels work in a browser", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const errors: string[] = [];
        const writes: Array<{ paths: Record<string, string>; expectedPaths: Record<string, string> }> = [];
        const deletes: URL[] = [];
        let collision = false;
        const detail = {
            id: "page-1",
            paths: { fr: "/about" } as Record<string, string>,
            languages: [
                { code: "fr", default: true, active: true, publicPath: "/about" },
                { code: "en", default: false, active: true, publicPath: "" },
            ],
        };
        page.on("pageerror", (error) => errors.push(error.message));
        await page.route("http://cms.test/**", async (route) => {
            const request = route.request();
            const url = new URL(request.url());
            if (request.resourceType() === "document") {
                await route.fulfill({ contentType: "text/html", body: "<!doctype html>" });
            } else if (url.pathname === "/api/page/paths" && request.method() === "PUT") {
                const body = request.postDataJSON() as {
                    paths: Record<string, string>;
                    expectedPaths: Record<string, string>;
                };
                writes.push(body);
                detail.paths = body.paths;
                detail.languages[1]!.publicPath = body.paths.en ? `/en${body.paths.en}` : "";
                await route.fulfill({ json: detail });
            } else if (url.pathname === "/api/page/paths") {
                await route.fulfill({ json: detail });
            } else if (url.pathname === "/api/page/seo") {
                await route.fulfill({
                    json: {
                        id: "page-1",
                        defaults: { title: "About", description: "" },
                        languages: ["fr", "en"],
                        translations: {},
                    },
                });
            } else if (url.pathname === "/api/page/exists") {
                await route.fulfill({ json: { exists: collision } });
            } else if (url.pathname === "/api/page/list") {
                await route.fulfill({
                    json: [
                        { id: "page-1", title: "Current", path: "/about" },
                        { id: "page-2", title: "Replacement", path: "/replacement" },
                    ],
                });
            } else if (url.pathname === "/api/page" && request.method() === "DELETE") {
                deletes.push(url);
                await route.fulfill({ status: 500, body: "Failed" });
            } else {
                await route.fulfill({ status: 404 });
            }
        });
        await page.goto("http://cms.test/admin/pages/detail?id=page-1");
        await page.setContent(`
            <p9r-input name="path" value="/about" readonly></p9r-input>
            <p9r-input name="editable-path" value="/about"></p9r-input>
            <cms-page-languages page-id="page-1"></cms-page-languages>
            <cms-page-delete page-id="page-1"></cms-page-delete>
        `);
        await page.addScriptTag({ path: bundlePath });
        await page.waitForSelector('cms-page-languages p9r-input[name="en"]');
        expect(await page.locator("cms-page-languages th").allTextContents()).toEqual([
            "Language",
            "Current URL",
            "New URL",
        ]);
        expect(
            await page
                .locator("cms-page-languages .page-language-row")
                .last()
                .locator(".page-language-old-value")
                .textContent(),
        ).toBe("No URL yet");
        const readonly = await page
            .locator('p9r-input[name="path"]')
            .evaluate((host) => host.shadowRoot?.querySelector("input")?.readOnly);
        expect(readonly).toBe(true);
        const backgrounds = await page
            .locator("p9r-input")
            .evaluateAll((hosts) =>
                hosts.map((host) => getComputedStyle(host.shadowRoot!.querySelector("input")!).backgroundColor),
            );
        expect(backgrounds[0]).not.toBe(backgrounds[1]);
        expect(await page.locator('cms-page-languages p9r-input[name="en"] .prefix').textContent()).toBe("/en");

        await page.locator('cms-page-languages p9r-input[name="en"] input').fill("/about");
        expect(
            await page
                .locator("cms-page-languages form")
                .evaluate((form) => new FormData(form as HTMLFormElement).get("en")),
        ).toBe("/about");
        expect(
            await page
                .locator("cms-page-languages .page-language-row")
                .last()
                .locator(".page-language-old-value")
                .textContent(),
        ).toBe("No URL yet");
        const saveState = await page.locator("cms-page-languages p9r-button").evaluate((button) => ({
            associated: Boolean((button as HTMLElement & { _internals: ElementInternals })._internals.form),
            valid: (button.closest("form") as HTMLFormElement).checkValidity(),
            disabled: button.hasAttribute("disabled"),
        }));
        expect(saveState).toEqual({ associated: true, valid: true, disabled: false });
        await Promise.all([
            page.waitForResponse(
                (response) => response.url().includes("/api/page/paths") && response.request().method() === "PUT",
            ),
            page.locator("cms-page-languages p9r-button").click(),
        ]);
        await page.waitForFunction(
            () =>
                document.querySelector<HTMLElement & { value: string }>('cms-page-languages p9r-input[name="en"]')
                    ?.value === "/about",
        );
        expect(writes).toEqual([{ paths: { fr: "/about", en: "/about" }, expectedPaths: { fr: "/about" } }]);
        expect(
            await page
                .locator("cms-page-languages .page-language-row")
                .last()
                .locator(".page-language-old-value")
                .textContent(),
        ).toBe("/en/about");

        collision = true;
        await page.locator('cms-page-languages p9r-input[name="en"] input').fill("/taken");
        await page.locator("cms-page-languages p9r-button").click();
        await page.waitForFunction(() =>
            document
                .querySelector('cms-page-languages p9r-input[name="en"]')
                ?.getAttribute("error")
                ?.includes("reserved"),
        );
        expect(await page.locator('cms-page-languages p9r-input[name="en"] input').getAttribute("aria-invalid")).toBe(
            "true",
        );
        expect(writes).toHaveLength(1);

        await page.locator('cms-page-delete p9r-select option[value="page-2"]').waitFor({ state: "attached" });
        expect(await page.locator("cms-page-delete p9r-select option").count()).toBe(2);
        const alternative = page.locator("cms-page-delete p9r-select");
        expect(await alternative.evaluate((select) => (select as HTMLElement & { value: string }).value)).toBe("");
        await alternative.getByRole("combobox").click();
        await alternative.locator('[role="option"][data-value="page-2"]').click();
        expect(await alternative.evaluate((select) => (select as HTMLElement & { value: string }).value)).toBe(
            "page-2",
        );
        expect(await page.locator("cms-page-delete p9r-button").getAttribute("disabled")).toBeNull();
        await Promise.all([
            page.waitForResponse(
                (response) => response.url().includes("/api/page?") && response.request().method() === "DELETE",
            ),
            page.locator("cms-page-delete p9r-button").click(),
        ]);
        expect(deletes).toHaveLength(1);
        expect(await page.locator('cms-page-delete [role="alert"]').textContent()).toContain("Could not delete");
        expect(deletes[0]?.searchParams.get("alternativeId")).toBe("page-2");
        expect(errors).toEqual([]);
    } finally {
        await browser.close();
    }
}, 30_000);
