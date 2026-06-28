import { describe, test, expect, afterEach } from "bun:test";
import { CompiledTemplate } from "../../../src/binding/reactive/CompiledTemplate";
import { resetDom, text } from "../testUtils";

afterEach(resetDom);

function fragment(html: string): DocumentFragment {
    const tpl = document.createElement("template");
    tpl.innerHTML = html.trim();
    return tpl.content;
}

function mount(html: string, scope: unknown, filters = {}) {
    const host = document.createElement("div");
    const compiled = CompiledTemplate.fromFragment(fragment(html), filters);
    const region = compiled.mount(host, { value: scope });
    document.body.appendChild(host);
    return { compiled, host, region };
}

describe("CompiledTemplate — text and attributes", () => {
    test("mounts a fragment and binds text and attributes", () => {
        const { host } = mount(`
            <p>Hello {{ name }}</p>
            <a href="/users/{{ id }}" title="{{ name }}">Open</a>
        `, { name: "Ada", id: 1 });

        expect(text(host.querySelector("p"))).toBe("Hello Ada");
        expect(host.querySelector("a")!.getAttribute("href")).toBe("/users/1");
        expect(host.querySelector("a")!.getAttribute("title")).toBe("Ada");
    });

    test("updates live sites without replacing unrelated nodes", () => {
        const { host, region } = mount(`
            <label>{{ label }}</label>
            <input name="email">
            <a href="/users/{{ id }}">Open</a>
        `, { label: "Email", id: 1 });
        const input = host.querySelector("input")!;
        const link = host.querySelector("a")!;

        region.update({ value: { label: "Work email", id: 2 } });

        expect(text(host.querySelector("label"))).toBe("Work email");
        expect(host.querySelector("input")).toBe(input);
        expect(host.querySelector("a")).toBe(link);
        expect(link.getAttribute("href")).toBe("/users/2");
    });

    test("uses existing interpolation rules for misses and filters", () => {
        const { host } = mount(
            `<p>{{ name | up }} / {{ missing }}</p>`,
            { name: "ada" },
            { up: (value: unknown) => String(value).toUpperCase() },
        );

        expect(text(host.querySelector("p"))).toBe("ADA /");
    });
});

describe("CompiledTemplate — boundaries", () => {
    test("binds a nested source's own attributes but does not descend into its subtree", () => {
        const { host, region } = mount(`
            <div>
                <div cms-source="/api/{{ id }}" data-id="{{ id }}">
                    <span>{{ id }}</span>
                </div>
            </div>
        `, { id: 7 });
        const source = host.querySelector("[cms-source]")!;

        expect(source.getAttribute("cms-source")).toBe("/api/7");
        expect(source.getAttribute("data-id")).toBe("7");
        expect(text(source.querySelector("span"))).toBe("{{ id }}");

        region.update({ value: { id: 8 } });
        expect(source.getAttribute("cms-source")).toBe("/api/8");
        expect(source.getAttribute("data-id")).toBe("8");
        expect(text(source.querySelector("span"))).toBe("{{ id }}");
    });

    test("binds a nested binding core's own attributes but keeps its subtree inert", () => {
        const { host } = mount(`
            <section>
                <cms-binding-core data-id="{{ id }}">
                    <span>{{ id }}</span>
                </cms-binding-core>
            </section>
        `, { id: "outer" });
        const core = host.querySelector("cms-binding-core")!;

        expect(core.getAttribute("data-id")).toBe("outer");
        expect(text(core.querySelector("span"))).toBe("{{ id }}");
    });
});

describe("CompiledTemplate — raw template and lifecycle", () => {
    test("cloneRaw() returns the authored template after mounted updates", () => {
        const { compiled, region } = mount(`<p>{{ name }}</p>`, { name: "Ada" });

        region.update({ value: { name: "Grace" } });
        const raw = compiled.cloneRaw();

        expect(text(raw.querySelector("p"))).toBe("{{ name }}");
    });

    test("unmount() removes the mounted nodes", () => {
        const { host, region } = mount(`<p>{{ name }}</p><span>Static</span>`, { name: "Ada" });

        expect(host.children.length).toBe(2);
        region.unmount();
        expect(host.childNodes.length).toBe(0);
    });
});
