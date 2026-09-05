import { afterEach, describe, expect, test } from "bun:test";
import { primarySchema } from "../support/offer-filter-panel.fixtures";
import {
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

describe("Commerce filter editor and Source runtime integration", () => {
    test("preserves authored filters when the list runtime deactivates", async () => {
        await Promise.all([defineFilter(), defineList()]);
        const realFetch = globalThis.fetch;
        globalThis.fetch = (input) => {
            const url = String(input);
            const body = url.includes("offerFilterSchema")
                ? primarySchema
                : { items: [], total: 0, limit: 12, offset: 0, wholeUnitPrices: true };
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
        panel.setAttribute("source-prefix", "/editor-runtime-sources");
        const authored = document.createElement("p");
        authored.setAttribute("data-original-authored", "");
        authored.textContent = "Original";
        panel.append(authored);
        list.append(category, panel);
        const core = createBindingCore(true);
        core.append(list);

        try {
            document.body.append(core);
            await settleLifecycle();
            await settleUntil(() => panel.getAttribute("data-schema-status") === "ready");
            core.removeAttribute("cms-binding-disabled");
            const runtime = core.runtime;
            if (!runtime) {
                throw new Error("Binding runtime did not start");
            }
            await settleUntil(() => runtime.size === 1);

            runtime.deactivate();
            const restoredPanel = list.querySelector(`${filterTag}[schema-driven]`);
            restoredPanel?.setAttribute("schema-driven", "false");

            expect(restoredPanel?.querySelector("[data-original-authored]")?.textContent).toBe("Original");
        } finally {
            core.remove();
            globalThis.fetch = realFetch;
        }
    });
});
