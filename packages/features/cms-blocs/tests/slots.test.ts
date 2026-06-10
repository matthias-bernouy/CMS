import { describe, test, expect } from "bun:test";
import { captureContent, renderContent, isEmpty } from "../src/binding/slots";

function el(html: string): HTMLElement {
    const host = document.createElement("div");
    host.innerHTML = html.trim();
    return host.firstElementChild as HTMLElement;
}

const text = (e: Element) => (e.textContent ?? "").replace(/\s+/g, " ").trim();

describe("captureContent — partition", () => {
    test("splits slots from body and empties the element", () => {
        const src = el(`
            <div cms-source="/x">
                <p class="row">{{ name }}</p>
                <div cms-slot="loading">Loading…</div>
                <div cms-slot="error">Oops {{ status }}</div>
                <div cms-slot="empty">Nothing</div>
            </div>
        `);
        const { body, slots } = captureContent(src);
        expect(src.childNodes.length).toBe(0);
        expect(slots.loading && text(slots.loading.firstElementChild!)).toBe("Loading…");
        expect(slots.error).toBeDefined();
        expect(slots.empty && text(slots.empty.firstElementChild!)).toBe("Nothing");
        expect(text(body.querySelector(".row")!)).toBe("{{ name }}");
    });

    test("captured slot nodes lose their cms-slot attribute", () => {
        const src = el(`<div cms-source="/x"><div cms-slot="empty">x</div></div>`);
        const { slots } = captureContent(src);
        expect(slots.empty!.firstElementChild!.hasAttribute("cms-slot")).toBe(false);
    });

    test("a <template> body is captured as its inert content", () => {
        const src = el(`<div cms-source="/x"><template><p class="row">{{ name }}</p></template><div cms-slot="empty">none</div></div>`);
        const { body, slots } = captureContent(src);
        expect(src.childNodes.length).toBe(0);
        expect(body.querySelector(".row")?.textContent).toBe("{{ name }}");
        expect(slots.empty).toBeDefined();
    });

    test("only the first node per slot is kept", () => {
        const src = el(`<div cms-source="/x"><b cms-slot="empty">A</b><b cms-slot="empty">B</b></div>`);
        const { slots } = captureContent(src);
        expect(text(slots.empty!.firstElementChild!)).toBe("A");
        expect(slots.empty!.childNodes.length).toBe(1);
    });
});

describe("renderContent — bind on render, pristine preserved", () => {
    test("renders body bound against a scope", () => {
        const src = el(`<div cms-source="/x"><p>{{ name }}</p></div>`);
        const { body } = captureContent(src);
        renderContent(src, body, { value: { name: "Ada" } });
        expect(text(src.querySelector("p")!)).toBe("Ada");
    });

    test("a repeat body re-renders correctly twice (reload-ready)", () => {
        const src = el(`<ul cms-source="/x"><li cms-repeat="items">{{ value }}</li></ul>`);
        const { body } = captureContent(src);

        renderContent(src, body, { value: { items: ["a", "b"] } });
        expect(Array.from(src.querySelectorAll("li")).map(text)).toEqual(["a", "b"]);

        // Second render starts from the pristine fragment — the template was
        // never consumed in place.
        renderContent(src, body, { value: { items: ["x", "y", "z"] } });
        expect(Array.from(src.querySelectorAll("li")).map(text)).toEqual(["x", "y", "z"]);
    });

    test("null scope renders static content (tokens left verbatim)", () => {
        const src = el(`<div cms-source="/x"><span cms-slot="error">Err {{ status }}</span></div>`);
        const { slots } = captureContent(src);
        renderContent(src, slots.error!, null);
        expect(text(src.querySelector("span")!)).toBe("Err {{ status }}");
    });

    test("error slot bound with an error context", () => {
        const src = el(`<div cms-source="/x"><span cms-slot="error">Err {{ status }}</span></div>`);
        const { slots } = captureContent(src);
        renderContent(src, slots.error!, { value: { status: 404 } });
        expect(text(src.querySelector("span")!)).toBe("Err 404");
    });
});

describe("isEmpty", () => {
    test.each([
        [null, true],
        [undefined, true],
        [[], true],
        [{}, true],
        [[1], false],
        [{ a: 1 }, false],
        ["x", false],
        [0, false],
    ] as [unknown, boolean][])("isEmpty(%p) → %p", (input, expected) => {
        expect(isEmpty(input)).toBe(expected);
    });
});
