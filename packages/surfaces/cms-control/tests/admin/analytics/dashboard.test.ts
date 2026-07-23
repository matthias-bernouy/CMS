import { afterEach, describe, expect, test } from "bun:test";
import "cms-control/components/admin/Layout/Analytics/AnalyticsDashboard";

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
    document.head.innerHTML = "";
    document.body.replaceChildren();
    history.replaceState(null, "", "/");
});

describe("analytics dashboards", () => {
    test("loads only the content datasets and renders safe report rows", async () => {
        document.head.innerHTML = '<meta name="basePath" content="/cms">';
        history.replaceState(null, "", "/cms/admin/analytics/content?range=30d");
        const requests: string[] = [];
        globalThis.fetch = (async (input) => {
            const url = String(input);
            requests.push(url);
            if (url.includes("top-pages")) {
                return Response.json([{ key: "/home", count: 12 }]);
            }
            if (url.includes("/flows")) {
                return Response.json([{ from: "/home", to: "/pricing", count: 4 }]);
            }
            if (url.includes("dim=device")) {
                return Response.json([{ key: "mobile", count: 7 }]);
            }
            return Response.json([{ key: "chrome", count: 9 }]);
        }) as typeof fetch;

        const dashboard = document.createElement("cms-analytics-dashboard");
        dashboard.setAttribute("view", "content");
        document.body.append(dashboard);
        await waitFor(() => dashboard.querySelector<HTMLElement>('[data-state="ready"]')?.hidden === false);

        expect(requests).toHaveLength(4);
        expect(requests.every((url) => url.startsWith("/cms/api/analytics/"))).toBe(true);
        expect(requests.every((url) => url.includes("range=30d"))).toBe(true);
        expect(dashboard.textContent).toContain("/home");
        expect(dashboard.textContent).toContain("/pricing");
        expect(dashboard.textContent).toContain("Mobile");
        expect(getComputedStyle(dashboard.querySelector('[data-state="loading"]')!).display).toBe("none");
    });

    test("keeps request health aggregated and states that raw logs are unavailable", async () => {
        globalThis.fetch = (async (input) => {
            const url = String(input);
            if (url.includes("/health")) {
                return Response.json({
                    requests: 12,
                    notFound: 1,
                    clientErrors: 1,
                    serverErrors: 1,
                    avgMs: 34,
                    maxMs: 140,
                });
            }
            return Response.json([
                { key: "200", count: 10 },
                { key: "404", count: 1 },
                { key: "500", count: 1 },
            ]);
        }) as typeof fetch;

        const dashboard = document.createElement("cms-analytics-dashboard");
        dashboard.setAttribute("view", "health");
        document.body.append(dashboard);
        await waitFor(() => dashboard.querySelector<HTMLElement>('[data-state="ready"]')?.hidden === false);

        expect(dashboard.textContent).toContain("No individual request logs");
        expect(dashboard.textContent).toContain("HTTP 500");
        expect(dashboard.querySelector('[data-role="health-rate"]')?.textContent).toContain("error rate");
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
