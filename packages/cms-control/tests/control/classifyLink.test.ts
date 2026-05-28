import { describe, test, expect } from "bun:test";
import { classifyLink } from "src/control/core/editorSystem/classifyLink";

const ORIGIN = "https://cms.example.com";
const PAGES = new Set(["/", "/about", "/blog/post-1"]);

describe("classifyLink", () => {
    test("empty / # / javascript: classify as `empty`", () => {
        expect(classifyLink("",                ORIGIN, PAGES).kind).toBe("empty");
        expect(classifyLink("#",               ORIGIN, PAGES).kind).toBe("empty");
        expect(classifyLink("javascript:void", ORIGIN, PAGES).kind).toBe("empty");
    });

    test("`#section` is an anchor", () => {
        const r = classifyLink("#hero", ORIGIN, PAGES);
        expect(r.kind).toBe("anchor");
        expect(r.target).toBe("hero");
    });

    test("`mailto:` / `tel:` / `sms:` are mailto-bucket", () => {
        expect(classifyLink("mailto:hi@example.com", ORIGIN, PAGES).kind).toBe("mailto");
        expect(classifyLink("tel:+33123456789",      ORIGIN, PAGES).kind).toBe("mailto");
        expect(classifyLink("sms:+33123456789",      ORIGIN, PAGES).kind).toBe("mailto");
    });

    test("known internal paths classify as `page`", () => {
        const r = classifyLink("/about", ORIGIN, PAGES);
        expect(r.kind).toBe("page");
        expect(r.target).toBe("/about");
    });

    test("unknown same-origin paths default to `page` (likely a draft)", () => {
        const r = classifyLink("/contact", ORIGIN, PAGES);
        expect(r.kind).toBe("page");
        expect(r.target).toBe("/contact");
    });

    test("internal asset prefixes classify as `asset`", () => {
        expect(classifyLink("/uploads/file.pdf", ORIGIN, PAGES).kind).toBe("asset");
        expect(classifyLink("/assets/logo.png",  ORIGIN, PAGES).kind).toBe("asset");
        expect(classifyLink("/api/page/list",    ORIGIN, PAGES).kind).toBe("asset");
    });

    test("absolute external URLs classify as `external`", () => {
        const r = classifyLink("https://example.com/path", ORIGIN, PAGES);
        expect(r.kind).toBe("external");
        expect(r.target).toBe("https://example.com/path");
    });

    test("absolute same-origin URLs are reduced to path classification", () => {
        const r = classifyLink(`${ORIGIN}/about`, ORIGIN, PAGES);
        expect(r.kind).toBe("page");
        expect(r.target).toBe("/about");
    });
});
