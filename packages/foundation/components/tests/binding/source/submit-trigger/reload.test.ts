import { afterEach, describe, expect, test } from "bun:test";
import { BindingRuntime } from "../../../../src/binding/runtime/BindingRuntime";
import { RELOAD_EVENT } from "../../../../src/binding/source/Source";
import { el, resetDom, settle, waitFor } from "../../testUtils";

afterEach(resetDom);

describe("Source — form reload isolation", () => {
    test.each(["submit", "change"])("a changed URL waits for the next %s event", async (trigger) => {
        const requests: { url: string; method: string }[] = [];
        globalThis.fetch = (async (url: string, init?: RequestInit) => {
            requests.push({ url, method: init?.method ?? "GET" });
            return new Response(JSON.stringify({ ok: true }), {
                headers: { "content-type": "application/json" },
            });
        }) as typeof fetch;
        const root = el(`<div>
            <section cms-source="/api/items"></section>
            <form cms-source="/api/items" cms-source-trigger="${trigger}" cms-source-method="POST">
                <input name="title" value="A composition">
            </form>
        </div>`);
        document.body.append(root);
        const runtime = new BindingRuntime(root);
        runtime.start();
        try {
            await waitFor(() => requests.length === 1);
            root.querySelector("section")!.setAttribute("cms-source", "/api/updated-items");
            const form = root.querySelector("form")!;
            form.setAttribute("cms-source", "/api/updated-items");
            await waitFor(() => requests.some((request) => request.url === "/api/updated-items"));
            await settle();
            expect(requests).toEqual([
                { url: "/api/items", method: "GET" },
                { url: "/api/updated-items", method: "GET" },
            ]);

            form.dispatchEvent(new Event(trigger, { bubbles: true, cancelable: true }));
            await waitFor(() => requests.length === 3);
            expect(requests[2]).toEqual({ url: "http://localhost/api/updated-items", method: "POST" });
        } finally {
            runtime.stop();
        }
    });

    test.each(["submit", "change"])("global refresh does not submit a %s-triggered form", async (trigger) => {
        const requests: { url: string; method: string; body?: BodyInit | null }[] = [];
        globalThis.fetch = (async (url: string, init?: RequestInit) => {
            requests.push({ url, method: init?.method ?? "GET", body: init?.body });
            return new Response(JSON.stringify({ ok: true }), {
                headers: { "content-type": "application/json" },
            });
        }) as typeof fetch;
        const root = el(`<div>
            <section cms-source="/api/items"></section>
            <form cms-source="/api/items" cms-source-trigger="${trigger}" cms-source-method="POST"
                cms-source-success-reset="false" cms-reload-on="items:create">
                <input name="title" value="A composition">
            </form>
        </div>`);
        document.body.append(root);
        const runtime = new BindingRuntime(root);
        runtime.start();
        try {
            await waitFor(() => requests.length === 1);
            document.dispatchEvent(new Event(RELOAD_EVENT));
            await waitFor(() => requests.filter((request) => request.method === "GET").length === 2);
            await settle();
            expect(requests.map((request) => request.method)).toEqual(["GET", "GET"]);

            const form = root.querySelector("form")!;
            form.dispatchEvent(new Event(trigger, { bubbles: true, cancelable: true }));
            await waitFor(() => requests.length === 3);
            expect(requests[2]?.method).toBe("POST");
            expect(requests[2]?.body).toBe(JSON.stringify({ title: "A composition" }));

            document.dispatchEvent(new Event(RELOAD_EVENT));
            await waitFor(() => requests.filter((request) => request.method === "GET").length === 3);
            await settle();
            expect(requests.filter((request) => request.method === "POST")).toHaveLength(1);

            document.dispatchEvent(new Event("items:create"));
            await waitFor(() => requests.filter((request) => request.method === "POST").length === 2);
        } finally {
            runtime.stop();
        }
        document.dispatchEvent(new Event("items:create"));
        document.dispatchEvent(new Event(RELOAD_EVENT));
        await settle();
        expect(requests).toHaveLength(5);
    });
});
