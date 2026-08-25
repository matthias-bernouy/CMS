import { afterEach, describe, expect, test } from "bun:test";
import { CMS_SOURCE_FAILED_EVENT, CMS_SOURCE_SUCCESS_EVENT, type CmsSourceResultEvent } from "../../../../binding";
import { BindingRuntime } from "../../../../src/binding/runtime/BindingRuntime";
import { el, resetDom, settle, waitFor } from "../../testUtils";

afterEach(resetDom);

describe("Source — public submission events", () => {
    test("exports stable canonical event names", () => {
        expect(CMS_SOURCE_SUCCESS_EVENT).toBe("cms-source:success");
        expect(CMS_SOURCE_FAILED_EVENT).toBe("cms-source:failed");
    });

    test("dispatches a typed failure result from the source element", async () => {
        globalThis.fetch = (async () =>
            new Response(JSON.stringify({ field: "path", error: "A page already uses this path." }), {
                status: 409,
                statusText: "Conflict",
                headers: { "content-type": "application/json" },
            })) as unknown as typeof fetch;

        const form = el(`
            <form cms-source="/api/page" cms-source-trigger="submit" cms-source-method="POST">
                <input name="path" value="/about">
                <button type="submit">Create</button>
            </form>
        `) as HTMLFormElement;
        document.body.append(form);
        const runtime = new BindingRuntime(form);
        runtime.start();
        await settle();

        let failure: CmsSourceResultEvent | null = null;
        form.addEventListener(
            CMS_SOURCE_FAILED_EVENT,
            (event) => {
                failure = event;
            },
            { once: true },
        );

        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await waitFor(() => failure !== null);

        const event = failure as unknown as CmsSourceResultEvent;
        expect(event.target).toBe(form);
        expect(event.bubbles).toBe(true);
        expect(event.composed).toBe(true);
        expect(event.detail.ok).toBe(false);
        expect(event.detail.status).toBe(409);
        expect(event.detail.statusText).toBe("Conflict");
        expect(event.detail.body).toEqual({ field: "path", error: "A page already uses this path." });
        expect(event.detail.message).toBe("A page already uses this path.");
        expect(event.detail.form).toBe(form);
        runtime.stop();
    });
});
