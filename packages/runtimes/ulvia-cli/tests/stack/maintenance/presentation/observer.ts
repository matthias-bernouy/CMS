import { expect } from "bun:test";
import { repositoryApi } from "../../../../../../../tests/integration/instance/repository/client";
import type { HostedSite } from "../../edgeSmoke/setup";
/** Use an existing installed composition as the site's real server-error Page. */
export async function configureNativeErrorPage(site: HostedSite) {
    const api = repositoryApi(site.origin);
    const actor = await api.session(site.administrator.email, site.administrator.password);
    const call = async (path: string, method = "GET", input?: unknown) => {
        const response = await api.request("ulvia/cms.content", path, method, input, actor);
        expect(response.status, await response.clone().text()).toBe(200);
        return response.json();
    };
    const pages = await call("/pages/list", "QUERY", { limit: 25 });
    const page = pages.items.find((row: { path: string }) => row.path === "/smoke-page");
    expect(page).toBeDefined();
    const settings = await call("/site");
    await call("/site", "POST", {
        expectedRevision: settings.revision,
        visible: true,
        serverError: { pageId: page.id },
    });
}
export function observeNativeMaintenance(site: HostedSite) {
    let stopped = false,
        observed = false;
    const errors: unknown[] = [];
    const task = (async () => {
        while (!stopped) {
            let checking = false;
            try {
                const response = await fetch(`${site.origin}/maintenance-observer`, {
                    signal: AbortSignal.timeout(1000),
                });
                const html = await response.text();
                if (response.headers.get("ulvia-maintenance") === "upgrade") {
                    checking = true;
                    expect(response.status).toBe(503);
                    expect(html).toContain("Smoke Page");
                    expect(html).not.toContain("<script");
                    const assets = [...html.matchAll(/(?:href|src)="(\/_content\/maintenance\/[a-f0-9]{64}\/\d+)"/gu)];
                    expect(assets.length).toBeGreaterThan(0);
                    for (const asset of assets) {
                        const resource = await fetch(`${site.origin}${asset[1]}`, {
                            signal: AbortSignal.timeout(1000),
                        });
                        if (resource.headers.get("ulvia-maintenance") === "upgrade") {
                            expect(resource.status).toBe(200);
                        }
                        await resource.body?.cancel();
                    }
                    observed = true;
                }
            } catch (error) {
                // TCP handoff is bounded by the existing admin-disabled proxy; assertion failures are retained.
                if (checking) {
                    errors.push(error);
                }
            }
            await Bun.sleep(100);
        }
    })();
    return async () => {
        stopped = true;
        await task;
        expect(errors).toEqual([]);
        expect(observed).toBe(true);
    };
}
