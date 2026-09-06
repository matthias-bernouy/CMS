import { resolve } from "node:path";
import { chromium } from "playwright";
import library from "cms-control/api/_content/bloc/_catalogue/library.get";
import updateCollection from "cms-control/api/_content/bloc/collections/collections.put";
import createCollection from "cms-control/api/_content/bloc/collections/collections.post";
import createComposition from "cms-control/api/_content/site-bloc/site-bloc.post";
import saveAvailability from "cms-control/api/_content/bloc/collections/availability.post";
import importCollection from "cms-control/api/_platform/integrations/import.post";
import { libraryHarness } from "../../control/bloc-library/fixtures";

export const base = "/tenant/cms";
export const origin = "http://cms.test";
const sourceRoot = resolve(import.meta.dir, "../../../src");
const bundle = await Bun.file(`${sourceRoot}/static/assets/control-components.js`).text();
const styles = await Bun.file(resolve(import.meta.dir, "../../../../../foundation/components/dist/style.css")).text();

export async function fixture() {
    const harness = await libraryHarness();
    const html = (await Bun.file(`${sourceRoot}/static/admin/_content/blocs.html`).text()).replaceAll(
        "{{BASE_PATH}}",
        base,
    );
    const browser = await chromium.launch();
    const page = await browser.newPage({ reducedMotion: "reduce", viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(6000);
    page.setDefaultNavigationTimeout(6000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const writes: Array<{ path: string; body: Record<string, unknown> }> = [];
    const failures = new Map<string, string>();
    const reads: string[] = [];
    const state = {
        versions: ["1.3.0"],
        brokenImages: false,
        availabilityDelay: undefined as (() => Promise<void>) | undefined,
    };
    await page.route(`${origin}/**`, async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname.slice(base.length);
        if (path === "/control.js") {
            await route.fulfill({
                contentType: "text/javascript",
                body: bundle,
            });
            return;
        }
        if (path === "/style.css") {
            await route.fulfill({
                contentType: "text/css",
                body: styles,
            });
            return;
        }
        if (path === "/api/bloc/preview") {
            await route.fulfill({
                contentType: "text/html; charset=utf-8",
                body: "<!doctype html><p>Read-only preview</p>",
            });
            return;
        }
        if (request.resourceType() === "document") {
            await route.fulfill({
                contentType: "text/html; charset=utf-8",
                body: `<!doctype html><head><meta name="basePath" content="${base}"><link rel="stylesheet" href="${base}/style.css"><script src="${base}/control.js"></script></head><body><cms-binding-core>${path === "/editor/bloc" ? "<h1>Composition editor</h1>" : html}</cms-binding-core></body>`,
            });
            return;
        }
        if (request.resourceType() === "image") {
            if (state.brokenImages) {
                await route.fulfill({ status: 404, body: "Missing image" });
                return;
            }
            await route.fulfill({
                contentType: "image/svg+xml",
                body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#dae2dd"/></svg>',
            });
            return;
        }
        if (request.method() !== "GET") {
            writes.push({ path, body: request.postDataJSON() });
        } else {
            reads.push(`${path}${url.search}`);
        }
        if (path === "/api/bloc/collections/availability" && state.availabilityDelay) {
            const delay = state.availabilityDelay;
            state.availabilityDelay = undefined;
            await delay();
        }
        if (failures.has(path)) {
            const error = failures.get(path);
            failures.delete(path);
            await route.fulfill({ status: 503, json: { error } });
            return;
        }
        const req = new Request(url, {
            method: request.method(),
            ...(request.postData()
                ? { body: request.postData(), headers: { "content-type": "application/json" } }
                : {}),
        });
        try {
            const handler =
                path === "/api/bloc/library"
                    ? library
                    : path === "/api/bloc/collections"
                      ? request.method() === "PUT"
                          ? updateCollection
                          : createCollection
                      : path === "/api/site-bloc"
                        ? createComposition
                        : path === "/api/bloc/collections/availability"
                          ? saveAvailability
                          : path === "/api/integrations/import"
                            ? importCollection
                            : undefined;
            if (handler) {
                const response = await handler(req, harness.cms);
                await route.fulfill({
                    status: response.status,
                    contentType: "application/json",
                    body: await response.text(),
                });
            } else if (path === "/api/integrations/installations/versions") {
                const installation = await harness.integrationInstallations.get(url.searchParams.get("id")!);
                await route.fulfill({
                    json: { id: installation!.id, current: installation!.definitionVersion, versions: state.versions },
                });
            } else if (path === "/api/integrations/installations/upgrade") {
                const installation = (await harness.integrationInstallations.get(url.searchParams.get("id")!))!;
                await harness.integrationInstallations.replace({
                    ...installation,
                    definitionVersion: request.postDataJSON().version,
                });
                state.versions = [];
                await route.fulfill({ json: { ok: true } });
            } else {
                await route.fulfill({ json: { site: { name: "Test CMS" } } });
            }
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
        failures,
        state,
        goto: (query = "") => page.goto(`${origin}${base}/admin/blocs${query}`, { waitUntil: "domcontentloaded" }),
    };
}
