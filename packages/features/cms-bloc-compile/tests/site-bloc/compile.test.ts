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
            viewSource: source["Bloc.ts"],
            editorSource: source["BlocEditor.ts"],
        });
        expect(validation.errors).toEqual([]);

        const bloc = await prepare_bloc(
            new File([source["Bloc.ts"]], "Bloc.ts", { type: "text/typescript" }),
            new File([source["BlocEditor.ts"]], "BlocEditor.ts", { type: "text/typescript" }),
            "Hero",
            "Layout",
            "Reusable hero",
            "site-hero",
            encoded,
            source["default.html"],
        );

        expect(() => new Function(bloc.viewJS)).not.toThrow();
        expect(() => new Function(bloc.editorJS)).not.toThrow();
        expect(bloc.viewJS).toContain("window.p9r.Component");
        expect(bloc.viewJS).toContain('<slot name="title"></slot>');
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
    });
});
