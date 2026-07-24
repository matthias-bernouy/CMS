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

describe("endpoint performance states", () => {
    test("keeps loading explicit before rendering an empty aggregate report", async () => {
        let release!: (response: Response) => void;
        globalThis.fetch = (() =>
            new Promise<Response>((resolve) => {
                release = resolve;
            })) as unknown as typeof fetch;
        const dashboard = document.createElement("cms-endpoint-performance");
        document.body.append(dashboard);

        await waitForEndpointState(dashboard, "loading");
        expect(dashboard.getAttribute("aria-busy")).toBe("true");
        release(
            Response.json(
                endpointPerformanceDashboard({
                    summary: {
                        requests: 0,
                        errors: 0,
                        errorRate: null,
                        p50Ms: null,
                        p95Ms: null,
                        p99Ms: null,
                        maxMs: null,
                    },
                    timeline: [],
                    endpoints: [],
                    detail: null,
                }),
            ),
        );
        await waitForEndpointState(dashboard, "ready");

        expect(dashboard.querySelector<HTMLElement>("[data-empty]")!.hidden).toBe(false);
        expect(dashboard.querySelector<HTMLElement>("[data-content]")!.hidden).toBe(true);
        expect(dashboard.textContent).toContain("No endpoint activity in this range");
        expect(dashboard.getAttribute("aria-busy")).toBe("false");
    });

    test("makes partial coverage and stale data visible together", async () => {
        globalThis.fetch = (async () =>
            Response.json(
                endpointPerformanceDashboard({
                    meta: {
                        partial: true,
                        stale: true,
                        dropped: 7,
                        invalid: 2,
                        flushFailures: 1,
                        collectorCountsExact: false,
                        lastObservationAt: "2026-07-23T09:00:00.000Z",
                    },
                }),
            )) as unknown as typeof fetch;
        const dashboard = document.createElement("cms-endpoint-performance");
        document.body.append(dashboard);
        await waitForEndpointState(dashboard, "ready");

        const partial = dashboard.querySelector<HTMLElement>("[data-partial]")!;
        const stale = dashboard.querySelector<HTMLElement>("[data-stale]")!;
        expect(partial.hidden).toBe(false);
        expect(partial.textContent).toContain("7 dropped");
        expect(partial.textContent).toContain("1 flush failures");
        expect(partial.textContent).toContain("Collector-wide");
        expect(partial.textContent).toContain("estimates");
        expect(stale.hidden).toBe(false);
        expect(stale.textContent).toContain("Last observation");
    });

    test("shows backend unavailability and retries without reloading the page", async () => {
        let calls = 0;
        globalThis.fetch = (async () => {
            calls += 1;
            return calls === 1
                ? Response.json({ error: "endpoint performance unavailable" }, { status: 503 })
                : Response.json(endpointPerformanceDashboard());
        }) as unknown as typeof fetch;
        const dashboard = document.createElement("cms-endpoint-performance");
        document.body.append(dashboard);
        await waitForEndpointState(dashboard, "unavailable");

        expect(dashboard.textContent).toContain("Endpoint performance is unavailable");
        dashboard.querySelector<HTMLButtonElement>("[data-retry]")!.click();
        await waitForEndpointState(dashboard, "ready");
        expect(calls).toBe(2);
        expect(dashboard.textContent).toContain("Aggregate operational telemetry");
    });
});
