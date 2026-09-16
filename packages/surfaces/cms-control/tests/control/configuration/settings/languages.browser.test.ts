import { expect, test } from "bun:test";
import { InMemoryCmsRepository, ValidatingCmsRepository } from "@bernouy/cms-content";
import getSettings from "cms-control/api/system/settings.get";
import postSettings from "cms-control/api/system/settings.post";
import { makeCms } from "../../integrations/support/helpers";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const assets = resolve(import.meta.dir, "../../../../src/static/assets");
const pagePath = resolve(import.meta.dir, "../../../../src/static/admin/_access/settings/_site/languages.html");

test("language activation survives Save and a full page reload", async () => {
    const browser = await chromium.launch();
    try {
        const repository = new InMemoryCmsRepository();
        await repository.updateSystem({
            site: { language: "fr", additionalLanguages: ["en"], activeLanguages: [] } as never,
        });
        const cms = makeCms([]).cms;
        cms.repository = new ValidatingCmsRepository(repository);
        const [markup, bundle, styles] = await Promise.all([
            readFile(pagePath, "utf8"),
            readFile(resolve(assets, "control-components.js"), "utf8"),
            readFile(resolve(assets, "control-styles.css"), "utf8"),
        ]);
        const writes: Record<string, unknown>[] = [];
        const errors: string[] = [];
        const page = await browser.newPage();
        page.on("pageerror", (error) => errors.push(error.message));
        await page.route("http://cms.test/**", async (route) => {
            const request = route.request();
            const url = new URL(request.url());
            if (url.pathname === "/assets/control-components.js") {
                await route.fulfill({ contentType: "text/javascript", body: bundle });
            } else if (url.pathname === "/assets/control-styles.css") {
                await route.fulfill({ contentType: "text/css", body: styles });
            } else if (url.pathname === "/api/system/settings") {
                if (request.method() === "POST") {
                    writes.push(JSON.parse(request.postData() ?? "{}") as Record<string, unknown>);
                }
                const handler = request.method() === "POST" ? postSettings : getSettings;
                const response = await handler(
                    new Request(request.url(), {
                        method: request.method(),
                        ...(request.method() === "POST" ? { body: request.postData() } : {}),
                    }),
                    cms,
                );
                await route.fulfill({
                    status: response.status,
                    contentType: response.headers.get("content-type") ?? "text/plain",
                    body: await response.text(),
                });
            } else {
                await route.fulfill({
                    contentType: "text/html",
                    body: `<!doctype html><html><head><meta name="basePath" content=""><link rel="stylesheet" href="/assets/control-styles.css"></head><body><cms-binding-core>${markup.replaceAll("{{BASE_PATH}}", "")}</cms-binding-core><script src="/assets/control-components.js"></script></body></html>`,
                });
            }
        });

        await page.goto("http://cms.test/admin/settings/languages");
        const english = page.locator("[data-selected-list] .language-row", {
            has: page.getByText("English", { exact: true }),
        });
        await english.getByText("Draft", { exact: true }).waitFor();
        await english.locator("w13c-switch").click();
        await english.getByText("Active", { exact: true }).waitFor();
        expect(await page.locator('input[name="site.activeLanguages"]').inputValue()).toBe("en");

        const activeSave = page.waitForResponse(
            (response) => response.url().endsWith("/api/system/settings") && response.request().method() === "POST",
        );
        await page.locator("cms-form-save-action").getByRole("button").click();
        await activeSave;
        await page.waitForFunction(
            () => document.querySelector("cms-form-save-action")?.getAttribute("state") === "saved",
        );
        expect(writes.at(-1)?.["site.activeLanguages"]).toBe("en");
        expect((await repository.getSystem()).site.activeLanguages).toEqual(["en"]);
        await page.waitForFunction(
            () => document.querySelector("cms-language-settings")?.getAttribute("active-languages") === '["en"]',
        );
        await english.getByText("Active", { exact: true }).waitFor();
        await page.reload();
        await english.getByText("Active", { exact: true }).waitFor();

        await english.locator("w13c-switch").click();
        await english.getByText("Draft", { exact: true }).waitFor();
        const draftSave = page.waitForResponse(
            (response) => response.url().endsWith("/api/system/settings") && response.request().method() === "POST",
        );
        await page.locator("cms-form-save-action").getByRole("button").click();
        await draftSave;
        await page.waitForFunction(
            () => document.querySelector("cms-form-save-action")?.getAttribute("state") === "saved",
        );
        expect(writes.at(-1)?.["site.activeLanguages"]).toBe("");
        expect((await repository.getSystem()).site.activeLanguages).toEqual([]);
        await page.reload();
        await english.getByText("Draft", { exact: true }).waitFor();
        expect(errors).toEqual([]);
    } finally {
        await browser.close();
    }
}, 20_000);
