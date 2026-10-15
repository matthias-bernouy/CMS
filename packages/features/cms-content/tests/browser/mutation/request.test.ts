import { afterEach, describe, expect, test } from "bun:test";
import { mutationFormRequest, MutationFormError } from "../../../src/browser/index";
import { BindingRuntime } from "../../../src/browser/binding/runtime/BindingRuntime";
import { el, resetDom, settle, text, waitFor } from "../support/testUtils";

afterEach(resetDom);

describe("Form mutation — submit request", () => {
    test("submits a logical mutation through the canonical Gateway route", async () => {
        let request: { url: string; init?: RequestInit } | null = null;
        location.href = "http://localhost/";
        globalThis.fetch = (async (url: string, init?: RequestInit) => {
            request = { url, init };
            return Response.json({ id: "page-1" });
        }) as typeof fetch;
        const host = el(`
            <div>
                <form cms-mutation="ulvia.cms.pages:create as created">
                    <input name="title" value="Welcome">
                    <p class="result" cms-condition="created.outcome.kind === 'success'">{{ created.data.id }}</p>
                </form>
            </div>
        `);
        document.body.append(host);
        const runtime = new BindingRuntime(host);
        runtime.start();

        const result = await mutationFormRequest(host, "created");

        const captured = request as unknown as { url: string; init?: RequestInit };
        expect(captured.url).toBe("http://localhost/.cms/call/ulvia.cms.pages/create");
        expect(captured.init?.method).toBe("POST");
        expect(captured.init?.headers).toEqual(expect.any(Headers));
        expect(JSON.parse(String(captured.init?.body))).toEqual({ title: "Welcome" });
        expect(result).toEqual({ id: "page-1" });
        expect(text(host.querySelector(".result"))).toBe("page-1");
        runtime.stop();
    });

    test("form-owned mutation sends JSON without replacing form controls", async () => {
        let request: { url: string; init?: RequestInit } | null = null;
        location.href = "http://localhost/";
        globalThis.fetch = (async (url: string, init?: RequestInit) => {
            request = { url, init };
            return new Response(JSON.stringify({ id: "42" }), {
                status: 201,
                statusText: "Created",
                headers: { "content-type": "application/json" },
            });
        }) as typeof fetch;

        const root = el(`
            <form cms-mutation="test.users:create as result">
                <input name="email">
                <p class="success" cms-condition="result.outcome.kind === 'success'">Created {{ result.data.id }}</p>
                <button type="submit">Save</button>
            </form>
        `) as HTMLFormElement;
        document.body.append(root);
        const input = root.querySelector("input")!;
        input.value = "ada@example.com";
        input.focus();
        const runtime = new BindingRuntime(root);
        runtime.start();
        await settle();

        expect(root.querySelector("input")).toBe(input);
        expect(root.querySelector(".success")).toBeNull();

        root.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await waitFor(() => text(root.querySelector(".success")) === "Created 42");

        const captured = request as unknown as { url: string; init?: RequestInit };
        expect(captured.url).toBe("http://localhost/.cms/call/test.users/create");
        expect(captured.init?.method).toBe("POST");
        expect(captured.init?.body).toBe(JSON.stringify({ email: "ada@example.com" }));
        expect(root.querySelector("input")).toBe(input);
        expect(input.value).toBe("");
        runtime.stop();
    });

    test("captures transient submit values before rendering the loading state", async () => {
        let requestBody = "";
        globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
            requestBody = String(init?.body);
            return new Response(JSON.stringify({ ok: true }), {
                headers: { "content-type": "application/json" },
            });
        }) as typeof fetch;

        const root = el(`
            <form cms-mutation="test.newsletter:subscribe as result">
                <input name="email" value="reader@example.com">
                <button type="submit">Subscribe</button>
            </form>
        `) as HTMLFormElement;
        document.body.append(root);
        const runtime = new BindingRuntime(root);
        runtime.start();
        await settle();

        const transient = document.createElement("input");
        transient.type = "hidden";
        transient.name = "subscribed";
        transient.value = "true";
        root.append(transient);
        root.requestSubmit(root.querySelector("button")!);
        transient.remove();

        await waitFor(() => requestBody !== "");
        expect(JSON.parse(requestBody)).toEqual({
            email: "reader@example.com",
            subscribed: "true",
        });
        runtime.stop();
    });

    test("automatic idempotency candidates are reused after failure and rotate after success", async () => {
        const keys: string[] = [];
        let status = 503;
        globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
            keys.push(new Headers(init?.headers).get("X-Ulvia-Automatic-Idempotency-Key") ?? "");
            return new Response(JSON.stringify({ ok: status === 200 }), {
                status,
                headers: { "content-type": "application/json" },
            });
        }) as typeof fetch;
        const root = el(`
            <form cms-mutation="test.jobs:run as result">
                <input name="name" value="migration">
                <button type="submit">Run</button>
                <p class="success" cms-condition="result.outcome.kind === 'success'">Done</p>
            </form>
        `) as HTMLFormElement;
        document.body.append(root);
        const runtime = new BindingRuntime(root);
        runtime.start();
        await settle();

        root.requestSubmit();
        await waitFor(() => keys.length === 1);
        await settle();
        root.requestSubmit();
        await waitFor(() => keys.length === 2);
        await settle();
        expect(keys[0]).not.toBe("");
        expect(keys[1]).toBe(keys[0]);

        status = 200;
        root.requestSubmit();
        await waitFor(() => keys.length === 3);
        expect(keys[2]).toBe(keys[0]);
        await waitFor(() => root.querySelector(".success") !== null);
        root.requestSubmit();
        await waitFor(() => keys.length === 4);
        expect(keys[3]).not.toBe(keys[2]);
        runtime.stop();
    });

    test("programmatic requests submit through the active declarative mutation runtime", async () => {
        let payload: unknown;
        globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
            payload = JSON.parse(String(init?.body));
            return Response.json({ saved: true });
        }) as typeof fetch;
        const host = el('<div><form cms-mutation="test.profile:save as save"></form></div>');
        document.body.append(host);
        const runtime = new BindingRuntime(host);
        runtime.start();

        const result = await mutationFormRequest(host, "save", {
            name: "Ada",
            count: 2,
            enabled: false,
            navigation: [],
            tags: ["binding", "cms"],
            profile: { city: "Paris" },
        });

        expect(result).toEqual({ saved: true });
        expect(payload).toEqual({
            name: "Ada",
            count: 2,
            enabled: false,
            navigation: [],
            tags: ["binding", "cms"],
            profile: { city: "Paris" },
        });
        runtime.stop();
    });

    test("programmatic requests expose declared mutation failures", async () => {
        globalThis.fetch = (async () =>
            Response.json(
                { error: { code: "INVALID_PROFILE", retryable: false, output: { message: "Invalid profile" } } },
                { status: 422, statusText: "Unprocessable Content" },
            )) as typeof fetch;
        const host = el('<div><form cms-mutation="test.profile:save as save"></form></div>');
        document.body.append(host);
        const runtime = new BindingRuntime(host);
        runtime.start();

        const error = await mutationFormRequest(host, "save").catch((reason) => reason);
        expect(error).toBeInstanceOf(MutationFormError);
        expect(error).toMatchObject({ message: "Invalid profile", status: 422, body: { message: "Invalid profile" } });
        runtime.stop();
    });
});
