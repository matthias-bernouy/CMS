import { afterEach, describe, expect, test } from "bun:test";
import "cms-control/components/admin/Layout/Analytics/AnalyticsDashboard";

const realFetch = globalThis.fetch;
const report = <T>(data: T) =>
    Response.json({
        data,
        meta: {
            profile: "privacy-strict",
            window: "30d",
            from: "2026-06-01T00:00:00.000Z",
            to: "2026-07-01T00:00:00.000Z",
            lastClosedBucket: "2026-07-01T00:00:00.000Z",
            threshold: 10,
            rounding: 10,
            suppressedValueCount: 2,
            referrerSaturated: false,
            versions: {
                filter: "strict-filter-v1",
                rollup: "strict-rollup-v1",
                visitorEstimator: "hllpp-v1",
                publication: "strict-publication-v1",
            },
        },
    });

afterEach(() => {
    globalThis.fetch = realFetch;
    document.head.innerHTML = "";
    document.body.replaceChildren();
    history.replaceState(null, "", "/");
});

describe("analytics dashboards", () => {
    test("labels the daily HLL++ estimate without claiming range-unique visitors", async () => {
        globalThis.fetch = (async (input) => {
            const url = String(input);
            if (url.includes("/summary")) {
                return report({
                    views: 120,
                    uniqueVisitors: 70,
                    estimatedVisitors: 70,
                    visitorDays: 70,
                    averageDailyVisitors: 10,
                    latestCompletedDayVisitors: 20,
                    latestCompletedUtcDay: "2026-06-30T00:00:00.000Z",
                    avgMs: 40,
                    errorRate: 0,
                });
            }
            if (url.includes("/timeseries")) {
                return report([{ bucket: "2026-06-30T00:00:00.000Z", count: 120 }]);
            }
            return report([{ key: url.includes("device") ? "desktop" : "chrome", count: 120 }]);
        }) as typeof fetch;

        const dashboard = document.createElement("cms-analytics-dashboard");
        document.body.append(dashboard);
        await waitFor(() => dashboard.querySelector<HTMLElement>('[data-state="ready"]')?.hidden === false);

        expect(dashboard.textContent).toContain("Estimated visitors");
        expect(dashboard.textContent).toContain("Completed UTC day");
        expect(dashboard.textContent).toContain("Estimated visitor-days");
        expect(dashboard.textContent).not.toContain("Unique visitors");
        expect(dashboard.textContent).toContain("minimum 10");
    });

    test("loads only the content datasets and renders safe report rows", async () => {
        document.head.innerHTML = '<meta name="basePath" content="/cms">';
        history.replaceState(null, "", "/cms/admin/analytics/content?range=30d");
        const requests: string[] = [];
        globalThis.fetch = (async (input) => {
            const url = String(input);
            requests.push(url);
            if (url.includes("top-pages")) {
                return report([{ key: "page-home", count: 10 }]);
            }
            if (url.includes("/entries")) {
                return report([{ key: "page-home", count: 10 }]);
            }
            if (url.includes("/flows")) {
                return report([{ from: "page-home", to: "page-pricing", count: 10 }]);
            }
            throw new Error(`Unexpected request: ${url}`);
        }) as typeof fetch;

        const dashboard = document.createElement("cms-analytics-dashboard");
        dashboard.setAttribute("view", "content");
        document.body.append(dashboard);
        await waitFor(() => dashboard.querySelector<HTMLElement>('[data-state="ready"]')?.hidden === false);

        expect(requests).toHaveLength(3);
        expect(requests.every((url) => url.startsWith("/cms/api/analytics/"))).toBe(true);
        expect(requests.every((url) => url.includes("range=30d"))).toBe(true);
        expect(dashboard.textContent).toContain("page-home");
        expect(dashboard.textContent).toContain("page-pricing");
        expect(dashboard.textContent).toContain("Aggregate transitions, not individual journeys");
        expect(getComputedStyle(dashboard.querySelector('[data-state="loading"]')!).display).toBe("none");
    });

    test("keeps request health aggregated and states that raw logs are unavailable", async () => {
        globalThis.fetch = (async (input) => {
            const url = String(input);
            if (url.includes("/health")) {
                return report({
                    requests: 12,
                    notFound: 1,
                    clientErrors: 1,
                    serverErrors: 1,
                    avgMs: 34,
                    maxMs: 140,
                });
            }
            if (url.includes("dim=status")) {
                return report([
                    { key: "200", count: 10 },
                    { key: "404", count: 10 },
                    { key: "500", count: 10 },
                ]);
            }
            if (url.includes("dim=latency")) {
                return report([{ key: "0-100", count: 10 }]);
            }
            return report([{ key: "automation", count: 10 }]);
        }) as typeof fetch;

        const dashboard = document.createElement("cms-analytics-dashboard");
        dashboard.setAttribute("view", "health");
        document.body.append(dashboard);
        await waitFor(() => dashboard.querySelector<HTMLElement>('[data-state="ready"]')?.hidden === false);

        expect(dashboard.textContent).toContain("No individual request logs");
        expect(dashboard.textContent).toContain("HTTP 500");
        expect(dashboard.querySelector('[data-role="health-rate"]')?.textContent).toContain("error rate");
    });

    test("renders literal bounded traffic origins without marketing attribution", async () => {
        globalThis.fetch = (async () =>
            report([
                { key: "__none__", count: 30 },
                { key: "example.org", count: 20 },
                { key: "__other__", count: 10 },
            ])) as unknown as typeof fetch;
        const dashboard = document.createElement("cms-analytics-dashboard");
        dashboard.setAttribute("view", "origins");
        document.body.append(dashboard);
        await waitFor(() => dashboard.querySelector<HTMLElement>('[data-state="ready"]')?.hidden === false);

        expect(dashboard.textContent).toContain("No external referrer");
        expect(dashboard.textContent).toContain("Other external domains");
        expect(dashboard.textContent).toContain("UTM values and click identifiers are discarded");
        expect(dashboard.textContent).not.toContain("Campaign");
    });
});

async function waitFor(predicate: () => boolean, tries = 50): Promise<void> {
    for (let attempt = 0; attempt < tries; attempt += 1) {
        if (predicate()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error("Timed out waiting for analytics dashboard");
}
