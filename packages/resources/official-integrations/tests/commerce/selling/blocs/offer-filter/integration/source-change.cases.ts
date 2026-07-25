import { afterEach, describe, expect, test } from "bun:test";
import { padelSchema, tennisSchema } from "../panel/fixtures";
import { defineFilter, filterTag, settleLifecycle } from "../panel/harness";

const originalUrl = `${location.pathname}${location.search}${location.hash}`;

afterEach(() => {
    history.replaceState(history.state, "", originalUrl);
    document.querySelectorAll(filterTag).forEach((element) => element.remove());
});

describe("Commerce offer filter source changes", () => {
    test("starts the new source request when configuration changes during a fetch", async () => {
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
        history.replaceState(history.state, "", `${location.pathname}?category=sports%2Fsource-change`);

        const panel = document.createElement(filterTag);
        panel.setAttribute("schema-driven", "");
        panel.setAttribute("source-prefix", "/source-change-sources");
        panel.setAttribute("source-id", "first-source");

        try {
            document.body.append(panel);
            await settleLifecycle();
            expect(requests.map(({ url }) => url.pathname)).toEqual([
                "/source-change-sources/first-source/offerFilterSchema",
            ]);

            panel.setAttribute("source-id", "second-source");
            await settleLifecycle();
            expect(requests.map(({ url }) => url.pathname)).toEqual([
                "/source-change-sources/first-source/offerFilterSchema",
                "/source-change-sources/second-source/offerFilterSchema",
            ]);

            requests[0]!.resolve(response(tennisSchema));
            requests[1]!.resolve(response(padelSchema));
            await settleLifecycle();

            expect(panel.querySelector('[field="shape"]')).not.toBeNull();
            expect(panel.querySelector('[field="string_pattern"]')).toBeNull();
        } finally {
            panel.remove();
            globalThis.fetch = realFetch;
        }
    });

    test("refreshes catalogue fields after a completed panel lifecycle", async () => {
        await defineFilter();
        const realFetch = globalThis.fetch;
        let requests = 0;
        globalThis.fetch = () => Promise.resolve(response(++requests === 1 ? tennisSchema : padelSchema));
        history.replaceState(history.state, "", `${location.pathname}?category=sports%2Ffresh-schema`);

        const first = document.createElement(filterTag);
        first.setAttribute("schema-driven", "");
        first.setAttribute("source-prefix", "/schema-freshness-sources");
        const second = document.createElement(filterTag);
        second.setAttribute("schema-driven", "");
        second.setAttribute("source-prefix", "/schema-freshness-sources");

        try {
            document.body.append(first);
            await settleLifecycle();
            expect(first.querySelector('[field="string_pattern"]')).not.toBeNull();
            first.remove();

            document.body.append(second);
            await settleLifecycle();

            expect(requests).toBe(2);
            expect(second.querySelector('[field="shape"]')).not.toBeNull();
            expect(second.querySelector('[field="string_pattern"]')).toBeNull();
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
