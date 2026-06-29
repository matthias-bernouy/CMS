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
});
