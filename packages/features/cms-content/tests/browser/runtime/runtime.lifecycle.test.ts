import { afterEach, describe, expect, test } from "bun:test";
import { BindingRuntime } from "../../../src/browser/binding/runtime/BindingRuntime";
import { writeSyncValue } from "../../../src/browser/binding/state/SyncState";
import { el, resetDom, text, waitFor } from "../support/testUtils";

afterEach(resetDom);

describe("BindingRuntime — lifecycle", () => {
    test("discovers a declarative query", async () => {
        globalThis.fetch = (async () => new Response(JSON.stringify(["password"]))) as typeof fetch;
        const root = el(
            `<div><section cms-query="kernel.auth:me as methods"><p>{{ methods.data[0] }}</p></section></div>`,
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

    test("discovers mutation forms but ignores cms-mutation on non-form elements", async () => {
        const requests: string[] = [];
        globalThis.fetch = (async (input: RequestInfo | URL) => {
            requests.push(String(input));
            return new Response("{}");
        }) as typeof fetch;
        const root = el(`<div>
            <section cms-mutation="test.items:save as ignored"></section>
            <form cms-mutation="test.items:save as saved"><button>Save</button></form>
        </div>`);
        document.body.appendChild(root);
        const runtime = new BindingRuntime(root);

        runtime.start();
        expect(runtime.size).toBe(1);
        expect(requests).toEqual([]);
        root.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await waitFor(() => requests.length === 1);
        expect(requests).toEqual(["http://localhost/.cms/call/test.items/save"]);
        runtime.stop();
    });

    test("discovers a query-import-only rendering boundary", () => {
        const pages = { scope: "page", key: "test-shared-pages" } as const;
        const user = { scope: "page", key: "test-shared-user" } as const;
        writeSyncValue(pages, { count: 2 });
        writeSyncValue(user, { name: "Ada" });
        const root = el(`<div><section cms-queries="@page:test-shared-pages as pages @page:test-shared-user as user">
            <p>{{ user.data.name }}: {{ pages.data.count }}</p>
        </section></div>`);
        document.body.appendChild(root);
        const runtime = new BindingRuntime(root);

        runtime.start();
        expect(text(root.querySelector("p"))).toBe("Ada: 2");
        expect(runtime.size).toBe(1);
        runtime.stop();
        expect(text(root.querySelector("p"))).toBe("{{ user.data.name }}: {{ pages.data.count }}");
        writeSyncValue(pages, undefined);
        writeSyncValue(user, undefined);
    });
});
