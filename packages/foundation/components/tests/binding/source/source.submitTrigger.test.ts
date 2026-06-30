import { afterEach, describe, expect, test } from "bun:test";
import { PARAMS_CHANGE_EVENT } from "../../../src/binding/params";
import { BindingRuntime } from "../../../src/binding/runtime/BindingRuntime";
import { el, res, resetDom, settle, text, waitFor } from "../testUtils";

afterEach(resetDom);

describe("Source — submit trigger", () => {
    test("submit-triggered sources wait for the parent form submit", async () => {
        let calls = 0;
        const urls: string[] = [];
        globalThis.fetch = (async (url: string) => {
            calls++;
            urls.push(url);
            return res(200, JSON.stringify({ n: calls }));
        }) as unknown as typeof fetch;
        location.href = "http://localhost/?search=foo";

        const root = el(`
            <form>
                <input name="q" value="plans">
                <div cms-source="/api/search?q=#{search}" cms-source-trigger="submit"><p>{{ n }}</p></div>
            </form>
        `);
        document.body.appendChild(root);
        const runtime = new BindingRuntime(root);
        runtime.start();
        await settle();
        expect(calls).toBe(0);
        expect(root.querySelector("p")).not.toBeNull();

        location.href = "http://localhost/?search=bar";
        document.dispatchEvent(new Event(PARAMS_CHANGE_EVENT));
        await settle();
        expect(calls).toBe(0);

        const event = new Event("submit", { bubbles: true, cancelable: true });
        root.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        await waitFor(() => text(root.querySelector("p")) === "1");
        expect(calls).toBe(1);
        expect(urls).toEqual(["/api/search?q=bar"]);
        runtime.stop();
    });

    test("submit-triggered sources render common body before the first submit", async () => {
        let calls = 0;
        globalThis.fetch = (async () => {
            calls++;
            return res(200, JSON.stringify({ n: calls }));
        }) as unknown as typeof fetch;

        const root = el(`
            <form>
                <div cms-source="/api/search" cms-source-trigger="submit">
                    <fieldset><input name="q" value="plans"></fieldset>
                    <p class="loaded" cms-condition="$source.loaded">{{ n }}</p>
                    <p class="loading" cms-condition="$source.loading">Loading</p>
                    <p class="empty" cms-condition="$source.empty">Empty</p>
                    <p class="error" cms-condition="$source.error">Error</p>
                </div>
            </form>
        `);
        document.body.appendChild(root);
        const runtime = new BindingRuntime(root);
        runtime.start();
        await settle();

        const input = root.querySelector("input")!;
        expect(calls).toBe(0);
        expect(root.querySelector("fieldset")).not.toBeNull();
        expect(root.querySelector(".loaded")).toBeNull();
        expect(root.querySelector(".loading")).toBeNull();
        expect(root.querySelector(".empty")).toBeNull();
        expect(root.querySelector(".error")).toBeNull();

        root.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

        await waitFor(() => text(root.querySelector(".loaded")) === "1");
        expect(calls).toBe(1);
        expect(root.querySelector("input")).toBe(input);
        runtime.stop();
    });

    test("form-owned submit source sends JSON without replacing form controls", async () => {
        let request: { url: string; init?: RequestInit } | null = null;
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
        expect(root.querySelector("input")).toBe(input);
        expect(input.value).toBe("");
        runtime.stop();
    });

    test("form-owned GET submit appends form values and does not reset by default", async () => {
        let url = "";
        globalThis.fetch = (async (nextUrl: string) => {
            url = nextUrl;
            return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
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

    test("form-owned submit publishes binding reload channels", async () => {
        let calls = 0;
        const urls: string[] = [];
        globalThis.fetch = (async (url: string) => {
            calls++;
            urls.push(url);
            return new Response(JSON.stringify({ calls }), { headers: { "content-type": "application/json" } });
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

    test("form-owned submit source inside a parent source keeps parent-bound fields and owns result state", async () => {
        let request: { url: string; init?: RequestInit } | null = null;
        globalThis.fetch = (async (url: string, init?: RequestInit) => {
            if (url === "/settings") {
                return new Response(JSON.stringify({
                    site: { name: "Demo" },
                    email: { enabled: true },
                    pages: [{ path: "/404", title: "Not found" }],
                }), { headers: { "content-type": "application/json" } });
            }
            request = { url, init };
            return new Response(JSON.stringify({ id: "saved" }), {
                status: 201,
                statusText: "Created",
                headers: { "content-type": "application/json" },
            });
        }) as typeof fetch;

        const root = el(`
            <section cms-source="/settings">
                <template>
                    <form cms-source="/api/settings as result" cms-source-trigger="submit" cms-source-method="POST" cms-source-success-reset="false">
                        <input name="site.name" value="{{ site.name }}">
                        <select name="site.notFound">
                            <option cms-repeat="pages" value="{{ path }}">{{ title }}</option>
                        </select>
                        <input class="enabled" cms-condition="email.enabled" name="email.enabled" value="true">
                        <input class="disabled" cms-condition="!email.enabled" name="email.enabled" value="true">
                        <p class="success" cms-condition="result.ok">Saved {{ result.body.id }}</p>
                        <button type="submit">Save</button>
                    </form>
                </template>
            </section>
        `);
        document.body.append(root);
        const runtime = new BindingRuntime(root);
        runtime.start();

        await waitFor(() => root.querySelector<HTMLInputElement>("[name='site.name']")?.value === "Demo");
        const form = root.querySelector("form")!;
        expect(root.querySelector("option")?.getAttribute("value")).toBe("/404");
        expect(text(root.querySelector("option"))).toBe("Not found");
        expect(form.querySelector(".enabled")).not.toBeNull();
        expect(form.querySelector(".disabled")).toBeNull();
        expect(root.querySelector(".success")).toBeNull();

        const event = new Event("submit", { bubbles: true, cancelable: true });
        form.dispatchEvent(event);
        await waitFor(() => text(root.querySelector(".success")) === "Saved saved");

        const captured = request as unknown as { url: string; init?: RequestInit };
        expect(event.defaultPrevented).toBe(true);
        expect(captured.url).toBe("http://localhost/api/settings");
        expect(captured.init?.body).toBe(JSON.stringify({
            "site.name": "Demo",
            "site.notFound": "/404",
            "email.enabled": "true",
        }));
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
        expect(captured.init?.body).toBe(JSON.stringify({
            email: "ada@example.com",
            password: "password-1",
        }));
        runtime.stop();
    });
});
