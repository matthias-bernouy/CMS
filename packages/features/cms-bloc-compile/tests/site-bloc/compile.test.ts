import { describe, expect, test } from "bun:test";
import { generateSiteBlocSourceBundle, prepare_bloc, validateBloc } from "@bernouy/cms-bloc-compile";
import { definition } from "./fixtures";

describe("generated site bloc compilation", () => {
    test("builds valid view and editor bundles through prepare_bloc", async () => {
        const source = generateSiteBlocSourceBundle(definition());
        const encoded = Object.fromEntries(
            Object.entries(source).map(([path, content]) => [path, Buffer.from(content).toString("base64")]),
        );
        const validation = validateBloc({
            tag: "site-hero",
            editorSource: source["BlocEditor.ts"],
        });
        expect(validation.errors).toEqual([]);

        const bloc = await prepare_bloc(
            null,
            new File([source["BlocEditor.ts"]], "BlocEditor.ts", { type: "text/typescript" }),
            "Hero",
            "Layout",
            "Reusable hero",
            "site-hero",
            encoded,
            source["default.html"],
            { compositionHTML: source["template.html"] },
        );

        expect(() => new Function(bloc.viewJS)).not.toThrow();
        expect(() => new Function(bloc.editorJS)).not.toThrow();
        expect(bloc.viewJS).toBe("");
        expect(bloc.compositionHTML).toContain('<slot name="title" slot="title"></slot>');
        expect(bloc.editorJS).toContain("window.p9rEditor.Editor");
        expect(bloc.editorJS).toContain("basic-heading-1");
        let registration: { defaultContent?: string } | undefined;
        new Function("window", bloc.editorJS)({
            p9rEditor: {
                Editor: class {},
                registerEditor(value: { defaultContent?: string }) {
                    registration = value;
                },
            },
        });
        expect(registration?.defaultContent).toBe('<site-hero><h1 slot="title">Hello</h1><p>Body</p></site-hero>\n');
        expect(bloc.source).toEqual(encoded);
    });

    test("rejects invalid slot placeholders and authored private behavior", () => {
        const base = definition();
        expect(() =>
            generateSiteBlocSourceBundle(base, {
                ...base.draft,
                structure: [
                    { kind: "slot", slotId: "title" },
                    { kind: "slot", slotId: "title" },
                    { kind: "slot", slotId: "content" },
                ],
            }),
        ).toThrow('Duplicate site bloc slot placeholder "title"');
        expect(() =>
            generateSiteBlocSourceBundle(base, {
                ...base.draft,
                structure: [{ kind: "slot", slotId: "title" }],
            }),
        ).toThrow('Site bloc slot "content" has no placeholder');
        expect(() =>
            generateSiteBlocSourceBundle(base, {
                ...base.draft,
                structure: [
                    {
                        kind: "bloc",
                        tag: "basic-container",
                        attributes: { "cms-source": "/api/items" },
                        children: [
                            { kind: "slot", slotId: "title" },
                            { kind: "slot", slotId: "content" },
                        ],
                    },
                ],
            }),
        ).toThrow('attribute "cms-source" is forbidden');

        for (const [name, value] of [
            ["style", "color: red"],
            ["onclick", "alert(1)"],
            ["title", "{{ data.title }}"],
        ]) {
            expect(() =>
                generateSiteBlocSourceBundle(base, {
                    ...base.draft,
                    structure: [
                        {
                            kind: "bloc",
                            tag: "basic-container",
                            attributes: { [name]: value },
                            children: [
                                { kind: "slot", slotId: "title" },
                                { kind: "slot", slotId: "content" },
                            ],
                        },
                    ],
                }),
            ).toThrow();
        }

        expect(() =>
            generateSiteBlocSourceBundle(base, {
                ...base.draft,
                structure: [
                    {
                        kind: "bloc",
                        tag: "cms-binding-core",
                        attributes: {},
                        children: [
                            { kind: "slot", slotId: "title" },
                            { kind: "slot", slotId: "content" },
                        ],
                    },
                ],
            }),
        ).toThrow('Binding runtime tag "cms-binding-core" is forbidden');

        expect(() =>
            generateSiteBlocSourceBundle(base, {
                ...base.draft,
                structure: [{ kind: "text", value: "{{ private.value }}" }, ...base.draft.structure],
            }),
        ).toThrow("text must be static and free of control characters");

        expect(() =>
            generateSiteBlocSourceBundle(base, {
                ...base.draft,
                structure: [
                    {
                        kind: "bloc",
                        tag: "a",
                        attributes: { target: "_blank", rel: "nofollow" },
                        children: [],
                    },
                    ...base.draft.structure,
                ],
            }),
        ).toThrow("noopener noreferrer");
        expect(() =>
            generateSiteBlocSourceBundle(base, {
                ...base.draft,
                structure: [
                    {
                        kind: "bloc",
                        tag: "button",
                        attributes: { TYPE: "submit" },
                        children: [],
                    },
                    ...base.draft.structure,
                ],
            }),
        ).toThrow('attribute "TYPE" is not allowed');
    });

    test("serializes escaped static text in private composition", () => {
        const base = definition();
        const source = generateSiteBlocSourceBundle(base, {
            ...base.draft,
            structure: [
                {
                    kind: "bloc",
                    tag: "basic-container",
                    attributes: {},
                    children: [{ kind: "text", value: "Morrow & <Co>" }, ...base.draft.structure[0]!.children],
                },
            ],
        });

        expect(source["template.html"]).toContain("Morrow &amp; &lt;Co&gt;");
    });

    test("enforces native placement and form contracts at the source-bundle boundary", () => {
        const base = definition();
        for (const [snapshot, message] of [
            [
                { ...base.draft, structure: [{ kind: "bloc", tag: "span", attributes: {}, children: [] }] },
                /explicit component text slot/,
            ],
            [
                {
                    ...base.draft,
                    structure: [
                        {
                            kind: "bloc",
                            tag: "section",
                            attributes: {},
                            children: [{ kind: "bloc", tag: "li", attributes: {}, children: [] }],
                        },
                    ],
                },
                /direct child of <ul> or <ol>/,
            ],
            [
                {
                    ...base.draft,
                    structure: [
                        {
                            kind: "bloc",
                            tag: "ul",
                            attributes: {},
                            children: [{ kind: "bloc", tag: "site-card", attributes: {}, children: [] }],
                        },
                    ],
                },
                /only direct <li>/,
            ],
            [{ ...base.draft, defaultContent: "<li>Orphan item</li>" }, /direct child of <ul> or <ol>/],
            [{ ...base.draft, defaultContent: "<ul>Loose text<li>Item</li></ul>" }, /only direct <li>/],
            [{ ...base.draft, defaultContent: "<form></form>" }, /declared CMS source endpoint/],
        ] as const) {
            expect(() => generateSiteBlocSourceBundle(base, snapshot as typeof base.draft)).toThrow(message);
        }

        const source = generateSiteBlocSourceBundle(base, {
            ...base.draft,
            defaultContent: `<form cms-source="/.cms/sources/forms/contact"
                cms-source-method="POST" cms-source-trigger="submit"
                cms-source-success-reset="true"></form>`,
        });
        expect(source["default.html"]).toContain('cms-source="/.cms/sources/forms/contact"');
    });
});
