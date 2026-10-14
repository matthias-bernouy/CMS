import { describe, expect, test } from "bun:test";
import { validateBlocWrite } from "@bernouy/cms-content";
import { validateBlocContentMarkup } from "cms-content/blocs/core/markup/validation/nativeContent";
import { validateBlocDocument } from "cms-content/blocs/core/markup/validation/documents/blocDocument";
import { BLOC_DOCUMENT_LIMITS } from "cms-content/blocs/core/markup/validation/documents/blocBudgets";
import { siteBlocArtifact } from "../siteBlocFixture";

const fixed = (html: string) => validateBlocContentMarkup(html, { field: "componentHTML", kind: "fixed" });

describe("Bloc document accessibility", () => {
    test("accepts controlled implementation accessibility attributes", () => {
        expect(
            fixed(
                '<section aria-labelledby="heading"><h2 id="heading">Status</h2><div role="status" aria-live="polite" aria-busy="false"></div></section>',
            ).html,
        ).toContain('role="status"');
    });

    test.each([
        ['<div role="banana"></div>', "WAI-ARIA roles"],
        ['<div aria-unknown="value"></div>', "not a supported ARIA attribute"],
        ['<div aria-current="banana"></div>', "uncontrolled ARIA value"],
        ['<div aria-controls="1-invalid"></div>', "valid ids"],
    ])("rejects uncontrolled implementation accessibility markup", (html, message) => {
        expect(() => fixed(html)).toThrow(message);
    });
});

describe("Bloc document budgets", () => {
    test("bounds authored markup before parsing", () => {
        const markup = `<div>${"x".repeat(BLOC_DOCUMENT_LIMITS.maxMarkupLength)}</div>`;
        expect(() => fixed(markup)).toThrow("too long");
    });

    test("bounds DOM depth and node count", () => {
        const depth = BLOC_DOCUMENT_LIMITS.maxDomDepth + 1;
        expect(() => fixed(`${"<div>".repeat(depth)}${"</div>".repeat(depth)}`)).toThrow("too deep");
        expect(() => fixed("<span></span>".repeat(BLOC_DOCUMENT_LIMITS.maxDomNodes + 1))).toThrow("too many nodes");
    });

    test("bounds CMS source bindings", () => {
        const source =
            '<form cms-source="/.cms/call/example/items" cms-source-method="POST" cms-source-trigger="submit"><button>Save</button></form>';
        expect(() => fixed(source.repeat(BLOC_DOCUMENT_LIMITS.maxBindingSources + 1))).toThrow(
            "too many CMS source bindings",
        );
    });

    test("separates named queries from form submissions", () => {
        expect(() => fixed('<section cms-source="/.cms/call/catalog/items"></section>')).toThrow(
            "use cms-query for reads",
        );
        expect(() =>
            fixed(
                '<section cms-query="catalog:items as products"></section><section cms-query="catalog:featured as products"></section>',
            ),
        ).toThrow("must be unique");
    });

    test("enforces the structural cms-match and cms-case grammar", () => {
        expect(() =>
            fixed(
                `<section cms-match="status"><p cms-case="'ready'">Ready</p><p cms-case="'failed'">Failed</p></section>`,
            ),
        ).not.toThrow();
        expect(() => fixed(`<section><p cms-case="'ready'">Ready</p></section>`)).toThrow("direct child of cms-match");
        expect(() => fixed(`<section cms-match="status"><p>Missing case</p></section>`)).toThrow(
            "must each declare cms-case",
        );
        expect(() =>
            fixed(`<section cms-match="status"><p cms-case="'ready'">One</p><p cms-case="'ready'">Two</p></section>`),
        ).toThrow("duplicate case");
        expect(() =>
            fixed(
                `<section cms-match="outcome.kind">
                    <div cms-case="'success'">Done</div>
                    <div cms-case="'error'" cms-match="outcome.code">
                        <p cms-case="'NOT_FOUND'">Missing</p>
                    </div>
                </section>`,
            ),
        ).not.toThrow();
    });

    test("bounds component runtime and retained source bundles", () => {
        expect(() =>
            validateBlocWrite({
                ...siteBlocArtifact(),
                viewJS: "x".repeat(BLOC_DOCUMENT_LIMITS.maxViewJsLength + 1),
            }),
        ).toThrow("viewJS");
        expect(() =>
            validateBlocWrite({
                ...siteBlocArtifact(),
                source: Object.fromEntries(
                    Array.from({ length: BLOC_DOCUMENT_LIMITS.maxSourceFiles + 1 }, (_, index) => [
                        `${index}.ts`,
                        "eA==",
                    ]),
                ),
            }),
        ).toThrow("too many files");
        expect(() =>
            validateBlocWrite({
                ...siteBlocArtifact(),
                source: { "large.ts": "e".repeat(BLOC_DOCUMENT_LIMITS.maxSourceFileLength + 1) },
            }),
        ).toThrow("source.large.ts");
        expect(() =>
            validateBlocWrite({
                ...siteBlocArtifact(),
                source: Object.fromEntries(
                    Array.from({ length: 9 }, (_, index) => [
                        `${index}.ts`,
                        "e".repeat(BLOC_DOCUMENT_LIMITS.maxSourceTotalLength / 8),
                    ]),
                ),
            }),
        ).toThrow("bundle too long");
    });
});

describe("Bloc document cycles", () => {
    test("rejects a direct self reference in the canonical grammar", () => {
        expect(() =>
            validateBlocDocument(
                {
                    id: "fixture-loop",
                    kind: "composition",
                    slots: {},
                    fixedContent: "<fixture-loop></fixture-loop>",
                },
                [],
            ),
        ).toThrow("cannot reference itself");
    });
});

describe("Bloc document host attributes", () => {
    const target = {
        id: "fixture-target",
        kind: "component" as const,
        slots: {},
        settings: [
            {
                id: "expanded",
                label: "Expanded",
                type: "boolean" as const,
                default: false,
                control: { kind: "toggle" as const },
            },
            {
                id: "label",
                label: "Label",
                type: "string" as const,
                default: "",
                control: { kind: "text" as const },
            },
        ],
    };

    const validateBinding = (attributes: string) =>
        validateBlocDocument(
            {
                id: "fixture-owner",
                kind: "composition",
                slots: {},
                fixedContent: `<fixture-target ${attributes}></fixture-target>`,
            },
            [target],
        );

    test("uses target Bloc settings to validate bindings inside another Bloc", () => {
        expect(() => validateBinding('expanded="{{ item.open }}" label="{{ item.title }}"')).not.toThrow();
        expect(() => validateBinding("expanded=\"{{ item.state === 'open' }}\"")).not.toThrow();
        expect(() => validateBinding('expanded="{{ item.open | string }}"')).toThrow("boolean attribute binding");
        expect(() => validateBinding('label="{{ item.open === true }}"')).toThrow("string setting binding");
        expect(() => validateBinding('unknown="{{ item.value }}"')).toThrow("not a declared setting");
    });
});
