import { afterEach, describe, expect, test } from "bun:test";
import { writeSyncValue } from "../../../../src/browser/binding/params/SyncState";
import { BindingRuntime } from "../../../../src/browser/binding/runtime/BindingRuntime";
import { el, resetDom, settle, text, waitFor } from "../../support/testUtils";

afterEach(resetDom);

describe("Source — submit payload and publication", () => {
    test("form-owned submit resolves cms-source-body fields", async () => {
        let request: { url: string; init?: RequestInit } | null = null;
        globalThis.fetch = (async (url: string, init?: RequestInit) => {
            request = { url, init };
            return new Response(JSON.stringify({ ok: true }), {
                headers: { "content-type": "application/json" },
            });
        }) as typeof fetch;
        location.href = "http://localhost/?site-return-to=%2Fdashboard";
        writeSyncValue({ scope: "page", key: "site-auth-token" }, "abc123");
        const body = JSON.stringify({
            email: { from: "literal", value: "bound@example.com" },
            returnTo: { from: "state", key: "@param:site-return-to" },
            token: { from: "state", key: "@page:site-auth-token" },
            remember: { from: "literal", value: true },
        });

        const root = el(`
            <form cms-source="/api/login as result" cms-source-trigger="submit" cms-source-method="POST" cms-source-success-reset="false" cms-source-body='${body}'>
                <input name="email" value="ada@example.com">
                <button type="submit">Login</button>
            </form>
        `) as HTMLFormElement;
        document.body.append(root);
        const runtime = new BindingRuntime(root);
        runtime.start();
        await settle();

        root.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await waitFor(() => request !== null);

        const captured = request as unknown as { url: string; init?: RequestInit };
        expect(captured.url).toBe("http://localhost/api/login?site-return-to=%2Fdashboard");
        expect(captured.init?.body).toBe(
            JSON.stringify({
                email: "ada@example.com",
                returnTo: "/dashboard",
                token: "abc123",
                remember: true,
            }),
        );
        runtime.stop();
    });

    test("form-owned GET submit appends form values and does not reset by default", async () => {
        let url = "";
        globalThis.fetch = (async (nextUrl: string) => {
            url = nextUrl;
            return new Response(JSON.stringify({ ok: true }), {
                headers: { "content-type": "application/json" },
            });
        }) as typeof fetch;

        const root = el(`
            <form cms-source="/api/search?kind=public as result" cms-source-trigger="submit" cms-source-method="GET">
                <input name="q" value="plans">
                <button type="submit">Search</button>
            </form>
        `) as HTMLFormElement;
        document.body.append(root);
        const runtime = new BindingRuntime(root);
        runtime.start();
        await settle();

        root.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await waitFor(() => url !== "");

        expect(url).toBe("http://localhost/api/search?kind=public&q=plans");
        expect(root.querySelector<HTMLInputElement>("[name=q]")!.value).toBe("plans");
        runtime.stop();
    });

    test("form-owned submit does not send a required state input before it exists", async () => {
        let calls = 0;
        globalThis.fetch = (async () => {
            calls += 1;
            return new Response("{}", { headers: { "content-type": "application/json" } });
        }) as typeof fetch;
        const root = el(`
            <form cms-source="/api/login as result" cms-source-trigger="submit" cms-source-method="POST"
                cms-source-body='{"token":{"from":"state","key":"@page:site-missing-token"}}'>
                <button type="submit">Login</button>
            </form>
        `) as HTMLFormElement;
        document.body.append(root);
        const runtime = new BindingRuntime(root);
        runtime.start();

        root.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await settle();

        expect(calls).toBe(0);
        runtime.stop();
    });

    test("form-owned submit publishes binding reload channels", async () => {
        let calls = 0;
        const urls: string[] = [];
        globalThis.fetch = (async (url: string) => {
            calls++;
            urls.push(url);
            return new Response(JSON.stringify({ calls }), {
                headers: { "content-type": "application/json" },
            });
        }) as typeof fetch;

        const root = el(`
            <div>
                <form cms-source="/api/create as result" cms-source-trigger="submit" cms-source-publish="items:changed">
                    <input name="title" value="Hello">
                    <button type="submit">Save</button>
                </form>
                <section cms-source="/api/items" cms-reload-on="items:changed"><p>{{ calls }}</p></section>
            </div>
        `);
        document.body.append(root);
        const runtime = new BindingRuntime(root);
        runtime.start();
        await waitFor(() => text(root.querySelector("section p")) === "1");

        root.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await waitFor(() => text(root.querySelector("section p")) === "3");

        expect(urls).toEqual(["/api/items", "http://localhost/api/create", "/api/items"]);
        runtime.stop();
    });
});
