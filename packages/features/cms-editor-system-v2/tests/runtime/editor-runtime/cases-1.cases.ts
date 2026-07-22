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
    test("treats generated composition content as an opaque runtime detail", () => {
        const { document, HTMLElement } = parseHTML(`
            <main id="content-root">
                <x-parent id="composition" ${COMPOSITION_RUNTIME_ATTRIBUTE}>
                    <template ${COMPOSITION_INPUT_ATTRIBUTE}></template>
                    <x-child id="generated"></x-child>
                    <x-parent id="nested-composition" ${COMPOSITION_RUNTIME_ATTRIBUTE}>
                        <template ${COMPOSITION_INPUT_ATTRIBUTE}></template>
                        <x-child id="nested-generated"></x-child>
                    </x-parent>
                </x-parent>
            </main>
        `);
        const runtime = new EditorRuntime([
            {
                tag: "x-parent",
                label: "Composition",
                bloc: blocConstructor(HTMLElement),
                editor: UnsafeCompositionEditor,
            },
            {
                tag: "x-child",
                label: "Generated child",
                bloc: blocConstructor(HTMLElement),
                editor: ChildEditor,
            },
        ]);
        const contentRoot = document.getElementById("content-root")!;
        const composition = document.getElementById("composition")!;
        const generated = document.getElementById("generated")!;
        const nestedComposition = document.getElementById("nested-composition")!;

        runtime.load({ root: contentRoot, contentRoot });

        expect(runtime.getStructure().map((node) => node.label)).toEqual(["Composition"]);
        expect(runtime.getEditor(generated)).toBeUndefined();
        expect(runtime.getEditor(nestedComposition)).toBeUndefined();
        expect(runtime.getClosestEditor(generated)?.target).toBe(composition);
        runtime.select(composition);
        expect(runtime.getSelection()?.contentSlots).toEqual([]);
        expect(runtime.getSelection()?.textCapability).toBeNull();
    });

    test("loads editors from root and builds structure from contentRoot", () => {
        const { document, HTMLElement } = createDocument();
        const catalog: EditorCatalog = [
            {
                tag: "x-data",
                label: "Data root",
                bloc: blocConstructor(HTMLElement),
                editor: DataRootEditor,
            },
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
        ];
        const root = document.getElementById("runtime-root")!;
        const contentRoot = document.getElementById("content-root")!;
        const child = document.getElementById("child")!;
        const runtime = new EditorRuntime(catalog);

        runtime.load({ root, contentRoot });

        const structure = runtime.getStructure();
        expect(structure.map((node) => node.label)).toEqual(["Parent"]);
        expect(structure[0]?.children.map((node) => node.label)).toEqual(["Child"]);
        expect(runtime.registry.getEditor(root)?.getDataScopes()).toEqual([dataScope]);
        expect(runtime.getSelectedSettings()).toEqual([]);

        runtime.select(child);

        expect(runtime.getSelectedSettings()).toEqual([
            {
                kind: "self",
                label: "Child",
                settings: [],
            },
            childOverride,
        ]);
        expect(runtime.getSelection()?.contentSlots).toEqual([childContentSlot, parentContentOverride]);
        expect(runtime.getSelection()?.textCapability).toEqual({
            format: "richtext",
            bold: true,
            dynamic: true,
        });
        expect(runtime.getSelectedDataScopes()).toEqual([dataScope]);
    });
});
