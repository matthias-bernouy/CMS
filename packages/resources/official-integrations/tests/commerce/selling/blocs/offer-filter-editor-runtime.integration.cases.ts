import { afterEach, describe, expect, test } from "bun:test";
import { BindingRuntime } from "../../../../../../foundation/components/src/binding/runtime/BindingRuntime";
import { tennisSchema } from "./offer-filter-panel.fixtures";
import {
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

describe("Commerce filter editor and Source runtime integration", () => {
    test("preserves authored filters when the list runtime deactivates", async () => {
        await Promise.all([defineFilter(), defineList()]);
        const realFetch = globalThis.fetch;
        globalThis.fetch = (input) => {
            const url = String(input);
            const body = url.includes("offerFilterSchema")
                ? tennisSchema
                : { items: [], total: 0, limit: 12, offset: 0, wholeUnitPrices: true };
            return Promise.resolve(
                new Response(JSON.stringify(body), {
                    status: 200,
                    headers: { "content-type": "application/json" },
                }),
            );
        };
        history.replaceState(history.state, "", `${location.pathname}?category=sports%2Ftennis`);

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
        const runtime = new BindingRuntime(list);
        runtime.start();

        try {
            document.body.append(list);
            await settleLifecycle();
            await settleUntil(() => runtime.size === 1);

            runtime.deactivate();
            const restoredPanel = list.querySelector(`${filterTag}[schema-driven]`);
            restoredPanel?.setAttribute("schema-driven", "false");

            expect(restoredPanel?.querySelector("[data-original-authored]")?.textContent).toBe("Original");
        } finally {
            runtime.stop();
            list.remove();
            globalThis.fetch = realFetch;
        }
    });
});
