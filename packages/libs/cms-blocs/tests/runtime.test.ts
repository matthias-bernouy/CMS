import { describe, test, expect, afterEach } from "bun:test";
import { Source, RELOAD_EVENT } from "../src/binding/source";
import { BindingRuntime } from "../src/binding/runtime";
import { PARAMS_CHANGE_EVENT } from "../src/binding/params";

const realFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = realFetch;
    document.body.replaceChildren();
    location.href = "http://localhost/";
});

function el(html: string): HTMLElement {
    const host = document.createElement("div");
    host.innerHTML = html.trim();
    return host.firstElementChild as HTMLElement;
}
const text = (e: Element | null) => (e?.textContent ?? "").replace(/\s+/g, " ").trim();

/** Poll a predicate across macrotasks until true (or give up). Deterministic
 *  regardless of how many async hops the binding chain takes. */
async function waitFor(predicate: () => boolean, tries = 50): Promise<void> {
    for (let i = 0; i < tries; i++) {
        if (predicate()) return;
        await new Promise((r) => setTimeout(r, 0));
    }
}
/** Settle pending async work (for asserting that something does NOT change). */
async function settle(rounds = 8): Promise<void> {
    for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 0));
}

function res(status: number, body: string) {
    return { ok: status >= 200 && status < 300, status, text: async () => body } as unknown as Response;
}
function routes(map: Record<string, () => Response>) {
    globalThis.fetch = (async (url: string) => (map[url] ?? (() => res(404, "")))()) as unknown as typeof fetch;
}

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

describe("BindingRuntime — discovery", () => {
    test("start() activates a top-level source", async () => {
        routes({ "/x": () => res(200, JSON.stringify({ name: "Ada" })) });
        const root = el(`<div><div cms-source="/x"><p>{{ name }}</p></div></div>`);
        document.body.appendChild(root);
        const rt = new BindingRuntime(root);
        rt.start();
        await waitFor(() => text(root.querySelector("p")) === "Ada");
        expect(rt.size).toBe(1);
        rt.stop();
    });

    test("a nested source is activated by the observer after its parent renders", async () => {
        routes({
            "/outer": () => res(200, JSON.stringify({ inner: "/inner-1" })),
            "/inner-1": () => res(200, JSON.stringify({ msg: "hello" })),
        });
        const root = el(`
            <div>
                <div cms-source="/outer">
                    <div cms-source="{{ inner }}"><p class="leaf">{{ msg }}</p></div>
                </div>
            </div>
        `);
        document.body.appendChild(root);
        const rt = new BindingRuntime(root);
        rt.start();
        await waitFor(() => text(root.querySelector(".leaf")) === "hello");
        expect(rt.size).toBe(2); // outer + inner
        rt.stop();
    });
});

describe("BindingRuntime — no leak on reload", () => {
    test("reloading a parent disposes the old nested source and registers the fresh one", async () => {
        let innerCalls = 0;
        routes({
            "/outer": () => res(200, JSON.stringify({ inner: "/inner-1" })),
            "/inner-1": () => res(200, JSON.stringify({ msg: `hi-${++innerCalls}` })),
        });
        const root = el(`
            <div>
                <div cms-source="/outer" cms-reload-on="refresh">
                    <div cms-source="{{ inner }}"><p class="leaf">{{ msg }}</p></div>
                </div>
            </div>
        `);
        document.body.appendChild(root);
        const rt = new BindingRuntime(root);
        rt.start();
        await waitFor(() => text(root.querySelector(".leaf")) === "hi-1");
        expect(rt.size).toBe(2);

        // Reload the parent: it re-renders, dropping the old nested subtree and
        // stamping a fresh one (which fetches again → "hi-2"). Once settled the
        // count must be back to 2 — no orphaned source from the old subtree.
        document.dispatchEvent(new Event("refresh"));
        await waitFor(() => text(root.querySelector(".leaf")) === "hi-2");
        expect(rt.size).toBe(2);
        rt.stop();
    });

    test("stop() disposes every source", async () => {
        routes({ "/x": () => res(200, JSON.stringify({ name: "Ada" })) });
        const root = el(`<div><div cms-source="/x"><p>{{ name }}</p></div></div>`);
        document.body.appendChild(root);
        const rt = new BindingRuntime(root);
        rt.start();
        await waitFor(() => rt.size === 1);
        rt.stop();
        expect(rt.size).toBe(0);
    });
});
