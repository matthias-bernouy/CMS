import type { Page } from "playwright";
import type { DashboardSourceGroup } from "cms-control/components/admin/Resources/Dashboards/types";
import { resolve } from "node:path";

export const bundlePath = resolve(import.meta.dir, "../../../../../src/static/assets/control-components.js");
export const stylesPath = resolve(import.meta.dir, "../../../../../../../foundation/components/dist/style.css");
export const groups: DashboardSourceGroup[] = ["store", "delivery"].map((id) => ({
    source: {
        id,
        urn: `urn:${id}`,
        name: id === "store" ? "Store" : "Delivery",
        icon: "database",
        endpointCount: 0,
        dashboardCount: 2,
        readonly: false,
    },
    endpoints: [],
    dashboards: ["products", "settings"].map((name) => ({
        id: `${id}-${name}`,
        source: id,
        meta: { name, icon: "layout" },
        views: [],
    })),
}));

export async function installNavigation(page: Page, bundle: string) {
    let state = structuredClone(groups);
    let delayed: Promise<void> | undefined;
    let failed = false;
    const reads: string[] = [];
    await page.route("http://cms.test/**", async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (path === "/control.js") {
            await route.fulfill({ contentType: "text/javascript", body: bundle });
        } else if (path === "/style.css") {
            await route.fulfill({ contentType: "text/css", body: await Bun.file(stylesPath).text() });
        } else if (request.resourceType() === "document") {
            await route.fulfill({
                contentType: "text/html",
                body: '<!doctype html><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><script src="/control.js"></script></head><body><cms-binding-core><w13c-fixed-admin-layout><cms-dashboards-nav slot="secondary-lateral-nav"></cms-dashboards-nav><p>Workspace</p></w13c-fixed-admin-layout></cms-binding-core></body>',
            });
        } else if (path === "/api/dashboards") {
            reads.push(path);
            const value = structuredClone(state);
            const error = failed;
            failed = false;
            await delayed;
            await route.fulfill(error ? { status: 503, json: { error: "Unavailable" } } : { json: value });
        } else {
            await route.fulfill({ json: [] });
        }
    });
    return {
        reads,
        setGroups(value: DashboardSourceGroup[]) {
            state = value;
        },
        failRead() {
            failed = true;
        },
        holdRead() {
            let release!: () => void;
            delayed = new Promise<void>((resolve) => {
                release = resolve;
            });
            return () => {
                delayed = undefined;
                release();
            };
        },
    };
}
