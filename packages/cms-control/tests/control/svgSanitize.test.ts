import { describe, test, expect } from "bun:test";
import { sanitizeSvg } from "cms-control/components/editor/componentSync/sync/SvgSync/sanitize";

describe("sanitizeSvg", () => {
    test("preserves a clean SVG (paths, fills, viewBox)", () => {
        const raw = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M0 0h24v24H0z"/></svg>`;
        const out = sanitizeSvg(raw);
        expect(out).toContain("<path");
        expect(out).toContain('viewBox="0 0 24 24"');
        expect(out).toContain('fill="currentColor"');
    });

    test("strips <script> children", () => {
        const raw = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><path d="M0 0"/></svg>`;
        const out = sanitizeSvg(raw);
        expect(out).not.toContain("<script");
        expect(out).not.toContain("alert");
        expect(out).toContain("<path");
    });

    test("strips on* event handlers from any element", () => {
        const raw = `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><path onclick="x()" d="M0 0"/></svg>`;
        const out = sanitizeSvg(raw);
        expect(out).not.toContain("onload");
        expect(out).not.toContain("onclick");
        expect(out).toContain("<path");
    });

    test("strips javascript: hrefs in <use>", () => {
        const raw = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="javascript:alert(1)"/></svg>`;
        const out = sanitizeSvg(raw);
        expect(out.toLowerCase()).not.toContain("javascript:");
    });

    test("preserves fragment + http hrefs in <use>", () => {
        const raw = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use href="#icon"/><use xlink:href="https://example.com/sprite.svg#icon"/></svg>`;
        const out = sanitizeSvg(raw);
        expect(out).toContain('href="#icon"');
        expect(out).toContain("https://example.com/sprite.svg");
    });

    test("strips disallowed tags like <foreignObject>", () => {
        const raw = `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>html injection</div></foreignObject><path d="M0 0"/></svg>`;
        const out = sanitizeSvg(raw);
        expect(out).not.toContain("foreignObject");
        expect(out).not.toContain("html injection");
        expect(out).toContain("<path");
    });

    test("throws when the input is not an SVG document", () => {
        expect(() => sanitizeSvg(`<div>not an svg</div>`)).toThrow();
    });
});
