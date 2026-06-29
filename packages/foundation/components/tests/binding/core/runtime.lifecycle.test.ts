import { describe, test, expect, afterEach } from "bun:test";
import { BindingRuntime } from "../../../src/binding/runtime/BindingRuntime";
import { clearRuntimeStamps } from "../../../src/binding/source/Source";
import { el, text, waitFor, settle, res, routes, resetDom } from "../testUtils";

afterEach(resetDom);

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

    test("deactivate() restores authored <template> wrappers and source-state conditions for save", async () => {
        routes({ "/x": () => res(200, JSON.stringify({ name: "Ada" })) });
        const root = el(`
            <div>
                <div cms-source="/x">
                    <template><my-card>{{ name }}</my-card></template>
                    <p cms-condition="$source.empty">Nothing</p>
                    <p cms-condition="$source.error">Failed</p>
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
        expect(text(src.querySelector('[cms-condition="$source.empty"]'))).toBe("Nothing");
        expect(text(src.querySelector('[cms-condition="$source.error"]'))).toBe("Failed");
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
