import { describe, test, expect, afterEach } from "bun:test";
import { Source } from "../../../src/binding/source/Source";
import { BindingRuntime } from "../../../src/binding/runtime/BindingRuntime";
import { el, text, res, resetDom, waitFor } from "../testUtils";

afterEach(resetDom);

function deferredResponse(status: number, body: string) {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    globalThis.fetch = (async () => {
        await gate;
        return res(status, body);
    }) as unknown as typeof fetch;
    return release;
}

function responseSequence(payloads: { status: number; body: string }[]): void {
    let i = 0;
    globalThis.fetch = (async () => {
        const payload = payloads[Math.min(i, payloads.length - 1)]!;
        i++;
        return res(payload.status, payload.body);
    }) as unknown as typeof fetch;
}

describe("Source — source status conditions", () => {
    test("renders loading and then loaded conditions from $source", async () => {
        const release = deferredResponse(200, JSON.stringify({ name: "Ada" }));
        const src = el(`
            <section cms-source="/x">
                <p class="loading" cms-condition="$source.loading">Loading</p>
                <p class="loaded" cms-condition="$source.loaded">Hello {{ name }}</p>
                <p class="empty" cms-condition="$source.empty">Empty</p>
                <p class="error" cms-condition="$source.error">Error</p>
            </section>
        `);

        const promise = new Source(src).run();
        expect(text(src.querySelector(".loading"))).toBe("Loading");
        expect(src.querySelector(".loaded")).toBeNull();

        release();
        await promise;

        expect(src.querySelector(".loading")).toBeNull();
        expect(text(src.querySelector(".loaded"))).toBe("Hello Ada");
        expect(src.querySelector(".empty")).toBeNull();
        expect(src.querySelector(".error")).toBeNull();
    });

    test("renders empty and error conditions without using slots", async () => {
        responseSequence([
            { status: 200, body: JSON.stringify([]) },
            { status: 500, body: "" },
        ]);
        const src = el(`
            <section cms-source="/x">
                <p class="empty" cms-condition="$source.empty">No rows</p>
                <p class="error" cms-condition="$source.error">Failed {{ $source.status }}</p>
            </section>
        `);
        const source = new Source(src);

        await source.run();
        expect(text(src.querySelector(".empty"))).toBe("No rows");
        expect(src.querySelector(".error")).toBeNull();

        await source.run();
        expect(src.querySelector(".empty")).toBeNull();
        expect(text(src.querySelector(".error"))).toBe("Failed 500");
    });

    test("updates source status conditions without replacing stable loaded nodes", async () => {
        responseSequence([
            { status: 200, body: JSON.stringify({ name: "Ada" }) },
            { status: 200, body: JSON.stringify({ name: "Grace" }) },
        ]);
        const src = el(`
            <section cms-source="/x">
                <p cms-condition="$source.loaded">Hello {{ name }}</p>
                <input name="email" cms-condition="$source.loaded">
            </section>
        `);
        const source = new Source(src);

        await source.run();
        const paragraph = src.querySelector("p")!;
        const input = src.querySelector("input")!;
        input.setAttribute("data-live", "kept");

        await source.run();

        expect(src.querySelector("p")).toBe(paragraph);
        expect(src.querySelector("input")).toBe(input);
        expect(src.querySelector("input")!.getAttribute("data-live")).toBe("kept");
        expect(text(src.querySelector("p"))).toBe("Hello Grace");
    });

    test("explicit source status conditions can target an outer nested source", async () => {
        globalThis.fetch = (async (url: string) => {
            if (url === "/outer") return res(200, JSON.stringify({ innerUrl: "/inner" }));
            if (url === "/inner") return res(200, JSON.stringify({ name: "Nested" }));
            return res(404, "");
        }) as unknown as typeof fetch;
        const root = el(`
            <div>
                <section cms-source="/outer" cms-source-id="outer">
                    <section cms-source="{{ innerUrl }}" cms-source-id="inner">
                        <p class="outer-loaded" cms-condition="$sources.outer.loaded">Outer {{ $sources.outer.loaded }}</p>
                        <p class="inner-loaded" cms-condition="$sources.inner.loaded">Inner {{ name }}</p>
                    </section>
                </section>
            </div>
        `);
        document.body.append(root);
        const runtime = new BindingRuntime(root);
        runtime.start();

        await waitFor(() => text(root.querySelector(".inner-loaded")) === "Inner Nested");

        expect(text(root.querySelector(".outer-loaded"))).toBe("Outer true");
        runtime.stop();
    });

    test("source status conditions support multiple selected statuses", async () => {
        responseSequence([
            { status: 200, body: JSON.stringify([]) },
            { status: 500, body: "" },
        ]);
        const src = el(`
            <section cms-source="/x" cms-source-id="plans">
                <p class="fallback" cms-condition="$sources.plans.empty || $sources.plans.error">Fallback</p>
            </section>
        `);
        const source = new Source(src);

        await source.run();
        expect(text(src.querySelector(".fallback"))).toBe("Fallback");

        await source.run();
        expect(text(src.querySelector(".fallback"))).toBe("Fallback");
    });
});
