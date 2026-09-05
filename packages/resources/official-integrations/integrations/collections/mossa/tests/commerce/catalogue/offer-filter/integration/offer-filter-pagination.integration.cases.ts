import { afterEach, describe, expect, test } from "bun:test";
import { primarySchema } from "../support/offer-filter-panel.fixtures";
import {
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

describe("Commerce dynamic filter pagination", () => {
    test("keeps a bookmarked page on a no-op params event after schema discovery", async () => {
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
            `${location.pathname}?category=catalog%2Fprimary&filter_numeric_attribute:gte=2022&page=3`,
        );

        const list = document.createElement(listTag);
        const category = document.createElement("input");
        category.setAttribute("data-commerce-param", "category");
        category.setAttribute("data-url-param", "category");
        const panel = document.createElement(filterTag);
        panel.setAttribute("schema-driven", "");
        panel.setAttribute("source-prefix", "/pagination-bookmark-sources");
        list.append(category, panel);

        try {
            document.body.append(list);
            await settleLifecycle();
            await settleUntil(() => Boolean(list.getAttribute("cms-source")));

            expect(sourceParams(list).get("offset")).toBe("24");
            expect(new URLSearchParams(location.search).get("page")).toBe("3");

            document.dispatchEvent(new Event("cms-params:change"));

            expect(sourceParams(list).get("offset")).toBe("24");
            expect(new URLSearchParams(location.search).get("page")).toBe("3");
        } finally {
            list.remove();
            globalThis.fetch = realFetch;
        }
    });
});

function sourceParams(list: Element): URLSearchParams {
    const source = list.getAttribute("cms-source") || "";
    return new URLSearchParams(source.split("?")[1]?.split(" as ")[0] || "");
}
