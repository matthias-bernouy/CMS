import { describe, test, expect } from "bun:test";
import { parseHTML } from "linkedom";
import { hardenStoredHtml } from "cms-control/core/validation/hardenStoredHtml";

/** Re-parse sanitized HTML and collect any surviving `on*` event-handler
 *  attribute names — the semantically precise "did a handler survive?" check
 *  (a literal `onerror=` inside an unquoted `src` value is a URL, not a handler). */
function survivingHandlers(htmlOut: string): string[] {
    const { document } = parseHTML(`<!DOCTYPE html><html><body>${htmlOut}</body></html>`);
    const names: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
        for (const n of el.getAttributeNames()) if (n.toLowerCase().startsWith("on")) names.push(n);
    }
    return names;
}

/**
 * Regression suite for the stored-XSS hardening. These payloads were confirmed
 * to BYPASS the previous regex-based sanitizer (handler split by `/`, scheme
 * encoded as HTML entities); they must stay neutralized by the DOM sanitizer.
 */
describe("hardenStoredHtml — neutralizes stored-XSS vectors", () => {
    test("strips <script> elements but keeps siblings", () => {
        const out = hardenStoredHtml(`<script>alert(1)</script><p>ok</p>`);
        expect(out).not.toMatch(/<script/i);
        expect(out).toContain("ok");
    });

    test("no event-handler attribute survives, whatever the separator", () => {
        for (const p of [
            `<img src=x onerror=alert(1)>`,
            `<img src=x/onerror=alert(1)>`,   // onerror here is part of the src URL, not a handler
            `<svg/onload=alert(1)>`,           // slash after tag name → onload IS a real attribute
            `<img/src/onerror=alert(1)>`,      // slash-separated attributes → onerror IS real
            `<div onclick="evil()">hi</div>`,
            `<body ONLOAD=alert(1)>`,
        ]) {
            expect(survivingHandlers(hardenStoredHtml(p))).toEqual([]);
        }
    });

    test("neutralizes javascript: even when entity- or whitespace-encoded", () => {
        for (const p of [
            `<a href="javascript:alert(1)">x</a>`,
            `<a href="javascript&colon;alert(1)">x</a>`,
            `<a href="javascript&#58;alert(1)">x</a>`,
            `<a href="javascript&#x3a;alert(1)">x</a>`,
            `<a href="java\tscript:alert(1)">x</a>`,
        ]) {
            const out = hardenStoredHtml(p);
            expect(out.toLowerCase()).not.toContain("javascript:");
            expect(out).toContain("x"); // link text preserved, only href dropped
        }
    });

    test("drops iframe srcdoc payloads", () => {
        const out = hardenStoredHtml(`<iframe srcdoc="<script>alert(1)</script>"></iframe>`);
        expect(out.toLowerCase()).not.toContain("srcdoc");
    });
});

describe("hardenStoredHtml — preserves legitimate content", () => {
    test("does NOT corrupt text content that mentions handlers/schemes", () => {
        const out = hardenStoredHtml(`<p>The onclick handler fires on click of javascript: links</p>`);
        expect(out).toContain("The onclick handler fires on click of javascript: links");
    });

    test("keeps safe links and inline data:image", () => {
        expect(hardenStoredHtml(`<a href="https://example.com">l</a>`)).toContain("https://example.com");
        expect(hardenStoredHtml(`<a href="/about">l</a>`)).toContain('href="/about"');
        expect(hardenStoredHtml(`<a href="mailto:a@b.co">l</a>`)).toContain("mailto:a@b.co");
        expect(hardenStoredHtml(`<img src="data:image/png;base64,iVBORw0KGgo=">`)).toContain("data:image/png");
    });
});
