import { afterEach, describe, expect, test } from "bun:test";
import { padelSchema, tennisSchema } from "./offer-filter-panel.fixtures";
import {
    captureSourceWrites,
    defineFilter,
    defineList,
    filterTag,
    listTag,
    settleLifecycle,
    settleUntil,
} from "./offer-filter-panel.harness";

const originalUrl = `${location.pathname}${location.search}${location.hash}`;

afterEach(() => {
    history.replaceState(history.state, "", originalUrl);
    document.querySelectorAll(`${listTag}, ${filterTag}`).forEach((element) => element.remove());
});

describe("Commerce dynamic brand filter integration", () => {
    test("loads a bookmarked brand with a single correctly filtered source", async () => {
        await Promise.all([defineFilter(), defineList()]);
        const realFetch = globalThis.fetch;
        globalThis.fetch = () =>
            Promise.resolve(
                new Response(JSON.stringify(tennisSchema), {
                    status: 200,
                    headers: { "content-type": "application/json" },
                }),
            );
        history.replaceState(history.state, "", `${location.pathname}?category=sports%2Ftennis&brand=wilson`);

        const list = document.createElement(listTag);
        const category = document.createElement("input");
        category.setAttribute("data-commerce-param", "category");
        category.setAttribute("data-url-param", "category");
        const panel = document.createElement(filterTag);
        panel.setAttribute("schema-driven", "");
        panel.setAttribute("source-prefix", "/brand-bookmark-sources");
        list.append(category, panel);
        const sources = captureSourceWrites(list);

        try {
            document.body.append(list);
            await settleLifecycle();
            await settleUntil(() => Boolean(list.getAttribute("cms-source")));

            expect(sources).toHaveLength(1);
            expect(sourceParams(sources[0]!).get("category")).toBe("sports/tennis");
            expect(sourceParams(sources[0]!).get("brand")).toBe("wilson");
        } finally {
            list.remove();
            globalThis.fetch = realFetch;
        }
    });

    test("never sends a brand from the previous taxonomy", async () => {
        await Promise.all([defineFilter(), defineList()]);
        const realFetch = globalThis.fetch;
        globalThis.fetch = (input) => {
            const url = new URL(String(input), location.origin);
            const schema = url.searchParams.get("category")?.includes("padel") ? padelSchema : tennisSchema;
            return Promise.resolve(
                new Response(JSON.stringify(schema), {
                    status: 200,
                    headers: { "content-type": "application/json" },
                }),
            );
        };
        history.replaceState(history.state, "", `${location.pathname}?category=sports%2Ftennis&brand=wilson`);

        const list = document.createElement(listTag);
        const category = document.createElement("input");
        category.setAttribute("data-commerce-param", "category");
        category.setAttribute("data-url-param", "category");
        const panel = document.createElement(filterTag);
        panel.setAttribute("schema-driven", "");
        panel.setAttribute("source-prefix", "/brand-category-sources");
        list.append(category, panel);
        const sources = captureSourceWrites(list);

        try {
            document.body.append(list);
            await settleLifecycle();
            await settleUntil(() => Boolean(list.getAttribute("cms-source")));
            const sourceStart = sources.length;

            history.replaceState(history.state, "", `${location.pathname}?category=sports%2Fpadel&brand=wilson`);
            document.dispatchEvent(new Event("cms-params:change"));
            expect(sourceParams(list.getAttribute("cms-source") || "").get("category")).toBe("sports/tennis");
            await settleLifecycle();

            expect(sourceParams(list.getAttribute("cms-source") || "").get("category")).toBe("sports/padel");
            expect(sourceParams(list.getAttribute("cms-source") || "").has("brand")).toBe(false);
            const padelSources = sources
                .slice(sourceStart)
                .filter((source) => sourceParams(source).get("category") === "sports/padel");
            expect(padelSources.length).toBeGreaterThan(0);
            expect(padelSources.every((source) => !sourceParams(source).has("brand"))).toBe(true);

            const globalSourceStart = sources.length;
            history.replaceState(history.state, "", `${location.pathname}?brand=bullpadel`);
            document.dispatchEvent(new Event("cms-params:change"));
            await settleLifecycle();

            const globalSources = sources
                .slice(globalSourceStart)
                .filter((source) => !sourceParams(source).has("category"));
            expect(globalSources.length).toBeGreaterThan(0);
            expect(globalSources.every((source) => !sourceParams(source).has("brand"))).toBe(true);
        } finally {
            list.remove();
            globalThis.fetch = realFetch;
        }
    });
});

function sourceParams(source: string): URLSearchParams {
    return new URLSearchParams(source.split("?")[1]?.split(" as ")[0] || "");
}
