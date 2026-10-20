import { afterEach, describe, expect, test } from "bun:test";
import { BindingRuntime } from "../../../src/browser/binding/runtime/BindingRuntime";
import { el, resetDom, settle, waitFor } from "../support/testUtils";

afterEach(resetDom);

describe("BindingRuntime — nested core isolation", () => {
    test("the outer runtime ignores queries owned by a nested core", async () => {
        globalThis.fetch = (async () => new Response("[]")) as typeof fetch;
        const root = el(`
            <div>
                <section cms-query="ulvia.cms.access:resolve-actor as outer"></section>
                <cms-binding-core>
                    <section cms-query="ulvia.cms.access:resolve-actor as inner"></section>
                </cms-binding-core>
            </div>
        `);
        document.body.appendChild(root);
        const runtime = new BindingRuntime(root);

        runtime.start();
        await waitFor(() => runtime.size === 1);
        await settle();
        expect(runtime.size).toBe(1);
        runtime.stop();
    });
});
