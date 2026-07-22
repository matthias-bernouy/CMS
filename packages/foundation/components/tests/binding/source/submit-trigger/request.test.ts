import { afterEach, describe, expect, test } from "bun:test";
import { BindingRuntime } from "../../../../src/binding/runtime/BindingRuntime";
import { type FormSubmitResult } from "../../../../src/binding/submit/formSubmit";
import { el, resetDom, settle, text, waitFor } from "../../testUtils";

afterEach(resetDom);

describe("Source — submit request", () => {
    test("form-owned submit source sends JSON without replacing form controls", async () => {
        let request: { url: string; init?: RequestInit } | null = null;
        const events: Record<string, FormSubmitResult | undefined> = {};
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
            "cms-source:success",
            (event) => {
                events.source = (event as CustomEvent<FormSubmitResult>).detail;
            },
            { once: true },
        );
        document.body.addEventListener(
            "form:success",
            (event) => {
                events.form = (event as CustomEvent<FormSubmitResult>).detail;
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
        expect(events.source?.status).toBe(201);
        expect(events.form?.status).toBe(201);
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
});
