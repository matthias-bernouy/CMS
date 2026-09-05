import { afterEach, describe, expect, test } from "bun:test";
import { primarySchema } from "../support/offer-filter-panel.fixtures";
import {
    captureSourceWrites,
    createBindingCore,
    defineFilter,
    defineList,
    filterTag,
    listTag,
    settleLifecycle,
    settleUntil,
} from "../support/offer-filter-panel.harness";

const originalUrl = `${location.pathname}${location.search}${location.hash}`;

afterEach(() => {
    history.replaceState(history.state, "", originalUrl);
    document.querySelectorAll(`${listTag}, ${filterTag}`).forEach((element) => element.remove());
});

describe("Commerce numeric range bookmark integration", () => {
    test("normalizes a bookmark before publishing the first offer source", async () => {
        await Promise.all([defineFilter(), defineList()]);
        const realFetch = globalThis.fetch;
        const schemaRequests: URL[] = [];
        const offerRequests: URL[] = [];
        globalThis.fetch = (input) => {
            const url = new URL(String(input), location.origin);
            let body: unknown;
            if (url.pathname.endsWith("/offerFilterSchema")) {
                schemaRequests.push(url);
                body = primarySchema;
            } else if (url.pathname.endsWith("/offers")) {
                offerRequests.push(url);
                body = { items: [], total: 0, limit: 12, offset: 0, wholeUnitPrices: true };
            } else {
                return Promise.resolve(new Response(null, { status: 404 }));
            }
            return Promise.resolve(
                new Response(JSON.stringify(body), {
                    status: 200,
                    headers: { "content-type": "application/json" },
                }),
            );
        };
        history.replaceState(
            history.state,
            "",
            `${location.pathname}?category=catalog%2Fprimary&filter_numeric_attribute_min=9999`,
        );

        const list = document.createElement(listTag);
        const category = document.createElement("input");
        category.setAttribute("data-commerce-param", "category");
        category.setAttribute("data-url-param", "category");
        const panel = document.createElement(filterTag);
        panel.setAttribute("schema-driven", "");
        panel.setAttribute("source-prefix", "/range-bookmark-sources");
        list.append(category, panel);
        const sources = captureSourceWrites(list);
        const core = createBindingCore(true);
        core.append(list);

        try {
            document.body.append(core);
            await settleLifecycle();
            await settleUntil(() => sources.length > 0);

            expect(schemaRequests).toHaveLength(1);
            expect(offerRequests).toHaveLength(0);
            expect(sources).toHaveLength(1);
            expect(new URLSearchParams(location.search).get("filter_numeric_attribute:gte")).toBe("2024");
            expect(JSON.parse(sourceParams(sources[0]!).get("filters") || "{}")).toEqual({
                numeric_attribute: { gte: 2024 },
            });

            core.removeAttribute("cms-binding-disabled");
            await settleUntil(() => offerRequests.length > 0);

            expect(offerRequests).toHaveLength(1);
            expect(JSON.parse(offerRequests[0]!.searchParams.get("filters") || "{}")).toEqual({
                numeric_attribute: { gte: 2024 },
            });
        } finally {
            core.remove();
            globalThis.fetch = realFetch;
        }
    });

    test("never publishes or fetches an invalid external range value during params or popstate synchronization", async () => {
        await Promise.all([defineFilter(), defineList()]);
        const realFetch = globalThis.fetch;
        const offerRequests: URL[] = [];
        globalThis.fetch = (input) => {
            const url = new URL(String(input), location.origin);
            let body: unknown = primarySchema;
            if (url.pathname.endsWith("/offers")) {
                offerRequests.push(url);
                body = { items: [], total: 0, limit: 12, offset: 0, wholeUnitPrices: true };
            }
            return Promise.resolve(
                new Response(JSON.stringify(body), {
                    status: 200,
                    headers: { "content-type": "application/json" },
                }),
            );
        };
        history.replaceState(history.state, "", `${location.pathname}?category=catalog%2Fprimary`);

        const list = document.createElement(listTag);
        const category = document.createElement("input");
        category.setAttribute("data-commerce-param", "category");
        category.setAttribute("data-url-param", "category");
        const panel = document.createElement(filterTag);
        panel.setAttribute("schema-driven", "");
        panel.setAttribute("source-prefix", "/external-range-sources");
        list.append(category, panel);
        const root = document.createElement("div");
        root.append(list);
        const sources = captureSourceWrites(list);
        const core = createBindingCore();
        core.append(root);

        try {
            document.body.append(core);
            await settleUntil(() => offerRequests.length > 0);
            await settleUntil(() => list.querySelector(filterTag)?.getAttribute("data-schema-status") === "ready");

            const cmsSourceStart = sources.length;
            const cmsRequestStart = offerRequests.length;
            history.replaceState(
                history.state,
                "",
                `${location.pathname}?category=catalog%2Fprimary&filter_numeric_attribute%3Agte=9999`,
            );
            document.dispatchEvent(new Event("cms-params:change"));
            await settleUntil(() => rangeMinimum(list) === 2024);
            document.dispatchEvent(new Event("cms-source:reload"));
            await settleUntil(() => offerRequests.length > cmsRequestStart);

            const cmsSources = sources.slice(cmsSourceStart);
            const cmsRequests = offerRequests.slice(cmsRequestStart);
            expect(cmsSources.length).toBeGreaterThan(0);
            expect(cmsSources.map(rangeMinimum)).toEqual(cmsSources.map(() => 2024));
            expect(cmsRequests.map(requestRangeMinimum)).toEqual(cmsRequests.map(() => 2024));

            history.replaceState(
                history.state,
                "",
                `${location.pathname}?category=catalog%2Fprimary&filter_numeric_attribute%3Agte=2023`,
            );
            document.dispatchEvent(new Event("cms-params:change"));
            await settleUntil(() => rangeMinimum(list) === 2023);
            document.dispatchEvent(new Event("cms-source:reload"));
            await settleUntil(() => requestRangeMinimum(offerRequests[offerRequests.length - 1]!) === 2023);

            const popstateSourceStart = sources.length;
            const popstateRequestStart = offerRequests.length;
            history.replaceState(
                history.state,
                "",
                `${location.pathname}?category=catalog%2Fprimary&filter_numeric_attribute%3Agte=9999`,
            );
            window.dispatchEvent(new Event("popstate"));
            await settleUntil(() => rangeMinimum(list) === 2024);
            document.dispatchEvent(new Event("cms-source:reload"));
            await settleUntil(() => offerRequests.length > popstateRequestStart);

            const popstateSources = sources.slice(popstateSourceStart);
            const popstateRequests = offerRequests.slice(popstateRequestStart);
            expect(popstateSources.length).toBeGreaterThan(0);
            expect(popstateSources.map(rangeMinimum)).toEqual(popstateSources.map(() => 2024));
            expect(popstateRequests.map(requestRangeMinimum)).toEqual(popstateRequests.map(() => 2024));
        } finally {
            core.remove();
            globalThis.fetch = realFetch;
        }
    });
});

function sourceParams(source: string): URLSearchParams {
    return new URLSearchParams(source.split("?")[1]?.split(" as ")[0] || "");
}

function rangeMinimum(source: Element | string): number | undefined {
    const value = typeof source === "string" ? source : source.getAttribute("cms-source") || "";
    return JSON.parse(sourceParams(value).get("filters") || "{}").numeric_attribute?.gte;
}

function requestRangeMinimum(request: URL): number | undefined {
    return JSON.parse(request.searchParams.get("filters") || "{}").numeric_attribute?.gte;
}
