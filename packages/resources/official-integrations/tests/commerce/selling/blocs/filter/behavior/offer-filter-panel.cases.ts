import { afterEach, describe, expect, test } from "bun:test";
import { padelSchema, tennisSchema } from "../support/offer-filter-panel.fixtures";
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
            const schema = url.searchParams.get("category")?.includes("padel") ? padelSchema : tennisSchema;
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
            `${location.pathname}?category=sports%2Ftennis&filter_string_pattern=16x18&brand=wilson`,
        );

        const panel = document.createElement(filterTag) as HTMLElement & { managedParams(): string[] };
        panel.setAttribute("schema-driven", "");
        panel.setAttribute("source-prefix", "/panel-options-sources");
        try {
            document.body.append(panel);
            await settleLifecycle();

            expect(requests).toHaveLength(1);
            expect(requests[0]!.searchParams.get("category")).toBe("sports/tennis");
            expect(panel.querySelector('[field="grip_size"]')).toBeNull();
            expect(panel.querySelector('[field="string_pattern"]')).not.toBeNull();
            expect(panel.querySelector('[field="model_year"][operator="gte"]')).not.toBeNull();
            expect(panel.querySelector('[field="model_year"][operator="lte"]')).not.toBeNull();
            expect(
                [...panel.querySelectorAll('[name="filter_string_pattern"] basic-option')].map((item) =>
                    item.getAttribute("value"),
                ),
            ).toEqual(["", "16x19", "16x18"]);
            expect([...panel.querySelectorAll('[name="brand"] basic-option')].map((item) => item.textContent)).toEqual([
                "Toutes les marques",
                "Wilson",
                "Head",
            ]);
            expect(panel.querySelectorAll("select")).toHaveLength(0);
            expect(panel.querySelector('[name="brand"]')?.tagName).toBe("BASIC-SELECT");
            expect(panel.querySelector('[name="brand"]')?.getAttribute("accent-color")).toBe("var(--secondary-base)");

            const range = panel.querySelector("[data-numeric-range]")!;
            await exerciseNumericRange(range, settleLifecycle);

            document.dispatchEvent(new Event("cms-params:change"));
            await settleLifecycle();
            expect(requests).toHaveLength(1);

            history.replaceState(
                history.state,
                "",
                `${location.pathname}?category=sports%2Fpadel&filter_string_pattern=16x18&brand=wilson`,
            );
            document.dispatchEvent(new Event("cms-params:change"));
            await settleLifecycle();

            expect(requests).toHaveLength(2);
            expect(new URLSearchParams(location.search).has("filter_string_pattern")).toBe(false);
            expect(new URLSearchParams(location.search).has("brand")).toBe(false);
            expect(panel.querySelector('[field="shape"]')).not.toBeNull();
            expect(panel.querySelector('[field="string_pattern"]')).toBeNull();
            expect(panel.managedParams()).toContain("filter_shape");
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
        history.replaceState(history.state, "", `${location.pathname}?category=sports%2Freconnect`);

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
                new Response(JSON.stringify(tennisSchema), {
                    status: 200,
                    headers: { "content-type": "application/json" },
                }),
            );
            await settleLifecycle();

            expect(second.querySelector('[field="string_pattern"]')).not.toBeNull();
            expect(requests).toHaveLength(1);
        } finally {
            first.remove();
            second.remove();
            globalThis.fetch = realFetch;
        }
    });
});
