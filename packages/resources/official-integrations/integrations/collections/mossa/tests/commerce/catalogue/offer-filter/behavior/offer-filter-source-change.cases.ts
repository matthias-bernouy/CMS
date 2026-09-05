import { afterEach, describe, expect, test } from "bun:test";
import { primarySchema, secondarySchema } from "../support/offer-filter-panel.fixtures";
import { defineFilter, filterTag, settleLifecycle } from "../support/offer-filter-panel.harness";

const originalUrl = `${location.pathname}${location.search}${location.hash}`;

afterEach(() => {
    history.replaceState(history.state, "", originalUrl);
    document.querySelectorAll(filterTag).forEach((element) => element.remove());
});

describe("Commerce offer filter source changes", () => {
    test("starts the new fixed-source request when the category changes during a fetch", async () => {
        await defineFilter();
        const realFetch = globalThis.fetch;
        const requests: Array<{
            url: URL;
            resolve: (response: Response) => void;
        }> = [];
        globalThis.fetch = (input) =>
            new Promise<Response>((resolve) => {
                requests.push({ url: new URL(String(input), location.origin), resolve });
            });
        history.replaceState(history.state, "", `${location.pathname}?category=catalog%2Fsource-change`);

        const panel = document.createElement(filterTag);
        panel.setAttribute("schema-driven", "");

        try {
            document.body.append(panel);
            await settleLifecycle();
            expect(requests.map(({ url }) => url.pathname)).toEqual(["/.cms/sources/commerce/offerFilterSchema"]);
            expect(requests[0]?.url.searchParams.get("category")).toBe("catalog/source-change");

            history.replaceState(history.state, "", `${location.pathname}?category=catalog%2Fsecond-source`);
            window.dispatchEvent(new PopStateEvent("popstate"));
            await settleLifecycle();
            expect(requests.map(({ url }) => url.pathname)).toEqual([
                "/.cms/sources/commerce/offerFilterSchema",
                "/.cms/sources/commerce/offerFilterSchema",
            ]);
            expect(requests[1]?.url.searchParams.get("category")).toBe("catalog/second-source");

            requests[0]!.resolve(response(primarySchema));
            requests[1]!.resolve(response(secondarySchema));
            await settleLifecycle();

            expect(panel.querySelector('[field="alternate_attribute"]')).not.toBeNull();
            expect(panel.querySelector('[field="choice_attribute"]')).toBeNull();
        } finally {
            panel.remove();
            globalThis.fetch = realFetch;
        }
    });

    test("refreshes catalogue fields after a completed panel lifecycle", async () => {
        await defineFilter();
        const realFetch = globalThis.fetch;
        let requests = 0;
        globalThis.fetch = () => Promise.resolve(response(++requests === 1 ? primarySchema : secondarySchema));
        history.replaceState(history.state, "", `${location.pathname}?category=catalog%2Ffresh-schema`);

        const first = document.createElement(filterTag);
        first.setAttribute("schema-driven", "");
        const second = document.createElement(filterTag);
        second.setAttribute("schema-driven", "");

        try {
            document.body.append(first);
            await settleLifecycle();
            expect(first.querySelector('[field="choice_attribute"]')).not.toBeNull();
            first.remove();

            document.body.append(second);
            await settleLifecycle();

            expect(requests).toBe(2);
            expect(second.querySelector('[field="alternate_attribute"]')).not.toBeNull();
            expect(second.querySelector('[field="choice_attribute"]')).toBeNull();
        } finally {
            first.remove();
            second.remove();
            globalThis.fetch = realFetch;
        }
    });
});

function response(schema: unknown): Response {
    return new Response(JSON.stringify(schema), {
        status: 200,
        headers: { "content-type": "application/json" },
    });
}
