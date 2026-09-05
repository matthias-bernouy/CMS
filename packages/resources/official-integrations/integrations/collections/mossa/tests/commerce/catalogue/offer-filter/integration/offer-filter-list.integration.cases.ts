import { afterEach, describe, expect, test } from "bun:test";
import { primarySchema, secondarySchema } from "../support/offer-filter-panel.fixtures";
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

describe("Commerce filter and offer list integration", () => {
    test("never sends filters from the previous taxonomy after a category change", async () => {
        await Promise.all([defineFilter(), defineList()]);
        const realFetch = globalThis.fetch;
        globalThis.fetch = (input) => {
            const url = new URL(String(input), location.origin);
            const schema = url.searchParams.get("category")?.includes("secondary") ? secondarySchema : primarySchema;
            return Promise.resolve(
                new Response(JSON.stringify(schema), {
                    status: 200,
                    headers: { "content-type": "application/json" },
                }),
            );
        };
        history.replaceState(
            history.state,
            "",
            `${location.pathname}?category=catalog%2Fprimary&filter_numeric_attribute_min=2022`,
        );

        const list = document.createElement(listTag);
        const category = document.createElement("input");
        category.setAttribute("data-commerce-param", "category");
        category.setAttribute("data-url-param", "category");
        const panel = document.createElement(filterTag);
        panel.setAttribute("schema-driven", "");
        list.append(category, panel);
        const sources = captureSourceWrites(list);

        try {
            document.body.append(list);
            await settleLifecycle();
            await settleUntil(() => Boolean(list.getAttribute("cms-source")));
            const initialSources = sources.slice();

            expect(sourceParams(list).get("category")).toBe("catalog/primary");
            expect(JSON.parse(sourceParams(list).get("filters") || "{}")).toEqual({
                numeric_attribute: { gte: 2022 },
            });
            expect(initialSources).toHaveLength(1);
            expect(sourceParams(initialSources[0]!).has("filters")).toBe(true);
            expect(new URLSearchParams(location.search).has("filter_numeric_attribute_min")).toBe(false);
            expect(new URLSearchParams(location.search).get("filter_numeric_attribute:gte")).toBe("2022");

            const categorySourceStart = sources.length;

            history.replaceState(
                history.state,
                "",
                `${location.pathname}?category=catalog%2Fsecondary&filter_numeric_attribute:gte=2022`,
            );
            document.dispatchEvent(new Event("cms-params:change"));

            expect(sourceParams(list).get("category")).toBe("catalog/primary");
            await settleLifecycle();
            const categorySources = sources
                .slice(categorySourceStart)
                .filter((source) => source.includes("category=catalog%2Fsecondary"));

            expect(sourceParams(list).get("category")).toBe("catalog/secondary");
            expect(sourceParams(list).has("filters")).toBe(false);
            expect(new URLSearchParams(location.search).has("filter_numeric_attribute:gte")).toBe(false);
            expect(categorySources.length).toBeGreaterThan(0);
            expect(categorySources.every((source) => !sourceParams(source).has("filters"))).toBe(true);
        } finally {
            list.remove();
            globalThis.fetch = realFetch;
        }
    });

    test("keeps URL, manual controls, sliders, and source filters synchronized", async () => {
        await Promise.all([defineFilter(), defineList()]);
        const realFetch = globalThis.fetch;
        globalThis.fetch = () =>
            Promise.resolve(
                new Response(JSON.stringify(primarySchema), {
                    status: 200,
                    headers: { "content-type": "application/json" },
                }),
            );
        history.replaceState(
            history.state,
            "",
            `${location.pathname}?category=catalog%2Fprimary&filter_numeric_attribute:gte=2022`,
        );

        const list = document.createElement(listTag);
        const category = document.createElement("input");
        category.setAttribute("data-commerce-param", "category");
        category.setAttribute("data-url-param", "category");
        const panel = document.createElement(filterTag);
        panel.setAttribute("schema-driven", "");
        panel.setAttribute("source-prefix", "/param-sync-sources");
        const core = createBindingCore();
        core.append(panel);
        list.append(category, core);

        try {
            document.body.append(list);
            await settleLifecycle();
            await settleUntil(() => Boolean(list.getAttribute("cms-source")));
            const range = panel.querySelector("[data-numeric-range]")!;
            const minimumSlider = range.querySelector('[data-range-slider="minimum"]') as HTMLInputElement;
            const minimumControl = range.querySelector('[data-range-control="minimum"]') as HTMLInputElement;
            document.dispatchEvent(new Event("cms-params:change"));
            await settleLifecycle();

            expect(minimumControl.value).toBe("2022");
            expect(JSON.parse(sourceParams(list).get("filters") || "{}")).toEqual({
                numeric_attribute: { gte: 2022 },
            });

            minimumSlider.value = "2023";
            minimumSlider.dispatchEvent(new Event("input", { bubbles: true }));
            minimumSlider.dispatchEvent(new Event("change", { bubbles: true }));

            expect(new URLSearchParams(location.search).get("filter_numeric_attribute:gte")).toBe("2023");
            expect(minimumControl.value).toBe("2023");
            expect(JSON.parse(sourceParams(list).get("filters") || "{}")).toEqual({
                numeric_attribute: { gte: 2023 },
            });

            minimumSlider.value = "2020";
            minimumSlider.dispatchEvent(new Event("input", { bubbles: true }));
            minimumSlider.dispatchEvent(new Event("change", { bubbles: true }));

            expect(new URLSearchParams(location.search).has("filter_numeric_attribute:gte")).toBe(false);
            expect(sourceParams(list).has("filters")).toBe(false);
        } finally {
            list.remove();
            globalThis.fetch = realFetch;
        }
    });
});

function sourceParams(source: Element | string): URLSearchParams {
    const value = typeof source === "string" ? source : source.getAttribute("cms-source") || "";
    const query = value.split("?")[1]?.split(" as ")[0] || "";
    return new URLSearchParams(query);
}
