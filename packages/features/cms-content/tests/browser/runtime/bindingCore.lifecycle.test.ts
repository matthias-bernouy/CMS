import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { BindingCore, BINDING_CORE_TAG } from "../../../src/browser/binding/bindingCore";
import { resetDom, waitFor } from "../support/testUtils";

beforeAll(() => {
    if (!customElements.get(BINDING_CORE_TAG)) {
        customElements.define(BINDING_CORE_TAG, BindingCore);
    }
});

afterEach(resetDom);

describe("<cms-binding-core> — teardown on disconnect", () => {
    test("removing the core stops its query and reconnecting starts a fresh one", async () => {
        let calls = 0;
        globalThis.fetch = (async () => {
            calls++;
            return new Response("[]");
        }) as typeof fetch;
        document.body.innerHTML = `<${BINDING_CORE_TAG}><section cms-query="ulvia.cms.access:resolve-actor as methods"></section></${BINDING_CORE_TAG}>`;
        const core = document.querySelector(BINDING_CORE_TAG)!;

        await waitFor(() => calls === 1);
        core.remove();
        document.body.append(core);
        await waitFor(() => calls === 2);
        expect(calls).toBe(2);
    });
});
