import { describe, test, expect, afterEach } from "bun:test";
import { Source } from "../../../src/binding/source/Source";
import { setState } from "../../../src/binding/params";
import { el, resetDom } from "../testUtils";

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
        document.body.appendChild(src); // isConnected → the param handler runs
        const source = new Source(src);
        source.start();
        await flush();
        expect(calls).toBe(1); // initial fetch

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

    test("resolves an operator filter param on the first fetch and reloads with its changed value", async () => {
        const urls: string[] = [];
        globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
            urls.push(String(input));
            return { ok: true, status: 200, text: async () => JSON.stringify({ items: [] }) } as unknown as Response;
        }) as unknown as typeof fetch;
        const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

        history.replaceState({}, "", "/?filter_racket-weight%3Agte=280");
        const src = el(
            '<div cms-source="/offers?minimumWeight=#{filter_racket-weight:gte}"><p>{{ items.length }}</p></div>',
        );
        document.body.appendChild(src);
        const source = new Source(src);
        source.start();
        await flush();

        expect(urls).toEqual(["/offers?minimumWeight=280"]);

        history.replaceState({}, "", "/?filter_racket-weight%3Agte=305");
        document.dispatchEvent(new Event("cms-params:change"));
        await flush();

        expect(urls).toEqual(["/offers?minimumWeight=280", "/offers?minimumWeight=305"]);

        source.dispose();
        src.remove();
        history.replaceState({}, "", "/");
    });
});

describe("Source — state-reactive reload guard (URL-changed)", () => {
    test("a state change re-runs only when this source's resolved URL changed", async () => {
        let calls = 0;
        globalThis.fetch = (async () => {
            calls++;
            return { ok: true, status: 200, text: async () => JSON.stringify({ n: calls }) } as unknown as Response;
        }) as unknown as typeof fetch;
        const flush = () => new Promise((r) => setTimeout(r, 0));

        setState("address", "old", document);
        const src = el(`<div cms-source="/x?a=@{address}"><p>{{ n }}</p></div>`);
        document.body.appendChild(src);
        const source = new Source(src);
        source.start();
        await flush();
        expect(calls).toBe(1);

        setState("other", "value", document);
        await flush();
        expect(calls).toBe(1);

        setState("address", "new", document);
        await flush();
        expect(calls).toBe(2);

        source.dispose();
        src.remove();
    });
});
