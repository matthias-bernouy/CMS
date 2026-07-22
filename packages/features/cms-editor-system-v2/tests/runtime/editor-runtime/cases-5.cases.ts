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
    test("keeps plain source children ungrouped without empty state groups", () => {
        const { document, HTMLElement } = parseHTML(`
            <!DOCTYPE html>
            <html>
                <body>
                    <main id="content-root">
                        <x-parent id="parent" cms-source="/api/plans">
                            <x-child id="one"></x-child>
                            <x-child id="two"></x-child>
                        </x-parent>
                    </main>
                </body>
            </html>
        `);
        const runtime = new EditorRuntime([
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
        ]);

        runtime.load({
            root: document.getElementById("content-root")!,
            contentRoot: document.getElementById("content-root")!,
        });

        const source = runtime.getStructure()[0]!;
        expect(source.children.map((node) => node.target.id)).toEqual(["one", "two"]);
    });

    test("declares data scopes from named cms-repeat attributes", () => {
        const { document, HTMLElement } = parseHTML(`
            <!DOCTYPE html>
            <html>
                <body>
                    <main id="content-root">
                        <x-parent id="parent" cms-source="/api/plans">
                            <x-child id="child" cms-repeat="items as plan"></x-child>
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
                    label: "Plans",
                    url: "/api/plans",
                    fields: [
                        {
                            path: "items",
                            type: "array",
                            children: [
                                { path: "name", type: "string" },
                                { path: "price", type: "number" },
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
                label: "Plans",
                source: "/api/plans",
                fields: [
                    {
                        path: "items",
                        type: "array",
                        children: [
                            { path: "name", type: "string" },
                            { path: "price", type: "number" },
                        ],
                    },
                ],
            },
            {
                name: "plan",
                label: "plan",
                fields: [
                    { path: "name", type: "string" },
                    { path: "price", type: "number" },
                ],
            },
        ]);
    });
});
