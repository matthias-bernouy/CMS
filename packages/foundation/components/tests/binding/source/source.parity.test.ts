import { describe, test, expect, afterEach } from "bun:test";
import { Source } from "../../../src/binding/source/Source";
import { BindingRuntime } from "../../../src/binding/runtime/BindingRuntime";
import { el, text, waitFor, settle, res, resetDom } from "../testUtils";

afterEach(resetDom);

function jsonSequence(payloads: unknown[]): void {
    let i = 0;
    globalThis.fetch = (async () => {
        const payload = payloads[Math.min(i, payloads.length - 1)];
        i++;
        return res(200, JSON.stringify(payload));
    }) as unknown as typeof fetch;
}

function responseSequence(payloads: { status: number; body: string }[]): void {
    let i = 0;
    globalThis.fetch = (async () => {
        const payload = payloads[Math.min(i, payloads.length - 1)]!;
        i++;
        return res(payload.status, payload.body);
    }) as unknown as typeof fetch;
}

function deferredJson(payload: unknown): () => void {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    globalThis.fetch = (async () => {
        await gate;
        return res(200, JSON.stringify(payload));
    }) as unknown as typeof fetch;
    return release;
}

describe("Source — parity contract for authored template restore", () => {
    test("renderTemplate() restores structural directives, raw HTML placeholders, and source-state conditions", async () => {
        jsonSequence([{ items: [{ name: "Ada", visible: true }], html: "<b>Trusted</b>" }]);
        const src = el(`
            <section cms-source="/x">
                <ul>
                    <li cms-repeat="items as item" cms-condition="item.visible">{{ item.name }}</li>
                </ul>
                <raw-html>{{ html | innerHTML }}</raw-html>
                <p cms-condition="$source.empty">No rows</p>
            </section>
        `);
        const source = new Source(src);

        await source.run();
        expect(src.querySelector("[cms-repeat]")).toBeNull();
        expect(src.querySelector("raw-html")).toBeNull();
        expect(text(src.querySelector("li"))).toBe("Ada");
        expect(text(src.querySelector("b"))).toBe("Trusted");

        source.renderTemplate();

        const repeated = src.querySelector("[cms-repeat]")!;
        expect(repeated.getAttribute("cms-repeat")).toBe("items as item");
        expect(repeated.getAttribute("cms-condition")).toBe("item.visible");
        expect(text(repeated)).toBe("{{ item.name }}");
        expect(text(src.querySelector("raw-html"))).toBe("{{ html | innerHTML }}");
        expect(text(src.querySelector('[cms-condition="$source.empty"]'))).toBe("No rows");
    });
});

describe("Source — parity contract for body re-renders", () => {
    test("cms-condition can disappear and reappear across source runs", async () => {
        jsonSequence([
            { visible: false, name: "Hidden" },
            { visible: true, name: "Ada" },
            { visible: false, name: "Gone" },
        ]);
        const src = el(`<div cms-source="/x"><p cms-condition="visible">Hello {{ name }}</p></div>`);
        const source = new Source(src);

        await source.run();
        expect(src.querySelector("p")).toBeNull();

        await source.run();
        expect(text(src.querySelector("p"))).toBe("Hello Ada");

        await source.run();
        expect(src.querySelector("p")).toBeNull();
    });

    test("raw HTML placeholders are restamped from the pristine body on each run", async () => {
        jsonSequence([
            { html: "<b>First</b>" },
            { html: "<i>Second</i>" },
            { html: "" },
        ]);
        const src = el(`
            <section cms-source="/x">
                <div class="html"><raw-html>{{ html | innerHTML }}</raw-html></div>
            </section>
        `);
        const source = new Source(src);

        await source.run();
        expect(src.querySelector("raw-html")).toBeNull();
        expect(text(src.querySelector("b"))).toBe("First");

        await source.run();
        expect(src.querySelector("b")).toBeNull();
        expect(text(src.querySelector("i"))).toBe("Second");

        await source.run();
        expect(src.querySelector("raw-html")).toBeNull();
        expect(src.querySelector(".html")!.children.length).toBe(0);
    });

    test("cms-repeat restamps nested repeats, empty arrays, and non-arrays across runs", async () => {
        jsonSequence([
            { groups: [{ title: "A", tags: ["x", "y"] }, { title: "B", tags: ["z"] }] },
            { groups: [{ title: "C", tags: [] }] },
            { groups: [] },
            { groups: "not-an-array" },
        ]);
        const src = el(`
            <div cms-source="/x">
                <section cms-repeat="groups as group">
                    <h3>{{ group.title }}</h3>
                    <span cms-repeat="group.tags as tag">{{ tag }}</span>
                </section>
            </div>
        `);
        const source = new Source(src);

        await source.run();
        expect(Array.from(src.querySelectorAll("h3")).map(text)).toEqual(["A", "B"]);
        expect(Array.from(src.querySelectorAll("span")).map(text)).toEqual(["x", "y", "z"]);

        await source.run();
        expect(Array.from(src.querySelectorAll("h3")).map(text)).toEqual(["C"]);
        expect(src.querySelectorAll("span").length).toBe(0);

        await source.run();
        expect(src.querySelectorAll("section").length).toBe(0);

        const warn = console.warn;
        const warnings: unknown[][] = [];
        console.warn = (...args: unknown[]) => { warnings.push(args); };
        try {
            await source.run();
        } finally {
            console.warn = warn;
        }
        expect(src.querySelectorAll("section").length).toBe(0);
        expect(String(warnings[0]?.[0] ?? "")).toContain('cms-repeat="groups" expected an array');
    });
});

describe("Source — parity contract for status/body transitions", () => {
    test("success, empty condition, error condition, and success can alternate on one source", async () => {
        responseSequence([
            { status: 200, body: JSON.stringify({ name: "Ada" }) },
            { status: 200, body: JSON.stringify([]) },
            { status: 200, body: JSON.stringify({ name: "Grace" }) },
            { status: 500, body: "failed" },
            { status: 200, body: JSON.stringify({ name: "Lin" }) },
        ]);
        const src = el(`
            <div cms-source="/x">
                <p class="data" cms-condition="$source.loaded">{{ name }}</p>
                <p cms-condition="$source.empty" class="empty">No rows</p>
                <p cms-condition="$source.error" class="error">Failed: {{ status }}</p>
            </div>
        `);
        const source = new Source(src);

        await source.run();
        expect(text(src.querySelector(".data"))).toBe("Ada");

        await source.run();
        expect(src.querySelector(".data")).toBeNull();
        expect(text(src.querySelector(".empty"))).toBe("No rows");

        await source.run();
        expect(src.querySelector(".empty")).toBeNull();
        expect(text(src.querySelector(".data"))).toBe("Grace");

        await source.run();
        expect(src.querySelector(".data")).toBeNull();
        expect(text(src.querySelector(".error"))).toBe("Failed: 500");

        await source.run();
        expect(src.querySelector(".error")).toBeNull();
        expect(text(src.querySelector(".data"))).toBe("Lin");
    });

    test("loading condition can replace an already-rendered body and then return to body", async () => {
        jsonSequence([{ name: "Ada" }]);
        const src = el(`
            <div cms-source="/x">
                <p class="data" cms-condition="$source.loaded">{{ name }}</p>
                <p cms-condition="$source.loading" class="loading">Loading</p>
            </div>
        `);
        const source = new Source(src);

        await source.run();
        expect(text(src.querySelector(".data"))).toBe("Ada");

        const release = deferredJson({ name: "Grace" });
        const pending = source.run();
        expect(src.querySelector(".data")).toBeNull();
        expect(text(src.querySelector(".loading"))).toBe("Loading");

        release();
        await pending;
        expect(src.querySelector(".loading")).toBeNull();
        expect(text(src.querySelector(".data"))).toBe("Grace");
    });
});

describe("BindingRuntime — parity contract for repeated source boundaries", () => {
    test("reloading a repeated parent source replaces nested registrations without observer delivery", async () => {
        let outerCalls = 0;
        globalThis.fetch = (async (url: RequestInfo | URL) => {
            const href = String(url);
            if (href === "/outer") {
                outerCalls++;
                return res(200, JSON.stringify({
                    items: outerCalls === 1
                        ? [{ endpoint: "/inner-a" }]
                        : [{ endpoint: "/inner-b" }, { endpoint: "/inner-c" }],
                }));
            }
            const labels: Record<string, string> = {
                "/inner-a": "A",
                "/inner-b": "B",
                "/inner-c": "C",
            };
            return res(200, JSON.stringify({ label: labels[href] ?? "?" }));
        }) as unknown as typeof fetch;
        const root = el(`
            <div>
                <div cms-source="/outer" cms-reload-on="refresh">
                    <section cms-repeat="items as item">
                        <div cms-source="{{ item.endpoint }}">
                            <p class="leaf">{{ label }}</p>
                        </div>
                    </section>
                </div>
            </div>
        `);
        document.body.appendChild(root);
        const runtime = new BindingRuntime(root);

        runtime.start();
        await waitFor(() => text(root.querySelector(".leaf")) === "A");
        expect(runtime.size).toBe(2);

        // Source-owned renders must reconcile immediately even if mutation delivery is delayed or missed.
        (runtime as unknown as { observer: MutationObserver | null }).observer?.disconnect();
        document.dispatchEvent(new Event("refresh"));
        await waitFor(() => Array.from(root.querySelectorAll(".leaf")).map(text).join(",") === "B,C");
        await settle();

        expect(Array.from(root.querySelectorAll(".leaf")).map(text)).toEqual(["B", "C"]);
        expect(runtime.size).toBe(3);
        runtime.stop();
    });
});
