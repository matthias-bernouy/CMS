import { afterEach, describe, expect, test } from "bun:test";
import { resetDom, text } from "../testUtils";
import { mount } from "./compiledTemplateTestUtils";

afterEach(resetDom);

describe("CompiledTemplate — cms-repeat", () => {
    test("restamps arrays, empty arrays, and non-arrays", () => {
        const { host, region } = mount(`<ul><li cms-repeat="items as item">{{ item.name }}</li></ul>`, {
            items: [{ name: "Ada" }, { name: "Grace" }],
        });
        expect(Array.from(host.querySelectorAll("li")).map(text)).toEqual(["Ada", "Grace"]);
        expect(Array.from(host.querySelectorAll("li")).some((item) => item.hasAttribute("cms-repeat"))).toBe(false);
        region.update({ value: { items: [{ name: "Lin" }] } });
        expect(Array.from(host.querySelectorAll("li")).map(text)).toEqual(["Lin"]);
        region.update({ value: { items: [] } });
        expect(host.querySelectorAll("li").length).toBe(0);
        const warn = console.warn;
        const warnings: unknown[][] = [];
        console.warn = (...args: unknown[]) => warnings.push(args);
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
            `<section cms-repeat="groups as group">
                <h2>{{ group.title }}</h2>
                <span cms-repeat="group.tags as tag">{{ tag }}</span>
            </section>`,
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
            `<section cms-repeat="items as item">
                <div cms-source="{{ item.endpoint }}" data-id="{{ item.id }}"><p>{{ label }}</p></div>
            </section>`,
            { items: [{ id: "a", endpoint: "/a" }] },
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
        expect(
            Array.from(host.querySelectorAll("[cms-source]")).map((item) => item.getAttribute("cms-source")),
        ).toEqual(["/b", "/c"]);
        expect(Array.from(host.querySelectorAll("[cms-source] p")).map(text)).toEqual(["{{ label }}", "{{ label }}"]);
    });
});
