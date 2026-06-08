import { describe, test, expect } from "bun:test";
import { bindSubtree } from "../src/binding/bindSubtree";
import { type Scope } from "../src/binding/scope";

/** Parse an HTML string into a single root element for binding. */
function el(html: string): HTMLElement {
    const tpl = document.createElement("div");
    tpl.innerHTML = html.trim();
    return tpl.firstElementChild as HTMLElement;
}

describe("bindSubtree — text nodes", () => {
    test("interpolates a text node from scope", () => {
        const root = el(`<p>Hello {{ name }}</p>`);
        bindSubtree(root, { value: { name: "Ada" } });
        expect(root.textContent).toBe("Hello Ada");
    });

    test("interpolates nested element text", () => {
        const root = el(`<div><span>{{ a }}</span><b>{{ b }}</b></div>`);
        bindSubtree(root, { value: { a: "1", b: "2" } });
        expect(root.querySelector("span")!.textContent).toBe("1");
        expect(root.querySelector("b")!.textContent).toBe("2");
    });

    test("unresolved token stays verbatim in text", () => {
        const root = el(`<p>{{ name }} — {{ missing }}</p>`);
        bindSubtree(root, { value: { name: "Ada" } });
        expect(root.textContent).toBe("Ada — {{ missing }}");
    });
});

describe("bindSubtree — attributes", () => {
    test("interpolates an attribute value", () => {
        const root = el(`<a href="/p?id={{ id }}">x</a>`);
        bindSubtree(root, { value: { id: 42 } });
        expect(root.getAttribute("href")).toBe("/p?id=42");
    });

    test("attribute value is written raw (no HTML entity encoding)", () => {
        const root = el(`<a title="{{ t }}">x</a>`);
        bindSubtree(root, { value: { t: `a & b < c` } });
        expect(root.getAttribute("title")).toBe("a & b < c");
    });

    test("unresolved attribute token stays verbatim", () => {
        const root = el(`<a href="{{ BASE_PATH }}/x">x</a>`);
        bindSubtree(root, { value: {} });
        expect(root.getAttribute("href")).toBe("{{ BASE_PATH }}/x");
    });
});

describe("bindSubtree — text content is literal (no markup injection)", () => {
    test("angle brackets in data do not create elements", () => {
        const root = el(`<p>{{ x }}</p>`);
        bindSubtree(root, { value: { x: "<img src=x onerror=alert(1)>" } });
        expect(root.children.length).toBe(0);
        expect(root.textContent).toBe("<img src=x onerror=alert(1)>");
    });
});

describe("bindSubtree — nested source boundary", () => {
    test("does not descend into a child [cms-source] subtree", () => {
        const root = el(`
            <div>
                <span class="outer">{{ id }}</span>
                <div cms-source="/api/x">
                    <span class="inner">{{ id }}</span>
                </div>
            </div>
        `);
        bindSubtree(root, { value: { id: "OUT" } });
        expect(root.querySelector(".outer")!.textContent).toBe("OUT");
        // inner belongs to the nested source's own pass — left untouched.
        expect(root.querySelector(".inner")!.textContent!.trim()).toBe("{{ id }}");
    });

    test("a nested source's own attributes ARE bound against the parent scope", () => {
        const root = el(`
            <div>
                <div cms-source="/api/x/{{ id }}" data-keep="{{ id }}">
                    <span>{{ id }}</span>
                </div>
            </div>
        `);
        bindSubtree(root, { value: { id: "7" } });
        const src = root.querySelector("[cms-source]")!;
        expect(src.getAttribute("cms-source")).toBe("/api/x/7");
        expect(src.getAttribute("data-keep")).toBe("7");
        expect(src.querySelector("span")!.textContent!.trim()).toBe("{{ id }}");
    });

    test("the root itself may be a source (controller binds its own subtree)", () => {
        const root = el(`<div cms-source="/api/x"><span>{{ id }}</span></div>`);
        bindSubtree(root, { value: { id: "ROOT" } });
        expect(root.querySelector("span")!.textContent).toBe("ROOT");
    });
});

describe("bindSubtree — chained scope (parent reachable)", () => {
    test("a child scope reads its own item and the parent", () => {
        const parent: Scope = { value: { order: { id: 9 } } };
        const child: Scope = { vars: { line: { sku: "A1" } }, parent };
        const root = el(`<p>{{ line.sku }} of order {{ order.id }}</p>`);
        bindSubtree(root, child);
        expect(root.textContent).toBe("A1 of order 9");
    });
});

describe("bindSubtree — filters", () => {
    test("applies an injected filter", () => {
        const root = el(`<p>{{ name | up }}</p>`);
        bindSubtree(root, { value: { name: "ada" } }, { up: (v) => String(v).toUpperCase() });
        expect(root.textContent).toBe("ADA");
    });
});
