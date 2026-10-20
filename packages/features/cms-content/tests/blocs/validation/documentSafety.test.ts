import { describe, expect, test } from "bun:test";
import { validateBlocWrite } from "@bernouy/cms-content";
import { validateBlocContentMarkup } from "cms-content/blocs/core/markup/validation/nativeContent";
import { validateBlocDocument } from "cms-content/blocs/core/markup/validation/documents/blocDocument";
import { validatePageDocument } from "cms-content/blocs/core/markup/validation/documents/pageDocument";
import { BLOC_DOCUMENT_LIMITS } from "cms-content/blocs/core/markup/validation/documents/blocBudgets";
import { siteBlocArtifact } from "../siteBlocFixture";

const fixed = (html: string) => validateBlocContentMarkup(html, { field: "markupHTML", kind: "fixed" });

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
        ['<div aria-current="banana"></div>', "aria-current"],
        ['<div aria-controls="1-invalid"></div>', "valid ids"],
    ])("rejects uncontrolled implementation accessibility markup", (html, message) => {
        expect(() => fixed(html)).toThrow(message);
    });
});

describe("declarative native dialogs", () => {
    const action = {
        id: "fixture-action",
        kind: "component" as const,
        slots: {
            "": { accepts: [{ kind: "native-element" as const, accepts: ["button" as const] }], min: 1, max: 1 },
        },
        root: { accepts: ["div" as const] },
    };
    const dialog = {
        id: "fixture-dialog",
        kind: "component" as const,
        slots: {
            "": { accepts: [{ kind: "native-element" as const, accepts: ["dialog" as const] }], min: 1, max: 1 },
        },
        root: { accepts: ["div" as const] },
    };
    const heading = {
        id: "fixture-heading",
        kind: "component" as const,
        slots: {
            "": { accepts: [{ kind: "native-content" as const, profile: "phrasing" as const }], min: 1 },
        },
        root: { accepts: ["h2" as const] },
    };
    const validate = (content: string) =>
        validateBlocDocument(
            { id: "fixture-owner", kind: "composition", slots: {}, root: { accepts: ["div"] }, fixedContent: content },
            [action, dialog, heading],
        );

    test("accepts an addressable Light DOM dialog without component JavaScript", () => {
        expect(() =>
            validate(`
                <div cms-bloc=\"fixture-action\"><button type="button" command="show-modal" commandfor="create-dialog">Open</button></div>
                <div cms-bloc=\"fixture-dialog\"><dialog id="create-dialog" aria-labelledby="create-title">
                    <h2 cms-bloc="fixture-heading" id="create-title">Create</h2>
                    <div cms-bloc=\"fixture-action\"><button type="button" command="close" commandfor="create-dialog">Close</button></div>
                </dialog></div>
            `),
        ).not.toThrow();
    });

    test.each([
        [
            '<div cms-bloc=\"fixture-action\"><button type="button" command="show-modal" commandfor="missing">Open</button></div>',
            "missing id",
        ],
        [
            '<h2 cms-bloc="fixture-heading" id="target">Heading</h2><div cms-bloc=\"fixture-action\"><button type="button" command="show-modal" commandfor="target">Open</button></div>',
            "must be a <dialog>",
        ],
        [
            '<div cms-bloc=\"fixture-dialog\"><dialog id="same"></dialog></div><p id="same">Duplicate</p>',
            "duplicate static native id",
        ],
        [
            '<div cms-bloc=\"fixture-dialog\"><dialog id="unnamed"></dialog></div><div cms-bloc=\"fixture-action\"><button type="button" command="show-modal" commandfor="unnamed">Open</button></div>',
            "accessible name",
        ],
        [
            '<div cms-bloc=\"fixture-dialog\"><dialog id="labelled" aria-labelledby="missing-title"></dialog></div><div cms-bloc=\"fixture-action\"><button type="button" command="show-modal" commandfor="labelled">Open</button></div>',
            "aria-labelledby references missing id",
        ],
        [
            '<div cms-bloc=\"fixture-action\"><button type="button" command="show-modal">Open</button></div>',
            "command and commandfor must be declared together",
        ],
        [
            '<div cms-bloc=\"fixture-action\"><button type="button" command="toggle-popover" commandfor="target">Open</button></div>',
            "button command",
        ],
    ])("rejects invalid native dialog relationships", (content, message) => {
        expect(() => validate(content)).toThrow(message);
    });
});

describe("fixed heading ownership", () => {
    const heading = {
        id: "fixture-heading",
        kind: "component" as const,
        slots: {
            "": { accepts: [{ kind: "native-content" as const, profile: "phrasing" as const }], min: 1 },
        },
        root: { accepts: ["h1" as const, "h2" as const] },
    };
    const validate = (fixedContent: string) =>
        validateBlocDocument(
            { id: "fixture-owner", kind: "composition", slots: {}, root: { accepts: ["div"] }, fixedContent },
            [heading],
        );

    test("requires fixed headings to be explicit registered Blocs", () => {
        expect(() => validate("<h2>Title</h2>")).toThrow("place an explicit heading Bloc");
        expect(() => validate('<h2 cms-bloc="fixture-heading">Title</h2>')).not.toThrow();
        expect(() => validate('<h3 cms-bloc="fixture-heading">Title</h3>')).toThrow("accepted native root");
        expect(() => validate('<h2 cms-bloc="fixture-unknown">Title</h2>')).toThrow("unknown local bloc");
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

    test("bounds CMS operations", () => {
        const mutation = '<form cms-mutation="example:save-item as saved"><button>Save</button></form>';
        expect(() => fixed(mutation.repeat(BLOC_DOCUMENT_LIMITS.maxOperations + 1))).toThrow("too many CMS operations");
    });

    test("separates named queries from mutations", () => {
        expect(() => fixed('<section cms-mutation="catalog:save as saved"></section>')).toThrow(
            "CMS mutations are reserved for form submissions",
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
        expect(() =>
            fixed(`<div cms-bloc="fixture-stack" cms-match="status"><p cms-case="'ready'">Ready</p></div>`),
        ).toThrow("cms-match cannot share an element with cms-bloc");
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
                    fixedContent: '<div cms-bloc="fixture-loop"></div>',
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
        root: { accepts: ["div" as const] },
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
                root: { accepts: ["div"] },
                slots: {},
                fixedContent: `<div cms-bloc=\"fixture-target\" ${attributes}></div>`,
            },
            [target],
        );

    test("uses target Bloc settings to validate bindings inside another Bloc", () => {
        expect(() => validateBinding('expanded="{{ item.open }}" label="{{ item.title }}"')).not.toThrow();
        expect(() => validateBinding("expanded=\"{{ item.state === 'open' }}\"")).not.toThrow();
        expect(() => validateBinding('expanded="{{ item.open | string }}"')).toThrow("boolean attribute binding");
        expect(() => validateBinding('label="{{ item.open === true }}"')).toThrow("string setting binding");
        expect(() => validateBinding('unknown="{{ item.value }}"')).toThrow("neither a declared setting");
    });
});

test("Page Bloc roots retain bindings supported by their native element", () => {
    const form = {
        id: "fixture-form",
        kind: "component" as const,
        root: { accepts: ["form" as const] },
        slots: {},
    };
    expect(() =>
        validatePageDocument('<form cms-bloc="fixture-form" cms-mutation="fixture:save as saved"></form>', [form]),
    ).not.toThrow();
    expect(() =>
        validatePageDocument('<div cms-bloc="fixture-form" cms-mutation="fixture:save as saved"></div>', [form]),
    ).toThrow();
});
