import { afterEach, describe, expect, test } from "bun:test";
import { BindingRuntime } from "../../../../src/binding/runtime/BindingRuntime";
import { el, res, resetDom, settle, text, waitFor } from "../../testUtils";

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
