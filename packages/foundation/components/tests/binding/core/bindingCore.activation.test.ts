import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { BindingCore, BINDING_CORE_TAG } from "../../../src/binding/bindingCore";
import { text, waitFor, respond, routes, resetDom } from "../testUtils";

beforeAll(() => {
    if (!customElements.get(BINDING_CORE_TAG)) {
        customElements.define(BINDING_CORE_TAG, BindingCore);
    }
});
afterEach(resetDom);

describe("<cms-binding-core> — cloak", () => {
    test("connecting a core injects the cloak hiding un-ready sources", () => {
        document.body.innerHTML = `<${BINDING_CORE_TAG}></${BINDING_CORE_TAG}>`;
        const style = document.getElementById("cms-binding-cloak");
        expect(style).not.toBeNull();
        expect(style!.textContent).toContain("[cms-source]:not([cms-ready])");
        expect(style!.textContent).toContain("visibility:hidden");
    });
});

describe("<cms-binding-core> — activation", () => {
    test("connecting activates the sources inside it", async () => {
        respond(200, JSON.stringify({ name: "Ada" }));
        document.body.innerHTML = `<${BINDING_CORE_TAG}><div cms-source="/x"><p>{{ name }}</p></div></${BINDING_CORE_TAG}>`;
        await waitFor(() => text(document.querySelector("p")) === "Ada");
        expect(document.querySelector("[cms-source]")!.hasAttribute("cms-ready")).toBe(true);
    });

    test("nested sources work inside the core", async () => {
        routes({
            "/outer": () =>
                ({
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify({ inner: "/inner" }),
                }) as unknown as Response,
            "/inner": () =>
                ({ ok: true, status: 200, text: async () => JSON.stringify({ msg: "deep" }) }) as unknown as Response,
        });
        document.body.innerHTML = `
            <${BINDING_CORE_TAG}>
                <div cms-source="/outer">
                    <div cms-source="{{ inner }}"><p class="leaf">{{ msg }}</p></div>
                </div>
            </${BINDING_CORE_TAG}>`;
        await waitFor(() => text(document.querySelector(".leaf")) === "deep");
        expect(text(document.querySelector(".leaf"))).toBe("deep");
    });
});
