import { resolve } from "node:path";
import { chromium } from "playwright";
import createCollection from "cms-control/api/_content/bloc/collections/collections.post";
import updateCollection from "cms-control/api/_content/bloc/collections/collections.put";
import collectionWorkspace from "cms-control/api/_content/collections/workspace.get";
import createComposition from "cms-control/api/_content/site-bloc/site-bloc.post";
import getSettings from "cms-control/api/system/settings.get";
import postSettings from "cms-control/api/system/settings.post";
import { libraryHarness } from "../../control/bloc-library/fixtures";

export const base = "/tenant/cms";
export const origin = "http://cms.test";
const sourceRoot = resolve(import.meta.dir, "../../../src");
const bundle = await Bun.file(`${sourceRoot}/browser/control-components.js`).text();
const styles = await Bun.file(resolve(import.meta.dir, "../../../../../foundation/components/dist/style.css")).text();

export async function fixture() {
    const harness = await libraryHarness();
    const html = "<cms-collection-workspace></cms-collection-workspace>";
    const browser = await chromium.launch();
    const page = await browser.newPage({ reducedMotion: "reduce", viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(6000);
    page.setDefaultNavigationTimeout(6000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const writes: Array<{ path: string; body: Record<string, unknown> }> = [];
    const reads: string[] = [];
    await page.route(`${origin}/**`, async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname.slice(base.length);
        if (path === "/control.js") {
            await route.fulfill({ contentType: "text/javascript", body: bundle });
            return;
        }
        if (path === "/style.css") {
            await route.fulfill({ contentType: "text/css", body: styles });
            return;
        }
        if (path === "/api/bloc/preview") {
            await route.fulfill({
                contentType: "text/html; charset=utf-8",
                body: `<!doctype html><p>Read-only preview</p><script>
                    parent.postMessage({ type: "cms:bloc-preview-layout", layout: "compact", height: 220 }, "*");
                </script>`,
            });
            return;
        }
        if (path === "/api/bloc/catalogue") {
            await route.fulfill({ json: [] });
            return;
        }
        if (request.resourceType() === "document") {
            await route.fulfill({
                contentType: "text/html; charset=utf-8",
                body: `<!doctype html><head><meta name="basePath" content="${base}"><link rel="stylesheet" href="${base}/style.css"><script src="${base}/control.js"></script></head><body><cms-binding-core>${html}</cms-binding-core></body>`,
            });
            return;
        }
        if (request.resourceType() === "image") {
            await route.fulfill({
                contentType: "image/svg+xml",
                body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"></svg>',
            });
            return;
        }
        if (request.method() !== "GET") {
            writes.push({ path, body: request.postDataJSON() });
        } else {
            reads.push(`${path}${url.search}`);
        }
        const req = new Request(url, {
            method: request.method(),
            ...(request.postData()
                ? { body: request.postData(), headers: { "content-type": "application/json" } }
                : {}),
        });
        try {
            const handler =
                path === "/api/collections/workspace"
                    ? collectionWorkspace
                    : path === "/api/bloc/collections"
                      ? request.method() === "PUT"
                          ? updateCollection
                          : createCollection
                      : path === "/api/site-bloc"
                        ? createComposition
                        : path === "/api/system/settings"
                          ? request.method() === "POST"
                              ? postSettings
                              : getSettings
                          : undefined;
            if (!handler) {
                await route.fulfill({ json: { site: { name: "Test CMS" } } });
                return;
            }
            const response = await handler(req, harness.cms);
            await route.fulfill({
                status: response.status,
                contentType: "application/json",
                body: await response.text(),
            });
        } catch (error) {
            await route.fulfill({
                status: (error as { status?: number }).status ?? 400,
                json: { error: (error as Error).message },
            });
        }
    });
    return {
        ...harness,
        browser,
        page,
        errors,
        writes,
        reads,
        gotoCollection: (path = "/admin/collections") =>
            page.goto(`${origin}${base}${path}`, { waitUntil: "domcontentloaded" }),
    };
}
