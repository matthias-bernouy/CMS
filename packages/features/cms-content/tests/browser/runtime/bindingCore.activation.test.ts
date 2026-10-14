import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { BindingCore, BINDING_CORE_TAG } from "../../../src/browser/binding/bindingCore";
import { resetDom, text, waitFor } from "../support/testUtils";

beforeAll(() => {
    if (!customElements.get(BINDING_CORE_TAG)) {
        customElements.define(BINDING_CORE_TAG, BindingCore);
    }
});

afterEach(resetDom);

describe("<cms-binding-core> — cloak", () => {
    test("hides data-bound content only until the custom element is defined", () => {
        document.body.innerHTML = `<${BINDING_CORE_TAG}></${BINDING_CORE_TAG}>`;
        const style = document.getElementById("cms-binding-cloak");
        expect(style).not.toBeNull();
        expect(style!.textContent).toContain(`${BINDING_CORE_TAG}:not(:defined) :is([cms-mutation],[cms-query])`);
        expect(style!.textContent).toContain("visibility:hidden");
        expect(style!.textContent).not.toContain("cms-ready");
    });
});

describe("<cms-binding-core> — activation", () => {
    test("expands a fixed repeat immediately", async () => {
        document.body.innerHTML = `
            <${BINDING_CORE_TAG}>
                <article class="card" cms-repeat="$range(3) as index" data-index="{{ index }}">
                    Card {{ index }}
                </article>
            </${BINDING_CORE_TAG}>`;
        const core = document.querySelector(BINDING_CORE_TAG)!;

        await waitFor(() => core.querySelectorAll(".card").length === 3);
        expect(Array.from(core.querySelectorAll(".card")).map(text)).toEqual(["Card 0", "Card 1", "Card 2"]);
        expect(Array.from(core.querySelectorAll(".card")).map((card) => card.getAttribute("data-index"))).toEqual([
            "0",
            "1",
            "2",
        ]);
    });

    test("activates declarative queries", async () => {
        globalThis.fetch = (async () => new Response(JSON.stringify(["password"]))) as typeof fetch;
        document.body.innerHTML = `
            <${BINDING_CORE_TAG}>
                <section cms-query="kernel.auth:methods as methods">
                    <p>{{ methods.data[0] }}</p>
                </section>
            </${BINDING_CORE_TAG}>`;

        await waitFor(() => text(document.querySelector("p")) === "password");
        expect(document.querySelector("[cms-query]")?.hasAttribute("cms-ready")).toBe(false);
    });
});
