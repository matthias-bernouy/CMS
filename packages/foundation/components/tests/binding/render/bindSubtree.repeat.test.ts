import { describe, test, expect } from "bun:test";
import { bindSubtree } from "../../../src/binding/render/bindSubtree";
import { type Scope } from "../../../src/binding/scope";

function el(html: string): HTMLElement {
    const host = document.createElement("div");
    host.innerHTML = html.trim();
    return host.firstElementChild as HTMLElement;
}

const text = (e: Element) => (e.textContent ?? "").trim();
const hasComment = (e: Element) =>
    Array.from(e.childNodes).some((n) => n.nodeType === Node.COMMENT_NODE);

describe("cms-repeat — basic iteration", () => {
    test("array of primitives via {{ value }}", () => {
        const ul = el(`<ul><li cms-repeat="items">{{ value }}</li></ul>`);
        bindSubtree(ul, { value: { items: ["a", "b", "c"] } });
        const lis = ul.querySelectorAll("li");
        expect(lis.length).toBe(3);
        expect(Array.from(lis).map(text)).toEqual(["a", "b", "c"]);
    });

    test("array of objects via field tokens", () => {
        const ul = el(`<ul><li cms-repeat="rows">{{ name }}</li></ul>`);
        bindSubtree(ul, { value: { rows: [{ name: "Ada" }, { name: "Bob" }] } });
        expect(Array.from(ul.querySelectorAll("li")).map(text)).toEqual(["Ada", "Bob"]);
    });

    test("attributes inside a clone are interpolated against the item", () => {
        const ul = el(`<ul><a cms-repeat="rows" href="/p/{{ id }}">{{ name }}</a></ul>`);
        bindSubtree(ul, { value: { rows: [{ id: 1, name: "x" }, { id: 2, name: "y" }] } });
        const as = ul.querySelectorAll("a");
        expect(as[0]!.getAttribute("href")).toBe("/p/1");
        expect(as[1]!.getAttribute("href")).toBe("/p/2");
    });
});

describe("cms-repeat — template hygiene", () => {
    test("the original template node is replaced by a comment marker", () => {
        const ul = el(`<ul><li cms-repeat="items">{{ value }}</li></ul>`);
        bindSubtree(ul, { value: { items: ["a"] } });
        expect(hasComment(ul)).toBe(true);
    });

    test("clones carry no cms-repeat directive (idempotent re-scan)", () => {
        const ul = el(`<ul><li cms-repeat="items">{{ value }}</li></ul>`);
        bindSubtree(ul, { value: { items: ["a", "b"] } });
        expect(Array.from(ul.querySelectorAll("li")).some((li) => li.hasAttribute("cms-repeat"))).toBe(false);
    });
});

describe("cms-repeat — empty / missing / non-array", () => {
    test("empty array → marker only, no clones", () => {
        const ul = el(`<ul><li cms-repeat="items">{{ value }}</li></ul>`);
        bindSubtree(ul, { value: { items: [] } });
        expect(ul.querySelectorAll("li").length).toBe(0);
        expect(hasComment(ul)).toBe(true);
    });

    test("missing path → marker only, template removed", () => {
        const ul = el(`<ul><li cms-repeat="nope">{{ value }}</li></ul>`);
        bindSubtree(ul, { value: {} });
        expect(ul.querySelectorAll("li").length).toBe(0);
        expect(hasComment(ul)).toBe(true);
    });
});

describe("cms-repeat — nested iteration", () => {
    test("inner repeat stamps per outer item", () => {
        const root = el(`
            <div>
                <section cms-repeat="rows">
                    <h3>{{ title }}</h3>
                    <span cms-repeat="tags">{{ value }}</span>
                </section>
            </div>
        `);
        bindSubtree(root, {
            value: {
                rows: [
                    { title: "A", tags: ["x", "y"] },
                    { title: "B", tags: ["z"] },
                ],
            },
        });
        const sections = root.querySelectorAll("section");
        expect(sections.length).toBe(2);
        expect(text(sections[0]!.querySelector("h3")!)).toBe("A");
        expect(Array.from(sections[0]!.querySelectorAll("span")).map(text)).toEqual(["x", "y"]);
        expect(Array.from(sections[1]!.querySelectorAll("span")).map(text)).toEqual(["z"]);
    });
});

describe("cms-repeat — named binding keeps the parent reachable", () => {
    test("`rows as row` lets a clone read its item AND a parent field", () => {
        const ul = el(`<ul><li cms-repeat="lines as line">{{ line.sku }} @ {{ order.id }}</li></ul>`);
        const scope: Scope = { value: { order: { id: 9 }, lines: [{ sku: "A1" }, { sku: "B2" }] } };
        bindSubtree(ul, scope);
        expect(Array.from(ul.querySelectorAll("li")).map(text)).toEqual(["A1 @ 9", "B2 @ 9"]);
    });
});

describe("cms-condition — truthy path filtering", () => {
    test("removes elements whose condition resolves false", () => {
        const root = el(`
            <div>
                <p cms-condition="visible">Visible</p>
                <p cms-condition="hidden">Hidden</p>
            </div>
        `);

        bindSubtree(root, { value: { visible: true, hidden: false } });

        expect(Array.from(root.querySelectorAll("p")).map(text)).toEqual(["Visible"]);
    });

    test("supports negated paths", () => {
        const root = el(`
            <div>
                <p cms-condition="!archived">Current</p>
                <p cms-condition="!active">Inactive</p>
            </div>
        `);

        bindSubtree(root, { value: { archived: false, active: true } });

        expect(Array.from(root.querySelectorAll("p")).map(text)).toEqual(["Current"]);
    });

    test("filters repeated clones against each item scope", () => {
        const root = el(`
            <ul>
                <li cms-repeat="items as item" cms-condition="item.visible">{{ item.title }}</li>
            </ul>
        `);

        bindSubtree(root, {
            value: {
                items: [
                    { title: "Visible", visible: true },
                    { title: "Hidden", visible: false },
                ],
            },
        });

        expect(Array.from(root.querySelectorAll("li")).map(text)).toEqual(["Visible"]);
    });
});
