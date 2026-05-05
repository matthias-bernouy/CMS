import { describe, test, expect } from "bun:test";
import { rewriteHTML, isOptimizable, type VariantUrlResolver } from "src/delivery/core/enhance/rewriteHTML";

const wrap = (body: string) => `<!DOCTYPE html><html><head></head><body>${body}</body></html>`;

// Test resolver mirrors what `testMedia.formatImageUrl` used to produce —
// appends `?w=<width>` to the source. Independent of `MediaUrlBuilder` so
// these tests don't drag the broader Media→CDN migration in.
const resolve: VariantUrlResolver = (src, width) => {
    const u = new URL(src, "http://fake.local");
    u.searchParams.set("w", String(width));
    return u.toString();
};

describe("rewriteHTML — srcset via injected resolver", () => {
    test("builds srcset by calling the resolver for each width", () => {
        const html = wrap(`<img src="https://cdn.example.com/foo.jpg">`);
        const out = rewriteHTML(html, [
            { index: 0, widths: [400, 800], sizes: "100vw" },
        ], resolve);
        expect(out).toContain('srcset="https://cdn.example.com/foo.jpg?w=400 400w, https://cdn.example.com/foo.jpg?w=800 800w"');
        expect(out).toContain('sizes="100vw"');
    });

    test("skips data: URIs (no backend can resize them)", () => {
        const html = wrap(`<img src="data:image/png;base64,iVBOR">`);
        const out = rewriteHTML(html, [{ index: 0, widths: [400], sizes: "100vw" }], resolve);
        expect(out).not.toContain("srcset");
        expect(out).not.toContain("sizes");
    });

    test("skips .svg sources (resolution-independent, srcset is pointless)", () => {
        const html = wrap(`<img src="https://cdn.example.com/icon.svg">`);
        const out = rewriteHTML(html, [{ index: 0, widths: [400], sizes: "100vw" }], resolve);
        expect(out).not.toContain("srcset");
    });

    test("widths=[] is a no-op for srcset even with sizes provided", () => {
        const html = wrap(`<img src="https://cdn.example.com/foo.jpg">`);
        const out = rewriteHTML(html, [{ index: 0, widths: [], sizes: "100vw" }], resolve);
        expect(out).not.toContain("srcset");
        expect(out).not.toContain("sizes");
    });

    test("empty rewrites array returns the input untouched", () => {
        const html = wrap(`<img src="https://cdn.example.com/foo.jpg">`);
        expect(rewriteHTML(html, [], resolve)).toBe(html);
    });
});

describe("rewriteHTML — loading / fetchpriority", () => {
    test("loading='lazy' sets the attribute", () => {
        const html = wrap(`<img src="https://cdn.example.com/a.jpg">`);
        const out = rewriteHTML(html, [{ index: 0, widths: [], sizes: "", loading: "lazy" }], resolve);
        expect(out).toContain('loading="lazy"');
    });

    test("loading='eager' strips an existing loading attribute", () => {
        const html = wrap(`<img src="https://cdn.example.com/a.jpg" loading="lazy">`);
        const out = rewriteHTML(html, [{ index: 0, widths: [], sizes: "", loading: "eager" }], resolve);
        expect(out).not.toContain("loading=");
    });

    test("fetchpriority='high' sets the attribute", () => {
        const html = wrap(`<img src="https://cdn.example.com/a.jpg">`);
        const out = rewriteHTML(html, [{ index: 0, widths: [], sizes: "", fetchpriority: "high" }], resolve);
        expect(out).toContain('fetchpriority="high"');
    });

    test("loading/fetchpriority apply to SVG sources too (only srcset is skipped)", () => {
        const html = wrap(`<img src="https://cdn.example.com/icon.svg">`);
        const out = rewriteHTML(html, [{
            index: 0, widths: [400], sizes: "",
            loading: "lazy", fetchpriority: "high",
        }], resolve);
        expect(out).toContain('loading="lazy"');
        expect(out).toContain('fetchpriority="high"');
        expect(out).not.toContain("srcset");
    });
});

describe("rewriteHTML — index alignment", () => {
    test("rewrites match by document order index", () => {
        const html = wrap(
            `<img src="https://cdn.example.com/a.jpg">` +
            `<img src="https://cdn.example.com/b.jpg">` +
            `<img src="https://cdn.example.com/c.jpg">`
        );
        const out = rewriteHTML(html, [
            { index: 0, widths: [400], sizes: "100vw" },
            { index: 2, widths: [800], sizes: "200px" },
        ], resolve);
        expect(out).toContain("a.jpg?w=400 400w");
        expect(out).toContain("c.jpg?w=800 800w");
        // Index 1 was skipped — the middle image has no srcset.
        expect(out).not.toContain("b.jpg?w=");
    });
});

describe("isOptimizable", () => {
    test("accepts https URLs with standard extensions", () => {
        expect(isOptimizable("https://cdn.example.com/foo.jpg")).toBe(true);
    });

    test("rejects data URIs", () => {
        expect(isOptimizable("data:image/png;base64,xx")).toBe(false);
    });

    test("rejects .svg", () => {
        expect(isOptimizable("https://cdn.example.com/foo.svg")).toBe(false);
        expect(isOptimizable("https://cdn.example.com/foo.svg?v=1")).toBe(false);
        expect(isOptimizable("https://cdn.example.com/foo.svg#frag")).toBe(false);
    });

    test("rejects empty", () => {
        expect(isOptimizable("")).toBe(false);
    });
});
