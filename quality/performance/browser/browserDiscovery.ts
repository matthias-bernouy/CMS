import type { Page } from "playwright";
import { assertGrowth, assertMaximum, printResults } from "../benchmark";
import { browserBenchmark, type BrowserWindow } from "./browserBinding";

export async function runBrowserDiscoveryBenchmarks(page: Page): Promise<void> {
    const small = await browserBenchmark(page, "discover 100 inserted queries", () => discoverQueries(page, 100));
    const large = await browserBenchmark(page, "discover 1,000 inserted queries", () => discoverQueries(page, 1_000));
    const fanout100 = await browserBenchmark(page, "publish state to 100 consumers", () => stateFanout(page, 100));
    const fanout1000 = await browserBenchmark(page, "publish state to 1,000 consumers", () => stateFanout(page, 1_000));
    const teardown = await browserBenchmark(page, "tear down 1,000 active queries", () => teardownQueries(page, 1_000));
    printResults("Chromium dynamic discovery and state fan-out", [small, large, fanout100, fanout1000, teardown]);
    assertMaximum("1,000-query discovery p95", large.p95Ms, 4_000);
    assertMaximum("1,000-consumer state fan-out p95", fanout1000.p95Ms, 3_000);
    assertMaximum("1,000-query teardown p95", teardown.p95Ms, 3_000);
    assertGrowth("100 to 1,000 query discovery growth", small, large, 20);
    assertGrowth("100 to 1,000 state consumer growth", fanout100, fanout1000, 60);
    await reportRetainedChurn(page);
}

async function teardownQueries(page: Page, count: number): Promise<number> {
    await discoverQueries(page, count);
    return page.evaluate(async () => {
        const root = document.querySelector("cms-binding-core")!;
        const startedAt = performance.now();
        root.remove();
        await new Promise((resolve) => setTimeout(resolve, 0));
        return performance.now() - startedAt;
    });
}

async function reportRetainedChurn(page: Page): Promise<void> {
    await page.evaluate(() => document.querySelector("cms-binding-core")?.remove());
    await page.requestGC();
    const before = await page.evaluate(() => ({
        nodes: document.querySelectorAll("*").length,
        heap: (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0,
    }));
    for (let index = 0; index < 20; index += 1) {
        await discoverQueries(page, 100);
    }
    await page.evaluate(() => document.querySelector("cms-binding-core")?.remove());
    await page.requestGC();
    const after = await page.evaluate(() => ({
        nodes: document.querySelectorAll("*").length,
        heap: (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0,
    }));
    const retained = { domNodes: after.nodes - before.nodes, usedJsHeapBytes: after.heap - before.heap };
    console.log("\nRetained footprint after 20 mount/unmount cycles", retained);
    assertMaximum("retained DOM nodes after churn", retained.domNodes, 10);
    assertMaximum("retained JS heap after churn", retained.usedJsHeapBytes, 10_000_000);
}

async function discoverQueries(page: Page, count: number): Promise<number> {
    return page.evaluate(async (queryCount) => {
        document.querySelector("cms-binding-core")?.remove();
        await new Promise((resolve) => setTimeout(resolve, 0));
        const win = window as unknown as BrowserWindow;
        win.__perfResponse = { ready: true };
        const root = document.createElement("cms-binding-core");
        document.body.appendChild(root);
        await new Promise((resolve) => setTimeout(resolve, 0));
        const expectedFetches = win.__perfFetches + queryCount;
        const fragment = document.createDocumentFragment();
        for (let index = 0; index < queryCount; index += 1) {
            const query = document.createElement("section");
            query.setAttribute("cms-query", `performance:item-${index} as query${index}`);
            query.innerHTML = `<span>{{ query${index}.data.ready }}</span>`;
            fragment.appendChild(query);
        }
        const startedAt = performance.now();
        root.appendChild(fragment);
        await win.__perfWaitUntil(
            () =>
                win.__perfFetches >= expectedFetches &&
                root.querySelectorAll("span").length === queryCount &&
                Array.from(root.querySelectorAll("span")).every((element) => element.textContent === "true"),
        );
        return performance.now() - startedAt;
    }, count);
}

async function stateFanout(page: Page, count: number): Promise<number> {
    return page.evaluate(async (consumerCount) => {
        document.querySelector("cms-binding-core")?.remove();
        await new Promise((resolve) => setTimeout(resolve, 0));
        const root = document.createElement("cms-binding-core");
        root.innerHTML = `<input cms-sync="@page:perf-fanout">
            ${Array.from(
                { length: consumerCount },
                () => '<output cms-query="@page:perf-fanout as shared">{{ shared.data }}</output>',
            ).join("")}`;
        document.body.appendChild(root);
        await new Promise((resolve) => setTimeout(resolve, 0));
        const value = crypto.randomUUID();
        const input = root.querySelector("input")!;
        input.value = value;
        const startedAt = performance.now();
        input.dispatchEvent(new Event("change", { bubbles: true }));
        const win = window as unknown as BrowserWindow;
        await win.__perfWaitUntil(
            () =>
                root.querySelectorAll("output").length === consumerCount &&
                Array.from(root.querySelectorAll("output")).every((element) => element.textContent === value),
        );
        return performance.now() - startedAt;
    }, count);
}
