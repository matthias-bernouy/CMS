import { describe, test, expect } from "bun:test";
import { stripResidualChrome } from "cms-control/components/editor/EditorSystem/EditorRoot/stripResidualChrome";

function el(html: string): HTMLElement {
    const host = document.createElement("div");
    host.innerHTML = html.trim();
    return host.firstElementChild as HTMLElement;
}

describe("stripResidualChrome — style handling", () => {
    // Regression guard (S0): the old code removed the ENTIRE style attribute
    // whenever pointer-events matched — and the editor stamps an inline
    // pointer-events override on EVERY editorized target, so any authored
    // inline style was silently deleted on save.
    test("authored declarations survive; only the pointer-events override is removed", () => {
        const node = el(`<h2 style="color: red; pointer-events: auto !important;">t</h2>`);
        stripResidualChrome(node);
        const style = node.getAttribute("style") ?? "";
        expect(style).toContain("color");
        expect(style).not.toContain("pointer-events");
    });

    test("a pointer-events-only style drops the whole attribute (no empty style residue)", () => {
        const node = el(`<p style="pointer-events: auto !important;">t</p>`);
        stripResidualChrome(node);
        expect(node.hasAttribute("style")).toBe(false);
    });

    test("a style without pointer-events is untouched", () => {
        const node = el(`<p style="margin: 4px;">t</p>`);
        stripResidualChrome(node);
        expect(node.getAttribute("style")).toContain("margin");
    });
});

describe("stripResidualChrome — existing strip behavior (regression)", () => {
    test("p9r-*, contenteditable, tabindex, draggable, editor-block are stripped", () => {
        const node = el(
            `<div p9r-identifier="a" p9r-action-disable-delete="true" contenteditable="true"
                  tabindex="0" draggable="true" class="editor-block lead">x</div>`
        );
        stripResidualChrome(node);
        expect(node.getAttributeNames().some(n => n.startsWith("p9r-"))).toBe(false);
        expect(node.hasAttribute("contenteditable")).toBe(false);
        expect(node.hasAttribute("tabindex")).toBe(false);
        expect(node.hasAttribute("draggable")).toBe(false);
        expect(node.classList.contains("editor-block")).toBe(false);
        expect(node.classList.contains("lead")).toBe(true);
    });

    test("authored binding directives are NEVER touched", () => {
        const node = el(
            `<div cms-source="/api/x" cms-repeat="items" cms-param-sync="q" p9r-identifier="a">{{ name }}</div>`
        );
        stripResidualChrome(node);
        expect(node.getAttribute("cms-source")).toBe("/api/x");
        expect(node.getAttribute("cms-repeat")).toBe("items");
        expect(node.getAttribute("cms-param-sync")).toBe("q");
        expect(node.innerHTML).toContain("{{ name }}");
    });

    test("walks into <template>.content", () => {
        const node = el(`<div><template><span p9r-identifier="x" style="color: blue; pointer-events: none;">y</span></template></div>`);
        stripResidualChrome(node);
        const inner = (node.querySelector("template") as HTMLTemplateElement).content.querySelector("span")!;
        expect(inner.hasAttribute("p9r-identifier")).toBe(false);
        expect(inner.getAttribute("style")).toContain("color");
        expect(inner.getAttribute("style") ?? "").not.toContain("pointer-events");
    });
});
