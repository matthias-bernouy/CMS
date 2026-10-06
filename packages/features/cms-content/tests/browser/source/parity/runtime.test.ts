import { afterEach, describe, expect, test } from "bun:test";
import { BindingRuntime } from "../../../../src/browser/binding/runtime/BindingRuntime";
import { el, res, resetDom, settle, text, waitFor } from "../../support/testUtils";

afterEach(resetDom);

describe("BindingRuntime — parity contract for repeated source boundaries", () => {
    test("reloading a repeated parent source replaces nested registrations without observer delivery", async () => {
        let outerCalls = 0;
        globalThis.fetch = (async (url: RequestInfo | URL) => {
            const href = String(url);
            if (href === "/outer") {
                outerCalls++;
                return res(
                    200,
                    JSON.stringify({
                        items:
                            outerCalls === 1
                                ? [{ endpoint: "/inner-a" }]
                                : [{ endpoint: "/inner-b" }, { endpoint: "/inner-c" }],
                    }),
                );
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

test("an unchanged parent refresh keeps nested source registrations and pending local edits", async () => {
    let outerCalls = 0;
    let innerCalls = 0;
    globalThis.fetch = (async (url: RequestInfo | URL) => {
        if (String(url) === "/outer") {
            outerCalls += 1;
            return res(200, JSON.stringify({ items: [{ endpoint: "/inner" }] }));
        }
        innerCalls += 1;
        return res(200, JSON.stringify({ label: "Initial" }));
    }) as unknown as typeof fetch;
    const root = el(`<main>
        <div cms-source="/outer" cms-reload-on="refresh">
            <section cms-condition="$source.loaded">
                <article cms-repeat="items as item">
                    <div cms-source="{{ item.endpoint }}"><input value="{{ label }}"><p>{{ label }}</p></div>
                </article>
            </section>
        </div>
    </main>`);
    document.body.append(root);
    const runtime = new BindingRuntime(root);
    runtime.start();
    try {
        await waitFor(() => text(root.querySelector("p")) === "Initial");
        const nested = root.querySelector("article [cms-source]")!;
        const input = nested.querySelector("input")!;
        input.value = "Draft";
        input.focus();
        input.setSelectionRange(1, 3);
        document.dispatchEvent(new Event("refresh"));
        await settle();
        expect(outerCalls).toBe(2);
        expect(innerCalls).toBe(1);
        expect(runtime.size).toBe(2);
        expect(root.querySelector("article [cms-source]") === nested).toBe(true);
        expect(nested.querySelector("input") === input).toBe(true);
        expect(input.value).toBe("Draft");
        expect(document.activeElement === input).toBe(true);
        expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3]);
    } finally {
        runtime.stop();
    }
});
