import { afterEach, describe, expect, test } from "bun:test";
import "cms-control/components/admin/Layout/EndpointPerformance/EndpointPerformance";
import { endpointPerformanceDashboard, waitForEndpointState } from "./endpointPerformanceSupport";

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
    document.head.innerHTML = "";
    document.body.replaceChildren();
    history.replaceState(null, "", "/");
});

describe("endpoint performance dashboard", () => {
    test("renders cards, three timeline series, table, and selected aggregate detail safely", async () => {
        document.head.innerHTML = '<meta name="basePath" content="/cms">';
        history.replaceState(null, "", "/cms/admin/analytics/endpoints?range=1h&endpoint=urn%3Acommerce%3Alist_orders");
        const unsafeUrn = 'urn:source:<img src="x" onerror="alert(1)">';
        const data = endpointPerformanceDashboard({
            endpoints: [
                ...endpointPerformanceDashboard().endpoints,
                {
                    ...endpointPerformanceDashboard().endpoints[0]!,
                    endpointUrn: unsafeUrn,
                },
            ],
        });
        const requests: string[] = [];
        globalThis.fetch = (async (input) => {
            requests.push(String(input));
            return Response.json(data);
        }) as typeof fetch;

        const dashboard = document.createElement("cms-endpoint-performance");
        document.body.append(dashboard);
        await waitForEndpointState(dashboard, "ready");

        expect(requests).toHaveLength(1);
        const request = new URL(requests[0]!, "http://localhost");
        expect(request.pathname).toBe("/cms/api/analytics/endpoints");
        expect(request.searchParams.get("range")).toBe("1h");
        expect(request.searchParams.get("endpoint")).toBe("urn:commerce:list_orders");
        expect(dashboard.textContent).toContain("120");
        expect(dashboard.textContent).toContain("240 ms");
        expect(dashboard.querySelector(".endpoint-timeline__volume")).not.toBeNull();
        expect(dashboard.querySelector(".endpoint-timeline__p95")).not.toBeNull();
        expect(dashboard.querySelector(".endpoint-timeline__errors")).not.toBeNull();
        expect(dashboard.textContent).toContain("HTTP 5xx");
        expect(dashboard.textContent).toContain("Authorization");
        expect(dashboard.textContent).toContain("Upstream execution");
        expect(dashboard.textContent).toContain("Edge database calls");
        expect(dashboard.textContent).toContain("250");
        expect(dashboard.textContent).toContain("No individual request logs");
        expect(dashboard.textContent).toContain(unsafeUrn);
        expect(dashboard.querySelector("img")).toBeNull();
    });

    test("selects an endpoint, toggles sorting, and applies bounded filters", async () => {
        document.head.innerHTML = '<meta name="basePath" content="/cms">';
        history.replaceState(null, "", "/cms/admin/analytics/endpoints?range=7d");
        const requests: URL[] = [];
        globalThis.fetch = (async (input) => {
            const url = new URL(String(input), "http://localhost");
            requests.push(url);
            return Response.json(
                endpointPerformanceDashboard({
                    detail: url.searchParams.has("endpoint") ? undefined : null,
                }),
            );
        }) as typeof fetch;

        const dashboard = document.createElement("cms-endpoint-performance");
        document.body.append(dashboard);
        await waitForEndpointState(dashboard, "ready");

        dashboard.querySelector<HTMLButtonElement>("[data-endpoint]")!.click();
        await waitForRequestCount(requests, 2);
        await waitForEndpointState(dashboard, "ready");
        expect(requests[1]!.searchParams.get("endpoint")).toBe("urn:commerce:list_orders");
        expect(dashboard.querySelector<HTMLElement>("[data-detail]")!.hidden).toBe(false);

        dashboard.querySelector<HTMLButtonElement>('[data-sort="p95"]')!.click();
        await waitForRequestCount(requests, 3);
        await waitForEndpointState(dashboard, "ready");
        expect(requests[2]!.searchParams.get("sort")).toBe("p95");
        expect(requests[2]!.searchParams.get("order")).toBe("asc");

        const form = dashboard.querySelector<HTMLFormElement>("[data-filters]")!;
        (form.elements.namedItem("surface") as HTMLSelectElement).value = "delivery";
        (form.elements.namedItem("method") as HTMLSelectElement).value = "POST";
        (form.elements.namedItem("status") as HTMLSelectElement).value = "5xx";
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await waitForRequestCount(requests, 4);
        await waitForEndpointState(dashboard, "ready");

        expect(requests[3]!.searchParams.get("range")).toBe("7d");
        expect(requests[3]!.searchParams.get("surface")).toBe("delivery");
        expect(requests[3]!.searchParams.get("method")).toBe("POST");
        expect(requests[3]!.searchParams.get("status")).toBe("5xx");
        expect(window.location.search).toContain("surface=delivery");
    });
});

async function waitForRequestCount(requests: URL[], count: number, tries = 50): Promise<void> {
    for (let attempt = 0; attempt < tries; attempt += 1) {
        if (requests.length >= count) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error(`Timed out waiting for ${count} endpoint performance requests`);
}
