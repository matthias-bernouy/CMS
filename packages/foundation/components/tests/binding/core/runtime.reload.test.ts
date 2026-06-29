import { describe, test, expect, afterEach } from "bun:test";
import { Source, RELOAD_EVENT } from "../../../src/binding/source/Source";
import { BindingRuntime } from "../../../src/binding/runtime/BindingRuntime";
import { PARAMS_CHANGE_EVENT } from "../../../src/binding/params";
import { el, text, waitFor, settle, res, resetDom } from "../testUtils";

afterEach(resetDom);

describe("Source — reload", () => {
    test("a named event re-fetches and re-renders; dispose stops it", async () => {
        let n = 0;
        globalThis.fetch = (async () => res(200, JSON.stringify({ n: ++n }))) as unknown as typeof fetch;

        const elt = el(`<div cms-source="/x" cms-reload-on="refresh"><p>{{ n }}</p></div>`);
        document.body.appendChild(elt);
        const src = new Source(elt);
        src.start();
        await waitFor(() => text(elt.querySelector("p")) === "1");

        document.dispatchEvent(new Event("refresh"));
        await waitFor(() => text(elt.querySelector("p")) === "2");

        src.dispose();
        document.dispatchEvent(new Event("refresh"));
        await settle();
        expect(text(elt.querySelector("p"))).toBe("2"); // no reload after dispose
    });

    test("the global reload event reloads the source", async () => {
        let n = 0;
        globalThis.fetch = (async () => res(200, JSON.stringify({ n: ++n }))) as unknown as typeof fetch;

        const elt = el(`<div cms-source="/x"><p>{{ n }}</p></div>`);
        document.body.appendChild(elt);
        const src = new Source(elt);
        src.start();
        await waitFor(() => text(elt.querySelector("p")) === "1");

        document.dispatchEvent(new Event(RELOAD_EVENT));
        await waitFor(() => text(elt.querySelector("p")) === "2");
        expect(text(elt.querySelector("p"))).toBe("2");
        src.dispose();
    });

});

describe("Source — #{param} reactivity", () => {
    test("resolves #{param} at fetch time and reloads when the param changes", async () => {
        const urls: string[] = [];
        globalThis.fetch = (async (url: string) => {
            urls.push(url);
            return res(200, JSON.stringify([{ t: url }]));
        }) as unknown as typeof fetch;

        location.href = "http://localhost/?search=foo";
        const elt = el(`<div cms-source="/api/x?q=#{search}"><span cms-repeat="."></span></div>`);
        document.body.appendChild(elt);
        const src = new Source(elt);
        src.start();
        await waitFor(() => urls.includes("/api/x?q=foo"));

        // Simulate the param changing (happy-dom reflects href) + the notify event.
        location.href = "http://localhost/?search=bar";
        document.dispatchEvent(new Event(PARAMS_CHANGE_EVENT));
        await waitFor(() => urls.includes("/api/x?q=bar"));

        expect(urls).toContain("/api/x?q=foo");
        expect(urls).toContain("/api/x?q=bar");
        src.dispose();
    });

    test("a source without #{} does NOT reload on a param change", async () => {
        let calls = 0;
        globalThis.fetch = (async () => { calls++; return res(200, "[]"); }) as unknown as typeof fetch;

        const elt = el(`<div cms-source="/api/static"><span cms-repeat="."></span></div>`);
        document.body.appendChild(elt);
        const src = new Source(elt);
        src.start();
        await waitFor(() => calls === 1);

        document.dispatchEvent(new Event(PARAMS_CHANGE_EVENT));
        await settle();
        expect(calls).toBe(1); // unchanged — not param-reactive
        src.dispose();
    });
});

describe("BindingRuntime — cms-page-state", () => {
    test("syncs input value to local state and reloads dependent sources", async () => {
        const urls: string[] = [];
        globalThis.fetch = (async (url: string) => {
            urls.push(url);
            return res(200, JSON.stringify([{ t: url }]));
        }) as unknown as typeof fetch;
        location.href = "http://localhost/?kept=1";

        const root = el(`
            <div>
                <input cms-page-state="address">
                <div cms-source="/api/x?q=@{address}"><span cms-repeat="."></span></div>
            </div>
        `);
        document.body.appendChild(root);
        const runtime = new BindingRuntime(root);
        runtime.start();
        await waitFor(() => urls.includes("/api/x?q="));

        const input = root.querySelector<HTMLInputElement>("input")!;
        input.value = "Paris";
        input.dispatchEvent(new Event("change"));

        await waitFor(() => urls.includes("/api/x?q=Paris"));
        expect(location.search).toBe("?kept=1");
        runtime.stop();
    });
});
