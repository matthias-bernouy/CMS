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
    test("treats rich text formatting elements as text internals", () => {
        const { document, HTMLElement } = parseHTML(`
            <!DOCTYPE html>
            <html>
                <body>
                    <main id="content-root">
                        <x-rich id="rich">
                            Home <span id="size" style="font-size: 1.25em">Large</span>
                            <x-child id="item" slot="items">
                                Item <span id="item-size" style="font-size: 1.25em">Large</span>
                            </x-child>
                        </x-rich>
                    </main>
                </body>
            </html>
        `);
        const runtime = new EditorRuntime([
            {
                tag: "x-rich",
                label: "Rich text parent",
                bloc: blocConstructor(HTMLElement),
                editor: RichTextParentEditor,
            },
            {
                tag: "x-child",
                label: "Child",
                bloc: blocConstructor(HTMLElement),
                editor: ChildEditor,
            },
            {
                tag: "span",
                label: "Span",
                bloc: blocConstructor(HTMLElement),
                editor: SpanEditor,
            },
        ]);

        const contentRoot = document.getElementById("content-root")!;
        const rich = document.getElementById("rich")!;
        const size = document.getElementById("size")!;
        const item = document.getElementById("item")!;
        const itemSize = document.getElementById("item-size")!;

        runtime.load({
            root: contentRoot,
            contentRoot,
        });

        const structure = runtime.getStructure();
        expect(structure.map((node) => node.target.id)).toEqual(["rich"]);
        expect(structure[0]?.children.map((node) => node.target.id)).toEqual(["item"]);
        expect(structure[0]?.children[0]?.children).toEqual([]);
        expect(
            runtime
                .getEditor(rich)
                ?.getChildren()
                .map((editor) => editor.target.id),
        ).toEqual(["item"]);
        expect(runtime.getEditor(item)?.getChildren()).toEqual([]);
        expect(runtime.getEditor(size)).toBeDefined();
        expect(runtime.getClosestEditor(size)?.target).toBe(rich);
        expect(runtime.getClosestEditor(item)?.target).toBe(item);
        expect(runtime.getClosestEditor(itemSize)?.target).toBe(item);
        expect(runtime.select(size)?.editor.target).toBe(rich);
    });

    test("closest editor keeps the clicked descendant when no opaque ancestor exists", () => {
        const { document, HTMLElement } = createDocument();
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

        const contentRoot = document.getElementById("content-root")!;
        const child = document.getElementById("child")!;

        runtime.load({
            root: contentRoot,
            contentRoot,
        });

        expect(runtime.getClosestEditor(child)?.target).toBe(child);
    });
});
