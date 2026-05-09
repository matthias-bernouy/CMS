import { describe, test, expect } from "bun:test";
import { parseHTML } from "linkedom";
import { buildMetaCsp } from "src/delivery/core/head/buildMetaCsp";

function makeHead() {
    const { document } = parseHTML("<!DOCTYPE html><html><head><title>x</title></head><body></body></html>");
    return { document, head: document.head };
}

describe("buildMetaCsp", () => {
    test("inserts a meta tag at the very top of <head>", () => {
        const { document, head } = makeHead();
        buildMetaCsp(document, head, { connectExtras: [], mediaExtras: [] });

        const first = head.firstElementChild as HTMLElement | null;
        expect(first?.tagName.toLowerCase()).toBe("meta");
        expect(first?.getAttribute("http-equiv")).toBe("Content-Security-Policy");
    });

    test("emits the baseline CSP content when extras are empty", () => {
        const { document, head } = makeHead();
        buildMetaCsp(document, head, { connectExtras: [], mediaExtras: [] });

        const meta = head.querySelector('meta[http-equiv="Content-Security-Policy"]');
        const content = meta?.getAttribute("content") ?? "";
        expect(content).toContain("default-src 'self'");
        expect(content).not.toContain("connect-src");
        expect(content).not.toContain("media-src");
    });

    test("includes connectExtras and mediaExtras in the emitted directives", () => {
        const { document, head } = makeHead();
        buildMetaCsp(document, head, {
            connectExtras: ["https://api.example.com"],
            mediaExtras:   ["https://cdn.example.com"],
        });

        const content = head.querySelector('meta[http-equiv="Content-Security-Policy"]')
            ?.getAttribute("content") ?? "";
        expect(content).toContain("connect-src 'self' https://api.example.com");
        expect(content).toContain("media-src 'self' https://cdn.example.com");
    });

    test("each call prepends its own meta — the freshest CSP is first", () => {
        const { document, head } = makeHead();
        buildMetaCsp(document, head, { connectExtras: ["https://first.com"], mediaExtras: [] });
        buildMetaCsp(document, head, { connectExtras: ["https://second.com"], mediaExtras: [] });

        const metas = head.querySelectorAll('meta[http-equiv="Content-Security-Policy"]');
        expect(metas.length).toBe(2);
        expect(metas[0]?.getAttribute("content")).toContain("https://second.com");
    });
});
