import { expect, test } from "bun:test";
import { analyzeExpandedPageDocument, validateExpandedPageDocument } from "@bernouy/cms-content/page-document";

const codes = (html: string) => analyzeExpandedPageDocument(html, []).diagnostics.map((value) => value.code);

test("expanded authoring catches the reproduced site's nested main landmarks without changing historical validation", () => {
    const definitions = [
        { id: "example--test--shell", kind: "component" as const, markupHTML: "<main><slot></slot></main>" },
        { id: "example--test--section", kind: "component" as const, markupHTML: "<main><h1>Title</h1></main>" },
    ];
    const html = '<div cms-bloc="example--test--shell"><div cms-bloc="example--test--section"></div></div>';
    expect(() => validateExpandedPageDocument(html, definitions)).not.toThrow();
    const result = analyzeExpandedPageDocument(html, definitions);
    expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
            code: "page.main_nested",
            severity: "error",
            location: expect.objectContaining({ blocId: "example--test--section" }),
        }),
    );
});

test("main landmarks respect mutually exclusive cases, hidden alternatives and independent conditions", () => {
    expect(
        codes('<div cms-match="{{ state.mode }}"><main cms-case="one"></main><main cms-case="two"></main></div>'),
    ).not.toContain("page.multiple_main");
    expect(codes("<main></main><main hidden></main>")).not.toContain("page.multiple_main");
    expect(codes('<main cms-condition="{{ state.a }}"></main><main cms-condition="{{ state.b }}"></main>')).toContain(
        "page.multiple_main",
    );
    expect(codes('<main cms-repeat="item in state.items"></main>')).toContain("page.repeated_main");
    expect(codes("<article><main></main></article>")).toContain("page.main_ancestor");
});

test("slot expansion exposes invalid interactive and form nesting", () => {
    const definitions = [
        { id: "example--test--link", kind: "component" as const, markupHTML: '<a href="/"><slot></slot></a>' },
    ];
    expect(
        analyzeExpandedPageDocument(
            '<div cms-bloc="example--test--link"><button>Action</button></div>',
            definitions,
        ).diagnostics.some((d) => d.code === "page.interactive_nested"),
    ).toBe(true);
    expect(codes("<form><form></form></form>")).toContain("page.form_nested");
});

test("expanded references resolve renamed template IDs and diagnose missing and conditional targets", () => {
    const definitions = [
        {
            id: "example--test--dialog",
            kind: "component" as const,
            markupHTML: '<p id="label">Name</p><div aria-labelledby="label"></div>',
        },
    ];
    expect(
        analyzeExpandedPageDocument(
            '<div cms-bloc="example--test--dialog"></div><div cms-bloc="example--test--dialog"></div>',
            definitions,
        ).diagnostics,
    ).toEqual([]);
    expect(codes('<div aria-labelledby="missing"></div>')).toContain("page.reference_missing");
    expect(
        codes('<div aria-labelledby="label"></div><p id="label" cms-condition="{{ state.ready }}">Name</p>'),
    ).toContain("page.reference_conditional");
    expect(codes('<div cms-repeat="item in state.items"><p id="label">Name</p></div>')).toContain("page.repeated_id");
    expect(analyzeExpandedPageDocument('<div aria-labelledby="outer-label"></div>', [], false).diagnostics).toEqual([]);
});

test("analysis bounds diagnostics and keeps errors ahead of warnings", () => {
    const result = analyzeExpandedPageDocument(
        Array.from({ length: 40 }, (_, index) => `<p aria-labelledby="missing-${index}"></p>`).join(""),
        [],
    );
    expect(result.diagnostics).toHaveLength(16);
    expect(result.diagnostics[0]?.severity).toBe("error");
    expect(result.diagnostics.at(-1)?.code).toBe("analysis.truncated");
});

test("many dynamic reference advisories cannot hide a later static reference error", () => {
    const dynamic = '<p aria-labelledby="{{ state.label }}"></p>'.repeat(40);
    const result = analyzeExpandedPageDocument(`${dynamic}<p aria-labelledby="missing"></p>`, []);
    expect(result.diagnostics[0]).toMatchObject({ code: "page.reference_missing", severity: "error" });
    expect(result.diagnostics.at(-1)?.code).toBe("analysis.truncated");
});
