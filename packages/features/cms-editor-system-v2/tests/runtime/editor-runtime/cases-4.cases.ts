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
    test("declares data scopes from cms-source attributes", () => {
        const { document, HTMLElement } = parseHTML(`
            <!DOCTYPE html>
            <html>
                <body>
                    <main id="content-root">
                        <x-parent id="parent" cms-source="/api/plans?q=#{address} as plans">
                            <x-child id="child"></x-child>
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
                            children: [{ path: "name", type: "string" }],
                        },
                    ],
                },
            ],
        );

        runtime.load({
            root: document.getElementById("content-root")!,
            contentRoot: document.getElementById("content-root")!,
        });

        runtime.select(document.getElementById("parent")!);
        expect(runtime.getSelectedDataScopes()).toEqual([]);

        runtime.select(document.getElementById("child")!);

        expect(runtime.getSelectedDataScopes()).toEqual([
            {
                name: "plans",
                label: "Plans",
                source: "/api/plans?q=#{address}",
                fields: [
                    {
                        path: "items",
                        type: "array",
                        children: [{ path: "name", type: "string" }],
                    },
                ],
            },
        ]);
    });

    test("keeps cms-source children ungrouped and badges source status conditions", () => {
        const { document, HTMLElement } = parseHTML(`
            <!DOCTYPE html>
            <html>
                <body>
                    <main id="content-root">
                        <x-parent id="parent" cms-source="/api/plans">
                            <x-child id="success"></x-child>
                            <x-child id="loading-a" cms-condition="$source.loading"></x-child>
                            <x-child id="loading-b" cms-condition="$source.loading"></x-child>
                            <x-child id="error" cms-condition="$source.error"></x-child>
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
        expect(source.children.map((node) => node.target.id)).toEqual(["success", "loading-a", "loading-b", "error"]);
        expect(source.children[0]!.badges).toEqual([]);
        expect(source.children[1]!.badges).toEqual(["loading"]);
        expect(source.children[2]!.badges).toEqual(["loading"]);
        expect(source.children[3]!.badges).toEqual(["error"]);
    });
});
