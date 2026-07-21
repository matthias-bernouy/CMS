import { describe, test, expect } from "bun:test";
import { extractRefs, validateDocs } from "cms-cli/push/shared/validate";

const empty = () => new Set<string>();
const set = (s: string[]) => new Set(s);

describe("extractRefs", () => {
    test("captures non-system custom-element tags as bloc refs", () => {
        const { blocs } = extractRefs("<cs-step-card></cs-step-card><my-button>x</my-button>");
        expect(blocs).toEqual(new Set(["cs-step-card", "my-button"]));
    });

    test("skips system prefixes but keeps base blocs as normal refs", () => {
        const { blocs } = extractRefs(
            `<p9r-input></p9r-input>
             <w13c-fixed-admin-layout></w13c-fixed-admin-layout>
             <be5-editor></be5-editor>
             <cms-binding-core></cms-binding-core>
             <base-card></base-card>
             <cs-stat-tile></cs-stat-tile>`,
        );
        expect(blocs).toEqual(new Set(["base-card", "cs-stat-tile"]));
    });

    test("captures base-prefixed tags as bloc refs", () => {
        const { blocs } = extractRefs("<base-card></base-card>");
        expect(blocs).toEqual(new Set(["base-card"]));
    });

    test("skips reserved w13c tags", () => {
        const { blocs } = extractRefs(`<w13c-reserved-example data-id="header"></w13c-reserved-example>`);
        expect(blocs.size).toBe(0);
    });

    test("ignores plain HTML and uppercase variants", () => {
        const { blocs } = extractRefs("<P>plain</P><div>x</div><a href=/x>y</a>");
        expect(blocs.size).toBe(0);
    });
});

describe("validateDocs", () => {
    test("no issue when every ref is on remote", () => {
        const r = validateDocs([{ source: "/about", content: "<cs-card></cs-card>" }], set(["cs-card"]), empty());
        expect(r.errors).toEqual([]);
        expect(r.warnings).toEqual([]);
    });

    test("warning when ref is local-only (forward-compat)", () => {
        const r = validateDocs([{ source: "/about", content: "<cs-local></cs-local>" }], empty(), set(["cs-local"]));
        expect(r.errors).toEqual([]);
        expect(r.warnings).toEqual([{ source: "/about", kind: "bloc", name: "cs-local" }]);
    });

    test("error when ref is unknown both remote and local", () => {
        const r = validateDocs([{ source: "/x", content: "<cs-mystery></cs-mystery>" }], empty(), empty());
        expect(r.errors).toEqual([{ source: "/x", kind: "bloc", name: "cs-mystery" }]);
        expect(r.warnings).toEqual([]);
    });

    test("aggregates issues across multiple docs without duplicates per ref-per-doc", () => {
        const r = validateDocs(
            [
                { source: "/a", content: `<cs-a></cs-a><cs-a></cs-a><cs-missing></cs-missing>` },
                { source: "/b", content: `<cs-a></cs-a>` },
            ],
            empty(),
            set(["cs-a"]),
        );
        expect(r.warnings.filter((w) => w.source === "/a" && w.name === "cs-a")).toHaveLength(1);
        expect(r.warnings.filter((w) => w.source === "/b" && w.name === "cs-a")).toHaveLength(1);
        expect(r.errors).toEqual([{ source: "/a", kind: "bloc", name: "cs-missing" }]);
    });

    test("works on template sources too — same generic shape", () => {
        const r = validateDocs([{ source: "template:header", content: "<cs-button></cs-button>" }], empty(), empty());
        expect(r.errors).toEqual([{ source: "template:header", kind: "bloc", name: "cs-button" }]);
    });
});
