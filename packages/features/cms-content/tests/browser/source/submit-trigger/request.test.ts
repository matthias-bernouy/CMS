import { afterEach, describe, expect, test } from "bun:test";
import {
    CMS_SOURCE_SUCCESS_EVENT,
    readSourceData,
    type FormSubmitResult,
    sourceFormRequest,
    SourceFormError,
} from "../../../../src/browser/index";
import { BindingRuntime } from "../../../../src/browser/binding/runtime/BindingRuntime";
import { el, resetDom, settle, text, waitFor } from "../../support/testUtils";

afterEach(resetDom);

describe("Source — submit request", () => {
    test("form-owned submit source sends JSON without replacing form controls", async () => {
        let request: { url: string; init?: RequestInit } | null = null;
        let result: FormSubmitResult | undefined;
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
            <form cms-source="/api/users as result" cms-source-trigger="submit" cms-source-method="POST">
                <input name="email">
                <p class="success" cms-condition="result.ok">Created {{ result.body.id }}</p>
                <button type="submit">Save</button>
            </form>
        `) as HTMLFormElement;
        document.body.append(root);
        document.body.addEventListener(
            CMS_SOURCE_SUCCESS_EVENT,
            (event) => {
                result = event.detail;
            },
            { once: true },
        );
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
        expect(captured.url).toBe("http://localhost/api/users");
        expect(captured.init?.method).toBe("POST");
        expect(captured.init?.body).toBe(JSON.stringify({ email: "ada@example.com" }));
        expect(result?.status).toBe(201);
        expect(readSourceData(root)).toMatchObject({ ok: true, status: 201, body: { id: "42" } });
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
            <form cms-source="/api/newsletter as result" cms-source-trigger="submit" cms-source-method="POST">
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

    test("automatic idempotency reuses a key after failure and rotates it after success", async () => {
        const keys: string[] = [];
        let status = 503;
        globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
            keys.push(new Headers(init?.headers).get("Idempotency-Key") ?? "");
            return new Response(JSON.stringify({ ok: status === 200 }), {
                status,
                headers: { "content-type": "application/json" },
            });
        }) as typeof fetch;
        const root = el(`
            <form cms-source="/api/jobs" cms-source-trigger="submit" cms-source-method="POST"
                cms-source-idempotency="auto">
                <input name="name" value="migration">
                <button type="submit">Run</button>
            </form>
        `) as HTMLFormElement;
        document.body.append(root);
        const runtime = new BindingRuntime(root);
        runtime.start();
        await settle();

        root.requestSubmit();
        await waitFor(() => keys.length === 1);
        root.requestSubmit();
        await waitFor(() => keys.length === 2);
        expect(keys[0]).not.toBe("");
        expect(keys[1]).toBe(keys[0]);

        status = 200;
        root.requestSubmit();
        await waitFor(() => keys.length === 3);
        expect(keys[2]).toBe(keys[0]);
        await waitFor(() => (readSourceData(root) as FormSubmitResult | undefined)?.status === 200);
        root.requestSubmit();
        await waitFor(() => keys.length === 4);
        expect(keys[3]).not.toBe(keys[2]);
        runtime.stop();
    });

    test("programmatic requests submit the declarative source form through binding events", async () => {
        let payload: unknown;
        globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
            payload = JSON.parse(String(init?.body));
            return Response.json({ saved: true });
        }) as typeof fetch;
        const host = el(
            '<div><form cms-source="/save as result" cms-source-trigger="submit" cms-source-id="save" cms-source-serialization="typed-json"></form></div>',
        );
        document.body.append(host);
        const runtime = new BindingRuntime(host);
        runtime.start();

        const result = await sourceFormRequest(host, "save", {
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

    test("programmatic requests expose declarative source failures", async () => {
        globalThis.fetch = (async () =>
            Response.json(
                { error: "Invalid profile" },
                { status: 422, statusText: "Unprocessable Content" },
            )) as typeof fetch;
        const host = el(
            '<div><form cms-source="/save as result" cms-source-trigger="submit" cms-source-id="save"></form></div>',
        );
        document.body.append(host);
        const runtime = new BindingRuntime(host);
        runtime.start();

        const error = await sourceFormRequest(host, "save").catch((reason) => reason);
        expect(error).toBeInstanceOf(SourceFormError);
        expect(error).toMatchObject({ message: "Invalid profile", status: 422, body: { error: "Invalid profile" } });
        runtime.stop();
    });
});
