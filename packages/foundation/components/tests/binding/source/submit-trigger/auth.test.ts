import { afterEach, describe, expect, test } from "bun:test";
import { BindingRuntime } from "../../../../src/binding/runtime/BindingRuntime";
import { el, resetDom, settle, waitFor } from "../../testUtils";

afterEach(resetDom);

describe("Source — auth submit", () => {
    test.each([
        ["/sell?resume=listing#photos", "/sell?resume=listing#photos"],
        ["http://localhost/checkout?offer=42", "/checkout?offer=42"],
        ["", "/account"],
        ["https://outside.test/", "/account"],
        ["//outside.test/", "/account"],
        ["javascript:alert(1)", "/account"],
    ])("returns to the requested local flow or fallback: %s", async (returnTo, expected) => {
        globalThis.fetch = (async () =>
            Response.json({ subject: { identifier: "user:ada" } })) as unknown as typeof fetch;
        location.href = `http://localhost/login?returnTo=${encodeURIComponent(returnTo)}`;
        const form = el(`<form cms-source="/.cms/auth/login as result" cms-source-trigger="submit"
            cms-source-success-redirect="/account" cms-source-success-redirect-param="returnTo">
            <input name="email" value="ada@example.test">
        </form>`);
        document.body.append(form);
        const runtime = new BindingRuntime(form);
        runtime.start();
        await settle();
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await waitFor(() => location.href === `http://localhost${expected}`);
        expect(location.href).toBe(`http://localhost${expected}`);
        runtime.stop();
    });

    test("auth login form markup submits JSON and redirects on success", async () => {
        let request: { url: string; init?: RequestInit } | null = null;
        globalThis.fetch = (async (url: string, init?: RequestInit) => {
            request = { url, init };
            return new Response(JSON.stringify({ subject: { identifier: "user:ada" } }), {
                headers: {
                    "content-type": "application/json",
                    "set-cookie": "site-session=abc; Path=/",
                },
            });
        }) as typeof fetch;
        location.href = "http://localhost/auth/login?returnTo=%2Fdashboard";

        const root = el(`
            <form cms-source="/.cms/auth/login as result" cms-source-trigger="submit" cms-source-method="POST" cms-source-success-redirect="/">
                <input type="email" name="email" placeholder="Email" required>
                <input type="password" name="password" placeholder="Password" required>
                <input type="submit" value="Login">
            </form>
        `) as HTMLFormElement;
        document.body.append(root);
        root.querySelector<HTMLInputElement>("[name=email]")!.value = "ada@example.com";
        root.querySelector<HTMLInputElement>("[name=password]")!.value = "password-1";

        const runtime = new BindingRuntime(root);
        runtime.start();
        await settle();

        const event = new Event("submit", { bubbles: true, cancelable: true });
        root.dispatchEvent(event);
        await waitFor(() => request !== null);
        await waitFor(() => location.href === "http://localhost/");

        const captured = request as unknown as { url: string; init?: RequestInit };
        expect(event.defaultPrevented).toBe(true);
        expect(captured.url).toBe("http://localhost/.cms/auth/login?returnTo=%2Fdashboard");
        expect(captured.init?.method).toBe("POST");
        expect(captured.init?.body).toBe(
            JSON.stringify({
                email: "ada@example.com",
                password: "password-1",
            }),
        );
        runtime.stop();
    });
});
