import { afterEach, describe, expect, test } from "bun:test";
import { BindingRuntime } from "../../../src/browser/binding/runtime/BindingRuntime";
import { el, resetDom, text, waitFor } from "../support/testUtils";

afterEach(resetDom);

describe("BindingRuntime — lifecycle", () => {
    test("discovers a declarative query", async () => {
        globalThis.fetch = (async () => new Response(JSON.stringify(["password"]))) as typeof fetch;
        const root = el(
            `<div><section cms-query="kernel.auth:methods as methods"><p>{{ methods.data[0] }}</p></section></div>`,
        );
        document.body.appendChild(root);
        const runtime = new BindingRuntime(root);

        runtime.start();
        await waitFor(() => text(root.querySelector("p")) === "password");
        expect(runtime.size).toBe(1);
        runtime.stop();
        expect(runtime.size).toBe(0);
        expect(text(root.querySelector("p"))).toBe("{{ methods.data[0] }}");
    });

    test("discovers forms but ignores cms-source on non-form elements", async () => {
        const requests: string[] = [];
        globalThis.fetch = (async (input: RequestInfo | URL) => {
            requests.push(String(input));
            return new Response("{}");
        }) as typeof fetch;
        const root = el(`<div>
            <section cms-source="/old-read-source"></section>
            <form cms-source="/save" cms-source-trigger="submit"><button>Save</button></form>
        </div>`);
        document.body.appendChild(root);
        const runtime = new BindingRuntime(root);

        runtime.start();
        expect(runtime.size).toBe(1);
        expect(requests).toEqual([]);
        root.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await waitFor(() => requests.length === 1);
        expect(requests).toEqual(["http://localhost/save"]);
        runtime.stop();
    });
});
