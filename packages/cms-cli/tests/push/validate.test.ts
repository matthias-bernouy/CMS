import { describe, test, expect } from "bun:test";
import { extractRefs, validateDocs } from "cms-cli/push/shared/validate";

const empty = () => new Set<string>();
const set   = (s: string[]) => new Set(s);

describe("extractRefs", () => {
    test("captures non-system custom-element tags as bloc refs", () => {
        const { blocs, snippets } = extractRefs("<cs-step-card></cs-step-card><my-button>x</my-button>");
        expect(blocs).toEqual(new Set(["cs-step-card", "my-button"]));
        expect(snippets.size).toBe(0);
    });

    test("skips reserved system prefixes (w13c-, cms-)", () => {
        const { blocs } = extractRefs("<w13c-fixed-admin-layout></w13c-fixed-admin-layout><cms-fetch></cms-fetch><cs-stat-tile></cs-stat-tile>");
        expect(blocs).toEqual(new Set(["cs-stat-tile"]));
    });

    test("captures w13c-snippet identifier as a snippet ref, not a bloc", () => {
        const { blocs, snippets } = extractRefs(`<w13c-snippet identifier="header"></w13c-snippet>`);
        expect(blocs.size).toBe(0);
        expect(snippets).toEqual(new Set(["header"]));
    });

    test("ignores plain HTML and uppercase variants", () => {
        const { blocs, snippets } = extractRefs("<P>plain</P><div>x</div><a href=/x>y</a>");
        expect(blocs.size).toBe(0);
        expect(snippets.size).toBe(0);
    });
});

describe("validateDocs", () => {
    test("no issue when every ref is on remote", () => {
        const r = validateDocs(
            [{ source: "/about", content: "<cs-card></cs-card>" }],
            set(["cs-card"]), empty(), empty(), empty(),
        );
        expect(r.errors).toEqual([]);
        expect(r.warnings).toEqual([]);
    });

    test("warning when ref is local-only (forward-compat)", () => {
        const r = validateDocs(
            [{ source: "/about", content: `<w13c-snippet identifier="header"></w13c-snippet>` }],
            empty(), empty(), empty(), set(["header"]),
        );
        expect(r.errors).toEqual([]);
        expect(r.warnings).toEqual([{ source: "/about", kind: "snippet", name: "header" }]);
    });

    test("error when ref is unknown both remote and local", () => {
        const r = validateDocs(
            [{ source: "/x", content: "<cs-mystery></cs-mystery>" }],
            empty(), empty(), empty(), empty(),
        );
        expect(r.errors).toEqual([{ source: "/x", kind: "bloc", name: "cs-mystery" }]);
        expect(r.warnings).toEqual([]);
    });

    test("aggregates issues across multiple docs without duplicates per ref-per-doc", () => {
        const r = validateDocs(
            [
                { source: "/a", content: `<cs-a></cs-a><cs-a></cs-a><w13c-snippet identifier="hdr"></w13c-snippet>` },
                { source: "/b", content: `<cs-a></cs-a>` },
            ],
            empty(), set(["cs-a"]), empty(), empty(),
        );
        expect(r.warnings.filter(w => w.source === "/a" && w.name === "cs-a")).toHaveLength(1);
        expect(r.warnings.filter(w => w.source === "/b" && w.name === "cs-a")).toHaveLength(1);
        expect(r.errors).toEqual([{ source: "/a", kind: "snippet", name: "hdr" }]);
    });

    test("works on snippet sources too — same generic shape", () => {
        const r = validateDocs(
            [{ source: "snippet:header", content: "<cs-button></cs-button>" }],
            empty(), empty(), empty(), empty(),
        );
        expect(r.errors).toEqual([{ source: "snippet:header", kind: "bloc", name: "cs-button" }]);
    });
});
