import { afterEach, describe, expect, test } from "bun:test";
import { PARAMS_CHANGE_EVENT } from "../../../../src/binding/params";
import { BindingRuntime } from "../../../../src/binding/runtime/BindingRuntime";
import { el, res, resetDom, settle, text, waitFor } from "../../testUtils";

afterEach(resetDom);

describe("Source — submit trigger lifecycle", () => {
    test("change-triggered form sources submit after a control change, not on startup", async () => {
        const requests: RequestInit[] = [];
        globalThis.fetch = (async (_url: string, init?: RequestInit) => {
            requests.push(init ?? {});
            return new Response(JSON.stringify({ ok: true }), {
                headers: { "content-type": "application/json" },
            });
        }) as typeof fetch;

        const root = el(`
            <form cms-source="/api/preferences as result" cms-source-trigger="change" cms-source-method="POST" cms-source-success-reset="false">
                <select name="level"><option value="club" selected>Club</option></select>
                <input name="style" value="defender">
            </form>
        `) as HTMLFormElement;
        document.body.append(root);
        const runtime = new BindingRuntime(root);
        runtime.start();
        await settle();
        expect(requests).toHaveLength(0);

        root.querySelector("select")!.dispatchEvent(new Event("change", { bubbles: true }));
        await waitFor(() => requests.length === 1);

        expect(requests[0]?.method).toBe("POST");
        expect(requests[0]?.body).toBe(JSON.stringify({ level: "club", style: "defender" }));
        runtime.stop();
    });

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
});
