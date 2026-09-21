import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const bundlePath = resolve(import.meta.dir, "../../../src/static/assets/control-components.js");
const detailPath = resolve(import.meta.dir, "../../../src/static/admin/_content/pages/detail.html");

test("page detail keeps its place after saving and opens language and delete actions", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const errors: string[] = [];
        const settingsWrites: Array<Record<string, unknown>> = [];
        let documents = 0;
        const paths = {
            id: "page-1",
            paths: { en: "/pricing" },
            languages: [{ code: "en", active: true, default: true, publicPath: "/pricing" }],
        };
        page.on("pageerror", (error) => errors.push(error.message));
        await page.route("http://cms.test/**", async (route) => {
            const request = route.request();
            const url = new URL(request.url());
            if (request.resourceType() === "document") {
                documents += 1;
                await route.fulfill({ contentType: "text/html", body: "<!doctype html>" });
            } else if (url.pathname === "/api/page/configDetail" && request.method() === "PUT") {
                settingsWrites.push(request.postDataJSON() as Record<string, unknown>);
                await route.fulfill({ json: { id: "page-1" } });
            } else if (url.pathname === "/api/page/configDetail") {
                await route.fulfill({
                    json: {
                        id: "page-1",
                        title: "Pricing",
                        description: "Pricing page",
                        path: "/pricing",
                        publicUrl: "https://site.test/pricing",
                        tags: [],
                        published: true,
                        indexingEditor: {
                            configured: false,
                            suggested: false,
                            detectionStatus: "none",
                            enabled: false,
                            selection: "",
                            selectionValid: true,
                            availableVariables: [],
                            candidates: [],
                        },
                    },
                });
            } else if (url.pathname === "/api/page/paths" && request.method() === "PUT") {
                paths.paths = (request.postDataJSON() as typeof paths).paths;
                paths.languages[0]!.publicPath = paths.paths.en;
                await route.fulfill({ json: paths });
            } else if (url.pathname === "/api/page/paths") {
                await route.fulfill({ json: paths });
            } else if (url.pathname === "/api/page/seo") {
                await route.fulfill({
                    json: {
                        id: "page-1",
                        defaultLanguage: "en",
                        defaults: { title: "Pricing", description: "Pricing page" },
                        languages: [],
                        translations: {},
                    },
                });
            } else if (url.pathname === "/api/page/exists") {
                await route.fulfill({ json: { exists: false } });
            } else if (url.pathname === "/api/page/list" || url.pathname === "/api/tags") {
                await route.fulfill({ json: [] });
            } else {
                await route.fulfill({ status: 404 });
            }
        });
        await page.goto("http://cms.test/admin/pages/detail?id=page-1");
        await page.setContent(
            `<meta name="basePath" content=""><cms-binding-core>${readFileSync(detailPath, "utf8").replaceAll("{{BASE_PATH}}", "")}</cms-binding-core>`,
        );
        await page.addScriptTag({ path: bundlePath });
        await page.locator("cms-shell-detail").waitFor();
        await page.locator('p9r-input[name="path"] input').waitFor();
        expect(await page.locator('p9r-input[name="path"] input').getAttribute("readonly")).not.toBeNull();
        await page.locator("cms-shell-detail").evaluate((shell) => {
            shell.setAttribute("data-identity", "original");
        });

        await page.locator('p9r-input[name="title"] input').fill("New pricing");
        await Promise.all([
            page.waitForResponse(
                (response) =>
                    response.url().includes("/api/page/configDetail") && response.request().method() === "PUT",
            ),
            page.locator('p9r-button[form="page-settings-form"]').click(),
        ]);
        await page.locator('cms-shell-detail [slot="title"]').getByText("New pricing").waitFor();
        expect(settingsWrites[0]?.path).toBe("/pricing");
        expect(await page.locator("cms-shell-detail").getAttribute("data-identity")).toBe("original");
        expect(await page.locator('[role="status"]').first().textContent()).toBe("Settings saved.");
        expect(documents).toBe(1);

        await page.locator("p9r-action-menu [data-trigger]").click();
        await page.locator('[data-modal-target="manage-page-languages-modal"]').click();
        expect(await page.locator("#manage-page-languages-modal").getAttribute("open")).not.toBeNull();
        await page.locator('cms-page-languages .page-language-row p9r-input[name="en"] input').fill("/plans");
        await Promise.all([
            page.waitForResponse(
                (response) => response.url().includes("/api/page/paths") && response.request().method() === "PUT",
            ),
            page.locator("cms-page-languages p9r-button").click(),
        ]);
        await page.waitForFunction(
            () => document.querySelector<HTMLElement & { value: string }>('p9r-input[name="path"]')?.value === "/plans",
        );
        expect(await page.locator("cms-shell-detail").getAttribute("data-identity")).toBe("original");
        expect(await page.locator('[data-action="view-public"]').getAttribute("href")).toBe("https://site.test/plans");
        await page.locator('#manage-page-languages-modal [aria-label="Close"]').click();
        await Promise.all([
            page.waitForResponse(
                (response) =>
                    response.url().includes("/api/page/configDetail") && response.request().method() === "PUT",
            ),
            page.locator('p9r-button[form="page-settings-form"]').click(),
        ]);
        expect(settingsWrites[1]?.path).toBe("/plans");
        expect(await page.locator("cms-shell-detail").getAttribute("data-identity")).toBe("original");
        await page.locator("p9r-action-menu [data-trigger]").click();
        await page.locator('[data-modal-target="delete-page-modal"]').click();
        expect(await page.locator("#delete-page-modal").getAttribute("open")).not.toBeNull();
        expect(documents).toBe(1);
        expect(errors).toEqual([]);
    } finally {
        await browser.close();
    }
}, 30_000);
