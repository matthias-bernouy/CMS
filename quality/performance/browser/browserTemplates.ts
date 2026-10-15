import type { Page } from "playwright";
import { assertGrowth, assertMaximum, printResults } from "../benchmark";
import { browserBenchmark, type BrowserWindow } from "./browserBinding";

export async function runBrowserTemplateBenchmarks(page: Page): Promise<void> {
    const flat = await browserBenchmark(page, "flat repeat: 1,000 rows", () => mountFlat(page));
    const nested = await browserBenchmark(page, "nested repeat: 50 x 20 rows", () => mountNested(page));
    const conditions = await browserBenchmark(page, "1,000 rows with conditions", () => mountConditions(page));
    const matches = await browserBenchmark(page, "1,000 rows with match/case", () => mountMatches(page));
    const queries4 = await browserBenchmark(page, "4 concurrent queries", () => mountQueries(page, 4));
    const queries16 = await browserBenchmark(page, "16 concurrent queries", () => mountQueries(page, 16));
    const imports4 = await browserBenchmark(page, "import 4 synchronized states", () => mountImports(page, 4));
    const imports16 = await browserBenchmark(page, "import 16 synchronized states", () => mountImports(page, 16));
    const results = [flat, nested, conditions, matches, queries4, queries16, imports4, imports16];
    printResults("Chromium binding workload shapes", results);
    assertMaximum("nested 1,000-node render p95", nested.p95Ms, 2_000);
    assertMaximum("condition-heavy render p95", conditions.p95Ms, 2_000);
    assertMaximum("match-heavy render p95", matches.p95Ms, 2_000);
    assertMaximum("16-query render p95", queries16.p95Ms, 2_000);
    assertMaximum("16-state import p95", imports16.p95Ms, 2_000);
    assertGrowth("4 to 16 query growth", queries4, queries16, 8);
    assertGrowth("4 to 16 synchronized state import growth", imports4, imports16, 8);
}

async function mountFlat(page: Page): Promise<number> {
    return mountQuery(
        page,
        rows(1_000),
        '<li data-perf-row cms-repeat="result.data as row">{{ row.label }}</li>',
        1_000,
    );
}

async function mountNested(page: Page): Promise<number> {
    const data = Array.from({ length: 50 }, (_, group) => ({
        group,
        items: Array.from({ length: 20 }, (_, item) => ({ label: `${group}-${item}` })),
    }));
    const template = `<section cms-repeat="result.data as group">
        <span data-perf-row cms-repeat="group.items as item">{{ item.label }}</span>
    </section>`;
    return mountQuery(page, data, template, 1_000);
}

async function mountConditions(page: Page): Promise<number> {
    const template = `<article cms-repeat="result.data as row">
        <span data-perf-row cms-condition="row.enabled">{{ row.label }}</span>
        <span data-perf-row cms-condition="!row.enabled">disabled</span>
    </article>`;
    return mountQuery(
        page,
        rows(1_000).map((row) => ({ ...row, enabled: row.id % 2 === 0 })),
        template,
        1_000,
    );
}

async function mountMatches(page: Page): Promise<number> {
    const template = `<article cms-repeat="result.data as row" cms-match="row.kind">
        <span data-perf-row cms-case='"first"'>{{ row.label }}</span>
        <span data-perf-row cms-case='"second"'>{{ row.label }}</span>
        <span data-perf-row cms-case='"third"'>{{ row.label }}</span>
    </article>`;
    return mountQuery(
        page,
        rows(1_000).map((row) => ({ ...row, kind: ["first", "second", "third"][row.id % 3] })),
        template,
        1_000,
    );
}

async function mountQuery(page: Page, response: unknown, template: string, expectedNodes: number): Promise<number> {
    return page.evaluate(
        async ({ data, markup, count }) => {
            document.querySelector("cms-binding-core")?.remove();
            await new Promise((resolve) => setTimeout(resolve, 0));
            const win = window as unknown as BrowserWindow;
            win.__perfResponse = data;
            const request = win.__perfFetches + 1;
            const root = document.createElement("cms-binding-core");
            root.innerHTML = `<main cms-query="performance:list as result">${markup}</main>`;
            const startedAt = performance.now();
            document.body.appendChild(root);
            await win.__perfWaitUntil(
                () => win.__perfFetches >= request && root.querySelectorAll("[data-perf-row]").length === count,
            );
            return performance.now() - startedAt;
        },
        { data: response, markup: template, count: expectedNodes },
    );
}

async function mountQueries(page: Page, count: number): Promise<number> {
    return page.evaluate(async (queryCount) => {
        document.querySelector("cms-binding-core")?.remove();
        await new Promise((resolve) => setTimeout(resolve, 0));
        const win = window as unknown as BrowserWindow;
        win.__perfResponse = [{ label: "ready" }];
        const expectedFetches = win.__perfFetches + queryCount;
        const root = document.createElement("cms-binding-core");
        root.innerHTML = Array.from(
            { length: queryCount },
            (_, index) =>
                `<section cms-query="performance:item-${index} as query${index}"><span>{{ query${index}.data.0.label }}</span></section>`,
        ).join("");
        const startedAt = performance.now();
        document.body.appendChild(root);
        await win.__perfWaitUntil(
            () =>
                win.__perfFetches >= expectedFetches &&
                root.querySelectorAll("span").length === queryCount &&
                Array.from(root.querySelectorAll("span")).every((element) => element.textContent === "ready"),
        );
        return performance.now() - startedAt;
    }, count);
}

async function mountImports(page: Page, count: number): Promise<number> {
    return page.evaluate(async (stateCount) => {
        document.querySelector("cms-binding-core")?.remove();
        await new Promise((resolve) => setTimeout(resolve, 0));
        for (let index = 0; index < stateCount; index += 1) {
            sessionStorage.setItem(
                `cms-sync:v1:session:perf-${index}`,
                JSON.stringify({ version: 1, value: { label: `State ${index}` } }),
            );
        }
        const declarations = Array.from(
            { length: stateCount },
            (_, index) => `@session:perf-${index} as state${index}`,
        ).join(" ");
        const outputs = Array.from(
            { length: stateCount },
            (_, index) => `<span>{{ state${index}.data.label }}</span>`,
        ).join("");
        const root = document.createElement("cms-binding-core");
        root.innerHTML = `<section cms-queries="${declarations}">${outputs}</section>`;
        const startedAt = performance.now();
        document.body.appendChild(root);
        const win = window as unknown as BrowserWindow;
        await win.__perfWaitUntil(
            () =>
                root.querySelectorAll("span").length === stateCount &&
                Array.from(root.querySelectorAll("span")).every(
                    (element, index) => element.textContent === `State ${index}`,
                ),
        );
        return performance.now() - startedAt;
    }, count);
}

function rows(count: number): Array<{ id: number; label: string }> {
    return Array.from({ length: count }, (_, id) => ({ id, label: `Row ${id}` }));
}
