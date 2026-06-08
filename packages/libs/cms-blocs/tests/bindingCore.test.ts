import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { BindingCore, BINDING_CORE_TAG } from "../src/binding/bindingCore";

beforeAll(() => {
    if (!customElements.get(BINDING_CORE_TAG)) customElements.define(BINDING_CORE_TAG, BindingCore);
});

const realFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = realFetch;
    document.body.replaceChildren();
    document.getElementById("cms-binding-cloak")?.remove();
});

const text = (e: Element | null) => (e?.textContent ?? "").replace(/\s+/g, " ").trim();
async function waitFor(predicate: () => boolean, tries = 50): Promise<void> {
    for (let i = 0; i < tries; i++) {
        if (predicate()) return;
        await new Promise((r) => setTimeout(r, 0));
    }
}
async function settle(rounds = 8): Promise<void> {
    for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 0));
}
function respond(status: number, body: string) {
    globalThis.fetch = (async () => ({
        ok: status >= 200 && status < 300,
        status,
        text: async () => body,
    })) as unknown as typeof fetch;
}
function routes(map: Record<string, () => Response>) {
    const r = (s: number, b: string) => ({ ok: s >= 200 && s < 300, status: s, text: async () => b } as unknown as Response);
    globalThis.fetch = (async (url: string) => (map[url] ?? (() => r(404, "")))()) as unknown as typeof fetch;
}

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
            "/outer": () => ({ ok: true, status: 200, text: async () => JSON.stringify({ inner: "/inner" }) } as unknown as Response),
            "/inner": () => ({ ok: true, status: 200, text: async () => JSON.stringify({ msg: "deep" }) } as unknown as Response),
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

describe("<cms-binding-core> — teardown on disconnect", () => {
    test("removing the core stops its runtime (no reload after)", async () => {
        let n = 0;
        globalThis.fetch = (async () => ({
            ok: true, status: 200, text: async () => JSON.stringify({ n: ++n }),
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
