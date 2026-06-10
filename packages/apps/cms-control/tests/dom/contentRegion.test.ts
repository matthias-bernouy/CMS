import { describe, test, expect } from "bun:test";
import { findContentRegion, isRegionEmpty, applyPickedTemplate } from "cms-control/components/editor/EditorSystem/EditorRoot/contentRegion";

/** Build an element from HTML (happy-dom via tests/setup.ts). */
function el(html: string): Element {
    const host = document.createElement("div");
    host.innerHTML = html.trim();
    return host.firstElementChild as Element;
}

describe("findContentRegion", () => {
    test("page: returns the [data-cms-content] marker inside the composed Shell", () => {
        const wrapper = el(`<div cms-bind-stop><cms-binding-core><div data-cms-content><p>x</p></div></cms-binding-core></div>`);
        expect(findContentRegion([wrapper])).toBe(wrapper.querySelector("[data-cms-content]"));
    });

    test("template/snippet (no Shell): falls back to the cms-bind-stop element itself", () => {
        const wrapper = el(`<div cms-bind-stop><p>x</p></div>`);
        expect(findContentRegion([wrapper])).toBe(wrapper);
    });

    test("no cms-bind-stop wrapper → null", () => {
        expect(findContentRegion([el(`<section>x</section>`)])).toBeNull();
    });
});

describe("isRegionEmpty", () => {
    test("null region → empty", () => {
        expect(isRegionEmpty(null)).toBe(true);
    });

    // Regression guard for the Shell-in-canvas change: the cms-bind-stop +
    // <cms-binding-core> + [data-cms-content] wrapper must NOT mask a fresh
    // page's single empty <p>, otherwise the new-page template picker never
    // opens (the slotted wrapper element is a <div>, not the empty <p>).
    test("fresh page (empty <p> inside the marker inside the Shell) → empty", () => {
        const wrapper = el(`<div cms-bind-stop><cms-binding-core><div data-cms-content style="display:contents"><p></p></div></cms-binding-core></div>`);
        expect(isRegionEmpty(findContentRegion([wrapper]))).toBe(true);
    });

    test("<p><br></p> → empty", () => {
        const wrapper = el(`<div cms-bind-stop><div data-cms-content><p><br></p></div></div>`);
        expect(isRegionEmpty(findContentRegion([wrapper]))).toBe(true);
    });

    test("real bloc content → not empty", () => {
        const wrapper = el(`<div cms-bind-stop><cms-binding-core><div data-cms-content><base-card>hi</base-card></div></cms-binding-core></div>`);
        expect(isRegionEmpty(findContentRegion([wrapper]))).toBe(false);
    });

    test("<p> with text → not empty", () => {
        const wrapper = el(`<div cms-bind-stop><div data-cms-content><p>hello</p></div></div>`);
        expect(isRegionEmpty(findContentRegion([wrapper]))).toBe(false);
    });

    test("two empty paragraphs → not empty", () => {
        const wrapper = el(`<div cms-bind-stop><div data-cms-content><p></p><p></p></div></div>`);
        expect(isRegionEmpty(findContentRegion([wrapper]))).toBe(false);
    });
});

describe("applyPickedTemplate", () => {
    // Regression guard: picking a template on a new page must NOT destroy the
    // cms-bind-stop / Shell wrapper, or pageContent (which locates content via
    // findContentRegion) would persist "" on the next save.
    test("region present: replaces only the region content, preserving the wrapper", () => {
        const host = el(`<div><div cms-bind-stop><cms-binding-core><div data-cms-content style="display:contents"><p></p></div></cms-binding-core></div></div>`);
        const region = findContentRegion(Array.from(host.children))!;
        applyPickedTemplate(host, region, `<base-card>tpl</base-card>`);
        const after = findContentRegion(Array.from(host.children));
        expect(after).toBe(region);                                  // wrapper NOT destroyed
        expect(host.querySelector("[cms-bind-stop]")).not.toBeNull();
        expect(isRegionEmpty(after)).toBe(false);                    // template is now the content
        expect(after!.querySelector("base-card")).not.toBeNull();
    });

    test("no wrapper (fallback): replaces default-slotted children, keeps named slots", () => {
        const host = el(`<div><p>old</p><style slot="style">x</style></div>`);
        applyPickedTemplate(host, null, `<base-card>tpl</base-card>`);
        expect(host.querySelector("base-card")).not.toBeNull();
        expect(host.querySelector("p")).toBeNull();                   // default content replaced
        expect(host.querySelector('[slot="style"]')).not.toBeNull();  // named slot survives
    });
});
