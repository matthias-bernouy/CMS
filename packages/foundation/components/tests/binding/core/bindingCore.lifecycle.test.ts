import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { BindingCore, BINDING_CORE_TAG } from "../../../src/binding/bindingCore";
import { text, waitFor, settle, resetDom } from "../testUtils";

beforeAll(() => {
    if (!customElements.get(BINDING_CORE_TAG)) {
        customElements.define(BINDING_CORE_TAG, BindingCore);
    }
});
afterEach(resetDom);

describe("<cms-binding-core> — teardown on disconnect", () => {
    test("removing the core stops its runtime (no reload after)", async () => {
        let n = 0;
        globalThis.fetch = (async () => ({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ n: ++n }),
        })) as unknown as typeof fetch;

        document.body.innerHTML = `<${BINDING_CORE_TAG}><div cms-source="/x" cms-reload-on="go"><p>{{ n }}</p></div></${BINDING_CORE_TAG}>`;
        const core = document.querySelector(BINDING_CORE_TAG)!;
        const p = () => core.querySelector("p");

        await waitFor(() => text(p()) === "1");
        document.dispatchEvent(new Event("go"));
        await waitFor(() => text(p()) === "2");

        core.remove(); // disconnectedCallback → runtime.stop()
        document.dispatchEvent(new Event("go"));
        await settle();
        expect(text(p())).toBe("2"); // frozen — disposed, no reload
    });
});
