import { chromium, type Page } from "playwright";
import { assertGrowth, assertMaximum, type BenchmarkResult, printResults, sampleCount } from "../benchmark";
import { BINDING_CORE, memoryMetrics, reportBundleSize, reportMemory } from "./browserMetrics";

export type BrowserWindow = Window & {
    __perfFetches: number;
    __perfRequests: Array<{ method: string; url: string; body: string | null }>;
    __perfResponse: unknown;
    __perfRows: Array<{ id: number; label: string }>;
    __perfWaitUntil: (predicate: () => boolean) => Promise<void>;
};

export async function runBrowserBindingBenchmarks(): Promise<void> {
    const browser = await chromium.launch({ headless: true, args: ["--enable-precise-memory-info"] });
    try {
        const page = await browser.newPage();
        await preparePage(page);
        const baselineMemory = await memoryMetrics(page);
        const small = await browserBenchmark(page, "initial render: 100 rows", () => mountBindingRows(page, 100));
        const large = await browserBenchmark(page, "initial render: 1,000 rows", () => mountBindingRows(page, 1_000));
        await mountBindingRows(page, 1_000);
        const stable = await browserBenchmark(page, "refresh: 1,000 unchanged rows", () => refresh(page, false));
        const changed = await browserBenchmark(page, "refresh: one of 1,000 rows changed", () => refresh(page, true));
        const results = [small, large, stable, changed];
        printResults("Chromium binding runtime", results);
        assertMaximum("1,000-row initial binding render p95", large.p95Ms, 2_000);
        assertGrowth("100 to 1,000 row binding growth", small, large, 20);
        assertMaximum("unchanged 1,000-row refresh p95", stable.p95Ms, 1_000);
        assertMaximum("single-change 1,000-row refresh p95", changed.p95Ms, 1_000);
        await reportBundleSize();
        await reportMemory(page, baselineMemory);
    } finally {
        await browser.close();
    }
}

export async function preparePage(page: Page): Promise<void> {
    await page.route("http://127.0.0.1/", (route) =>
        route.fulfill({
            contentType: "text/html",
            body: "<!doctype html><html lang='en'><body></body></html>",
        }),
    );
    await page.goto("http://127.0.0.1/");
    await page.evaluate(() => {
        const win = window as unknown as BrowserWindow;
        win.__perfFetches = 0;
        win.__perfRequests = [];
        win.__perfResponse = undefined;
        win.__perfRows = [];
        win.__perfWaitUntil = async (predicate) => {
            const deadline = performance.now() + 10_000;
            while (!predicate()) {
                if (performance.now() > deadline) {
                    throw new Error("Browser performance workload timed out");
                }
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        };
        Object.defineProperty(window, "fetch", {
            configurable: true,
            value: async (input: RequestInfo | URL, init?: RequestInit) => {
                win.__perfFetches += 1;
                win.__perfRequests.push({
                    method: init?.method ?? "GET",
                    url: String(input),
                    body: typeof init?.body === "string" ? init.body : null,
                });
                return new Response(JSON.stringify(win.__perfResponse ?? win.__perfRows), {
                    status: 200,
                    headers: {
                        "content-type": "application/json",
                        "x-ulvia-request-id": String(win.__perfFetches),
                    },
                });
            },
        });
    });
    await page.addScriptTag({ content: await Bun.file(BINDING_CORE).text() });
}

export async function mountBindingRows(page: Page, count: number): Promise<number> {
    return page.evaluate(async (rowCount) => {
        for (const root of document.querySelectorAll("cms-binding-core")) {
            root.remove();
        }
        const win = window as unknown as BrowserWindow;
        win.__perfRows = Array.from({ length: rowCount }, (_, id) => ({
            id,
            label: `Row ${id}${id === rowCount - 1 ? " v0" : ""}`,
        }));
        const expectedRequestId = String(win.__perfFetches + 1);
        const root = document.createElement("cms-binding-core");
        root.innerHTML = `<section cms-query="performance:list as result" cms-query-refresh="reconnect">
            <ul cms-condition="result.hasData" data-request-id="{{ result.outcome.requestId }}">
                <li cms-repeat="result.data as row" data-id="{{ row.id }}">{{ row.label }}</li>
            </ul>
        </section>`;
        const startedAt = performance.now();
        document.body.appendChild(root);
        const deadline = performance.now() + 5_000;
        while (
            root.querySelectorAll("li").length !== rowCount ||
            root.querySelector("ul")?.getAttribute("data-request-id") !== expectedRequestId
        ) {
            if (performance.now() > deadline) {
                throw new Error("Binding benchmark timed out");
            }
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
        return performance.now() - startedAt;
    }, count);
}

async function refresh(page: Page, changeLast: boolean): Promise<number> {
    return page.evaluate(async (change) => {
        const win = window as unknown as BrowserWindow;
        const version = change ? win.__perfFetches : 0;
        win.__perfRows = Array.from({ length: 1_000 }, (_, id) => ({
            id,
            label: `Row ${id}${id === 999 ? ` v${version}` : ""}`,
        }));
        const expectedFetches = win.__perfFetches + 1;
        const startedAt = performance.now();
        window.dispatchEvent(new Event("online"));
        const deadline = performance.now() + 5_000;
        while (
            win.__perfFetches !== expectedFetches ||
            document.querySelector("ul")?.getAttribute("data-request-id") !== String(expectedFetches) ||
            (change && document.querySelector("li:last-child")?.textContent !== `Row 999 v${version}`)
        ) {
            if (performance.now() > deadline) {
                throw new Error("Binding refresh benchmark timed out");
            }
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
        return performance.now() - startedAt;
    }, changeLast);
}

export async function browserBenchmark(
    page: Page,
    name: string,
    operation: () => Promise<number>,
): Promise<BenchmarkResult> {
    try {
        for (let index = 0; index < 3; index += 1) {
            await operation();
        }
        const samples = [];
        for (let index = 0; index < sampleCount(); index += 1) {
            samples.push(await operation());
        }
        const sorted = samples.toSorted((left, right) => left - right);
        const percentile = (ratio: number) =>
            sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)]!;
        return {
            name,
            samples,
            medianMs: percentile(0.5),
            p95Ms: percentile(0.95),
            minMs: sorted[0]!,
            maxMs: sorted.at(-1)!,
        };
    } catch (error) {
        throw new Error(`Browser benchmark failed: ${name}`, { cause: error });
    }
}
