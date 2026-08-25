import {
    COMPOSITION_INPUT_ATTRIBUTE,
    COMPOSITION_RUNTIME_ATTRIBUTE,
    ChildEditor,
    DataRootEditor,
    Editor,
    EditorRuntime,
    OpaqueEditor,
    ParentEditor,
    RichTextParentEditor,
    SpanEditor,
    UnsafeCompositionEditor,
    blocConstructor,
    childContentSlot,
    childOverride,
    createDocument,
    dataScope,
    describe,
    expect,
    parentContentOverride,
    parseHTML,
    test,
    type ContentSlot,
    type DataScope,
    type EditorCatalog,
    type SettingSection,
} from "./support/index";

describe("EditorRuntime", () => {
    test("declares a numeric data scope for a fixed repeat range", () => {
        const { document, HTMLElement } = parseHTML(`
            <!DOCTYPE html>
            <html>
                <body>
                    <main id="content-root">
                        <x-child id="child" cms-repeat="$range(5) as index"></x-child>
                    </main>
                </body>
            </html>
        `);
        const runtime = new EditorRuntime([
            {
                tag: "x-child",
                label: "Child",
                bloc: blocConstructor(HTMLElement),
                editor: ChildEditor,
            },
        ]);

        runtime.load({
            root: document.getElementById("content-root")!,
            contentRoot: document.getElementById("content-root")!,
        });
        expect(runtime.getStructure()[0]?.badges).toEqual(["Repeat ×5"]);
        runtime.select(document.getElementById("child")!);

        expect(runtime.getSelectedDataScopes()).toEqual([
            { name: "index", label: "index", fields: [{ path: ".", type: "number" }] },
        ]);
    });

    test("declares item fields when cms-repeat targets a root-array data source", () => {
        const { document, HTMLElement } = parseHTML(`
            <!DOCTYPE html>
            <html>
                <body>
                    <main id="content-root">
                        <x-parent id="parent" cms-source="/api/rackets as data">
                            <x-child id="child" cms-repeat="data as racket"></x-child>
                        </x-parent>
                    </main>
                </body>
            </html>
        `);
        const runtime = new EditorRuntime(
            [
                {
                    tag: "x-parent",
                    label: "Parent",
                    bloc: blocConstructor(HTMLElement),
                    editor: ParentEditor,
                },
                {
                    tag: "x-child",
                    label: "Child",
                    bloc: blocConstructor(HTMLElement),
                    editor: ChildEditor,
                },
            ],
            [
                {
                    label: "Rackets",
                    url: "/api/rackets",
                    fields: [
                        {
                            path: ".",
                            type: "array",
                            children: [
                                { path: "id", type: "string" },
                                { path: "label", type: "string" },
                                { path: "weight_g", type: "number" },
                            ],
                        },
                    ],
                },
            ],
        );

        runtime.load({
            root: document.getElementById("content-root")!,
            contentRoot: document.getElementById("content-root")!,
        });
        runtime.select(document.getElementById("child")!);

        expect(runtime.getSelectedDataScopes()).toEqual([
            {
                name: "data",
                label: "Rackets",
                source: "/api/rackets",
                fields: [
                    {
                        path: ".",
                        type: "array",
                        children: [
                            { path: "id", type: "string" },
                            { path: "label", type: "string" },
                            { path: "weight_g", type: "number" },
                        ],
                    },
                ],
            },
            {
                name: "racket",
                label: "racket",
                fields: [
                    { path: "id", type: "string" },
                    { path: "label", type: "string" },
                    { path: "weight_g", type: "number" },
                ],
            },
        ]);
    });
});
