import { describe, test, expect, afterEach } from "bun:test";
import { BindingRuntime } from "../../../src/binding/runtime/BindingRuntime";
import { el, text, waitFor, settle, res, routes, resetDom } from "../testUtils";

afterEach(resetDom);

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
            "/outer": () => res(200, JSON.stringify([{ v: "o" }])),
            "/walled": () => {
                walledFetches++;
                return res(200, JSON.stringify([{ v: "w" }]));
            },
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
        expect(rt.size).toBe(1); // only /outer — the walled source is never registered
        expect(walledFetches).toBe(0); // and never executed → stays an inert template
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
        const outer = new BindingRuntime(root); // chrome-like outer runtime
        outer.start();
        const inner = new BindingRuntime(root.querySelector("cms-binding-core")!); // the core's OWN runtime
        inner.start();
        await waitFor(() => inner.size === 1);
        await settle();
        expect(outer.size).toBe(0); // outer ignores everything behind bind-stop
        expect(inner.size).toBe(1); // but the core's OWN runtime is unaffected by bind-stop above it
        outer.stop();
        inner.stop();
    });

    test("a source injected into a [cms-bind-stop] region after start is ignored by the observer", async () => {
        let walledFetches = 0;
        routes({
            "/walled": () => {
                walledFetches++;
                return res(200, "[]");
            },
        });
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
