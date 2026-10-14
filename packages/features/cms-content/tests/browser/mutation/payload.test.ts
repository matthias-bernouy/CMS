import { afterEach, describe, expect, test } from "bun:test";
import { BindingRuntime } from "../../../src/browser/binding/runtime/BindingRuntime";
import { writeSyncValue } from "../../../src/browser/binding/state/SyncState";
import { el, resetDom, settle, waitFor } from "../support/testUtils";

afterEach(resetDom);

describe("Form mutation payload", () => {
    test("resolves cms-mutation-input fields without inheriting page query parameters", async () => {
        let request: { url: string; init?: RequestInit } | null = null;
        globalThis.fetch = (async (url: string, init?: RequestInit) => {
            request = { url, init };
            return Response.json({ ok: true });
        }) as typeof fetch;
        location.href = "http://localhost/?site-return-to=%2Fdashboard";
        writeSyncValue({ scope: "page", key: "site-auth-token" }, "abc123");
        const input = JSON.stringify({
            returnTo: { from: "state", key: "@param:site-return-to" },
            token: { from: "state", key: "@page:site-auth-token" },
            remember: { from: "literal", value: true },
        });
        const root = el(`
            <form cms-mutation="accounts:login as session" cms-mutation-reset="false" cms-mutation-input='${input}'>
                <input name="email" value="ada@example.com">
            </form>
        `) as HTMLFormElement;
        document.body.append(root);
        const runtime = new BindingRuntime(root);
        runtime.start();

        root.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await waitFor(() => request !== null);

        const captured = request as unknown as { url: string; init?: RequestInit };
        expect(captured.url).toBe("http://localhost/.cms/call/accounts/login");
        expect(JSON.parse(String(captured.init?.body))).toEqual({
            email: "ada@example.com",
            returnTo: "/dashboard",
            token: "abc123",
            remember: true,
        });
        runtime.stop();
    });

    test("does not send a required synchronized input before it exists", async () => {
        let calls = 0;
        globalThis.fetch = (async () => {
            calls += 1;
            return Response.json({});
        }) as typeof fetch;
        const root = el(`
            <form cms-mutation="accounts:login as session"
                cms-mutation-input='{"token":{"from":"state","key":"@page:site-missing-token"}}'>
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
});
