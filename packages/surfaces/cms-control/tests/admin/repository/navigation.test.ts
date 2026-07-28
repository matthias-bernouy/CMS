import { afterEach, describe, expect, test } from "bun:test";
import "cms-control/components/admin/Layout/AdminLayout/AdminLayout";
import { resetRepositoryDom, waitFor } from "./fixtures";

afterEach(resetRepositoryDom);

describe("repository administration navigation", () => {
    for (const status of [200, 503]) {
        test(`shows the repository route when capability status is ${status}`, async () => {
            const paths = installNavigationFetch(status);
            const layout = mountLayout();
            await waitFor(() => paths.includes("/cms/api/repository/status"));
            const item = layout.shadowRoot?.querySelector<HTMLElement>("[data-repository-route]");
            await waitFor(() => item?.hidden === false);
            expect(item?.getAttribute("href")).toBe("/cms/admin/repository");
        });
    }

    for (const status of [403, 404]) {
        test(`hides the repository route when capability status is ${status}`, async () => {
            const paths = installNavigationFetch(status);
            const layout = mountLayout();
            await waitFor(() => paths.includes("/cms/api/repository/status"));
            expect(layout.shadowRoot?.querySelector<HTMLElement>("[data-repository-route]")?.hidden).toBe(true);
        });
    }

    test("fails closed when capability discovery cannot reach the gateway", async () => {
        globalThis.fetch = (async (input: RequestInfo | URL) => {
            const path = new URL(String(input), "http://localhost:4999").pathname;
            if (path.endsWith("/repository/status")) {
                throw new TypeError("network unavailable");
            }
            return Response.json({ site: { name: "Test CMS" } });
        }) as typeof fetch;
        const layout = mountLayout();
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(layout.shadowRoot?.querySelector<HTMLElement>("[data-repository-route]")?.hidden).toBe(true);
    });
});

function mountLayout(): HTMLElement {
    document.head.innerHTML = '<meta name="basePath" content="/cms">';
    const layout = document.createElement("w13c-fixed-admin-layout");
    document.body.append(layout);
    return layout;
}

function installNavigationFetch(repositoryStatus: number): string[] {
    const paths: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const path = new URL(String(input), "http://localhost:4999").pathname;
        paths.push(path);
        return path.endsWith("/repository/status")
            ? Response.json({ code: "capability" }, { status: repositoryStatus })
            : Response.json({ site: { name: "Test CMS" } });
    }) as typeof fetch;
    return paths;
}
