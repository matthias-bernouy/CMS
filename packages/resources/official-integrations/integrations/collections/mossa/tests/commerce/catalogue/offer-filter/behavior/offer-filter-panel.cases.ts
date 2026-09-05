import { afterEach, describe, expect, test } from "bun:test";
import { primarySchema, secondarySchema } from "../support/offer-filter-panel.fixtures";
import { defineFilter, filterTag, settleLifecycle } from "../support/offer-filter-panel.harness";
import { exerciseNumericRange } from "../support/offer-filter-range.assertions";

const originalUrl = `${location.pathname}${location.search}${location.hash}`;

afterEach(() => {
    history.replaceState(history.state, "", originalUrl);
    document.querySelectorAll(filterTag).forEach((element) => element.remove());
});

describe("Commerce schema-driven offer filters", () => {
    test("renders schema options, resets incompatible category filters, and deduplicates schema reads", async () => {
        await defineFilter();
        const realFetch = globalThis.fetch;
        const requests: URL[] = [];
        globalThis.fetch = (input) => {
            const url = new URL(String(input), location.origin);
            requests.push(url);
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
            `${location.pathname}?category=catalog%2Fprimary&filter_choice_attribute=beta&brand=brand-a`,
        );

        const panel = document.createElement(filterTag) as HTMLElement & { managedParams(): string[] };
        panel.setAttribute("schema-driven", "");
        panel.setAttribute("source-prefix", "/panel-options-sources");
        try {
            document.body.append(panel);
            await settleLifecycle();

            expect(requests).toHaveLength(1);
            expect(requests[0]!.searchParams.get("category")).toBe("catalog/primary");
            expect(panel.querySelector('[field="hidden_attribute"]')).toBeNull();
            expect(panel.querySelector('[field="choice_attribute"]')).not.toBeNull();
            expect(panel.querySelector('[field="numeric_attribute"][operator="gte"]')).not.toBeNull();
            expect(panel.querySelector('[field="numeric_attribute"][operator="lte"]')).not.toBeNull();
            expect(
                [...panel.querySelectorAll('[name="filter_choice_attribute"] mossa-option')].map((item) =>
                    item.getAttribute("value"),
                ),
            ).toEqual(["", "alpha", "beta"]);
            expect([...panel.querySelectorAll('[name="brand"] mossa-option')].map((item) => item.textContent)).toEqual([
                "All brands",
                "Brand A",
                "Brand B",
            ]);
            expect(panel.querySelectorAll("select")).toHaveLength(0);
            expect(panel.querySelector('[name="brand"]')?.tagName).toBe("MOSSA-SELECT");
            expect(panel.querySelector('[name="brand"]')?.getAttribute("accent-color")).toBeNull();

            const range = panel.querySelector("[data-numeric-range]")!;
            await exerciseNumericRange(range, settleLifecycle);

            document.dispatchEvent(new Event("cms-params:change"));
            await settleLifecycle();
            expect(requests).toHaveLength(1);

            history.replaceState(
                history.state,
                "",
                `${location.pathname}?category=catalog%2Fsecondary&filter_choice_attribute=beta&brand=brand-a`,
            );
            document.dispatchEvent(new Event("cms-params:change"));
            await settleLifecycle();

            expect(requests).toHaveLength(2);
            expect(new URLSearchParams(location.search).has("filter_choice_attribute")).toBe(false);
            expect(new URLSearchParams(location.search).has("brand")).toBe(false);
            expect(panel.querySelector('[field="alternate_attribute"]')).not.toBeNull();
            expect(panel.querySelector('[field="choice_attribute"]')).toBeNull();
            expect(panel.managedParams()).toContain("filter_alternate_attribute");
        } finally {
            panel.remove();
            globalThis.fetch = realFetch;
        }
    });

    test("shares an initial schema read when the renderer reconnects the panel", async () => {
        await defineFilter();
        const realFetch = globalThis.fetch;
        const requests: URL[] = [];
        let completeRequest: ((response: Response) => void) | undefined;
        globalThis.fetch = (input) => {
            requests.push(new URL(String(input), location.origin));
            return new Promise<Response>((resolve) => {
                completeRequest = resolve;
            });
        };
        history.replaceState(history.state, "", `${location.pathname}?category=catalog%2Freconnect`);

        const first = document.createElement(filterTag);
        first.setAttribute("schema-driven", "");
        first.setAttribute("source-prefix", "/reconnect-sources");
        const second = document.createElement(filterTag);
        second.setAttribute("schema-driven", "");
        second.setAttribute("source-prefix", "/reconnect-sources");
        try {
            document.body.append(first);
            await settleLifecycle();
            expect(requests).toHaveLength(1);

            first.remove();
            document.body.append(second);
            await settleLifecycle();
            expect(requests).toHaveLength(1);

            completeRequest?.(
                new Response(JSON.stringify(primarySchema), {
                    status: 200,
                    headers: { "content-type": "application/json" },
                }),
            );
            await settleLifecycle();

            expect(second.querySelector('[field="choice_attribute"]')).not.toBeNull();
            expect(requests).toHaveLength(1);
        } finally {
            first.remove();
            second.remove();
            globalThis.fetch = realFetch;
        }
    });
});
