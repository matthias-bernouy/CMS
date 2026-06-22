import { describe, test, expect, afterEach } from "bun:test";
import { Source } from "../../../src/binding/source/Source";
import { el, text, resetDom } from "../testUtils";

afterEach(resetDom);

describe("Source — param-reactive reload guard (URL-changed)", () => {
    test("a global cms-params:change re-runs only when THIS source's resolved URL changed", async () => {
        let calls = 0;
        globalThis.fetch = (async () => {
            calls++;
            return { ok: true, status: 200, text: async () => JSON.stringify({ n: calls }) } as unknown as Response;
        }) as unknown as typeof fetch;
        const flush = () => new Promise((r) => setTimeout(r, 0));

        history.replaceState({}, "", "/?a=1");
        const src = el(`<div cms-source="/x?a=#{a}"><p>{{ n }}</p></div>`);
        document.body.appendChild(src);          // isConnected → the param handler runs
        const source = new Source(src);
        source.start();
        await flush();
        expect(calls).toBe(1);                    // initial fetch

        // An UNRELATED param changes (a is unchanged) → same resolved URL → no refetch.
        history.replaceState({}, "", "/?a=1&b=9");
        document.dispatchEvent(new Event("cms-params:change"));
        await flush();
        expect(calls).toBe(1);

        // The referenced param changes → resolved URL differs → refetch.
        history.replaceState({}, "", "/?a=2");
        document.dispatchEvent(new Event("cms-params:change"));
        await flush();
        expect(calls).toBe(2);

        source.dispose();
        src.remove();
        history.replaceState({}, "", "/");
    });
});
