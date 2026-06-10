import { describe, test, expect, afterEach } from "bun:test";
import { Source, RELOAD_EVENT, clearRuntimeStamps } from "../src/binding/source";
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

describe("BindingRuntime — nested core isolation", () => {
    test("the outer runtime ignores sources inside a nested <cms-binding-core>", async () => {
        routes({
            "/outer": () => res(200, JSON.stringify([{ v: "o" }])),
            "/inner": () => res(200, JSON.stringify([{ v: "i" }])),
        });
        const root = el(`
            <div>
                <div cms-source="/outer"><span cms-repeat="."></span></div>
                <cms-binding-core>
                    <div cms-source="/inner"><span cms-repeat="."></span></div>
                </cms-binding-core>
            </div>
        `);
        document.body.appendChild(root);
        const rt = new BindingRuntime(root);
        rt.start();
        await waitFor(() => rt.size >= 1);
        await settle();
        expect(rt.size).toBe(1); // only /outer — the nested core owns /inner
        rt.stop();
    });
});

describe("BindingRuntime — cms-bind-stop boundary", () => {
    test("the runtime never registers OR fetches sources inside a [cms-bind-stop] region", async () => {
        let walledFetches = 0;
        routes({
            "/outer":  () => res(200, JSON.stringify([{ v: "o" }])),
            "/walled": () => { walledFetches++; return res(200, JSON.stringify([{ v: "w" }])); },
        });
        const root = el(`
            <div>
                <div cms-source="/outer"><span cms-repeat="."></span></div>
                <div cms-bind-stop>
                    <div cms-source="/walled"><span cms-repeat="."></span></div>
                </div>
            </div>
        `);
        document.body.appendChild(root);
        const rt = new BindingRuntime(root);
        rt.start();
        await waitFor(() => rt.size >= 1);
        await settle();
        expect(rt.size).toBe(1);        // only /outer — the walled source is never registered
        expect(walledFetches).toBe(0);  // and never executed → stays an inert template
        rt.stop();
    });

    test("sources inside a [cms-bind-stop] region are revealed as inert editable templates", async () => {
        routes({ "/walled": () => res(200, JSON.stringify([{ v: "w" }])) });
        const root = el(`
            <div>
                <div cms-bind-stop>
                    <div cms-source="/walled"><p>{{ v }}</p></div>
                </div>
            </div>
        `);
        document.body.appendChild(root);
        const walled = root.querySelector("[cms-source]")!;
        const rt = new BindingRuntime(root);

        rt.start();
        await settle();

        expect(rt.size).toBe(0);
        expect(walled.hasAttribute("cms-ready")).toBe(true);
        expect(text(walled.querySelector("p"))).toBe("{{ v }}");
        rt.stop();
    });

    test("a nested <cms-binding-core>'s OWN runtime still drives its sources inside a [cms-bind-stop] region", async () => {
        routes({ "/inner": () => res(200, JSON.stringify([{ v: "i" }])) });
        const root = el(`
            <div>
                <div cms-bind-stop>
                    <cms-binding-core>
                        <div cms-source="/inner"><span cms-repeat="."></span></div>
                    </cms-binding-core>
                </div>
            </div>
        `);
        document.body.appendChild(root);
        const outer = new BindingRuntime(root);                          // chrome-like outer runtime
        outer.start();
        const inner = new BindingRuntime(root.querySelector("cms-binding-core")!); // the core's OWN runtime
        inner.start();
        await waitFor(() => inner.size === 1);
        await settle();
        expect(outer.size).toBe(0);  // outer ignores everything behind bind-stop
        expect(inner.size).toBe(1);  // but the core's OWN runtime is unaffected by bind-stop above it
        outer.stop();
        inner.stop();
    });

    test("a source injected into a [cms-bind-stop] region after start is ignored by the observer", async () => {
        let walledFetches = 0;
        routes({ "/walled": () => { walledFetches++; return res(200, "[]"); } });
        const root = el(`<div><div cms-bind-stop></div></div>`);
        document.body.appendChild(root);
        const rt = new BindingRuntime(root);
        rt.start();
        await settle();

        // Mirror the editor's inner-html injection: add a cms-source under the boundary.
        root.querySelector("[cms-bind-stop]")!.innerHTML = `<div cms-source="/walled"></div>`;
        await settle();
        expect(rt.size).toBe(0);
        expect(walledFetches).toBe(0);
        rt.stop();
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

describe("BindingRuntime — deactivate / resume (editor pause)", () => {
    test("deactivate() reverts to the raw template + reveals it; a fresh runtime re-renders", async () => {
        routes({ "/x": () => res(200, JSON.stringify({ name: "Ada" })) });
        const root = el(`<div><div cms-source="/x"><p>{{ name }}</p></div></div>`);
        document.body.appendChild(root);
        const src = root.querySelector("[cms-source]")!;

        const rt = new BindingRuntime(root);
        rt.start();
        await waitFor(() => text(root.querySelector("p")) === "Ada");   // live render

        rt.deactivate();
        await settle();
        expect(text(root.querySelector("p"))).toBe("{{ name }}");        // authored template restored
        expect(src.hasAttribute("cms-ready")).toBe(true);                // revealed — cloak won't hide it
        expect(rt.size).toBe(0);                                         // torn down
        expect(rt.isStopped).toBe(true);                                 // single-use

        // Resume = a FRESH runtime (the editor's startRuntime): re-discovers the
        // restored template and renders it with data again.
        const rt2 = new BindingRuntime(root);
        rt2.start();
        await waitFor(() => text(root.querySelector("p")) === "Ada");
        expect(rt2.size).toBe(1);
        rt2.stop();
    });

    test("deactivate() restores authored <template> wrappers and state slots for save", async () => {
        routes({ "/x": () => res(200, JSON.stringify({ name: "Ada" })) });
        const root = el(`
            <div>
                <div cms-source="/x">
                    <template><my-card>{{ name }}</my-card></template>
                    <p cms-slot="empty">Nothing</p>
                    <p cms-slot="error">Failed</p>
                </div>
            </div>
        `);
        document.body.appendChild(root);
        const rt = new BindingRuntime(root);

        rt.start();
        await waitFor(() => text(root.querySelector("my-card")) === "Ada");
        rt.deactivate();

        const src = root.querySelector("[cms-source]")!;
        const template = src.querySelector("template") as HTMLTemplateElement | null;
        expect(template).not.toBeNull();
        expect(text(template!.content.querySelector("my-card"))).toBe("{{ name }}");
        expect(text(src.querySelector('[cms-slot="empty"]'))).toBe("Nothing");
        expect(text(src.querySelector('[cms-slot="error"]'))).toBe("Failed");
        expect(src.innerHTML).toContain("<template>");
    });
});

describe("clearRuntimeStamps", () => {
    test("removes cms-ready from root + subtree, leaving authored directives intact", () => {
        const root = el(`<div cms-ready><div cms-source="/x" cms-ready><span cms-repeat="items">{{ name }}</span></div></div>`);
        clearRuntimeStamps(root);
        expect(root.hasAttribute("cms-ready")).toBe(false);
        const src = root.querySelector("[cms-source]")!;
        expect(src.hasAttribute("cms-ready")).toBe(false);
        // authored binding directives must NOT be touched
        expect(src.getAttribute("cms-source")).toBe("/x");
        expect(root.querySelector("[cms-repeat]")).not.toBeNull();
        expect(root.innerHTML).toContain("{{ name }}");
    });
});
