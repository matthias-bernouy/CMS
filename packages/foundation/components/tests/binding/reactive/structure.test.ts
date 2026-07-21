import { describe, test, expect, afterEach } from "bun:test";
import { CompiledTemplate } from "../../../src/binding/reactive/CompiledTemplate";
import { resetDom, text } from "../testUtils";

afterEach(resetDom);

function fragment(html: string): DocumentFragment {
    const tpl = document.createElement("template");
    tpl.innerHTML = html.trim();
    return tpl.content;
}

function mount(html: string, scope: unknown) {
    const host = document.createElement("div");
    const compiled = CompiledTemplate.fromFragment(fragment(html));
    const region = compiled.mount(host, { value: scope });
    document.body.appendChild(host);
    return { compiled, host, region };
}

describe("CompiledTemplate — cms-condition", () => {
    test("can hide, show, update, hide, and show the same authored branch", () => {
        const { host, region } = mount(`<p cms-condition="visible">Hello {{ name }}</p>`, {
            visible: false,
            name: "Hidden",
        });

        expect(host.querySelector("p")).toBeNull();

        region.update({ value: { visible: true, name: "Ada" } });
        const shown = host.querySelector("p")!;
        expect(text(shown)).toBe("Hello Ada");
        expect(shown.getAttribute("cms-condition")).toBe("visible");

        region.update({ value: { visible: true, name: "Grace" } });
        expect(host.querySelector("p")).toBe(shown);
        expect(text(host.querySelector("p"))).toBe("Hello Grace");

        region.update({ value: { visible: false, name: "Gone" } });
        expect(host.querySelector("p")).toBeNull();

        region.update({ value: { visible: true, name: "Lin" } });
        expect(text(host.querySelector("p"))).toBe("Hello Lin");
    });
});

describe("CompiledTemplate — cms-repeat", () => {
    test("restamps arrays, empty arrays, and non-arrays", () => {
        const { host, region } = mount(`<ul><li cms-repeat="items as item">{{ item.name }}</li></ul>`, {
            items: [{ name: "Ada" }, { name: "Grace" }],
        });

        expect(Array.from(host.querySelectorAll("li")).map(text)).toEqual(["Ada", "Grace"]);
        expect(Array.from(host.querySelectorAll("li")).some((li) => li.hasAttribute("cms-repeat"))).toBe(false);

        region.update({ value: { items: [{ name: "Lin" }] } });
        expect(Array.from(host.querySelectorAll("li")).map(text)).toEqual(["Lin"]);

        region.update({ value: { items: [] } });
        expect(host.querySelectorAll("li").length).toBe(0);

        const warn = console.warn;
        const warnings: unknown[][] = [];
        console.warn = (...args: unknown[]) => {
            warnings.push(args);
        };
        try {
            region.update({ value: { items: "not-an-array" } });
        } finally {
            console.warn = warn;
        }
        expect(host.querySelectorAll("li").length).toBe(0);
        expect(String(warnings[0]?.[0] ?? "")).toContain('cms-repeat="items" expected an array');
    });

    test("named item scopes keep parent data reachable", () => {
        const { host, region } = mount(`<ol><li cms-repeat="items as item">{{ item.name }} / {{ title }}</li></ol>`, {
            title: "People",
            items: [{ name: "Ada" }],
        });

        expect(text(host.querySelector("li"))).toBe("Ada / People");

        region.update({ value: { title: "Guests", items: [{ name: "Grace" }, { name: "Lin" }] } });
        expect(Array.from(host.querySelectorAll("li")).map(text)).toEqual(["Grace / Guests", "Lin / Guests"]);
    });

    test("nested repeats restamp from each item scope", () => {
        const { host, region } = mount(
            `
            <section cms-repeat="groups as group">
                <h2>{{ group.title }}</h2>
                <span cms-repeat="group.tags as tag">{{ tag }}</span>
            </section>
        `,
            {
                groups: [
                    { title: "A", tags: ["x", "y"] },
                    { title: "B", tags: ["z"] },
                ],
            },
        );

        expect(Array.from(host.querySelectorAll("h2")).map(text)).toEqual(["A", "B"]);
        expect(Array.from(host.querySelectorAll("span")).map(text)).toEqual(["x", "y", "z"]);

        region.update({ value: { groups: [{ title: "C", tags: ["q"] }] } });
        expect(Array.from(host.querySelectorAll("h2")).map(text)).toEqual(["C"]);
        expect(Array.from(host.querySelectorAll("span")).map(text)).toEqual(["q"]);
    });

    test("root conditions on repeated items filter each clone", () => {
        const { host, region } = mount(
            `<li cms-repeat="items as item" cms-condition="item.visible">{{ item.name }}</li>`,
            {
                items: [
                    { name: "Ada", visible: true },
                    { name: "Grace", visible: false },
                ],
            },
        );

        expect(Array.from(host.querySelectorAll("li")).map(text)).toEqual(["Ada"]);

        region.update({
            value: {
                items: [
                    { name: "Ada", visible: false },
                    { name: "Grace", visible: true },
                ],
            },
        });
        expect(Array.from(host.querySelectorAll("li")).map(text)).toEqual(["Grace"]);
    });

    test("nested source attributes bind inside repeated clones while source content stays inert", () => {
        const { host, region } = mount(
            `
            <section cms-repeat="items as item">
                <div cms-source="{{ item.endpoint }}" data-id="{{ item.id }}">
                    <p>{{ label }}</p>
                </div>
            </section>
        `,
            {
                items: [{ id: "a", endpoint: "/a" }],
            },
        );

        const source = host.querySelector("[cms-source]")!;
        expect(source.getAttribute("cms-source")).toBe("/a");
        expect(source.getAttribute("data-id")).toBe("a");
        expect(text(source.querySelector("p"))).toBe("{{ label }}");

        region.update({
            value: {
                items: [
                    { id: "b", endpoint: "/b" },
                    { id: "c", endpoint: "/c" },
                ],
            },
        });
        expect(Array.from(host.querySelectorAll("[cms-source]")).map((el) => el.getAttribute("cms-source"))).toEqual([
            "/b",
            "/c",
        ]);
        expect(Array.from(host.querySelectorAll("[cms-source] p")).map(text)).toEqual(["{{ label }}", "{{ label }}"]);
    });
});

describe("CompiledTemplate — raw HTML", () => {
    test("replaces the placeholder element with parsed HTML on each update", () => {
        const { host, region } = mount(`<div class="html"><raw-html>{{ html | innerHTML }}</raw-html></div>`, {
            html: "<b>First</b>",
        });

        expect(host.querySelector("raw-html")).toBeNull();
        expect(text(host.querySelector("b"))).toBe("First");

        region.update({ value: { html: "<i>Second</i>" } });
        expect(host.querySelector("b")).toBeNull();
        expect(text(host.querySelector("i"))).toBe("Second");

        region.update({ value: { html: "" } });
        expect(host.querySelector("raw-html")).toBeNull();
        expect(host.querySelector(".html")!.children.length).toBe(0);
    });

    test("raw HTML still works when the placeholder is the shown condition root", () => {
        const { host, region } = mount(`<raw-html cms-condition="visible">{{ html | innerHTML }}</raw-html>`, {
            visible: false,
            html: "<b>Hidden</b>",
        });

        expect(host.querySelector("b")).toBeNull();

        region.update({ value: { visible: true, html: "<b>Shown</b>" } });
        expect(host.querySelector("raw-html")).toBeNull();
        expect(text(host.querySelector("b"))).toBe("Shown");
    });
});

describe("CompiledTemplate — structural cloneRaw", () => {
    test("cloneRaw() keeps authored structural directives after live updates", () => {
        const { compiled, region } = mount(
            `
            <p cms-condition="visible">{{ name }}</p>
            <li cms-repeat="items as item">{{ item.name }}</li>
            <raw-html>{{ html | innerHTML }}</raw-html>
        `,
            {
                visible: true,
                name: "Ada",
                items: [{ name: "Grace" }],
                html: "<b>Trusted</b>",
            },
        );

        region.update({ value: { visible: false, items: [], html: "" } });
        const raw = compiled.cloneRaw();

        expect(raw.querySelector('[cms-condition="visible"]')).not.toBeNull();
        expect(raw.querySelector('[cms-repeat="items as item"]')).not.toBeNull();
        expect(text(raw.querySelector("raw-html"))).toBe("{{ html | innerHTML }}");
        expect(text(raw.querySelector("[cms-condition]"))).toBe("{{ name }}");
    });
});
