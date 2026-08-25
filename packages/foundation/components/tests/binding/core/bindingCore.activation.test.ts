import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { BINDING_DISABLED_ATTR, BindingCore, BINDING_CORE_TAG } from "../../../src/binding/bindingCore";
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
    test("entering view expands a fixed repeat without a source", async () => {
        document.body.innerHTML = `
            <${BINDING_CORE_TAG} ${BINDING_DISABLED_ATTR}>
                <main>
                    <article class="card" cms-repeat="$range(5) as index" data-index="{{ index }}">
                        Card {{ index }}
                    </article>
                </main>
            </${BINDING_CORE_TAG}>`;
        const core = document.querySelector(BINDING_CORE_TAG)!;

        expect(core.querySelectorAll(".card")).toHaveLength(1);
        core.removeAttribute(BINDING_DISABLED_ATTR);
        await waitFor(() => core.querySelectorAll(".card").length === 5);

        expect(Array.from(core.querySelectorAll(".card")).map(text)).toEqual([
            "Card 0",
            "Card 1",
            "Card 2",
            "Card 3",
            "Card 4",
        ]);
        expect(Array.from(core.querySelectorAll(".card")).map((card) => card.getAttribute("data-index"))).toEqual([
            "0",
            "1",
            "2",
            "3",
            "4",
        ]);

        core.setAttribute(BINDING_DISABLED_ATTR, "");
        expect(core.querySelectorAll(".card")).toHaveLength(1);
        expect(core.querySelector(".card")?.getAttribute("cms-repeat")).toBe("$range(5) as index");

        core.removeAttribute(BINDING_DISABLED_ATTR);
        await waitFor(() => core.querySelectorAll(".card").length === 5);
        expect(Array.from(core.querySelectorAll(".card")).map(text)).toEqual([
            "Card 0",
            "Card 1",
            "Card 2",
            "Card 3",
            "Card 4",
        ]);
    });

    test("activates one nested source per standalone range item", async () => {
        routes({
            "/cards/0": () => new Response(JSON.stringify({ label: "Zero" })),
            "/cards/1": () => new Response(JSON.stringify({ label: "One" })),
            "/cards/2": () => new Response(JSON.stringify({ label: "Two" })),
        });
        document.body.innerHTML = `
            <${BINDING_CORE_TAG}>
                <article class="card" cms-repeat="$range(3) as index">
                    <section cms-source="/cards/{{ index }} as card"><p>{{ card.label }}</p></section>
                </article>
            </${BINDING_CORE_TAG}>`;
        const core = document.querySelector(BINDING_CORE_TAG)!;

        await waitFor(() => Array.from(core.querySelectorAll("p")).map(text).join(",") === "Zero,One,Two");

        expect(core.querySelectorAll(".card")).toHaveLength(3);
        expect(core.querySelectorAll("[cms-source][cms-ready]")).toHaveLength(3);
        expect(Array.from(core.querySelectorAll("p")).map(text)).toEqual(["Zero", "One", "Two"]);
    });

    test("leaves a fixed range inside a source to the source renderer", async () => {
        respond(200, JSON.stringify({ label: "Plan" }));
        document.body.innerHTML = `
            <${BINDING_CORE_TAG}>
                <section cms-source="/plan as plan">
                    <article class="card" cms-repeat="$range(3) as index">{{ plan.label }} {{ index }}</article>
                </section>
            </${BINDING_CORE_TAG}>`;
        const core = document.querySelector(BINDING_CORE_TAG)!;

        await waitFor(() => core.querySelectorAll(".card").length === 3);

        expect(Array.from(core.querySelectorAll(".card")).map(text)).toEqual(["Plan 0", "Plan 1", "Plan 2"]);
    });

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
