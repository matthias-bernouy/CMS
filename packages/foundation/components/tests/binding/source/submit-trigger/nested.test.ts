import { afterEach, describe, expect, test } from "bun:test";
import { BindingRuntime } from "../../../../src/binding/runtime/BindingRuntime";
import { el, resetDom, text, waitFor } from "../../testUtils";

afterEach(resetDom);

describe("Source — nested submit sources", () => {
    test("nested submit source owns its local $source conditions", async () => {
        location.href = "http://localhost/";
        globalThis.fetch = (async (url: string) => {
            if (url === "/account") {
                return new Response(JSON.stringify({ givenName: "Ada" }), {
                    headers: { "content-type": "application/json" },
                });
            }
            return new Response(JSON.stringify({ updated: true }), {
                headers: { "content-type": "application/json" },
            });
        }) as typeof fetch;

        const root = el(`
            <section cms-source="/account">
                <form cms-source="/account/update" cms-source-trigger="submit" cms-source-method="POST">
                    <input name="givenName" value="{{ givenName }}">
                    <p class="saving" cms-condition="$source.loading">Saving</p>
                    <p class="saved" cms-condition="$source.loaded">Saved</p>
                    <p class="failed" cms-condition="$source.error">Failed</p>
                    <button type="submit">Save</button>
                </form>
            </section>
        `);
        document.body.append(root);
        const runtime = new BindingRuntime(root);
        runtime.start();

        await waitFor(() => root.querySelector<HTMLInputElement>("input")?.value === "Ada");
        expect(root.querySelector(".saved")).toBeNull();

        root.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await waitFor(() => text(root.querySelector(".saved")) === "Saved");

        expect(root.querySelector(".saving")).toBeNull();
        expect(root.querySelector(".failed")).toBeNull();
        runtime.stop();
    });

    test("form-owned submit source inside a parent source keeps parent-bound fields and owns result state", async () => {
        let request: { url: string; init?: RequestInit } | null = null;
        location.href = "http://localhost/";
        globalThis.fetch = (async (url: string, init?: RequestInit) => {
            if (url === "/settings") {
                return new Response(
                    JSON.stringify({
                        site: { name: "Demo" },
                        email: { enabled: true },
                        pages: [{ path: "/404", title: "Not found" }],
                    }),
                    { headers: { "content-type": "application/json" } },
                );
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
        expect(captured.init?.body).toBe(
            JSON.stringify({
                "site.name": "Demo",
                "site.notFound": "/404",
                "email.enabled": "true",
            }),
        );
        runtime.stop();
    });

    test("change form keeps an auth-bound hidden field around a nested read source", async () => {
        let submittedBody: BodyInit | null | undefined;
        globalThis.fetch = (async (url: string, init?: RequestInit) => {
            if (url === "/account") {
                return new Response(JSON.stringify({ metadata: {} }), {
                    headers: { "content-type": "application/json" },
                });
            }
            if (url === "/me") {
                return new Response(JSON.stringify({ subject: { email: "seller+2@example.com" } }), {
                    headers: { "content-type": "application/json" },
                });
            }
            if (url === "/subscription?email=seller%2B2%40example.com") {
                return new Response(JSON.stringify({ subscribed: false }), {
                    headers: { "content-type": "application/json" },
                });
            }
            submittedBody = init?.body;
            return new Response(JSON.stringify({ subscribed: true }), {
                headers: { "content-type": "application/json" },
            });
        }) as typeof fetch;

        const root = el(`
            <section cms-source="/account as data">
                <div cms-source="/me as auth">
                    <form cms-source="/subscription as result" cms-source-trigger="change" cms-source-method="POST" cms-source-success-reset="false">
                        <input type="hidden" name="email" value="{{ auth.subject.email }}">
                        <div cms-source="/subscription?email={{ auth.subject.email | urlencode }} as subscription">
                            <input name="subscribed" value="true">
                        </div>
                    </form>
                </div>
            </section>
        `);
        document.body.append(root);
        const runtime = new BindingRuntime(root);
        runtime.start();

        await waitFor(() => root.querySelector<HTMLInputElement>("[name=email]")?.value === "seller+2@example.com");
        const subscribed = root.querySelector<HTMLInputElement>("[name=subscribed]")!;
        subscribed.dispatchEvent(new Event("change", { bubbles: true }));
        await waitFor(() => submittedBody !== undefined);

        expect(submittedBody).toBe(
            JSON.stringify({
                email: "seller+2@example.com",
                subscribed: "true",
            }),
        );
        runtime.stop();
    });
});
