import { describe, test, expect, afterEach } from "bun:test";
import { Source, RELOAD_EVENT } from "../../../src/browser/binding/source/Source";
import { el, text, waitFor, settle, res, resetDom } from "../support/testUtils";

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
