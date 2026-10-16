import { describe, expect, test } from "bun:test";
import { compileBlocStyle, compileBlocTemplate } from "@bernouy/cms-repository/collections/build";

describe("collection Bloc template tooling", () => {
    test("projects fixed Light DOM into the component template", () => {
        const template = compileBlocTemplate(
            '<div part="field"><slot name="field-label"></slot><slot name="field-control"></slot></div>',
            '<label slot="field-label"><slot name="label"></slot></label><div slot="field-control"><slot name="control"></slot></div>',
        );

        expect(template).toBe(
            '<div part="field"><label part="field-label"><slot name="label"></slot></label><div part="field-control"><slot name="control"></slot></div></div>',
        );
    });

    test("merges consumed slot names into existing structural part tokens", () => {
        expect(
            compileBlocTemplate(
                '<section><slot name="heading"></slot></section>',
                '<h2 slot="heading" part="copy">Title</h2>',
            ),
        ).toBe('<section><h2 part="copy heading">Title</h2></section>');
    });

    test("keeps root metadata while projecting fixed Light DOM", () => {
        const template = compileBlocTemplate(
            "<div><slot></slot></div>",
            '<template cms-root aria-live="polite"><span>Ready</span></template>',
        );

        expect(template).toBe('<template aria-live="polite" cms-root=""></template><div><span>Ready</span></div>');
    });

    test("keeps a projected Page slot without obsolete shell forwarding metadata", () => {
        expect(
            compileBlocTemplate(
                `<header><slot name="navigation"></slot></header>`,
                `<slot name="items" slot="navigation"></slot>`,
            ),
        ).toBe(`<header><slot name="items"></slot></header>`);
    });
});

describe("collection Bloc style tooling", () => {
    test("closes authored CSS at nested Bloc boundaries", () => {
        expect(compileBlocStyle("example-card", ".title { color: red; }")).toBe(
            `@layer ulvia.blocks {
@scope ([cms-bloc="example-card"]) to (:scope [cms-bloc]) {
.title { color: red; }
}
}`,
        );
    });

    test("rejects selectors that reach a nested Bloc root", () => {
        expect(() => compileBlocStyle("example-card", '[cms-bloc="example-action"] { inline-size: 100%; }')).toThrow(
            "must stay inside its Light DOM boundary",
        );
    });

    test("keeps validated collection asset expressions for installation-time linking", () => {
        expect(
            compileBlocStyle(
                "example-card",
                ':scope { background-image: url("{{ cms.asset.example.background.webp }}"); }',
            ),
        ).toContain("{{ cms.asset.example.background.webp }}");
    });

    test.each([
        [":host { display: block; }", "Shadow DOM selectors"],
        ["body { margin: 0; }", "document selectors"],
        ["[cms-bloc] .title { color: red; }", "unbounded nested Bloc selectors"],
        ['[cms-bloc="example-action"] { color: red; }', "exact nested Bloc selectors"],
        ["@scope (.card) { :scope { display: block; } }", "authored scope boundaries"],
    ])("rejects %s", (source, _reason) => {
        expect(() => compileBlocStyle("example-card", source)).toThrow();
    });
});
